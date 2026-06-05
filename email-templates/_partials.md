# Email Template Partials Reference

This file documents the shared header and footer HTML used across all six Recall email templates. When editing templates, keep these sections consistent.

---

## Shared Header

Paste inside the card `<td>`, before the heading. The logo URL and wordmark must not change.

```html
<!-- Logo -->
<img src="https://cesmsdnblkdjkskmiqib.supabase.co/storage/v1/object/public/brand-assets/recall-logo.png"
     alt="Recall"
     width="56"
     height="56"
     style="display:block;width:56px;height:56px;border-radius:14px;margin:0 auto 12px auto;">

<!-- Wordmark -->
<p style="margin:0 0 28px 0;font-size:13px;font-weight:700;letter-spacing:0.12em;color:#111827;text-transform:uppercase;">RECALL</p>
```

---

## Shared Footer

Paste after the closing card `</table>` tag, still inside the outer centering `<td>`.

```html
<!-- Footer -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin-top:24px;">
  <tr>
    <td align="center" style="padding:0 16px;">
      <p style="margin:0 0 6px 0;font-size:13px;color:#6b7280;line-height:1.5;">If you didn't request this, you can safely ignore this email.</p>
      <p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">
        <a href="mailto:support@recall.app" style="color:#6b7280;text-decoration:underline;">support@recall.app</a>
        &nbsp;&middot;&nbsp;
        &copy; 2025 Recall
      </p>
    </td>
  </tr>
</table>
<!-- /Footer -->
```

---

## CTA Button (bulletproof MSO/VML pattern)

Replace `HREF_URL` with the appropriate token URL and `BUTTON_LABEL` with the button text.

```html
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 24px auto;">
  <tr>
    <td align="center" bgcolor="#3b82f6" style="border-radius:10px;">
      <!--[if mso]>
      <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word"
        href="HREF_URL"
        style="height:50px;v-text-anchor:middle;width:200px;" arcsize="20%" stroke="f" fillcolor="#3b82f6">
        <w:anchorlock/>
        <center style="color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;font-size:16px;font-weight:600;">BUTTON_LABEL</center>
      </v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <a href="HREF_URL"
         style="display:inline-block;background-color:#3b82f6;color:#ffffff;font-size:16px;font-weight:600;line-height:1;padding:14px 28px;border-radius:10px;text-decoration:none;mso-hide:all;">BUTTON_LABEL</a>
      <!--<![endif]-->
    </td>
  </tr>
</table>
```

---

## Token URL Reference

| Template              | href value                                                                              |
|-----------------------|-----------------------------------------------------------------------------------------|
| confirm-signup.html   | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=signup`                |
| magic-link.html       | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=magiclink`             |
| reset-password.html   | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=recovery`              |
| change-email.html     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=email_change`          |
| invite-user.html      | `{{ .ConfirmationURL }}` (Supabase builds the full URL)                                 |
| reauthentication.html | No link — displays `{{ .Token }}` as a 6-digit OTP code                                 |

---

## Design Tokens

| Token            | Value                                                                                    |
|------------------|------------------------------------------------------------------------------------------|
| Body bg          | `#f4f5f7`                                                                                |
| Card bg          | `#ffffff`                                                                                |
| Card border      | `1px solid #e5e7eb`                                                                      |
| Card radius      | `14px`                                                                                   |
| Primary blue     | `#3b82f6`                                                                                |
| Body text        | `#111827`                                                                                |
| Muted text       | `#6b7280`                                                                                |
| Font stack       | `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif` |
| Body font size   | `16px`                                                                                   |
| Body line-height | `1.55`                                                                                   |
| H1 size          | `24px`, weight `700`                                                                     |
| Button padding   | `14px 28px`                                                                              |
| Button radius    | `10px`                                                                                   |
