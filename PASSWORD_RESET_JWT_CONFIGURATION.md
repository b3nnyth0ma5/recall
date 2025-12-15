
# Password Reset JWT Configuration Guide

## Issue Summary

The password reset flow was showing "[UpdatePassword] No session found" error because the session was not being properly established from the password reset token.

## Root Cause

The issue was **NOT** related to missing JWT secrets on the client side. Supabase handles all JWT signing and verification on the server side. The client only needs the anonymous key (anon key) to communicate with Supabase.

The actual issue was:
1. The `verifyOtp` call was not properly handling errors or missing session data
2. Insufficient logging made it difficult to diagnose the exact failure point
3. The session verification after `verifyOtp` was not being checked

## How Supabase Password Reset Works

### 1. Password Reset Request
```typescript
await supabase.auth.resetPasswordForEmail(email, {
  redirectTo: 'https://recall.expo.app/update-password',
});
```

This sends an email with a link like:
```
https://recall.expo.app/update-password?token_hash=ABC123&type=recovery
```

### 2. Token Verification
When the user clicks the link, the app extracts `token_hash` and `type` from the URL and calls:

```typescript
const { data, error } = await supabase.auth.verifyOtp({
  token_hash: tokenHash,
  type: type as any,
});
```

This is the **critical step** that:
- Validates the token on the server
- Creates a new session with a JWT access token
- Stores the session in AsyncStorage (configured in supabase client)
- Returns the session data

### 3. Session Management
The session created by `verifyOtp` includes:
- **Access Token (JWT)**: Short-lived token (default 3600 seconds = 60 minutes)
- **Refresh Token**: Long-lived token used to get new access tokens
- **User Data**: Email, ID, metadata

The JWT is signed by Supabase using the **JWT Secret** configured in your project settings. The client never needs to know this secret - it only needs to send the JWT with requests.

## JWT Configuration in Supabase

### Where JWT Settings Are Configured

1. **Supabase Dashboard** → Your Project → **Settings** → **Auth**
2. Look for **JWT Expiry Limit** (default: 3600 seconds = 60 minutes)

### Important JWT Settings

- **JWT Expiry Limit**: How long the access token is valid (default: 3600 seconds)
- **JWT Secret**: Used by Supabase server to sign tokens (never exposed to client)
- **Refresh Token Rotation**: Whether refresh tokens are rotated on use

### Recommended Settings for Password Reset

```
JWT Expiry Limit: 3600 seconds (60 minutes)
```

This gives users 60 minutes to complete the password reset after clicking the link.

## Client Configuration

### Supabase Client Setup

```typescript
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = 'https://cesmsdnblkdjkskmiqib.supabase.co';
const supabaseAnonKey = 'eyJhbGci...'; // Your anon key

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,           // Store sessions in AsyncStorage
    autoRefreshToken: true,           // Automatically refresh expired tokens
    persistSession: true,             // Persist session across app restarts
    detectSessionInUrl: false,        // We handle URL-based sessions manually
  },
});
```

### Why `detectSessionInUrl: false`?

We set this to `false` because:
1. We manually extract `token_hash` and `type` from URL parameters
2. We explicitly call `verifyOtp` to establish the session
3. This gives us more control and better error handling

## Enhanced Error Handling

The updated `update-password.tsx` now includes:

### 1. Comprehensive Logging
```typescript
console.log('[UpdatePassword] Token hash length:', tokenHash.length);
console.log('[UpdatePassword] Type:', type);
console.log('[UpdatePassword] Session user:', data.session.user.email);
console.log('[UpdatePassword] Session expires in:', Math.round((data.session.expires_at || 0) - Date.now() / 1000), 'seconds');
```

### 2. Session Verification
```typescript
if (!data.session) {
  console.error('[UpdatePassword] OTP verified but no session returned');
  Alert.alert('Session Error', 'Unable to establish a session...');
  return;
}
```

### 3. Stored Session Check
```typescript
const { data: { session: storedSession }, error: sessionCheckError } = await supabase.auth.getSession();

if (storedSession) {
  console.log('[UpdatePassword] Session successfully stored and retrieved');
} else {
  console.warn('[UpdatePassword] Session was not stored properly');
}
```

### 4. Pre-Update Session Validation
```typescript
// Before updating password, verify session is still valid
const { data: { session }, error: sessionError } = await supabase.auth.getSession();

if (sessionError || !session) {
  Alert.alert('Session Expired', 'Please request a new password reset link.');
  return;
}
```

## Email Template Configuration

### Supabase Email Template

In **Supabase Dashboard** → **Authentication** → **Email Templates** → **Reset Password**:

```html
<h2>Reset Password</h2>
<p>Follow this link to reset your password:</p>
<p><a href="{{ .SiteURL }}/update-password?token_hash={{ .TokenHash }}&type=recovery">Reset Password</a></p>
```

### Required Variables
- `{{ .SiteURL }}`: Your app's base URL (e.g., `https://recall.expo.app`)
- `{{ .TokenHash }}`: The password reset token (automatically generated)
- `{{ .Type }}`: The token type (should be `recovery` for password reset)

### Site URL Configuration

In **Supabase Dashboard** → **Authentication** → **URL Configuration**:

1. **Site URL**: `https://recall.expo.app`
2. **Redirect URLs**: Add `https://recall.expo.app/update-password`

## Debugging Checklist

If password reset is not working, check:

### 1. Email Template
- [ ] Contains `token_hash` parameter
- [ ] Contains `type=recovery` parameter
- [ ] Uses correct Site URL

### 2. Supabase Configuration
- [ ] Site URL is correct
- [ ] Redirect URL includes `/update-password`
- [ ] JWT Expiry is at least 3600 seconds

### 3. Client Code
- [ ] Extracts `token_hash` and `type` from URL
- [ ] Calls `verifyOtp` with correct parameters
- [ ] Checks for errors from `verifyOtp`
- [ ] Verifies session was created
- [ ] Stores session in AsyncStorage

### 4. Logs to Check
```
[UpdatePassword] Found token_hash in URL, verifying OTP...
[UpdatePassword] OTP verified successfully, session established
[UpdatePassword] Session user: user@example.com
[UpdatePassword] Session expires in: 3600 seconds
[UpdatePassword] Session successfully stored and retrieved
```

## Common Issues and Solutions

### Issue: "No session found"
**Cause**: `verifyOtp` failed or didn't return a session
**Solution**: Check logs for `verifyOtp` error, verify token_hash is present in URL

### Issue: "Invalid Link"
**Cause**: Token expired (24 hours) or already used
**Solution**: Request a new password reset link

### Issue: "Session Expired"
**Cause**: User took longer than JWT expiry time to update password
**Solution**: Increase JWT Expiry Limit in Supabase settings

### Issue: Session not persisting
**Cause**: AsyncStorage not properly configured
**Solution**: Verify AsyncStorage is imported and passed to Supabase client

## Testing the Flow

### 1. Request Password Reset
```typescript
await supabase.auth.resetPasswordForEmail('user@example.com', {
  redirectTo: 'https://recall.expo.app/update-password',
});
```

### 2. Check Email
- Verify email received
- Check link format: `...update-password?token_hash=...&type=recovery`

### 3. Click Link
- App should open to `/update-password`
- Check logs for session establishment
- Verify "Verifying link..." shows briefly

### 4. Update Password
- Enter new password
- Click "Update Password"
- Should see success message
- Should redirect to login

### 5. Verify New Password
- Try logging in with new password
- Should succeed

## Security Considerations

1. **JWT Secret**: Never expose this to the client. It's only used by Supabase server.
2. **Token Expiry**: Password reset tokens expire after 24 hours.
3. **Session Expiry**: JWT access tokens expire after configured time (default 60 minutes).
4. **One-Time Use**: Password reset tokens can only be used once.
5. **HTTPS Only**: Always use HTTPS for password reset links.

## Summary

The password reset flow does **NOT** require the JWT secret on the client side. The client only needs:
1. The Supabase URL
2. The anonymous (anon) key
3. Proper AsyncStorage configuration
4. Correct implementation of `verifyOtp`

The JWT secret is used by Supabase's server to sign tokens, and the client simply sends these signed tokens with requests. The enhanced error handling and logging in the updated code will help diagnose any future issues.
