"use client";

import { ClipboardEvent, FormEvent, KeyboardEvent, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AvLogo from "@/components/av-logo";

export default function SetPasswordPage(){
  const supabase=createClient();
  const [mode,setMode]=useState("recovery");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [digits,setDigits]=useState<string[]>(()=>Array(8).fill(""));
  const [identifier,setIdentifier]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [ready,setReady]=useState(false);
  const [complete,setComplete]=useState(false);
  const [resendSeconds,setResendSeconds]=useState(60);
  const otpRefs=useRef<Array<HTMLInputElement|null>>([]);
  const passwordRef=useRef<HTMLInputElement|null>(null);
  const token=digits.join("");

  useEffect(()=>{
    async function prepare(){
      const params=new URLSearchParams(window.location.search);
      const queryMode=params.get("mode")||"recovery";
      setMode(queryMode);

      if(queryMode==="forced"){
        const{data}=await supabase.auth.getUser();
        if(!data.user){window.location.href="/";return}
        setReady(true);
        return;
      }
      const savedIdentifier=sessionStorage.getItem("av-recovery-identifier")||"";
      setIdentifier(savedIdentifier);
      if(!savedIdentifier)setMessage("Start password recovery from the sign-in page to request a code.");
      setReady(true);
    }

    void prepare();
  },[]);

  useEffect(()=>{
    if(mode!=="recovery"||resendSeconds<=0)return;
    const timer=window.setInterval(()=>setResendSeconds(value=>Math.max(0,value-1)),1000);
    return()=>window.clearInterval(timer);
  },[mode,resendSeconds]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(password.length<8){setMessage("Use a password of at least 8 characters.");return}
    if(password!==confirm){setMessage("The passwords do not match.");return}

    setBusy(true);setMessage("");
    if(mode==="recovery"){
      if(!identifier){setBusy(false);setMessage("Start password recovery from the sign-in page to request a code.");return}
      if(!/^\d{8}$/.test(token)){setBusy(false);setMessage("Enter the 8-digit verification code.");return}
      try{
        const response=await fetch("/api/password-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"verify_and_change",identifier,token,password})});
        const body=await response.json();
        setBusy(false);
        if(!response.ok){setMessage(body.error||"Recovery code is invalid or expired.");return}
        sessionStorage.removeItem("av-recovery-identifier");
        setComplete(true);setMessage("");
      }catch{setBusy(false);setMessage("Password recovery is temporarily unavailable. Please try again.")}
      return;
    }

    const{data,error}=await supabase.auth.updateUser({password});
    if(error){setBusy(false);setMessage(error.message);return}
    if(data.user)await supabase.from("profiles").update({force_password_reset:false,password_changed_at:new Date().toISOString()}).eq("id",data.user.id);
    setBusy(false);window.location.href="/dashboard";
  }

  async function resend(){
    if(!identifier||resendSeconds>0)return;
    setBusy(true);setMessage("");
    try{
      await fetch("/api/password-reset",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"request",identifier})});
      setMessage("If this account has a recovery email, a new code has been sent.");
      setResendSeconds(60);
    }catch{setMessage("Could not request another code. Please try again.")}
    finally{setBusy(false)}
  }

  function applyOtp(startIndex:number,raw:string){
    const incoming=raw.replace(/\D/g,"").slice(0,8);
    if(!incoming)return;
    const start=incoming.length===8?0:startIndex;
    const next=incoming.length===8?Array(8).fill(""):[...digits];
    incoming.split("").forEach((digit,offset)=>{if(start+offset<8)next[start+offset]=digit});
    setDigits(next);
    const nextIndex=start+incoming.length;
    window.requestAnimationFrame(()=>{
      if(next.every(Boolean))passwordRef.current?.focus();
      else otpRefs.current[Math.min(nextIndex,7)]?.focus();
    });
  }

  function handleOtpChange(index:number,value:string){
    const incoming=value.replace(/\D/g,"");
    if(!incoming){const next=[...digits];next[index]="";setDigits(next);return}
    applyOtp(index,incoming);
  }

  function handleOtpKeyDown(index:number,event:KeyboardEvent<HTMLInputElement>){
    if(event.key==="Backspace"){
      event.preventDefault();
      const next=[...digits];
      const target=digits[index]?Math.max(0,index-1):Math.max(0,index-1);
      if(digits[index])next[index]="";else next[target]="";
      setDigits(next);otpRefs.current[target]?.focus();
    }else if(event.key==="ArrowLeft"){
      event.preventDefault();otpRefs.current[Math.max(0,index-1)]?.focus();
    }else if(event.key==="ArrowRight"){
      event.preventDefault();otpRefs.current[Math.min(7,index+1)]?.focus();
    }else if(event.key==="Delete"){
      event.preventDefault();const next=[...digits];next[index]="";setDigits(next);
    }
  }

  function handleOtpPaste(event:ClipboardEvent<HTMLDivElement>){
    event.preventDefault();
    const activeIndex=otpRefs.current.findIndex(input=>input===document.activeElement);
    applyOtp(activeIndex>=0?activeIndex:0,event.clipboardData.getData("text"));
  }

  if(!ready)return <main className="v321PasswordPage"><div className="v321PasswordLoading">Securing your account…</div></main>;

  return <main className="v321PasswordPage">
    <div className="v321PasswordAurora"/>
    <section className="v321PasswordCard">
      <div className="v321PasswordBrand"><AvLogo size={58} showWordmark/></div>
      <div className="v321PasswordHeading">
        <span>{mode==="forced"?"Welcome to AV Gymnastics":"Password recovery"}</span>
        <h1>{mode==="forced"?"Choose your own password":complete?"Password changed":"Enter your recovery code"}</h1>
        <p>{mode==="forced"
          ?"Your temporary password worked. Choose a private password before continuing to the portal."
          :complete?"Your password has been changed successfully. You can now sign in with your new password.":"Enter the 8-digit code from your email, then choose a new password."}</p>
      </div>

      {message&&<div className={`notice ${/^If this account/i.test(message)?"":"danger"}`}>{message}</div>}

      {!complete&&<form onSubmit={save}>
        {mode==="recovery"&&<div className="field v522OtpField"><label id="recovery-code-label">Recovery verification code</label><div className="v522OtpGroup" role="group" aria-labelledby="recovery-code-label" onPaste={handleOtpPaste}>{digits.map((digit,index)=><span className={index===4?"v522OtpSlot v522OtpBreak":"v522OtpSlot"} key={index}><input ref={element=>{otpRefs.current[index]=element}} aria-label={`Verification code digit ${index+1} of 8`} inputMode="numeric" pattern="[0-9]*" autoComplete={index===0?"one-time-code":"off"} maxLength={8} value={digit} onFocus={event=>event.currentTarget.select()} onChange={event=>handleOtpChange(index,event.target.value)} onKeyDown={event=>handleOtpKeyDown(index,event)}/></span>)}</div></div>}
        <div className="field"><label>New password</label><input ref={passwordRef} type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters"/></div>
        <div className="field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
        <button className="btn btnPrimary v321PasswordSubmit" disabled={busy||mode==="recovery"&&!identifier}>{busy?"Updating…":mode==="forced"?"Save password & continue":"Change password"}</button>
      </form>}
      {mode==="recovery"&&!complete&&<div className="v521RecoveryActions"><button type="button" className="v3TextButton" disabled={busy||resendSeconds>0||!identifier} onClick={resend}>{resendSeconds>0?`Resend code in ${resendSeconds}s`:"Resend code"}</button><a href="/">Back to sign in</a></div>}
      {complete&&<a className="btn btnPrimary v321PasswordSubmit" href="/">Return to sign in</a>}
      {mode==="forced"&&<small className="v321PasswordHint">You can change your password again at any time from My Profile → Security.</small>}
    </section>
  </main>
}
