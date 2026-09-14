# NOTIFY backend

## Run locally

```powershell
npm install
npm start
```

## Brevo email reminders

Reminder and password-reset emails use the Brevo transactional email API. Create a Brevo API key and verify the sender email in Brevo, then configure these environment variables:

```text
BREVO_API_KEY=your-brevo-api-key
BREVO_SENDER_EMAIL=verified-sender@example.com
BREVO_SENDER_NAME=NOTIFY
NOTIFY_ADMIN_EMAILS=admin@example.com
```

`NOTIFY_ADMIN_EMAILS` may contain comma-separated addresses. Without a Brevo API key, emails are logged and kept in local-only fallback mode.
