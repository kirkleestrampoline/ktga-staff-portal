import { randomUUID } from "crypto";
import { NextRequest,NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requirePlatformAdmin } from "@/lib/platform-admin";

const USERNAME_RE=/^[a-z0-9][a-z0-9._-]{2,31}$/;
const SLUG_RE=/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;
function adminClient(){const url=process.env.NEXT_PUBLIC_SUPABASE_URL,secret=process.env.SUPABASE_SECRET_KEY;if(!url||!secret)throw new Error("Server configuration is missing");return createClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}})}
const clean=(value:unknown)=>String(value||"").trim();

export async function GET(){
  const actor=await requirePlatformAdmin();if(!actor)return NextResponse.json({error:"Platform Admin access required"},{status:403});
  const admin=adminClient();
  const[{data:clubs,error},{data:profiles}]=await Promise.all([
    admin.from("clubs").select("id,name,slug,email,telephone,timezone,primary_colour,secondary_colour,active,created_at,updated_at").order("created_at",{ascending:false}),
    admin.from("profiles").select("id,club_id,full_name,contact_email,email,role,is_active,last_login_at")
  ]);
  if(error)return NextResponse.json({error:"Could not load clubs"},{status:500});
  const people=profiles||[];
  return NextResponse.json({clubs:(clubs||[]).map(club=>{const members=people.filter(p=>p.club_id===club.id);const owner=members.find(p=>p.role==="club_owner")||members.find(p=>p.role==="admin")||null;const lastActivity=members.map(p=>p.last_login_at).filter(Boolean).sort().at(-1)||club.updated_at;return{...club,staff_count:members.length,owner:owner?{id:owner.id,full_name:owner.full_name,contact_email:owner.contact_email||owner.email,is_active:owner.is_active}:null,last_activity:lastActivity}})});
}

export async function POST(req:NextRequest){
  const actor=await requirePlatformAdmin();if(!actor)return NextResponse.json({error:"Platform Admin access required"},{status:403});
  const body=await req.json();const club=body.club||{},owner=body.owner||{};
  const name=clean(club.name),slug=clean(club.slug).toLowerCase(),contactEmail=clean(club.contact_email).toLowerCase(),username=clean(owner.username).toLowerCase(),ownerName=clean(owner.full_name),ownerEmail=clean(owner.contact_email).toLowerCase(),password=String(owner.password||"");
  if(!name||!SLUG_RE.test(slug)||!contactEmail.includes("@"))return NextResponse.json({error:"Valid club name, slug and contact email are required"},{status:400});
  if(!ownerName||!USERNAME_RE.test(username)||!ownerEmail.includes("@")||password.length<8)return NextResponse.json({error:"Valid owner name, username, recovery email and an 8-character password are required"},{status:400});
  if(name.localeCompare(ownerName,undefined,{sensitivity:"accent"})===0)return NextResponse.json({error:"Club name must identify the club, not the Club Owner"},{status:400});
  const admin=adminClient();
  const{data:newClub,error:clubError}=await admin.from("clubs").insert({name,slug,email:contactEmail,telephone:clean(club.telephone)||null,timezone:clean(club.timezone)||"Europe/London",primary_colour:clean(club.primary_colour)||"#6D3A91",secondary_colour:clean(club.secondary_colour)||"#243044",active:club.active!==false}).select("id,name,slug").single();
  if(clubError||!newClub)return NextResponse.json({error:clubError?.code==="23505"?"That club name or slug already exists":"Club creation failed"},{status:clubError?.code==="23505"?409:400});
  const authEmail=`${username}.${randomUUID().slice(0,8)}@login.avgymnastics.invalid`;let authId:string|null=null;
  try{
    const prep=await admin.from("pending_auth_user_clubs").insert({auth_email:authEmail,club_id:newClub.id,created_by:actor.user.id});if(prep.error)throw prep.error;
    const created=await admin.auth.admin.createUser({email:authEmail,password,email_confirm:true,user_metadata:{full_name:ownerName,username,contact_email:ownerEmail},app_metadata:{club_id:newClub.id}});if(created.error||!created.data.user)throw created.error||new Error("Owner Auth creation failed");authId=created.data.user.id;
    const saved=await admin.from("profiles").update({club_id:newClub.id,full_name:ownerName,username,email:ownerEmail,contact_email:ownerEmail,auth_email:authEmail,role:"club_owner",is_active:true,force_password_reset:true}).eq("id",authId).eq("club_id",newClub.id).select("id").single();if(saved.error||!saved.data)throw saved.error||new Error("Owner profile was not created");
    const venue=await admin.from("venues").insert({name,slug,active:true,brand_color:clean(club.primary_colour)||"#6D3A91",club_id:newClub.id,legacy:false});if(venue.error)throw venue.error;
    const settings=await admin.from("business_settings").insert({club_id:newClub.id,business_name:name,payment_note:"Payment by bank transfer",cutoff_day:1});if(settings.error)throw settings.error;
    const staffingSettings=await admin.from("staffing_recommendation_settings").insert({club_id:newClub.id});if(staffingSettings.error)throw staffingSettings.error;
    const activity=await admin.from("platform_activity").insert([{actor_id:actor.user.id,club_id:newClub.id,action:"club_created",entity_type:"clubs",entity_id:newClub.id,details:{name,slug}},{actor_id:actor.user.id,club_id:newClub.id,action:"first_owner_created",entity_type:"profiles",entity_id:authId,details:{username}}]);if(activity.error)throw activity.error;
    return NextResponse.json({ok:true,club:newClub,owner_id:authId},{status:201});
  }catch(error:any){
    const cleanupErrors:string[]=[];
    const staffingCleanup=await admin.from("staffing_recommendation_settings").delete().eq("club_id",newClub.id);if(staffingCleanup.error)cleanupErrors.push("staffing-settings");
    const activityCleanup=await admin.from("platform_activity").delete().eq("club_id",newClub.id);if(activityCleanup.error)cleanupErrors.push("activity");
    const settingsCleanup=await admin.from("business_settings").delete().eq("club_id",newClub.id);if(settingsCleanup.error)cleanupErrors.push("settings");
    const venueCleanup=await admin.from("venues").delete().eq("club_id",newClub.id);if(venueCleanup.error)cleanupErrors.push("venue");
    if(authId){const authCleanup=await admin.auth.admin.deleteUser(authId);if(authCleanup.error)cleanupErrors.push("auth");}
    else{const pendingCleanup=await admin.from("pending_auth_user_clubs").delete().eq("auth_email",authEmail);if(pendingCleanup.error)cleanupErrors.push("pending-auth");}
    const clubCleanup=await admin.from("clubs").delete().eq("id",newClub.id);if(clubCleanup.error)cleanupErrors.push("club");
    console.error("[platform-admin] club onboarding failed",{actorId:actor.user.id,clubId:newClub.id,stage:authId?"post-auth":"owner-auth",code:error?.code,status:error?.status,message:error?.message,cleanupErrors});
    return NextResponse.json({error:cleanupErrors.length?"Club onboarding failed and automatic cleanup needs support review":"Club onboarding could not be completed; incomplete records were rolled back"},{status:cleanupErrors.length?500:400});
  }
}

export async function PATCH(req:NextRequest){
  const actor=await requirePlatformAdmin();if(!actor)return NextResponse.json({error:"Platform Admin access required"},{status:403});
  const body=await req.json(),id=clean(body.id);if(!id)return NextResponse.json({error:"Club is required"},{status:400});
  const admin=adminClient();const{data:before}=await admin.from("clubs").select("id,name,active").eq("id",id).maybeSingle();if(!before)return NextResponse.json({error:"Club not found"},{status:404});
  const changes:any={};for(const key of ["name","email","telephone","timezone","primary_colour","secondary_colour"]){if(Object.prototype.hasOwnProperty.call(body,key))changes[key]=clean(body[key])||null}if(typeof body.active==="boolean")changes.active=body.active;changes.updated_at=new Date().toISOString();
  const{data,error}=await admin.from("clubs").update(changes).eq("id",id).select("id,name,slug,email,telephone,timezone,primary_colour,secondary_colour,active,created_at,updated_at").single();if(error)return NextResponse.json({error:"Club update failed"},{status:400});
  const action=typeof body.active==="boolean"&&body.active!==before.active?(body.active?"club_reactivated":"club_suspended"):"club_updated";
  await admin.from("platform_activity").insert({actor_id:actor.user.id,club_id:id,action,entity_type:"clubs",entity_id:id,details:{changed_fields:Object.keys(changes).filter(k=>k!=="updated_at")}});
  return NextResponse.json({ok:true,club:data});
}
