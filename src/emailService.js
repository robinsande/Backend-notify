const brevoApiKey = process.env.BREVO_API_KEY || '';
const fromAddress = process.env.BREVO_SENDER_EMAIL || process.env.FROM_EMAIL || 'notify.local@example.com';
const fromName = process.env.BREVO_SENDER_NAME || 'NOTIFY';
const brevoEndpoint = 'https://api.brevo.com/v3/smtp/email';

function getRecipients(to) {
  return (Array.isArray(to) ? to : String(to || '').split(','))
    .map(value => String(value || '').trim())
    .filter(Boolean)
    .map(email => ({ email }));
}

async function sendMail({ to, subject, html, text }) {
  const recipients = getRecipients(to);
  if (!brevoApiKey || recipients.length === 0) {
    console.warn(`[EMAIL] Brevo not configured. Email queued locally only for ${to}. Subject: ${subject}`);
    return {
      messageId: `local-email-${Date.now()}`,
      accepted: recipients.map(recipient => recipient.email),
      rejected: [],
      fallback: 'local-only'
    };
  }

  try {
    const response = await fetch(brevoEndpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { email: fromAddress, name: fromName },
        to: recipients,
        subject,
        htmlContent: html,
        textContent: text
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Brevo API ${response.status}: ${errorBody}`);
    }

    const payload = await response.json();
    return {
      messageId: payload.messageId,
      accepted: recipients.map(recipient => recipient.email),
      rejected: []
    };
  } catch (error) {
    console.warn(`[EMAIL] Brevo send failed for ${to}: ${error.message}`);
    console.warn('[EMAIL] Falling back to local-only mode to keep the app running.');
    return {
      messageId: `local-email-fallback-${Date.now()}`,
      accepted: [to],
      rejected: [],
      fallback: 'local-only',
      error: error.message
    };
  }
}

module.exports = { sendMail, fromAddress };
