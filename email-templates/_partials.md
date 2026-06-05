# Email Template Partials Reference

This file documents the shared design system, markup patterns, and token reference used across all six Recall email templates. When editing templates, keep these sections consistent.

---

## Design Tokens

| Token                  | Value                                                                                        |
|------------------------|----------------------------------------------------------------------------------------------|
| Body bg                | `#f4f5f7`                                                                                    |
| Card bg                | `#ffffff`                                                                                    |
| Card border            | `1px solid #e5e7eb`                                                                          |
| Card radius            | `16px`                                                                                       |
| Primary coral          | `#FF6B7A`                                                                                    |
| Coral dark / pressed   | `#E55A68`                                                                                    |
| Coral light            | `#FF8A96`                                                                                    |
| Coral tint bg (light)  | `#FFF1F3`                                                                                    |
| Coral tint bg (dark)   | `rgba(255,107,122,0.12)`                                                                     |
| Info chip border       | `#FFD9DE`                                                                                    |
| Body text              | `#111827`                                                                                    |
| Muted text             | `#6b7280`                                                                                    |
| Dark body bg           | `#1A1A1A`                                                                                    |
| Dark card bg           | `#2A2A2A`                                                                                    |
| Dark border            | `#3A3A3A`                                                                                    |
| Dark URL pill bg       | `#1F1F1F`                                                                                    |
| Font stack             | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` |
| Mono font stack        | `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`                                   |
| Body font size         | `16px`                                                                                       |
| Body line-height       | `1.55`                                                                                       |
| H1 size                | `24px`, weight `700`                                                                         |
| Button padding         | `15px 30px`                                                                                  |
| Button radius          | `12px`                                                                                       |

---

## `<head>` `<style>` Block

Paste this identical `<style>` block into the `<head>` of every template (adjust `.email-otp-chip` / `.email-otp-code` rules only for `reauthentication.html`).

```html
<style>
  /* ── Dark mode ── */
  @media (prefers-color-scheme: dark) {
    .email-body    { background-color: #1A1A1A !important; }
    .email-card    { background-color: #2A2A2A !important; border-color: #3A3A3A !important; }
    .email-hero    { background-color: rgba(255,107,122,0.12) !important; }
    .email-h1      { color: #FFFFFF !important; }
    .email-text    { color: #FFFFFF !important; }
    .email-muted   { color: #B0B0B0 !important; }
    .email-info-chip { background-color: rgba(255,107,122,0.12) !important; border-color: #FFD9DE !important; }
    .email-url-pill  { background-color: #1F1F1F !important; }
    .email-divider   { border-color: #3A3A3A !important; }
    .email-footer p  { color: #B0B0B0 !important; }
    .email-logo-wrap { background-color: #FFFFFF !important; padding: 6px !important; border-radius: 14px !important; display: inline-block !important; }
    /* reauthentication.html only */
    .email-otp-chip  { background-color: rgba(255,107,122,0.12) !important; border-color: #FFD9DE !important; }
    .email-otp-code  { color: #FFFFFF !important; }
  }
  /* ── Mobile ── */
  @media (max-width: 600px) {
    .email-card    { border-radius: 12px !important; }
    .email-hero    { padding: 20px 20px 18px !important; }
    .email-content { padding: 20px !important; }
    .email-h1      { font-size: 22px !important; }
    .email-cta a   { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
  }
</style>
```

---

## Hero Band Pattern

Paste as the first `<tr>` inside the card `<table>`. The hero band goes edge-to-edge (no padding on the card itself).

```html
<!-- Hero band -->
<tr>
  <td class="email-hero" align="center" bgcolor="#FFF1F3" style="background-color:#FFF1F3;padding:28px 32px 24px;">
    <div class="email-logo-wrap" style="display:inline-block;">
      <img src="https://cesmsdnblkdjkskmiqib.supabase.co/storage/v1/object/public/brand-assets/recall-logo.png"
           alt="Recall"
           width="112"
           height="112"
           style="display:block;width:56px;height:56px;border-radius:14px;margin:0 auto 12px auto;">
    </div>
    <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.14em;color:#111827;text-transform:uppercase;">RECALL</p>
  </td>
</tr>
```

> **Logo note:** `width="112" height="112"` is the 2× source size for retina sharpness; CSS `style="width:56px;height:56px;"` renders it at 56 px. The `.email-logo-wrap` div gets a white chip background in dark mode so a transparent logo stays legible.

---

## Eyebrow Label

Paste at the top of the content `<td>`, before the H1. Replace `LABEL` with the per-template value.

| Template              | Eyebrow label       |
|-----------------------|---------------------|
| confirm-signup        | `VERIFICATION`      |
| magic-link            | `SIGN IN`           |
| reset-password        | `SECURITY`          |
| change-email          | `ACCOUNT`           |
| invite-user           | `INVITATION`        |
| reauthentication      | `VERIFICATION CODE` |

```html
<!-- Eyebrow -->
<p class="email-eyebrow" style="margin:0 0 12px 0;font-size:12px;font-weight:700;letter-spacing:0.14em;color:#FF6B7A;text-transform:uppercase;">LABEL</p>
```

---

## CTA Button (bulletproof MSO/VML pattern)

Replace `HREF_URL` and `BUTTON_LABEL`. Not used on `reauthentication.html`.

```html
<!-- CTA Button -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" class="email-cta" style="margin:24px auto 20px auto;">
  <tr>
    <td align="center" bgcolor="#FF6B7A" style="border-radius:12px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="HREF_URL"
        style="height:50px;v-text-anchor:middle;width:200px;" arcsize="22%" stroke="f" fillcolor="#FF6B7A">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;">BUTTON_LABEL</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="HREF_URL"
         style="display:inline-block;background-color:#FF6B7A;color:#ffffff;font-size:16px;font-weight:600;line-height:1;padding:15px 30px;border-radius:12px;border-bottom:2px solid #E55A68;text-decoration:none;mso-hide:all;">BUTTON_LABEL</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
```

---

## Plain-URL Pill

Paste below the CTA button. Not used on `reauthentication.html`.

```html
<!-- Plain-URL pill -->
<p style="margin:0 0 8px 0;font-size:13px;color:#6b7280;line-height:1.5;">Or copy and paste this link:</p>
<div class="email-url-pill" style="background-color:#F4F5F7;padding:12px 16px;border-radius:10px;font-size:13px;color:#6b7280;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;line-height:1.5;">TOKEN_URL</div>
```

---

## Info Chip

Paste below the URL pill (or below the body text for `reauthentication.html`). Replace the content with the per-template text below.

| Template              | Info chip content                                                                                                              |
|-----------------------|--------------------------------------------------------------------------------------------------------------------------------|
| confirm-signup        | This link expires in 24 hours. If you didn't sign up for Recall, you can safely ignore this email.                            |
| magic-link            | This link can only be used once and expires in 24 hours. If you didn't request it, you can safely ignore this email.           |
| reset-password        | This link expires in 1 hour and can only be used once. If you didn't request a password reset, you can safely ignore this email. |
| change-email          | This link expires in 24 hours. If you didn't request an email change, please contact support immediately.                      |
| invite-user           | This invitation expires in 7 days.                                                                                             |
| reauthentication      | This code expires in 1 hour. Never share it with anyone — Recall will never ask for this code.                                 |

```html
<!-- Info chip -->
<div class="email-info-chip" style="margin-top:20px;background-color:#FFF1F3;border-left:4px solid #FF6B7A;padding:12px 14px;border-radius:8px;font-size:13px;color:#6b7280;line-height:1.5;">CHIP_CONTENT</div>
```

---

## OTP Chip (reauthentication.html only)

Replaces the CTA button and URL pill on `reauthentication.html`.

```html
<!-- OTP chip -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;">
  <tr>
    <td align="center" class="email-otp-chip" style="max-width:280px;background-color:#FFF1F3;border:1px solid #FFD9DE;border-radius:14px;padding:20px 32px;">
      <p class="email-otp-code" style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:36px;font-weight:700;color:#111827;letter-spacing:0.16em;line-height:1;text-align:center;margin:0;">{{ .Token }}</p>
    </td>
  </tr>
</table>
```

---

## Footer

Paste after the closing card `</table>`, still inside the outer centering `<td>`.

```html
<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;padding-top:24px;">
  <tr>
    <td align="center" style="padding:0 16px;">
      <p class="email-footer" style="margin:0 0 4px 0;font-size:13px;color:#6b7280;line-height:1.5;">Recall — your memory, on tap.</p>
      <p class="email-footer" style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
        <a href="mailto:support@recall.app" style="color:#FF6B7A;text-decoration:none;font-weight:600;">support@recall.app</a>
        &nbsp;&middot;&nbsp;
        &copy; 2025 Recall
      </p>
    </td>
  </tr>
</table>
<!-- /Footer -->
```

---

## Token URL Reference

| Template              | href / token value                                                                              |
|-----------------------|-------------------------------------------------------------------------------------------------|
| confirm-signup.html   | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=signup`                        |
| magic-link.html       | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=magiclink`                     |
| reset-password.html   | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=recovery`                      |
| change-email.html     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=email_change`                  |
| invite-user.html      | `{{ .ConfirmationURL }}` (Supabase builds the full URL)                                         |
| reauthentication.html | No link — displays `{{ .Token }}` as a 6-digit OTP code inside the branded OTP chip            |
