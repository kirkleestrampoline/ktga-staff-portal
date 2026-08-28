"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage(){
  const supabase=createClient();
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState("Checking your secure link…");
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);
  const [expectedEmail,setExpectedEmail]=useState("");

  useEffect(()=>{
    let cancelled=false;
    async function initialise(){
      const url=new URL(window.location.href);
      const expected=(url.searchParams.get("email")||"").toLowerCase();
      setExpectedEmail(expected);
      const hash=new URLSearchParams(window.location.hash.replace(/^#/,""));
      const hashError=hash.get("error_description")||hash.get("error");
      if(hashError){setMessage(hashError.replace(/\+/g," "));return}

      const access=hash.get("access_token");
      const refresh=hash.get("refresh_token");
      const code=url.searchParams.get("code");

      // Never allow an existing admin/other local session to be used to set this password.
      await supabase.auth.signOut({scope:"local"});

      let error:any=null;
      if(access&&refresh){
        const result=await supabase.auth.setSession({access_token:access,refresh_token:refresh});
        error=result.error;
      }else if(code){
        const result=await supabase.auth.exchangeCodeForSession(code);
        error=result.error;
      }else{
        setMessage("This setup link does not contain a valid invitation or recovery token. Please use the newest link you were sent.");
        return;
      }

      if(error){setMessage(error.message);return}
      const{data:{user}}=await supabase.auth.getUser();
      if(!user){setMessage("We could not verify this account setup link. Please request a new one.");return}
      if(expected && user.email?.toLowerCase()!==expected){
        await supabase.auth.signOut({scope:"local"});
        setMessage("This link belongs to a different account. Please open the newest link for your own email address.");
        return;
      }
      if(!cancelled){
        setReady(true);
        setMessage(`Set a password for ${user.email||"your account"}.`);
        history.replaceState({},"",`/set-password${expected?`?email=${encodeURIComponent(expected)}`:""}`);
      }
    }
    void initialise();
    return()=>{cancelled=true};
  },[]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(password.length<8){setMessage("Use at least 8 characters.");return}
    if(password!==confirm){setMessage("The two passwords do not match.");return}
    setBusy(true);
    const{data:{user}}=await supabase.auth.getUser();
    if(!user || (expectedEmail&&user.email?.toLowerCase()!==expectedEmail)){
      setBusy(false);setReady(false);setMessage("The secure session does not match this account. Please use a fresh setup link.");return;
    }
    const{error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error){setMessage(error.message);return}
    window.location.href="/dashboard";
  }

  return <div className="loginPage"><div className="loginPanel"><form className="loginCard" onSubmit={save}>
    <div className="loginBrand"><div className="brandMark">AV</div><div><div style={{fontWeight:850}}>AV Gymnastics Solutions</div><div className="muted" style={{fontSize:12}}>Secure account setup</div></div></div>
    <h1>Create your password</h1><p>{message}</p>
    <div className="field"><label>New password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={!ready} required autoComplete="new-password"/></div>
    <div className="field"><label>Confirm password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={!ready} required autoComplete="new-password"/></div>
    <button className="btn btnPrimary" style={{width:"100%"}} disabled={!ready||busy}>{busy?"Saving…":"Set password & continue"}</button>
  </form></div><aside className="loginAside"><div className="brandGlow brandGlowPurple"/><div className="brandGlow brandGlowGreen"/><h2>One portal for your coaching work.</h2><p>Log hours, choose the venue you worked at, maintain your payment details and submit your monthly invoice.</p></aside></div>
}
