import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

export async function POST(req:NextRequest){
  const body=await req.json();
  const identifier=String(body.identifier||"").trim().toLowerCase();
  const generic={message:"If this account has a recovery email, a reset link has been sent. Otherwise contact an administrator."};
  if(!identifier)return NextResponse.json(generic);

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  if(!url||!secret)return NextResponse.json(generic);
  const admin=createAdminClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false}});

  let query=admin.from("profiles").select("id,email,contact_email,auth_email");
  const{data:profile}=identifier.includes("@")
    ? await query.or(`email.eq.${identifier},contact_email.eq.${identifier},auth_email.eq.${identifier}`).maybeSingle()
    : await query.ilike("username",identifier).maybeSingle();

  if(!profile)return NextResponse.json(generic);
  const recovery=String(profile.contact_email||profile.email||"").trim().toLowerCase();
  if(!recovery)return NextResponse.json(generic);

  if(profile.auth_email!==recovery){
    const{error:updateError}=await admin.auth.admin.updateUserById(profile.id,{email:recovery,email_confirm:true});
    if(updateError)return NextResponse.json(generic);
    await admin.from("profiles").update({auth_email:recovery,email:recovery,contact_email:recovery}).eq("id",profile.id);
  }
  const siteUrl=process.env.NEXT_PUBLIC_SITE_URL||"https://staff.avgymnastics.co.uk";
  await admin.auth.resetPasswordForEmail(recovery,{redirectTo:`${siteUrl}/set-password?mode=recovery`});
  return NextResponse.json(generic);
}
