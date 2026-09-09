import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { resolvePortalAccount } from "@/lib/portal-account";

export async function POST(req:NextRequest){
  const body=await req.json();
  const identifier=String(body.identifier||"").trim().toLowerCase();
  const clubCode=String(body.club_code||"").trim().toLowerCase();
  const password=String(body.password||"");
  if(!identifier||!password)return NextResponse.json({error:"Username and password are required"},{status:400});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});

  const resolution=await resolvePortalAccount(admin,identifier,clubCode,{allowEmail:true});
  if(resolution.status==="ambiguous")return NextResponse.json({error:"These login details are used by more than one club. Enter your club code to continue.",code:"CLUB_CODE_REQUIRED"},{status:409});
  if(resolution.status==="lookup_error"){
    console.error("[login] account resolution failed",{code:resolution.code});
    return NextResponse.json({error:"Sign-in is temporarily unavailable"},{status:503});
  }
  if(resolution.status!=="found")return NextResponse.json({error:"Invalid club code, username or password"},{status:401});
  const{profile,club}=resolution;
  if(!profile.username)return NextResponse.json({error:"This staff profile does not have portal access."},{status:403});
  if(!profile.is_active)return NextResponse.json({error:"This account is inactive. Contact an administrator."},{status:403});
  if(club.active!==true)return NextResponse.json({error:"This club workspace is suspended. Contact your administrator.",code:"CLUB_SUSPENDED"},{status:403});

  let authEmail=String(profile.auth_email||"").trim().toLowerCase();
  if(!authEmail){
    const{data:userData}=await admin.auth.admin.getUserById(profile.id);
    authEmail=String(userData.user?.email||"").trim().toLowerCase();
  }
  if(!authEmail)return NextResponse.json({error:"This account is not configured for login. Contact an administrator."},{status:400});

  const supabase=await createClient();
  const{data,error}=await supabase.auth.signInWithPassword({email:authEmail,password});
  if(error||!data.user)return NextResponse.json({error:"Invalid username or password"},{status:401});

  if(data.user.id!==profile.id){
    await supabase.auth.signOut();
    return NextResponse.json({error:"Account configuration could not be verified"},{status:403});
  }
  await admin.from("profiles").update({last_login_at:new Date().toISOString()}).eq("id",profile.id);
  return NextResponse.json({ok:true,force_password_reset:Boolean(profile.force_password_reset)});
}
