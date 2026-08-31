import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const supabase=await createClient();
  const{data:{user}}=await supabase.auth.getUser();
  if(!user)return NextResponse.json({error:"Not signed in"},{status:401});

  const body=await req.json();
  const email=String(body.email||"").trim().toLowerCase();
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json({error:"Server configuration is missing"},{status:500});
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});

  const{data:profile}=await admin.from("profiles").select("username,auth_email").eq("id",user.id).single();
  if(!profile)return NextResponse.json({error:"Profile not found"},{status:404});

  let authEmail=String(profile.auth_email||user.email||"");
  if(email){
    const{error}=await admin.auth.admin.updateUserById(user.id,{email,email_confirm:true});
    if(error)return NextResponse.json({error:error.message},{status:400});
    authEmail=email;
  }
  const{error:profileError}=await admin.from("profiles").update({
    email:email||null,contact_email:email||null,auth_email:authEmail
  }).eq("id",user.id);
  if(profileError)return NextResponse.json({error:profileError.message},{status:400});
  return NextResponse.json({ok:true});
}
