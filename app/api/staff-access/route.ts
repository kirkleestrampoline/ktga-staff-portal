import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const USERNAME_RE=/^[a-z0-9][a-z0-9._-]{2,31}$/;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me } = await supabase.from("profiles").select("role").eq("id", user.id).single();
  if (!me || !["admin","org_admin"].includes(me.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const actorId=user.id;
  const actorRole=me.role as "admin"|"org_admin";
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Supabase server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const body=await req.json();

  async function allowedVenueIds(){
    if(actorRole==="admin"){
      const{data}=await admin.from("venues").select("id").eq("active",true);
      return(data||[]).map((x:any)=>x.id);
    }
    const{data}=await admin.from("staff_venues").select("venue_id").eq("profile_id",actorId).eq("is_admin",true);
    return(data||[]).map((x:any)=>x.venue_id);
  }
  const allowed=await allowedVenueIds();

  async function canManage(profileId:string){
    if(actorRole==="admin")return true;
    const{data:links}=await admin.from("staff_venues").select("venue_id").eq("profile_id",profileId);
    return!(links||[]).some((x:any)=>!allowed.includes(x.venue_id));
  }

  if(body.action==="create_account"){
    const fullName=String(body.full_name||"").trim();
    const username=String(body.username||"").trim().toLowerCase();
    const password=String(body.password||"");
    const contactEmail=String(body.email||"").trim().toLowerCase();
    const venueIds:string[]=Array.isArray(body.venue_ids)?body.venue_ids:[];
    const role=actorRole==="admin"&&body.role==="org_admin"?"org_admin":"coach";
    const forcePasswordReset=body.force_password_reset!==false;

    if(!fullName)return NextResponse.json({error:"Name is required"},{status:400});
    if(!USERNAME_RE.test(username))return NextResponse.json({error:"Username must be 3–32 characters using letters, numbers, dots, dashes or underscores"},{status:400});
    if(password.length<8)return NextResponse.json({error:"Password must be at least 8 characters"},{status:400});
    if(venueIds.some(id=>!allowed.includes(id)))return NextResponse.json({error:"You cannot add staff to that organisation"},{status:403});

    const{data:existing}=await admin.from("profiles").select("id").ilike("username",username).maybeSingle();
    if(existing)return NextResponse.json({error:"That username is already in use"},{status:409});

    const authEmail=contactEmail||`${username}.${randomUUID().slice(0,8)}@login.avgymnastics.invalid`;
    const{data:created,error:createError}=await admin.auth.admin.createUser({
      email:authEmail,password,email_confirm:true,
      user_metadata:{full_name:fullName,username}
    });
    if(createError||!created.user)return NextResponse.json({error:createError?.message||"Could not create staff account"},{status:400});

    const id=created.user.id;
    const{error:profileError}=await admin.from("profiles").upsert({
      id,full_name:fullName,username,
      email:contactEmail||null,contact_email:contactEmail||null,auth_email:authEmail,
      role,hourly_rate:Number(body.hourly_rate||0),is_active:true,
      force_password_reset:forcePasswordReset,password_changed_at:new Date().toISOString()
    });
    if(profileError){
      await admin.auth.admin.deleteUser(id);
      return NextResponse.json({error:profileError.message},{status:400});
    }

    if(venueIds.length){
      const adminVenueIds:string[]=actorRole==="admin"&&Array.isArray(body.admin_venue_ids)?body.admin_venue_ids:[];
      const{error}=await admin.from("staff_venues").insert(venueIds.map(venue_id=>({
        profile_id:id,venue_id,is_admin:role==="org_admin"&&adminVenueIds.includes(venue_id)
      })));
      if(error)return NextResponse.json({error:error.message},{status:400});
    }
    return NextResponse.json({ok:true,id,username});
  }

  if(body.action==="set_password"){
    const profileId=String(body.profile_id||"");
    const password=String(body.password||"");
    const forcePasswordReset=body.force_password_reset!==false;
    if(!profileId||password.length<8)return NextResponse.json({error:"Staff member and a password of at least 8 characters are required"},{status:400});

    // Critical safety guard: admin password tools can never mutate the actor's own auth record.
    if(profileId===actorId)return NextResponse.json({error:"For safety, change your own password from My Profile → Security"},{status:400});
    if(!(await canManage(profileId)))return NextResponse.json({error:"You do not manage this staff member"},{status:403});

    const{data:person}=await admin.from("profiles").select("id,username,is_active").eq("id",profileId).single();
    if(!person)return NextResponse.json({error:"Staff member not found"},{status:404});

    const{error:authError}=await admin.auth.admin.updateUserById(profileId,{password,email_confirm:true});
    if(authError)return NextResponse.json({error:authError.message},{status:400});

    const{error:profileError}=await admin.from("profiles").update({
      force_password_reset:forcePasswordReset,password_changed_at:new Date().toISOString()
    }).eq("id",profileId);
    if(profileError)return NextResponse.json({error:profileError.message},{status:400});

    return NextResponse.json({ok:true});
  }

  if(body.action==="update_identity"||body.action==="set_contact_email"){
    const profileId=String(body.profile_id||"");
    if(!profileId)return NextResponse.json({error:"Staff member is required"},{status:400});
    if(!(await canManage(profileId)))return NextResponse.json({error:"You do not manage this staff member"},{status:403});

    const{data:person}=await admin.from("profiles").select("id,username,auth_email").eq("id",profileId).single();
    if(!person)return NextResponse.json({error:"Staff member not found"},{status:404});

    const username=body.action==="update_identity"?String(body.username||"").trim().toLowerCase():String(person.username||"").trim().toLowerCase();
    const contactEmail=String(body.email||"").trim().toLowerCase();
    if(!USERNAME_RE.test(username))return NextResponse.json({error:"Username must be 3–32 characters using letters, numbers, dots, dashes or underscores"},{status:400});

    const{data:usernameOwner}=await admin.from("profiles").select("id").ilike("username",username).neq("id",profileId).maybeSingle();
    if(usernameOwner)return NextResponse.json({error:"That username is already in use"},{status:409});

    const authEmail=contactEmail||person.auth_email||`${username}.${profileId.slice(0,8)}@login.avgymnastics.invalid`;
    if(contactEmail&&authEmail!==person.auth_email){
      const{error:authError}=await admin.auth.admin.updateUserById(profileId,{email:authEmail,email_confirm:true,user_metadata:{username}});
      if(authError)return NextResponse.json({error:authError.message},{status:400});
    }else{
      const{error:metaError}=await admin.auth.admin.updateUserById(profileId,{user_metadata:{username}});
      if(metaError)return NextResponse.json({error:metaError.message},{status:400});
    }

    const{error:profileError}=await admin.from("profiles").update({
      username,email:contactEmail||null,contact_email:contactEmail||null,auth_email:authEmail
    }).eq("id",profileId);
    if(profileError)return NextResponse.json({error:profileError.message},{status:400});
    return NextResponse.json({ok:true});
  }

  if(body.action==="send_reset_email"){
    const profileId=String(body.profile_id||"");
    if(!profileId)return NextResponse.json({error:"Staff member is required"},{status:400});
    if(profileId===actorId)return NextResponse.json({error:"Use the Forgot password link or My Profile for your own account"},{status:400});
    if(!(await canManage(profileId)))return NextResponse.json({error:"You do not manage this staff member"},{status:403});

    const{data:person}=await admin.from("profiles").select("email,contact_email,auth_email").eq("id",profileId).single();
    const recovery=String(person?.contact_email||person?.email||"").trim().toLowerCase();
    if(!recovery)return NextResponse.json({error:"This staff member does not have a recovery email"},{status:400});

    if(person?.auth_email!==recovery){
      const{error:updateError}=await admin.auth.admin.updateUserById(profileId,{email:recovery,email_confirm:true});
      if(updateError)return NextResponse.json({error:updateError.message},{status:400});
      await admin.from("profiles").update({auth_email:recovery,email:recovery,contact_email:recovery}).eq("id",profileId);
    }

    const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||"https://staff.avgymnastics.co.uk";
    const{error}=await admin.auth.resetPasswordForEmail(recovery,{redirectTo:`${siteUrl}/set-password?mode=recovery`});
    if(error)return NextResponse.json({error:error.message},{status:400});
    return NextResponse.json({ok:true});
  }

  return NextResponse.json({error:"Unknown action"},{status:400});
}
