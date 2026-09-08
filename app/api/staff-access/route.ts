import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";

const USERNAME_RE=/^[a-z0-9][a-z0-9._-]{2,31}$/;
const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { data: me, error: actorError } = await supabase.from("profiles").select("role,club_id,is_active").eq("id", user.id).single();
  if (actorError || !me || !me.is_active || !["admin","club_owner","org_admin"].includes(me.role)) {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const actorId=user.id;
  const actorRole=me.role as "admin"|"club_owner"|"org_admin";
  const actorClubId=me.club_id as string|null;
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Supabase server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});
  const body=await req.json();

  // Ordinary staff creation is always scoped from the authenticated actor's
  // trusted profile. A browser can never choose or override the target tenant.
  if(Object.prototype.hasOwnProperty.call(body,"club_id")){
    return NextResponse.json({error:"Club assignment is managed by the server"},{status:400});
  }
  if(!actorClubId){
    return NextResponse.json({error:"Your administrator profile is not assigned to a club"},{status:400});
  }
  if(!UUID_RE.test(actorClubId)){
    console.error("[staff-access] administrator profile has an invalid club_id",{actorId});
    return NextResponse.json({error:"Your administrator club assignment is invalid"},{status:400});
  }
  const{data:actorClub,error:clubError}=await admin.from("clubs").select("id,active").eq("id",actorClubId).maybeSingle();
  if(clubError){
    console.error("[staff-access] club resolution failed",{actorId,clubId:actorClubId,code:clubError.code});
    return NextResponse.json({error:"Your club assignment could not be verified"},{status:500});
  }
  if(!actorClub){
    return NextResponse.json({error:"Your assigned club no longer exists"},{status:400});
  }
  if(!actorClub.active){
    return NextResponse.json({error:"Your assigned club is inactive"},{status:403});
  }
  const targetClubId=actorClub.id;

  async function allowedVenueIds(){
    if(actorRole==="admin"||actorRole==="club_owner"){
      let query=admin.from("venues").select("id").eq("active",true);
      query=query.eq("club_id",targetClubId);
      const{data}=await query;
      return(data||[]).map((x:any)=>x.id);
    }
    const{data}=await admin.from("staff_venues").select("venue_id,venues!inner(club_id)").eq("profile_id",actorId).eq("is_admin",true).eq("venues.club_id",targetClubId);
    return(data||[]).map((x:any)=>x.venue_id);
  }
  const allowed=await allowedVenueIds();

  async function canManage(profileId:string){
    if(actorRole==="admin"||actorRole==="club_owner"){
      const{data}=await admin.from("profiles").select("id").eq("id",profileId).eq("club_id",targetClubId).maybeSingle();
      return Boolean(data);
    }
    const{data:links}=await admin.from("staff_venues").select("venue_id").eq("profile_id",profileId);
    return!(links||[]).some((x:any)=>!allowed.includes(x.venue_id));
  }

  if(body.action==="create_account"){
    const fullName=String(body.full_name||"").trim();
    const username=String(body.username||"").trim().toLowerCase();
    const password=String(body.password||"");
    const contactEmail=String(body.email||"").trim().toLowerCase();
    const portalAccess=body.portal_access!==false;
    const venueIds:string[]=Array.isArray(body.venue_ids)?body.venue_ids:[];
    const role=(actorRole==="admin"||actorRole==="club_owner")&&body.role==="org_admin"?"org_admin":"coach";
    const forcePasswordReset=body.force_password_reset!==false;
    const employmentType=["hourly","salaried","volunteer"].includes(body.employment_type)?body.employment_type:"hourly";
    const standardRate=Number(body.standard_rate??body.hourly_rate??0);
    const enhancedRate=Number(body.enhanced_rate??standardRate);
    const annualSalary=body.annual_salary==null||body.annual_salary===""?null:Number(body.annual_salary);
    const contractedWeeklyHours=body.contracted_weekly_hours==null||body.contracted_weekly_hours===""?null:Number(body.contracted_weekly_hours);
    const workingWeeksPerYear=body.working_weeks_per_year==null||body.working_weeks_per_year===""?null:Number(body.working_weeks_per_year);

    if(!fullName)return NextResponse.json({error:"Name is required"},{status:400});
    if(portalAccess&&!USERNAME_RE.test(username))return NextResponse.json({error:"Username must be 3–32 characters using letters, numbers, dots, dashes or underscores"},{status:400});
    if(portalAccess&&password.length<8)return NextResponse.json({error:"Password must be at least 8 characters"},{status:400});
    if(venueIds.some(id=>!allowed.includes(id)))return NextResponse.json({error:"You cannot add staff to that club"},{status:403});
    if(!Number.isFinite(standardRate)||standardRate<0||!Number.isFinite(enhancedRate)||enhancedRate<0)return NextResponse.json({error:"Standard and Enhanced rates must be zero or greater"},{status:400});
    if(employmentType==="salaried"&&(
      annualSalary===null||!Number.isFinite(annualSalary)||annualSalary<0||
      contractedWeeklyHours===null||!Number.isFinite(contractedWeeklyHours)||contractedWeeklyHours<=0||contractedWeeklyHours>168||
      workingWeeksPerYear===null||!Number.isFinite(workingWeeksPerYear)||workingWeeksPerYear<1||workingWeeksPerYear>52
    ))return NextResponse.json({error:"Salaried staff require a non-negative annual salary, contracted weekly hours up to 168, and working weeks between 1 and 52"},{status:400});

    if(portalAccess){
      const{data:existing}=await admin.from("profiles").select("id").eq("club_id",targetClubId).ilike("username",username).limit(1).maybeSingle();
      if(existing)return NextResponse.json({error:"That username is already in use"},{status:409});
    }

    // Every profile currently shares its id with auth.users. Staff without portal
    // access therefore receive an inaccessible Auth shell, but no login username.
    const accountKey=portalAccess?username:`staff.${randomUUID().slice(0,8)}`;
    const authEmail=`${accountKey}.${randomUUID().slice(0,8)}@login.avgymnastics.invalid`;
    const authPassword=portalAccess?password:randomUUID()+randomUUID();
    const{error:provisionError}=await admin.from("pending_auth_user_clubs").upsert({
      auth_email:authEmail.toLowerCase(),club_id:targetClubId,created_by:actorId,
      created_at:new Date().toISOString(),expires_at:new Date(Date.now()+10*60*1000).toISOString()
    });
    if(provisionError){
      console.error("[staff-access] tenant provisioning failed",{actorId,clubId:targetClubId,code:provisionError.code});
      return NextResponse.json({error:"Staff account creation could not prepare the secure club assignment"},{status:500});
    }
    const{data:created,error:createError}=await admin.auth.admin.createUser({
      email:authEmail,password:authPassword,email_confirm:true,
      user_metadata:{full_name:fullName,username:portalAccess?username:null,contact_email:contactEmail||null,portal_access:portalAccess},
      app_metadata:{club_id:targetClubId}
    });
    if(createError||!created.user){
      await admin.from("pending_auth_user_clubs").delete().eq("auth_email",authEmail.toLowerCase()).eq("created_by",actorId);
      console.error("[staff-access] Auth creation failed",{actorId,clubId:targetClubId,status:createError?.status,code:createError?.code,message:createError?.message});
      const duplicate=createError?.message?.toLowerCase().includes("already")||createError?.message?.toLowerCase().includes("registered");
      return NextResponse.json({error:duplicate?"An account already exists for that login email":"Staff account creation failed during Auth setup"},{status:duplicate?409:400});
    }

    const id=created.user.id;
    if(created.user.app_metadata?.club_id!==targetClubId){
      const{error:metadataError}=await admin.auth.admin.updateUserById(id,{app_metadata:{...created.user.app_metadata,club_id:targetClubId}});
      if(metadataError){
        const cleanup=await admin.auth.admin.deleteUser(id);
        console.error("[staff-access] Auth tenant metadata verification failed",{actorId,clubId:targetClubId,userId:id,cleanupFailed:Boolean(cleanup.error)});
        return NextResponse.json({error:`Staff account creation failed while confirming its club assignment${cleanup.error?"; automatic cleanup also failed, so contact support before retrying":""}`},{status:400});
      }
    }
    const{error:profileError}=await admin.from("profiles").upsert({
      id,full_name:fullName,username:portalAccess?username:null,
      email:contactEmail||null,contact_email:contactEmail||null,auth_email:authEmail,
      role,hourly_rate:standardRate,is_active:true,club_id:targetClubId,
      ...(body.employment_foundation_available===true?{employment_type:employmentType,standard_rate:standardRate,enhanced_rate:enhancedRate,can_volunteer:Boolean(body.can_volunteer),annual_salary:employmentType==="salaried"?annualSalary:null,contracted_weekly_hours:employmentType==="salaried"?contractedWeeklyHours:null,working_weeks_per_year:employmentType==="salaried"?workingWeeksPerYear:null,invoice_required:false}:{}),
      force_password_reset:portalAccess&&forcePasswordReset,password_changed_at:portalAccess?new Date().toISOString():null
    });
    if(profileError){
      const cleanup=await admin.auth.admin.deleteUser(id);
      console.error("[staff-access] profile setup failed",{actorId,clubId:targetClubId,userId:id,code:profileError.code,cleanupFailed:Boolean(cleanup.error)});
      return NextResponse.json({error:`Staff account creation failed while saving the profile${cleanup.error?"; automatic cleanup also failed, so contact support before retrying":""}`},{status:400});
    }

    if(venueIds.length){
      const adminVenueIds:string[]=(actorRole==="admin"||actorRole==="club_owner")&&Array.isArray(body.admin_venue_ids)?body.admin_venue_ids:[];
      const{error}=await admin.from("staff_venues").insert(venueIds.map(venue_id=>({
        profile_id:id,venue_id,is_admin:role==="org_admin"&&adminVenueIds.includes(venue_id)
      })));
      if(error){
        const cleanup=await admin.auth.admin.deleteUser(id);
        console.error("[staff-access] venue assignment failed",{actorId,clubId:targetClubId,userId:id,code:error.code,cleanupFailed:Boolean(cleanup.error)});
        return NextResponse.json({error:`Staff member was not created because access setup failed${cleanup.error?"; automatic cleanup also failed, so contact support before retrying":""}`},{status:400});
      }
    }
    const{data:savedLinks,error:verifyError}=await admin.from("staff_venues").select("venue_id").eq("profile_id",id);
    const savedIds=new Set((savedLinks||[]).map((link:any)=>link.venue_id));
    if(verifyError||savedIds.size!==new Set(venueIds).size||venueIds.some(venueId=>!savedIds.has(venueId))){
      const cleanup=await admin.auth.admin.deleteUser(id);
      return NextResponse.json({error:`Staff member was not created because its club setup could not be verified.${cleanup.error?" Automatic Auth cleanup also failed; contact support before retrying.":""}`},{status:400});
    }
    return NextResponse.json({ok:true,id,username:portalAccess?username:null,portal_access:portalAccess,venue_ids:venueIds});
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

    const{data:person,error:personError}=await admin.from("profiles").select("id,username,full_name,email,contact_email,auth_email,club_id").eq("id",profileId).single();
    if(personError||!person){
      console.error("[staff-access] identity profile lookup failed",{actorId,profileId,code:personError?.code,message:personError?.message});
      return NextResponse.json({error:"Staff member not found",code:"STAFF_NOT_FOUND"},{status:404});
    }
    if(person.club_id!==targetClubId)return NextResponse.json({error:"You do not manage this staff member",code:"TENANT_MISMATCH"},{status:403});

    const username=body.action==="update_identity"?String(body.username||"").trim().toLowerCase():String(person.username||"").trim().toLowerCase();
    const contactEmail=String(body.email||"").trim().toLowerCase();
    const fullName=body.action==="update_identity"?String(body.full_name||person.full_name||"").trim():String(person.full_name||"").trim();
    if(username&&!USERNAME_RE.test(username))return NextResponse.json({error:"Username must be 3–32 characters using letters, numbers, dots, dashes or underscores"},{status:400});

    if(username){
      const{data:usernameOwner}=await admin.from("profiles").select("id").eq("club_id",targetClubId).ilike("username",username).neq("id",profileId).limit(1).maybeSingle();
      if(usernameOwner)return NextResponse.json({error:"That username is already in use"},{status:409});
    }

    const authEmail=person.auth_email;
    const{error:metaError}=await admin.auth.admin.updateUserById(profileId,{user_metadata:{
      username:username||null,
      full_name:fullName,
      contact_email:contactEmail||null
    }});
    if(metaError){
      console.error("[staff-access] Auth identity metadata update failed",{actorId,profileId,clubId:targetClubId,status:metaError.status,code:metaError.code,message:metaError.message});
      return NextResponse.json({error:"Could not update staff account metadata",code:"AUTH_METADATA_UPDATE_FAILED"},{status:400});
    }

    const{error:profileError}=await admin.from("profiles").update({
      username:username||null,email:contactEmail||null,contact_email:contactEmail||null
    }).eq("id",profileId);
    if(profileError){
      console.error("[staff-access] identity profile update failed",{actorId,profileId,clubId:targetClubId,code:profileError.code,message:profileError.message});
      return NextResponse.json({error:"Could not save the staff recovery details",code:"PROFILE_IDENTITY_UPDATE_FAILED"},{status:400});
    }
    return NextResponse.json({ok:true,auth_email:authEmail});
  }

  return NextResponse.json({error:"Unknown action"},{status:400});
}
