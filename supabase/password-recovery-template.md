# Supabase password recovery configuration

The application uses Supabase Auth's supported recovery OTP. It does not use a
clickable verification link or an application-owned OTP store.

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

Supabase enforces code generation, expiry, single use, resend limits and OTP
verification. The application only resolves usernames to the confirmed recovery
email and submits the user-entered code through `verifyOtp` with type `recovery`.
