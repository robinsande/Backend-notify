require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const { calculateReminderSchedule, getUpcomingItemsForReminders } = require('./reminderEngine');
const { sendMail } = require('./emailService');
const { registerUser, authenticateUser, createViewerUser, resetPassword, requestPasswordResetOtp, verifyPasswordResetOtp, getRegisteredUserEmails, recordAdminLoginEmail, getAdminReminderRecipientEmails, completeFirstLogin, getAllUsers, deleteUserById, updateUserRole } = require('./authStore');
const { initialEvents, initialTasks, initialNotifications, initialAttendees, initialDocuments, initialAuditLogs, buildDashboardSummary, syncEventAttendees } = require('./inMemoryStore');

const REMINDER_INTERVAL_MINUTES = Number(process.env.NOTIFY_REMINDER_INTERVAL_MINUTES || 5);
const REMINDER_INTERVAL_MS = Math.max(60000, REMINDER_INTERVAL_MINUTES * 60 * 1000);
const ADMIN_EMAILS = (process.env.NOTIFY_ADMIN_EMAILS || process.env.ADMIN_EMAILS || process.env.NOTIFY_ADMIN_EMAIL || process.env.ADMIN_EMAIL || '')
  .split(',')
  .map(value => String(value || '').trim().toLowerCase())
  .filter(Boolean);

const app = express();
app.use(cors());
app.use(express.json());

const mongoWasConfigured = Boolean(process.env.MONGODB_URI || process.env.MONGO_URI);

function requirePersistentAuth(res) {
  if (mongoWasConfigured && mongoose.connection.readyState !== 1) {
    res.status(503).json({ error: 'Account service is temporarily unavailable. Please try again shortly.' });
    return false;
  }
  return true;
}

let events = [...initialEvents];
let tasks = [...initialTasks];
let notifications = [...initialNotifications];
let attendees = [...initialAttendees];
let documents = [...initialDocuments];
let auditLogs = [...initialAuditLogs];
let currentAdminEmail = null;
let currentUserRole = null;
let currentUserId = null;

function registerAdminLogin(email, role = 'admin') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  if (!normalizedEmail) {
    return null;
  }

  currentAdminEmail = normalizedEmail;
  currentUserRole = role;
  recordAdminLoginEmail(normalizedEmail);
  return normalizedEmail;
}

function getReminderRecipients() {
  const allRecipients = getAdminReminderRecipientEmails({
    currentAdminEmail,
    configuredAdminEmails: ADMIN_EMAILS
  });
  return allRecipients;
}

function buildReminderMessage(item) {
  return `${item.type === 'event' ? 'Event' : 'Task'} reminder: ${item.title} — ${item.reminderLabel} (${item.reminderDate})`;
}

async function processAutomaticReminders() {
  const upcomingReminders = getUpcomingItemsForReminders(events, tasks, 7);
  const recipients = getReminderRecipients();
  const defaultRecipient = recipients.join(',');

  console.log(`[REMINDERS] Processing ${upcomingReminders.length} upcoming reminders for recipients: ${defaultRecipient || '(none configured)'}`);

  for (const item of upcomingReminders) {
    const message = buildReminderMessage(item);
    if (notifications.some(note => note.message === message)) {
      continue;
    }

    const systemNotification = {
      id: `notif-${Date.now()}-${item.id}`,
      message,
      channel: 'email',
      status: 'sent',
      createdAt: new Date().toISOString()
    };

    notifications.unshift(systemNotification);

    try {
      await sendMail({
        to: defaultRecipient,
        subject: `NOTIFY reminder for ${item.title}`,
        text: `${message} due ${item.dueDate}`,
        html: `<p>${message}</p><p>Scheduled due date: <strong>${item.dueDate}</strong></p>`
      });
      console.log(`[REMINDERS] Sent reminder for "${item.title}" to: ${defaultRecipient}`);
    } catch (error) {
      console.error('Automatic reminder send failed', error.message);
      notifications.unshift({
        id: `notif-fail-${Date.now()}-${item.id}`,
        message: `Failed to send reminder for ${item.title}`,
        channel: 'email',
        status: 'failed',
        createdAt: new Date().toISOString()
      });
    }
  }
}

setInterval(() => {
  processAutomaticReminders().catch(error => {
    console.error('Automatic reminder job failed', error.message);
  });
}, REMINDER_INTERVAL_MS);

console.log(`Automatic reminder checks enabled every ${REMINDER_INTERVAL_MINUTES} minutes.`);

processAutomaticReminders().catch(error => {
  console.error('Initial reminder job failed', error.message);
});

app.get('/health', (_req, res) => res.json({ ok: true, service: 'notify-backend' }));

app.get('/api/dashboard/summary', (_req, res) => {
  res.json(buildDashboardSummary(events, tasks, notifications));
});

app.get('/api/events', (_req, res) => res.json(events));
app.post('/api/events', async (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create events' });
  }
  const event = { id: `evt-${Date.now()}`, ...req.body };
  events.push(event);
  attendees = syncEventAttendees(attendees, event);
  notifications.unshift({ id: `notif-${Date.now()}`, message: `New event created: ${event.name}`, channel: 'in-app', status: 'sent', createdAt: new Date().toISOString() });
  await processAutomaticReminders().catch(error => console.error('Reminder job failed after event create', error.message));
  res.status(201).json(event);
});
app.put('/api/events/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot edit events' });
  }
  const index = events.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }
  events[index] = { ...events[index], ...req.body, id: req.params.id };
  attendees = syncEventAttendees(attendees, events[index]);
  res.json(events[index]);
});
app.delete('/api/events/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete events' });
  }
  const index = events.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const [deleted] = events.splice(index, 1);
  res.json({ ok: true, deleted });
});

app.get('/api/tasks', (_req, res) => res.json(tasks));
app.post('/api/tasks', async (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create tasks' });
  }
  const task = { id: `task-${Date.now()}`, ...req.body };
  tasks.push(task);
  notifications.unshift({ id: `notif-${Date.now()}`, message: `Task assigned: ${task.title}`, channel: 'email', status: 'scheduled', createdAt: new Date().toISOString() });
  await processAutomaticReminders().catch(error => console.error('Reminder job failed after task create', error.message));
  res.status(201).json(task);
});
app.delete('/api/tasks/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete tasks' });
  }
  const index = tasks.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Task not found' });
  }
  const [deleted] = tasks.splice(index, 1);
  res.json({ ok: true, deleted });
});

app.get('/api/notifications', (_req, res) => res.json(notifications.slice(0, 10)));
app.delete('/api/notifications/:id', (req, res) => {
  const index = notifications.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Notification not found' });
  }
  const [deleted] = notifications.splice(index, 1);
  res.json({ ok: true, deleted });
});

app.get('/api/reminders/summary', (_req, res) => {
  res.json(getUpcomingItemsForReminders(events, tasks, 7));
});

app.post('/api/reminders/trigger', async (_req, res) => {
  await processAutomaticReminders();
  res.json({ ok: true, message: 'Automatic reminders processed' });
});

app.get('/api/attendees', (_req, res) => res.json(attendees));
app.post('/api/attendees', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create attendees' });
  }
  const attendee = { id: `att-${Date.now()}`, ...req.body };
  attendees.push(attendee);
  res.status(201).json(attendee);
});
app.put('/api/attendees/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot edit attendees' });
  }
  const index = attendees.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Attendee not found' });
  }
  attendees[index] = { ...attendees[index], ...req.body, id: req.params.id };
  res.json(attendees[index]);
});

app.delete('/api/attendees/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete attendees' });
  }
  const index = attendees.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Attendee not found' });
  }
  const [deleted] = attendees.splice(index, 1);
  res.json({ ok: true, deleted });
});

app.get('/api/documents', (_req, res) => res.json(documents));
app.post('/api/documents', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot create documents' });
  }
  const documentEntry = { id: `doc-${Date.now()}`, ...req.body };
  documents.push(documentEntry);
  res.status(201).json(documentEntry);
});
app.delete('/api/documents/:id', (req, res) => {
  if (currentUserRole === 'viewer') {
    return res.status(403).json({ error: 'Viewers cannot delete documents' });
  }
  const index = documents.findIndex(item => item.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: 'Document not found' });
  }
  const [deleted] = documents.splice(index, 1);
  res.json({ ok: true, deleted });
});

app.get('/api/audit-logs', (_req, res) => res.json(auditLogs));

app.post('/api/auth/register', async (req, res) => {
  if (!requirePersistentAuth(res)) {
    return;
  }

  try {
    const user = await registerUser(req.body || {});
    registerAdminLogin(user.email, user.role || 'admin');
    currentUserId = user.id;
    recordAdminLoginEmail(user.email);
    console.log(`[AUTH] Admin registered: ${user.email} (will receive reminders)`);
    res.status(201).json({ ok: true, user: { id: user.id, email: user.email, fullName: user.fullName, role: user.role || 'admin' } });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  if (!requirePersistentAuth(res)) {
    return;
  }

  const user = await authenticateUser(req.body || {});
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  registerAdminLogin(user.email, user.role || 'admin');
  currentUserId = user.id;
  recordAdminLoginEmail(user.email);
  console.log(`[AUTH] ${user.role || 'admin'} logged in: ${user.email} (will receive reminders)`);
  res.json({ 
    ok: true, 
    user: { 
      id: user.id, 
      email: user.email, 
      fullName: user.fullName, 
      role: user.role || 'admin',
      isFirstLogin: user.isFirstLogin || false
    } 
  });
});

app.post('/api/auth/password-reset', async (req, res) => {
  const { email, newPassword, otpCode } = req.body || {};
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    if (newPassword && otpCode) {
      await verifyPasswordResetOtp({ email, code: otpCode, newPassword });
      await sendMail({
        to: email,
        subject: 'NOTIFY password updated',
        text: 'Your password was updated successfully.',
        html: '<p>Your password was updated successfully.</p>'
      });
      return res.json({ ok: true, message: 'Password reset successfully' });
    }

    const otp = await requestPasswordResetOtp({ email });
    await sendMail({
      to: email,
      subject: 'NOTIFY password reset OTP',
      text: `Your OTP code is ${otp.code}`,
      html: `<p>Your OTP code is <strong>${otp.code}</strong></p>`
    });
    res.json({ ok: true, message: 'OTP sent to your email' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// User management endpoints (admin only)
app.post('/api/admin/users', async (req, res) => {
  if (currentUserRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can create users' });
  }

  try {
    const { email, fullName, tempPassword } = req.body || {};
    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await createViewerUser({ email, fullName, tempPassword });
    console.log(`[ADMIN] New viewer user created: ${user.email}`);
    res.status(201).json({
      ok: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        password: user.password,
        isFirstLogin: user.isFirstLogin
      }
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/admin/users', async (req, res) => {
  if (currentUserRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can view users' });
  }

  const users = await getAllUsers();
  res.json(users);
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (currentUserRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can delete users' });
  }

  try {
    const deleted = await deleteUserById(req.params.id);
    res.json({ ok: true, deleted });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.put('/api/admin/users/:id/role', async (req, res) => {
  if (currentUserRole !== 'admin') {
    return res.status(403).json({ error: 'Only admins can change user roles' });
  }
  if (String(req.params.id) === String(currentUserId) && req.body?.role !== 'admin') {
    return res.status(400).json({ error: 'You cannot remove your own admin access' });
  }

  try {
    const user = await updateUserRole(req.params.id, req.body?.role);
    console.log(`[ADMIN] User role changed: ${user.email} -> ${user.role}`);
    res.json({ ok: true, user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/complete-first-login', async (req, res) => {
  try {
    const { email, newPassword } = req.body || {};
    if (!email || !newPassword) {
      return res.status(400).json({ error: 'Email and new password are required' });
    }

    const user = await completeFirstLogin({ email, newPassword });
    console.log(`[AUTH] User completed first login: ${user.email}`);
    res.json({ ok: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/events/:id/reminders', async (req, res) => {
  const event = events.find(item => item.id === req.params.id);
  const eventDate = event ? new Date(event.startDate || event.date) : new Date(req.body.eventDate || '2026-08-20');
  const reminders = calculateReminderSchedule(eventDate);
  const recipient = req.body.email || currentAdminEmail || getReminderRecipients()[0] || '';

  notifications.unshift({
    id: `notif-${Date.now()}-${event?.id || 'manual-reminder'}`,
    message: `Reminder schedule prepared for ${event?.name || 'event'} (${reminders.length} alerts)`,
    channel: 'system',
    status: 'sent',
    createdAt: new Date().toISOString()
  });

  try {
    await sendMail({
      to: recipient,
      subject: `NOTIFY reminder: ${event?.name || 'Event'}`,
      text: `Reminder schedule for ${event?.name || 'your event'}: ${reminders.map(item => `${item.label}: ${item.date}`).join(', ')}`,
      html: `<p>Reminder schedule for <strong>${event?.name || 'your event'}</strong>:</p><ul>${reminders.map(item => `<li>${item.label}: ${item.date}</li>`).join('')}</ul>`
    });
  } catch (error) {
    console.error('Reminder email send failed', error.message);
    notifications.unshift({
      id: `notif-fail-${Date.now()}-${event?.id || 'manual-reminder'}`,
      message: `Failed to send reminder for ${event?.name || 'event'}`,
      channel: 'system',
      status: 'failed',
      createdAt: new Date().toISOString()
    });
  }

  res.json({ eventId: req.params.id, reminders, recipient });
});

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/notify';
const PORT = Number(process.env.PORT) || 3001;

// Start server with or without MongoDB
const startServer = () => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`NOTIFY backend running on http://0.0.0.0:${PORT}`);
    console.log(`MongoDB target configured as ${MONGO_URI}`);
  });
};

// Try to connect to MongoDB, but allow server to run without it
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  family: 4
})
  .then(() => {
    console.log('MongoDB connected successfully');
    startServer();
  })
  .catch((error) => {
    console.warn('MongoDB connection unavailable, running in memory-only mode:', error.message);
    startServer();
  });
