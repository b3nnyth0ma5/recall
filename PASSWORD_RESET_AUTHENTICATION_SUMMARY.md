
# Password Reset Authentication Fix - Summary

## Problem
The password reset flow was failing with "[UpdatePassword] No session found" error because:
1. The password reset email wasn't properly configured to pass authentication tokens
2. The `/update-password` route wasn't extracting and verifying the token from the URL
3. No session was being established before attempting to update the password

## Solution

### 1. Updated `/update-password` Route
The `app/update-password.tsx` file now:
- Extracts `token_hash` and `type` parameters from the URL
- Uses `supabase.auth.verifyOtp()` to verify the token and establish a session
- Falls back to checking for an existing session if no token is in the URL
- Provides detailed logging for debugging
- Shows appropriate error messages if the link is invalid or expired

### 2. Supabase Email Template Configuration
You need to configure the **Password Reset** email template in your Supabase project to include the correct redirect URL with token parameters.

#### Steps to Configure:
1. Go to your Supabase Dashboard
2. Navigate to **Authentication** → **Email Templates**
3. Select the **Reset Password** template (also called "Recovery" template)
4. Update the template to use the following format:

```html
<h2>Reset Your Password</h2>

<p>Follow this link to reset the password for your user:</p>
<p>
  <a href="{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery">
    Reset Password
  </a>
</p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery</p>
```

**Important:** Replace `{{ .SiteURL }}` with your actual app URL if needed. The current configuration uses:
- Production: `https://recall.expo.app`
- The `{{ .SiteURL }}` variable should be configured in your Supabase project settings

### 3. Supabase Project Settings
Ensure the following settings are configured in your Supabase project:

#### Site URL Configuration
1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://recall.expo.app`

#### Redirect URLs
Add the following to your **Redirect URLs** allowlist:
- `https://recall.expo.app/update-password`
- `https://recall.expo.app/email-confirmed`
- `https://recall.expo.app/*` (wildcard for all routes)

#### JWT Expiry
1. Go to **Authentication** → **Settings**
2. Check **JWT Expiry Limit** - it should be set to at least **3600 seconds (60 minutes)**
3. This ensures the session remains active for at least 60 minutes after the user clicks the reset link

### 4. How It Works

#### Password Reset Flow:
1. User clicks "Forgot Password" on login screen
2. User enters their email in `/reset-password`
3. `supabase.auth.resetPasswordForEmail()` is called with `redirectTo: AUTH_REDIRECT_URLS.UPDATE_PASSWORD`
4. Supabase sends an email with a link like:
   ```
   https://recall.expo.app/update-password?token_hash=abc123...&type=recovery
   ```
5. User clicks the link in their email
6. The app opens to `/update-password` with the token parameters
7. The `update-password` screen:
   - Extracts `token_hash` and `type` from URL
   - Calls `supabase.auth.verifyOtp({ token_hash, type })` to verify the token
   - This establishes a valid session that lasts for the JWT expiry time (60+ minutes)
8. User enters their new password
9. `supabase.auth.updateUser({ password })` is called to update the password
10. User is signed out and redirected to login to sign in with new password

### 5. Session Duration
The session established by `verifyOtp()` will remain active for the duration specified in your Supabase project's **JWT Expiry Limit** setting. By default, this is:
- **3600 seconds (60 minutes)** for access tokens
- Refresh tokens never expire and can be used to get new access tokens

This means users have at least 60 minutes to update their password after clicking the reset link.

### 6. Testing the Flow

#### Test Password Reset:
1. Go to the login screen
2. Click "Forgot Password?"
3. Enter your email address
4. Check your email for the password reset link
5. Click the link in the email
6. You should be taken to the update password screen
7. Enter a new password (at least 6 characters)
8. Click "Update Password"
9. You should see a success message and be redirected to login
10. Sign in with your new password

#### Debugging:
Check the console logs for detailed information:
- `[UpdatePassword]` - Logs from the update password screen
- `[ResetPassword]` - Logs from the reset password request
- `[Supabase Auth]` - Logs from the Supabase auth client

### 7. Error Handling
The implementation includes comprehensive error handling:
- Invalid or expired tokens show an appropriate error message
- Network errors are caught and displayed to the user
- Session verification failures redirect to login with an explanation
- All errors are logged to the console for debugging

### 8. Security Considerations
- Tokens are single-use only (once verified, they cannot be reused)
- Tokens expire after 24 hours by default (configurable in Supabase)
- Sessions expire after 60 minutes (configurable via JWT Expiry Limit)
- Users are signed out after password update to ensure they use the new password
- All password reset attempts are rate-limited by Supabase

## Files Modified
1. `app/update-password.tsx` - Complete rewrite to handle token verification
2. `constants/config.ts` - Already had correct redirect URLs configured
3. `app/reset-password.tsx` - Already correctly configured to use `AUTH_REDIRECT_URLS.UPDATE_PASSWORD`

## Next Steps
1. **Configure the Supabase email template** as described above
2. **Verify the Site URL** in Supabase project settings
3. **Add redirect URLs** to the allowlist
4. **Test the complete flow** end-to-end
5. **Monitor logs** for any issues

## Additional Notes
- The `email-confirmed.tsx` route also handles password reset tokens and can redirect to `/update-password` if needed
- The `_layout.tsx` allows navigation to password reset screens without authentication
- The implementation follows Supabase best practices for password reset flows
- Token verification uses the `verifyOtp` method which is the recommended approach for handling email links
