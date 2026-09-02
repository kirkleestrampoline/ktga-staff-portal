import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const body=await req.json();
  const identifier=String(body.identifier||"").trim().toLowerCase();
  const password=String(body.password||"");
  if(!identifier||!password)return NextResponse.json({error:"Username and password are required"},{status:400});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});

  let query=admin.from("profiles").select("id,username,email,contact_email,auth_email,is_active,force_password_reset");
  const{data:profile,error:lookupError}=identifier.includes("@")
    ? await query.or(`email.eq.${identifier},contact_email.eq.${identifier},auth_email.eq.${identifier}`).maybeSingle()
    : await query.ilike("username",identifier).maybeSingle();

  if(lookupError||!profile)return NextResponse.json({error:"Invalid username or password"},{status:401});
  if(!profile.username)return NextResponse.json({error:"This staff profile does not have portal access."},{status:403});
  if(!profile.is_active)return NextResponse.json({error:"This account is inactive. Contact an administrator."},{status:403});

  let authEmail=String(profile.auth_email||"").trim().toLowerCase();
  if(!authEmail){
    const{data:userData}=await admin.auth.admin.getUserById(profile.id);
    authEmail=String(userData.user?.email||"").trim().toLowerCase();
    if(authEmail)await admin.from("profiles").update({auth_email:authEmail}).eq("id",profile.id);
  }
  if(!authEmail)return NextResponse.json({error:"This account is not configured for login. Contact an administrator."},{status:400});

  const supabase=await createClient();
  const{data,error}=await supabase.auth.signInWithPassword({email:authEmail,password});
  if(error||!data.user)return NextResponse.json({error:"Invalid username or password"},{status:401});

  await admin.from("profiles").update({last_login_at:new Date().toISOString()}).eq("id",profile.id);
  return NextResponse.json({ok:true,force_password_reset:Boolean(profile.force_password_reset)});
}
