"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import AvLogo from "@/components/av-logo";

function MailGlyph(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6.5h16v11H4z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="m4.7 7.2 7.3 5.7 7.3-5.7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>}
function LockGlyph(){return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8.3 10V7.4a3.7 3.7 0 0 1 7.4 0V10" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>}
function EyeGlyph({off=false}:{off?:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.4-5.2 9.2-5.2S21.2 12 21.2 12s-3.4 5.2-9.2 5.2S2.8 12 2.8 12Z" fill="none" stroke="currentColor" strokeWidth="1.6"/><circle cx="12" cy="12" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.6"/>{off&&<path d="m4 4 16 16" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/>}</svg>}

export default function LoginPage(){
  const supabase=createClient();
  const[email,setEmail]=useState("");
  const[password,setPassword]=useState("");
  const[message,setMessage]=useState("");
  const[busy,setBusy]=useState(false);
  const[showPassword,setShowPassword]=useState(false);

  async function signIn(event:FormEvent){
    event.preventDefault();setBusy(true);setMessage("");
    const{data,error}=await supabase.auth.signInWithPassword({email,password});
    if(error){setBusy(false);setMessage(error.message);return}
    if(data.user){
      await supabase.from("profiles").update({last_login_at:new Date().toISOString()}).eq("id",data.user.id);
    }
    setBusy(false);
    window.location.href="/dashboard";
  }

  async function resetPassword(){
    if(!email){setMessage("Enter your email address first.");return}
    const{error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:`${window.location.origin}/set-password?mode=recovery&email=${encodeURIComponent(email.toLowerCase())}`});
    setMessage(error?error.message:"Password reset email sent. Check your inbox.");
  }

  return <main className="v3LoginPage">
    <section className="v3LoginBrandPanel">
      <div className="v3Aurora v3AuroraPurple"/><div className="v3Aurora v3AuroraGreen"/>
      <div className="v3LoginBrandInner">
        <AvLogo size={62} showWordmark inverse/>
        <div className="v3LoginBrandCopy"><span className="v3Eyebrow">Built for gymnastics teams</span><h1>Everything your coaching team needs. In one place.</h1><p>Simple scheduling, accurate hours and clear payroll — without the admin getting in the way of coaching.</p></div>
        <div className="v3BrandFeatures"><div><span className="v3FeatureIcon">01</span><strong>Smart scheduling</strong><small>Know who is coaching, where and when.</small></div><div><span className="v3FeatureIcon">02</span><strong>Simple timesheets</strong><small>Confirm work directly from the rota.</small></div><div><span className="v3FeatureIcon">03</span><strong>Clear payroll</strong><small>Approvals and hours without guesswork.</small></div></div>
      </div>
    </section>

    <section className="v3LoginFormPanel">
      <div className="v3MobileBrand"><AvLogo size={52} showWordmark/></div>
      <form className="v3LoginCard" onSubmit={signIn}>
        <div className="v3LoginHeading"><span className="v3Eyebrow">AV Gymnastics</span><h2>Welcome back</h2><p>Sign in to continue to your workspace.</p></div>
        <div className="v3Field"><label>Email address</label><div className="v3InputShell"><span className="v3InputIcon"><MailGlyph/></span><input type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e=>setEmail(e.target.value)} required/></div></div>
        <div className="v3Field"><div className="v3FieldHead"><label>Password</label><button type="button" className="v3TextButton" onClick={resetPassword}>Forgot password?</button></div><div className="v3InputShell"><span className="v3InputIcon"><LockGlyph/></span><input type={showPassword?"text":"password"} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e=>setPassword(e.target.value)} required/><button className="v3PasswordToggle" type="button" aria-label={showPassword?"Hide password":"Show password"} onClick={()=>setShowPassword(!showPassword)}><EyeGlyph off={showPassword}/></button></div></div>
        {message&&<div className="v3LoginNotice">{message}</div>}
        <button className="v3SignInButton" disabled={busy}>{busy?<><span className="v3Spinner"/>Signing in…</>:"Sign in"}</button>
        <p className="v3LoginSupport">Secure access for AV Gymnastics staff and coaches.</p>
      </form>
      <div className="v3LoginFooter"><span>AV Gymnastics</span><span>Coach. Schedule. Perform.</span></div>
    </section>
  </main>;
}
