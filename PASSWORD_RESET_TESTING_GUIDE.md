
# Password Reset Flow - Testing Guide

## Prerequisites
Before testing, ensure you have:
1. A Supabase account with access to your project dashboard
2. A test email account you can access
3. The app running on a device or simulator

## Step 1: Configure Supabase Email Template

### Access Email Templates
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: `cesmsdnblkdjkskmiqib`
3. Navigate to **Authentication** → **Email Templates**
4. Find the **Reset Password** template (may be labeled as "Recovery")

### Update the Template
Replace the existing template content with:

```html
<h2>Reset Your Password</h2>

<p>Hello,</p>

<p>We received a request to reset your password. Follow this link to reset the password for your account:</p>

<p>
  <a href="{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery">
    Reset Password
  </a>
</p>

<p>Or copy and paste this URL into your browser:</p>
<p>{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery</p>

<p>If you didn't request this, you can safely ignore this email.</p>

<p>This link will expire in 24 hours.</p>

<p>Thanks,<br>The Recall Team</p>
```

### Save the Template
Click **Save** to apply the changes.

## Step 2: Configure URL Settings

### Site URL
1. Go to **Authentication** → **URL Configuration**
2. Set **Site URL** to: `https://recall.expo.app`
3. Click **Save**

### Redirect URLs
1. In the same **URL Configuration** page
2. Add these URLs to the **Redirect URLs** list:
   - `https://recall.expo.app/update-password`
   - `https://recall.expo.app/email-confirmed`
   - `https://recall.expo.app/*`
3. Click **Save**

### JWT Expiry
1. Go to **Authentication** → **Settings**
2. Find **JWT Expiry Limit**
3. Ensure it's set to at least **3600** (60 minutes)
4. Click **Save** if you made changes

## Step 3: Test the Password Reset Flow

### Test Case 1: Complete Password Reset Flow

1. **Open the app** and navigate to the login screen
2. **Click "Forgot Password?"** - You should be taken to the reset password screen
3. **Enter your email address** (use a real email you can access)
4. **Click "Send Reset Link"**
5. **Check the response:**
   - You should see an alert: "Check Your Email"
   - The message should say: "We have sent you a password reset link..."
6. **Check your email inbox**
   - Look for an email from Supabase
   - Subject should be: "Reset Your Password"
7. **Click the reset link in the email**
   - The link should look like: `https://recall.expo.app/update-password?token_hash=...&type=recovery`
8. **Verify the app opens:**
   - You should see "Verifying link..." briefly
   - Then the "Create New Password" screen should appear
9. **Enter a new password:**
   - Password must be at least 6 characters
   - Enter the same password in both fields
10. **Click "Update Password"**
11. **Verify success:**
    - You should see: "Success" alert
    - Message: "Your password has been updated successfully..."
    - You should be redirected to the login screen
12. **Sign in with new password:**
    - Enter your email
    - Enter the NEW password you just set
    - Click "Sign In"
    - You should be logged in successfully

### Test Case 2: Invalid/Expired Link

1. **Request a password reset** (follow steps 1-6 above)
2. **Wait for the link to expire** (24 hours) OR **use the link twice**
3. **Click the link again**
4. **Verify error handling:**
   - You should see: "Invalid Link" alert
   - Message: "This password reset link is invalid or has expired..."
   - You should be redirected to the login screen

### Test Case 3: Password Validation

1. **Request a password reset** and click the link
2. **Try entering passwords that don't match:**
   - Enter "password1" in first field
   - Enter "password2" in second field
   - Click "Update Password"
   - You should see: "Passwords do not match" error
3. **Try a password that's too short:**
   - Enter "12345" in both fields
   - Click "Update Password"
   - You should see: "Password must be at least 6 characters long" error
4. **Try empty fields:**
   - Leave both fields empty
   - Click "Update Password"
   - You should see: "Please enter and confirm your new password" error

## Step 4: Verify Console Logs

### Expected Log Sequence

When clicking the reset link, you should see logs like:

```
[UpdatePassword] Checking session with params: { token_hash: "...", type: "recovery" }
[UpdatePassword] Found token_hash in URL, verifying OTP...
[UpdatePassword] Token hash: abc123...
[UpdatePassword] Type: recovery
[UpdatePassword] OTP verified successfully, session established
[UpdatePassword] Session data: { ... }
[UpdatePassword] Session expires at: 2024-01-15T12:00:00.000Z
```

When updating the password:

```
[UpdatePassword] Updating password...
[UpdatePassword] Password updated successfully
[UpdatePassword] Signing out user...
[UpdatePassword] User signed out, redirecting to login
```

## Step 5: Troubleshooting

### Issue: Email not received
**Possible causes:**
- Email is in spam folder
- Email address is incorrect
- Supabase email service is down

**Solutions:**
- Check spam/junk folder
- Verify email address is correct
- Check Supabase status page
- Check Supabase logs in dashboard

### Issue: "Invalid Link" error immediately
**Possible causes:**
- Email template not configured correctly
- URL parameters missing or malformed
- Token already used

**Solutions:**
- Verify email template includes `token_hash` and `type` parameters
- Check the URL in the email matches the expected format
- Request a new reset link

### Issue: "No session found" error
**Possible causes:**
- Token verification failed
- Session expired
- Network connectivity issues

**Solutions:**
- Check console logs for detailed error messages
- Verify JWT expiry is set to at least 3600 seconds
- Check network connection
- Request a new reset link

### Issue: Password update fails
**Possible causes:**
- Session expired (after 60 minutes)
- Network error
- Supabase service issue

**Solutions:**
- Request a new reset link if more than 60 minutes have passed
- Check network connection
- Check Supabase service status
- Review console logs for specific error messages

## Step 6: Verify Session Duration

To verify the session lasts at least 60 minutes:

1. **Request a password reset** and click the link
2. **Note the time** when you arrive at the update password screen
3. **Wait 30 minutes** (or any time less than 60 minutes)
4. **Enter a new password** and click "Update Password"
5. **Verify it works** - The password should update successfully

If you wait MORE than 60 minutes:
- The session will expire
- You'll need to request a new reset link

## Step 7: Security Verification

### Verify Token is Single-Use
1. **Request a password reset** and click the link
2. **Copy the URL** from the browser/app
3. **Update your password** successfully
4. **Try to use the same URL again**
5. **Verify:** You should get an "Invalid Link" error

### Verify Token Expiry
1. **Request a password reset**
2. **Wait 24 hours** (or check Supabase settings for token expiry time)
3. **Click the link**
4. **Verify:** You should get an "Invalid Link" error

## Success Criteria

✅ Password reset email is received within 1 minute
✅ Email contains correct reset link with token_hash and type parameters
✅ Clicking the link opens the app to /update-password
✅ Token is verified and session is established
✅ New password can be entered and updated
✅ User is signed out and redirected to login
✅ User can sign in with new password
✅ Session lasts at least 60 minutes
✅ Token is single-use only
✅ Expired tokens show appropriate error
✅ All error cases are handled gracefully

## Additional Notes

### For Development/Testing
If you're testing locally or on a different domain:
1. Update `constants/config.ts` to use your local URL
2. Update the Supabase Site URL to match
3. Add your local URL to the Redirect URLs list

### For Production
Ensure:
1. Site URL is set to your production domain
2. All redirect URLs are added to the allowlist
3. Email template uses `{{ .SiteURL }}` variable (not hardcoded URL)
4. JWT expiry is appropriate for your use case (default 3600 seconds is good)

### Monitoring
Monitor these metrics:
- Password reset request rate
- Password reset success rate
- Token expiry rate
- Session duration
- Error rates

Check Supabase logs regularly:
1. Go to **Logs** in Supabase Dashboard
2. Filter by **Auth** service
3. Look for password reset related events
