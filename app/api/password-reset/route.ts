import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const PUBLIC_MESSAGE="If this account has a recovery email, a recovery code has been sent. Otherwise contact an administrator.";
type RecoveryProfile={id:string;username:string|null;email:string|null;contact_email:string|null;auth_email:string|null};

export async function POST(req:NextRequest){
  const body=await req.json();
  const action=String(body.action||"request");
  const identifier=String(body.identifier||"").trim().toLowerCase();
  const generic=NextResponse.json({ok:true,message:PUBLIC_MESSAGE});
  if(!identifier)return action==="request"?generic:NextResponse.json({error:"Enter your username or recovery email."},{status:400});

  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret=process.env.SUPABASE_SECRET_KEY;
  const publishableKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!secret||!publishableKey){
    console.error("[password-recovery] Supabase server configuration is incomplete");
    return action==="request"?generic:NextResponse.json({error:"Password recovery is temporarily unavailable."},{status:503});
  }

  const admin=createSupabaseClient(url,secret,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  let query=admin.from("profiles").select("id,username,email,contact_email,auth_email");
  const{data,error:lookupError}=identifier.includes("@")
    ? await query.or(`email.eq.${identifier},contact_email.eq.${identifier},auth_email.eq.${identifier}`).maybeSingle()
    : await query.ilike("username",identifier).maybeSingle();
  const profile=(data||null) as RecoveryProfile|null;

  if(lookupError)console.warn("[password-recovery] profile lookup failed",{action,code:lookupError.code});
  if(!profile?.username){
    console.info("[password-recovery] request did not resolve to a portal account",{action});
    return action==="request"?generic:NextResponse.json({error:"Recovery code is invalid or expired."},{status:400});
  }
  const recoveryEmail=String(profile.contact_email||profile.email||"").trim().toLowerCase();
  if(!recoveryEmail){
    console.info("[password-recovery] portal account has no recovery email",{action,userId:profile.id});
    return action==="request"?generic:NextResponse.json({error:"Recovery code is invalid or expired."},{status:400});
  }

  if(action==="request"){
    if(profile.auth_email!==recoveryEmail){
      const{error:updateError}=await admin.auth.admin.updateUserById(profile.id,{email:recoveryEmail,email_confirm:true});
      if(updateError){
        console.warn("[password-recovery] auth email synchronisation failed",{userId:profile.id,code:updateError.code});
        return generic;
      }
      const{error:profileError}=await admin.from("profiles").update({auth_email:recoveryEmail,email:recoveryEmail,contact_email:recoveryEmail}).eq("id",profile.id);
      if(profileError){
        console.warn("[password-recovery] profile email synchronisation failed",{userId:profile.id,code:profileError.code});
        return generic;
      }
    }
    // The hosted recovery template displays {{ .Token }}. There is no
    // token-consuming link or redirect in this recovery flow.
    const{error}=await admin.auth.resetPasswordForEmail(recoveryEmail);
    if(error)console.warn("[password-recovery] code request failed",{userId:profile.id,code:(error as any).code||"unknown"});
    else console.info("[password-recovery] code requested",{userId:profile.id});
    return generic;
  }

  if(action!=="verify_and_change")return NextResponse.json({error:"Unknown action"},{status:400});
  const token=String(body.token||"").replace(/\s+/g,"");
  const password=String(body.password||"");
  if(!/^\d{8}$/.test(token))return NextResponse.json({error:"Enter the 8-digit verification code."},{status:400});
  if(password.length<8)return NextResponse.json({error:"Use a password of at least 8 characters."},{status:400});

  const recoveryClient=createSupabaseClient(url,publishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const{data:verification,error:verifyError}=await recoveryClient.auth.verifyOtp({email:recoveryEmail,token,type:"recovery"});
  if(verifyError||!verification.user){
    console.warn("[password-recovery] code verification failed",{userId:profile.id,code:(verifyError as any)?.code||"invalid_otp"});
    return NextResponse.json({error:"Recovery code is invalid or expired."},{status:400});
  }
  const{error:passwordError}=await recoveryClient.auth.updateUser({password});
  if(passwordError){
    console.warn("[password-recovery] password update failed",{userId:profile.id,code:(passwordError as any).code||"unknown"});
    return NextResponse.json({error:"The password could not be changed. Request a new recovery code and try again."},{status:400});
  }
  const{error:profileError}=await admin.from("profiles").update({force_password_reset:false,password_changed_at:new Date().toISOString()}).eq("id",profile.id);
  if(profileError)console.warn("[password-recovery] password metadata update failed",{userId:profile.id,code:profileError.code});
  await recoveryClient.auth.signOut({scope:"global"});
  console.info("[password-recovery] password changed",{userId:profile.id});
  return NextResponse.json({ok:true,message:"Password changed successfully."});
}
