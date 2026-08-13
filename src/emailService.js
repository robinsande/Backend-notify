const nodemailer = require('nodemailer');

const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const fromAddress = process.env.FROM_EMAIL || smtpUser || 'notify.local@example.com';
const smtpEnabled = String(process.env.SMTP_ENABLED || '').toLowerCase() === 'true';
const hasSmtpCredentials = Boolean(smtpUser && smtpPass);

const transporter = hasSmtpCredentials || smtpEnabled
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    })
  : null;

async function sendMail({ to, subject, html, text }) {
  if (!transporter) {
    console.warn(`[EMAIL] SMTP not configured. Reminder email queued locally only for ${to}. Subject: ${subject}`);
    return {
      messageId: `local-email-${Date.now()}`,
      accepted: [to],
      rejected: [],
      fallback: 'local-only'
    };
  }

  try {
    return await transporter.sendMail({
      from: fromAddress,
      to,
      subject,
      html,
      text
    });
  } catch (error) {
    console.warn(`[EMAIL] SMTP send failed for ${to}: ${error.message}`);
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
