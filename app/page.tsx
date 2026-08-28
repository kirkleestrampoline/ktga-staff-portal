"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const supabase = createClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    window.location.href = "/dashboard";
  }

  async function resetPassword() {
    if (!email) {
      setMessage("Enter your email address first.");
      return;
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/set-password`,
    });
    setMessage(error ? error.message : "Password reset email sent.");
  }

  return (
    <div className="loginPage">
      <div className="loginPanel">
        <form className="loginCard" onSubmit={signIn}>
          <div className="loginBrand">
            <div className="brandMark">KT</div>
            <div>
              <div style={{ fontWeight: 850 }}>KTGA Staff Portal</div>
              <div className="muted" style={{ fontSize: 12 }}>Hours, invoices and staff management</div>
            </div>
          </div>
          <h1>Welcome back</h1>
          <p>Sign in to manage your hours and account.</p>
          <div className="field">
            <label>Email address</label>
            <input type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field">
            <label>Password</label>
            <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          {message && <div className="notice">{message}</div>}
          <button className="btn btnPrimary" style={{ width: "100%" }} disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
          <button type="button" className="btn btnSecondary" style={{ width: "100%", marginTop: 10 }} onClick={resetPassword}>
            Forgot password?
          </button>
        </form>
      </div>
      <aside className="loginAside">
        <h2>One place for the people who run the programme.</h2>
        <p>Simple monthly hours, self-employed invoicing and staff administration — designed around how a gymnastics club actually works.</p>
      </aside>
    </div>
  );
}
