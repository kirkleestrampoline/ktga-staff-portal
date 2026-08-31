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
    let cancelled=false;

    async function prepare(){
      const params=new URLSearchParams(window.location.search);
      const queryMode=params.get("mode")||"recovery";
      const code=params.get("code");
      setMode(queryMode);

      // Supabase password-recovery links use a one-time code.
      // Exchange it for a browser session before calling updateUser().
      if(code){
        const{error}=await supabase.auth.exchangeCodeForSession(code);
        if(error){
          if(!cancelled){
            setMessage("This password reset link is invalid or has expired. Please request a new one.");
            setReady(true);
          }
          return;
        }

        // Remove the one-time code from the address bar once consumed.
        const clean=new URL(window.location.href);
        clean.searchParams.delete("code");
        window.history.replaceState({},document.title,clean.pathname+clean.search);
      }

      const{data}=await supabase.auth.getUser();
      if(!data.user){
        if(queryMode==="forced"){
          window.location.href="/";
          return;
        }
        if(!cancelled){
          setMessage("This password reset link has expired or has already been used. Please request a new one.");
          setReady(true);
        }
        return;
      }

      if(!cancelled)setReady(true);
    }

    void prepare();
    return()=>{cancelled=true};
  },[]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(password.length<8){setMessage("Use a password of at least 8 characters.");return}
    if(password!==confirm){setMessage("The passwords do not match.");return}

    setBusy(true);setMessage("");
    const{data,error}=await supabase.auth.updateUser({password});
    if(error){
      setBusy(false);
      setMessage(error.message==="Auth session missing"
        ?"Your reset session has expired. Please request a new password reset link."
        :error.message);
      return;
    }

    if(data.user){
      await supabase.from("profiles").update({
        force_password_reset:false,
        password_changed_at:new Date().toISOString()
      }).eq("id",data.user.id);
    }

    setBusy(false);
    window.location.href="/dashboard";
  }

  if(!ready)return <main className="v321PasswordPage"><div className="v321PasswordLoading">Securing your account…</div></main>;

  return <main className="v321PasswordPage">
    <div className="v321PasswordAurora"/>
    <section className="v321PasswordCard">
      <div className="v321PasswordBrand"><AvLogo size={58} showWordmark/></div>
      <div className="v321PasswordHeading">
        <span>{mode==="forced"?"Welcome to AV Gymnastics":"Secure your account"}</span>
        <h1>{mode==="forced"?"Choose your own password":"Set a new password"}</h1>
        <p>{mode==="forced"
          ?"Your temporary password worked. Choose a private password before continuing to the portal."
          :"Choose a new password for your AV Gymnastics account."}</p>
      </div>

      {message&&<div className="notice danger">{message}</div>}

      {!message.includes("expired")&&!message.includes("invalid")&&<form onSubmit={save}>
        <div className="field"><label>New password</label><input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Minimum 8 characters"/></div>
        <div className="field"><label>Confirm new password</label><input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></div>
        <button className="btn btnPrimary v321PasswordSubmit" disabled={busy}>{busy?"Updating…":"Save password & continue"}</button>
      </form>}

      <small className="v321PasswordHint">You can change your password again at any time from My Profile → Security.</small>
    </section>
  </main>
}
