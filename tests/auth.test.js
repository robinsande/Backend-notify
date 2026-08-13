const test = require('node:test');
const assert = require('node:assert/strict');
const { registerUser, authenticateUser, resetPassword, requestPasswordResetOtp, verifyPasswordResetOtp, recordAdminLoginEmail, getAdminReminderRecipientEmails, grantAdminAccess } = require('../src/authStore');
const { initialAttendees, syncEventAttendees } = require('../src/inMemoryStore');

test('registerUser creates an account that can be used to sign in', async () => {
  const user = await registerUser({ email: 'new.user@example.com', password: 'Secret123!', fullName: 'New User' });

  assert.equal(user.email, 'new.user@example.com');
  assert.ok(user.id);

  const authenticated = await authenticateUser({ email: 'new.user@example.com', password: 'Secret123!' });
  assert.ok(authenticated);
  assert.equal(authenticated.email, 'new.user@example.com');
});

test('grantAdminAccess upgrades an existing account to admin role', async () => {
  await registerUser({ email: 'admin.override@example.com', password: 'Secret123!', fullName: 'Override User' });

  const granted = await grantAdminAccess('admin.override@example.com');
  assert.equal(granted.email, 'admin.override@example.com');
  assert.equal(granted.role, 'admin');

  const authenticated = await authenticateUser({ email: 'admin.override@example.com', password: 'Secret123!' });
  assert.ok(authenticated);
  assert.equal(authenticated.role, 'admin');
});

test('default attendee list is empty until the user adds their own entries', () => {
  assert.deepEqual(initialAttendees, []);
});

test('event attendees are synced to the attendee list with their event link', () => {
  const event = {
    id: 'evt-100',
    name: 'Quarterly Board Meeting',
    attendees: [
      { name: 'Jane Doe', email: 'jane@example.com', status: 'Confirmed', role: 'CD' },
      { name: 'John Smith', email: 'john@example.com', status: 'Pending', role: 'RD' }
    ]
  };

  const synced = syncEventAttendees([], event);

  assert.equal(synced.length, 2);
  assert.equal(synced[0].eventId, 'evt-100');
  assert.equal(synced[0].eventName, 'Quarterly Board Meeting');
  assert.equal(synced[1].role, 'RD');
});

test('resetPassword updates the stored password for an existing account', async () => {
  await registerUser({ email: 'reset.user@example.com', password: 'InitialPass123!', fullName: 'Reset User' });

  const updated = await resetPassword({ email: 'reset.user@example.com', newPassword: 'NewReset123!' });

  assert.equal(updated.email, 'reset.user@example.com');
  const authenticated = await authenticateUser({ email: 'reset.user@example.com', password: 'NewReset123!' });
  assert.equal(authenticated?.email, 'reset.user@example.com');
});

test('requestPasswordResetOtp creates a code that can be verified for an existing account', async () => {
  await registerUser({ email: 'otp.user@example.com', password: 'OtpPass123!', fullName: 'OTP User' });

  const otp = await requestPasswordResetOtp({ email: 'otp.user@example.com' });

  assert.equal(otp.email, 'otp.user@example.com');
  assert.match(otp.code, /^\d{6}$/);

  const verified = await verifyPasswordResetOtp({ email: 'otp.user@example.com', code: otp.code, newPassword: 'Reset123!' });
  assert.equal(verified.email, 'otp.user@example.com');
  const authenticated = await authenticateUser({ email: 'otp.user@example.com', password: 'Reset123!' });
  assert.equal(authenticated?.email, 'otp.user@example.com');
});

test('reminder recipients prioritize admin login emails used for access', () => {
  const adminEmails = getAdminReminderRecipientEmails({ currentAdminEmail: 'admin@notify.local', configuredAdminEmails: ['ops@notify.local'] });

  assert.deepEqual(adminEmails, ['admin@notify.local', 'ops@notify.local']);

  recordAdminLoginEmail('team@notify.local');
  recordAdminLoginEmail('admin@notify.local');

  const recipients = getAdminReminderRecipientEmails({ currentAdminEmail: 'admin@notify.local', configuredAdminEmails: ['ops@notify.local'] });
  assert.deepEqual(recipients, ['admin@notify.local', 'ops@notify.local', 'team@notify.local']);
});
