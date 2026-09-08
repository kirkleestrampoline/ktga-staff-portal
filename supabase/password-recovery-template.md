# Supabase password recovery configuration

The application uses Supabase Auth's supported recovery OTP. The API generates
the OTP against the internal Auth email, then sends it to the trusted
`profiles.contact_email` through Resend. It does not change `auth.users.email`
and does not use an application-owned OTP store.

Required Vercel environment variables:

- `RESEND_API_KEY`
- `PASSWORD_RECOVERY_FROM_EMAIL` (a verified Resend sender, for example
  `AV Gymnastics <accounts@example.com>`)

In the hosted Supabase Dashboard:

1. Open **Authentication → Email Templates → Reset password**.
2. Set the subject to:

   `Reset your AV Gymnastics Solutions password`

3. Set the body to:

   ```html
   <h2>Reset your AV Gymnastics Solutions password</h2>
   <p>Your password recovery code is</p>
   <p style="font-size:28px;font-weight:700;letter-spacing:6px">{{ .Token }}</p>
   <p>This code expires in 15 minutes.</p>
   <p>Enter this code into the AV Gymnastics Solutions password recovery screen.</p>
   ```

4. Open **Authentication → Sign In / Providers → Email** and set Email OTP
   expiration to `900` seconds (15 minutes).
5. Do not include `{{ .ConfirmationURL }}` in the recovery template. This keeps
   security scanners from consuming the recovery credential.

Supabase enforces code generation, expiry, single use and OTP verification. The
application resolves the account server-side, sends the generated OTP to the
saved recovery email, and verifies it against the unchanged internal Auth email.
