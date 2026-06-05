# Supabase Email Template Rollout Guide

Six branded HTML email templates for Recall are stored in `email-templates/`. This document is the authoritative step-by-step guide for configuring them in the Supabase dashboard.

---

## Section 1 — One-time Supabase project settings

Complete these steps once before pasting any templates.

### 1. Enable email confirmations

1. Open the [Supabase Dashboard](https://supabase.com/dashboard/project/cesmsdnblkdjkskmiqib).
2. Navigate to **Authentication → Providers → Email**.
3. Toggle **"Confirm email"** ON.
4. Click **Save**.

### 2. Site URL and Redirect URLs

1. Navigate to **Authentication → URL Configuration**.
2. Set **Site URL** to:
   ```
   https://recall.expo.app
   ```
3. Under **Redirect URLs**, add all three of the following (one per line):
   ```
   https://recall.expo.app/email-confirmed
   https://recall.expo.app/update-password
   https://recall.expo.app/reset-password
   ```
4. Click **Save**.

### 3. (Optional but strongly recommended) Custom SMTP

Supabase's built-in email service rate-limits outbound emails aggressively (typically 3–4 emails per hour per project on the free tier). For any production volume, configure a transactional email provider:

1. Navigate to **Project Settings → Auth → SMTP Settings**.
2. Enable **Custom SMTP** and enter credentials from a provider such as [Resend](https://resend.com), [Postmark](https://postmarkapp.com), or [SendGrid](https://sendgrid.com).
3. Set a **Sender name** (e.g. `Recall`) and **Sender email** (e.g. `noreply@recall.app`).
4. Click **Save** and send a test email to verify delivery.

This step does not block template rollout — the templates work with Supabase's default mailer — but it is required before launching to real users.

---

## Section 2 — Per-template paste guide

> **Templates re-skinned — re-paste required.**
> The templates have been re-skinned to the Recall coral brand (`#FF6B7A`) and modernised with a hero band, eyebrow labels, info chips, dark-mode support, and mobile-responsive layout. If you previously pasted earlier versions into the Supabase dashboard, please re-paste the latest content from `email-templates/<file>.html` for each template — Supabase does not auto-pull from the repo.

For each template below:
1. Open the Supabase Dashboard → **Authentication → Email Templates**.
2. Select the template listed.
3. Update the **Subject** field.
4. Copy the full contents of the corresponding `.html` file and paste into the **Message body** field.
5. Click **Save**.

---

### Template 1 — Confirm signup

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Confirm signup** |
| Subject       | `Confirm your email for Recall`                |
| File          | `email-templates/confirm-signup.html`          |
| Token URL     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=signup` |

---

### Template 2 — Reset password

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Reset password** |
| Subject       | `Reset your Recall password`                   |
| File          | `email-templates/reset-password.html`          |
| Token URL     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=recovery` |

---

### Template 3 — Magic link

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Magic link** |
| Subject       | `Your Recall sign-in link`                     |
| File          | `email-templates/magic-link.html`              |
| Token URL     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=magiclink` |

---

### Template 4 — Change email address

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Change email address** |
| Subject       | `Confirm your new Recall email`                |
| File          | `email-templates/change-email.html`            |
| Token URL     | `{{ .SiteURL }}/email-confirmed?token_hash={{ .TokenHash }}&type=email_change` |

---

### Template 5 — Invite user

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Invite user** |
| Subject       | `You're invited to Recall`                     |
| File          | `email-templates/invite-user.html`             |
| Token URL     | `{{ .ConfirmationURL }}` (Supabase default — no manual token construction needed) |

---

### Template 6 — Reauthentication

| Field         | Value                                          |
|---------------|------------------------------------------------|
| Dashboard tab | Authentication → Email Templates → **Reauthentication** |
| Subject       | `Your Recall verification code`                |
| File          | `email-templates/reauthentication.html`        |
| Token        | Displays `{{ .Token }}` as a 6-digit OTP code — no link button |

---

## Section 3 — End-to-end smoke test checklist

Run these checks on a real device after pasting all templates.

- [ ] **Confirm signup** — Sign up with a brand-new email address. Email arrives within 1 minute. Recall logo renders correctly (no broken image icon). CTA button is visible and styled. Tapping the link opens the app, finishes email verification, and routes into onboarding.
- [ ] **Resend email** — On the in-app "Verify your email" screen, tap "Resend email". A second confirmation email arrives and looks identical to the first.
- [ ] **Reset password** — On the login screen, tap "Forgot password". Reset email arrives. CTA button works. Tapping the link lands on the update-password screen and allows setting a new password.
- [ ] **Magic link** — If magic-link sign-in is exposed anywhere in the app, trigger one and confirm it signs the user in and lands on the home screen.
- [ ] **Change email** — Change the email address from account settings (if exposed). Confirmation email arrives at the **new** address. The new address is shown correctly in the email body.
- [ ] **All templates — visual check** — In Gmail mobile, Apple Mail, and Outlook web: logo loads (no broken image icon), CTA button renders as a solid blue button (not just a plain link), body text is readable, footer is present.

---

## Section 4 — Editing templates later

Templates are stored in `email-templates/*.html` for version control alongside the rest of the Recall codebase. To update wording, styling, or token URLs, edit the relevant `.html` file in this repo, then re-paste the updated file contents into the corresponding Supabase dashboard template and save. Supabase does not pull from the repository automatically — the paste step is always required to publish changes.

For shared structural elements (logo, footer, button pattern, design tokens), refer to `email-templates/_partials.md` to keep all six templates consistent.
