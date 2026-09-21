const test = require('node:test');
const assert = require('node:assert/strict');
const { registerUser, authenticateUser, createSession, getSessionUser, deleteSession, resetPassword, requestPasswordResetOtp, verifyPasswordResetOtp, recordAdminLoginEmail, getAdminReminderRecipientEmails, grantAdminAccess, createViewerUser, getAllUsers, deleteUserById, updateUserRole } = require('../src/authStore');
const { initialAttendees, syncEventAttendees } = require('../src/inMemoryStore');

test('registerUser creates an account that can be used to sign in', async () => {
  const user = await registerUser({ email: 'new.user@example.com', password: 'Secret123!', fullName: 'New User' });

  assert.equal(user.email, 'new.user@example.com');
  assert.ok(user.id);

  const authenticated = await authenticateUser({ email: 'new.user@example.com', password: 'Secret123!' });
  assert.ok(authenticated);
  assert.equal(authenticated.email, 'new.user@example.com');
});

test('sessions are isolated per user and can be revoked', async () => {
  const firstUser = await registerUser({ email: 'session.first@example.com', password: 'Secret123!', fullName: 'First User' });
  const secondUser = await registerUser({ email: 'session.second@example.com', password: 'Secret123!', fullName: 'Second User' });
  const firstToken = await createSession(firstUser);
  const secondToken = await createSession(secondUser);

  assert.notEqual(firstToken, secondToken);
  assert.equal((await getSessionUser(firstToken)).email, firstUser.email);
  assert.equal((await getSessionUser(secondToken)).email, secondUser.email);

  deleteSession(firstToken);
  assert.equal(await getSessionUser(firstToken), null);
  assert.equal((await getSessionUser(secondToken)).email, secondUser.email);
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

test('viewer users can be created with an auto-generated temporary password that works for first login', async () => {
  const user = await createViewerUser({ email: 'auto.viewer@example.com', fullName: 'Auto Viewer' });

  assert.equal(user.email, 'auto.viewer@example.com');
  assert.equal(user.role, 'viewer');
  assert.equal(user.isFirstLogin, true);
  assert.match(user.password, /[A-Za-z]/);
  assert.match(user.password, /\d/);

  const authenticated = await authenticateUser({ email: 'auto.viewer@example.com', password: user.password });
  assert.ok(authenticated);
  assert.equal(authenticated.email, 'auto.viewer@example.com');
});

test('admin can delete another user from the system', async () => {
  const created = await createViewerUser({ email: 'delete.viewer@example.com', fullName: 'Delete Viewer' });
  const deleted = await deleteUserById(created.id);

  assert.equal(deleted.email, 'delete.viewer@example.com');
  const remaining = await getAllUsers();
  assert.equal(remaining.some(user => user.id === created.id), false);
});

test('admin can change a user role between viewer and admin', async () => {
  const created = await createViewerUser({ email: 'role.viewer@example.com', fullName: 'Role Viewer' });

  const promoted = await updateUserRole(created.id, 'admin');
  assert.equal(promoted.role, 'admin');

  const demoted = await updateUserRole(created.id, 'viewer');
  assert.equal(demoted.role, 'viewer');
});

test('reminder recipients prioritize admin login emails used for access', () => {
  const adminEmails = getAdminReminderRecipientEmails({ currentAdminEmail: 'admin@notify.local', configuredAdminEmails: ['ops@notify.local'] });

  assert.deepEqual(adminEmails, ['admin@notify.local', 'ops@notify.local']);

  recordAdminLoginEmail('team@notify.local');
  recordAdminLoginEmail('admin@notify.local');

  const recipients = getAdminReminderRecipientEmails({ currentAdminEmail: 'admin@notify.local', configuredAdminEmails: ['ops@notify.local'] });
  assert.deepEqual(recipients, ['admin@notify.local', 'ops@notify.local', 'team@notify.local']);
});
