"use client";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email,setEmail] = useState("");
  const [password,setPassword] = useState("");
  const [message,setMessage] = useState("");
  const [busy,setBusy] = useState(false);

  async function signIn(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if(error){ setMessage(error.message); return; }
    window.location.href="/dashboard";
  }

  async function resetPassword() {
    if(!email){ setMessage("Enter your email address first."); return; }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/dashboard`
    });
    setMessage(error ? error.message : "Password reset email sent.");
  }

  return <div className="loginWrap">
    <form className="loginCard" onSubmit={signIn}>
      <h1>Coach Hours</h1>
      <div className="sub">Staff login</div>
      <div className="field"><label>Email</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required /></div>
      <div className="field"><label>Password</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required /></div>
      {message && <div className="notice">{message}</div>}
      <button className="btn primary" style={{width:"100%"}} disabled={busy}>{busy?"Signing in...":"Sign in"}</button>
      <button type="button" className="btn secondary" style={{width:"100%",marginTop:10}} onClick={resetPassword}>Forgot password?</button>
    </form>
  </div>
}
