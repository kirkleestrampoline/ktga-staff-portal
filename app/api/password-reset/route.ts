import { NextRequest, NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createHash } from "crypto";

const PUBLIC_MESSAGE="If this account has a recovery email, a recovery code has been sent. Otherwise contact an administrator.";
type RecoveryProfile={id:string;username:string|null;email:string|null;contact_email:string|null;auth_email:string|null};
type RateEntry={startedAt:number;count:number};

const RATE_WINDOW_MS=15*60*1000;
const REQUEST_LIMIT=3;
const VERIFY_LIMIT=8;
const recoveryRateLimits=new Map<string,RateEntry>();

function rateLimited(scope:string,value:string,limit:number){
  const now=Date.now();
  const key=createHash("sha256").update(`${scope}:${value}`).digest("hex");
  const current=recoveryRateLimits.get(key);
  if(!current||now-current.startedAt>=RATE_WINDOW_MS){recoveryRateLimits.set(key,{startedAt:now,count:1});return false}
  current.count+=1;
  return current.count>limit;
}

function escapeHtml(value:string){return value.replace(/[&<>"']/g,character=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]!))}

async function sendRecoveryCode(destination:string,code:string){
  const apiKey=process.env.RESEND_API_KEY;
  const from=process.env.PASSWORD_RECOVERY_FROM_EMAIL;
  if(!apiKey||!from)return{ok:false,reason:"configuration_missing"};
  const response=await fetch("https://api.resend.com/emails",{
    method:"POST",
    headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      from,to:[destination],subject:"Reset your AV Gymnastics Solutions password",
      html:`<h2>Reset your AV Gymnastics Solutions password</h2><p>Your password recovery code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${escapeHtml(code)}</p><p>This code expires in 15 minutes.</p><p>Enter this code into the AV Gymnastics Solutions password recovery screen.</p>`
    })
  });
  if(!response.ok)return{ok:false,reason:`provider_${response.status}`};
  return{ok:true,reason:"sent"};
}

export async function POST(req:NextRequest){
  const body=await req.json();
  const action=String(body.action||"request");
  const identifier=String(body.identifier||"").trim().toLowerCase();
  const clientAddress=(req.headers.get("x-forwarded-for")||req.headers.get("x-real-ip")||"unknown").split(",")[0].trim();
  const generic=NextResponse.json({ok:true,message:PUBLIC_MESSAGE});
  if(!identifier)return action==="request"?generic:NextResponse.json({error:"Enter your username or recovery email."},{status:400});
  if(rateLimited(action,`${clientAddress}:${identifier}`,action==="request"?REQUEST_LIMIT:VERIFY_LIMIT))return action==="request"?generic:NextResponse.json({error:"Too many attempts. Wait before trying again."},{status:429});

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
    const authEmail=String(profile.auth_email||"").trim().toLowerCase();
    if(!authEmail){console.warn("[password-recovery] portal account has no internal Auth email",{userId:profile.id});return generic}
    const{data:link,error:linkError}=await admin.auth.admin.generateLink({type:"recovery",email:authEmail});
    if(linkError||!link.properties?.email_otp){
      console.warn("[password-recovery] code generation failed",{userId:profile.id,code:(linkError as any)?.code||"missing_otp"});
      return generic;
    }
    if(!/^\d{8}$/.test(link.properties.email_otp)){
      console.error("[password-recovery] Supabase recovery OTP length is not configured for the 8-digit interface",{userId:profile.id,length:link.properties.email_otp.length});
      return generic;
    }
    try{
      const delivery=await sendRecoveryCode(recoveryEmail,link.properties.email_otp);
      if(!delivery.ok)console.error("[password-recovery] recovery email delivery failed",{userId:profile.id,reason:delivery.reason});
      else console.info("[password-recovery] recovery email delivered",{userId:profile.id});
    }catch(error:any){
      console.error("[password-recovery] recovery email provider request failed",{userId:profile.id,name:error?.name||"Error"});
    }
    return generic;
  }

  if(action!=="verify_and_change")return NextResponse.json({error:"Unknown action"},{status:400});
  const token=String(body.token||"").replace(/\s+/g,"");
  const password=String(body.password||"");
  if(!/^\d{8}$/.test(token))return NextResponse.json({error:"Enter the 8-digit verification code."},{status:400});
  if(password.length<8)return NextResponse.json({error:"Use a password of at least 8 characters."},{status:400});

  const recoveryClient=createSupabaseClient(url,publishableKey,{auth:{autoRefreshToken:false,persistSession:false,detectSessionInUrl:false}});
  const authEmail=String(profile.auth_email||"").trim().toLowerCase();
  if(!authEmail)return NextResponse.json({error:"Recovery code is invalid or expired."},{status:400});
  const{data:verification,error:verifyError}=await recoveryClient.auth.verifyOtp({email:authEmail,token,type:"recovery"});
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
