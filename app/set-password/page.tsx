"use client";

import { FormEvent, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function SetPasswordPage(){
  const supabase=createClient();
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [message,setMessage]=useState("Opening your secure invitation…");
  const [ready,setReady]=useState(false);
  const [busy,setBusy]=useState(false);

  useEffect(()=>{
    let mounted=true;
    async function check(){
      const {data:{session}}=await supabase.auth.getSession();
      if(mounted){
        setReady(!!session);
        setMessage(session?"Choose your password.":"If you arrived from an invitation email, wait a moment and refresh this page.");
      }
    }
    void check();
    const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(mounted&&session){setReady(true);setMessage("Choose your password.");}
    });
    return()=>{mounted=false;subscription.unsubscribe();}
  },[]);

  async function save(e:FormEvent){
    e.preventDefault();
    if(password.length<8){setMessage("Use at least 8 characters.");return}
    if(password!==confirm){setMessage("The two passwords do not match.");return}
    setBusy(true);
    const{error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error){setMessage(error.message);return}
    window.location.href="/dashboard";
  }

  return <div className="loginPage"><div className="loginPanel"><form className="loginCard" onSubmit={save}>
    <div className="loginBrand"><div className="brandMark">KT</div><div><div style={{fontWeight:850}}>KTGA Staff Portal</div><div className="muted" style={{fontSize:12}}>Account setup</div></div></div>
    <h1>Create your password</h1><p>{message}</p>
    <div className="field"><label>New password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} disabled={!ready} required/></div>
    <div className="field"><label>Confirm password</label><input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} disabled={!ready} required/></div>
    <button className="btn btnPrimary" style={{width:"100%"}} disabled={!ready||busy}>{busy?"Saving…":"Set password & continue"}</button>
  </form></div><aside className="loginAside"><h2>Your staff account, ready in a minute.</h2><p>Create a password, then you can enter monthly coaching hours, maintain your payment details and access your invoices.</p></aside></div>
}
