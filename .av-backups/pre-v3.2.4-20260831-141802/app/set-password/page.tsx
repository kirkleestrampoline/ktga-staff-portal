"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AvLogo from "@/components/av-logo";

export default function SetPasswordPage(){
  const supabase=createClient();
  const [mode,setMode]=useState("recovery");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [ready,setReady]=useState(false);

  useEffect(()=>{
    const queryMode=new URLSearchParams(window.location.search).get("mode")||"recovery";
    setMode(queryMode);
    supabase.auth.getUser().then(({data})=>{
      if(!data.user&&queryMode==="forced"){window.location.href="/";return}
      setReady(true);
    });
  },[]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(password.length<8){setMessage("Use a password of at least 8 characters.");return}
    if(password!==confirm){setMessage("The passwords do not match.");return}
    setBusy(true);setMessage("");
    const{data,error}=await supabase.auth.updateUser({password});
    if(error){setBusy(false);setMessage(error.message);return}
    if(data.user){
      await supabase.from("profiles").update({
        force_password_reset:false,
        password_changed_at:new Date().toISOString()
      }).eq("id",data.user.id);
    }
    setBusy(false);
    window.location.href="/dashboard";
  }

  if(!ready)return <main className="v321PasswordPage"><div className="v321PasswordLoading">Loading…</div></main>;

  return <main className="v321PasswordPage">
    <div className="v321PasswordAurora"/>
    <section className="v321PasswordCard">
      <div className="v321PasswordBrand"><AvLogo size={58} showWordmark/></div>
      <div className="v321PasswordHeading">
        <span>{mode==="forced"?"Welcome to AV Gymnastics":"Secure your account"}</span>
        <h1>{mode==="forced"?"Choose your own password":"Set a new password"}</h1>
        <p>{mode==="forced"?"Your temporary password worked. Choose a private password before continuing to the portal.":"Choose a new password for your AV Gymnastics account."}</p>
      </div>
      {message&&<div className="notice danger">{message}</div>}
      <form onSubmit={save}>
        <div className="field"><label>New password</label><input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters"/></div>
        <div className="field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
        <button className="btn btnPrimary v321PasswordSubmit" disabled={busy}>{busy?"Updating…":"Save password & continue"}</button>
      </form>
      <small className="v321PasswordHint">You can change your password again at any time from My Profile → Security.</small>
    </section>
  </main>
}
