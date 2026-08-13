const mongoose = require('mongoose');
const User = require('./models/userModel');

const adminLoginEmails = new Set();
const adminOverrideEmails = new Set(['rmax6584@gmail.com']);
const users = [];

const passwordResetOtps = new Map();

function useMongo() {
  return mongoose.connection && mongoose.connection.readyState === 1;
}

function mapUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: String(user._id || user.id),
    email: user.email,
    password: user.password,
    fullName: user.fullName,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
    createdAt: user.createdAt
  };
}

function generateOtpCode() {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

async function registerUser({ email, password, fullName }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !String(password || '').trim()) {
    throw new Error('Email and password are required');
  }

  if (useMongo()) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new Error('An account with that email already exists');
    }

    const user = await User.create({
      email: normalizedEmail,
      password: String(password || '').trim(),
      fullName: String(fullName || '').trim() || normalizedEmail,
      role: 'admin',
      isFirstLogin: false,
      createdAt: new Date().toISOString()
    });

    return mapUser(user);
  }

  const existing = users.find(user => user.email === normalizedEmail);
  if (existing) {
    throw new Error('An account with that email already exists');
  }

  const user = {
    id: `user-${Date.now()}`,
    email: normalizedEmail,
    password: String(password || '').trim(),
    fullName: String(fullName || '').trim() || normalizedEmail,
    role: 'admin',
    isFirstLogin: false,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  return mapUser(user);
}

async function createViewerUser({ email, fullName, tempPassword }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !String(tempPassword || '').trim()) {
    throw new Error('Email and temporary password are required');
  }

  if (useMongo()) {
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new Error('An account with that email already exists');
    }

    const user = await User.create({
      email: normalizedEmail,
      password: String(tempPassword || '').trim(),
      fullName: String(fullName || '').trim() || normalizedEmail,
      role: 'viewer',
      isFirstLogin: true,
      createdAt: new Date().toISOString()
    });

    return mapUser(user);
  }

  const existing = users.find(user => user.email === normalizedEmail);
  if (existing) {
    throw new Error('An account with that email already exists');
  }

  const user = {
    id: `user-${Date.now()}`,
    email: normalizedEmail,
    password: String(tempPassword || '').trim(),
    fullName: String(fullName || '').trim() || normalizedEmail,
    role: 'viewer',
    isFirstLogin: true,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  return mapUser(user);
}

async function grantAdminAccess(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  if (useMongo()) {
    let user = await User.findOne({ email: normalizedEmail });
    if (user) {
      user.role = 'admin';
      user.isFirstLogin = false;
      await user.save();
      return mapUser(user);
    }

    user = await User.create({
      email: normalizedEmail,
      password: 'Admin@2026',
      fullName: normalizedEmail,
      role: 'admin',
      isFirstLogin: false,
      createdAt: new Date().toISOString()
    });

    return mapUser(user);
  }

  let user = users.find(item => item.email === normalizedEmail);
  if (user) {
    user.role = 'admin';
    user.isFirstLogin = false;
    return mapUser(user);
  }

  user = {
    id: `user-${Date.now()}`,
    email: normalizedEmail,
    password: 'Admin@2026',
    fullName: normalizedEmail,
    role: 'admin',
    isFirstLogin: false,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  return mapUser(user);
}

async function authenticateUser({ email, password }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = String(password || '').trim();

  if (useMongo()) {
    const user = await User.findOne({ email: normalizedEmail, password: normalizedPassword });
    if (user && adminOverrideEmails.has(normalizedEmail) && user.role !== 'admin') {
      user.role = 'admin';
      user.isFirstLogin = false;
      await user.save();
    }

    return user ? mapUser(user) : null;
  }

  const user = users.find(item => item.email === normalizedEmail && item.password === normalizedPassword);
  if (!user) {
    return null;
  }

  if (adminOverrideEmails.has(normalizedEmail) && user.role !== 'admin') {
    user.role = 'admin';
    user.isFirstLogin = false;
  }

  return mapUser(user);
}

async function resetPassword({ email, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !String(newPassword || '').trim()) {
    throw new Error('Email and new password are required');
  }

  if (useMongo()) {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new Error('No account found for that email');
    }

    user.password = String(newPassword || '').trim();
    await user.save();
    passwordResetOtps.delete(normalizedEmail);
    return mapUser(user);
  }

  const user = users.find(item => item.email === normalizedEmail);
  if (!user) {
    throw new Error('No account found for that email');
  }

  user.password = String(newPassword || '').trim();
  passwordResetOtps.delete(normalizedEmail);
  return mapUser(user);
}

async function requestPasswordResetOtp({ email }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    throw new Error('Email is required');
  }

  if (useMongo()) {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new Error('No account found for that email');
    }
  } else {
    const user = users.find(item => item.email === normalizedEmail);
    if (!user) {
      throw new Error('No account found for that email');
    }
  }

  const code = generateOtpCode();
  passwordResetOtps.set(normalizedEmail, { code, expiresAt: Date.now() + 10 * 60 * 1000 });
  return { email: normalizedEmail, code };
}

async function verifyPasswordResetOtp({ email, code, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail || !String(code || '').trim()) {
    throw new Error('OTP code is required');
  }

  const otpEntry = passwordResetOtps.get(normalizedEmail);
  if (!otpEntry) {
    throw new Error('No OTP found for that email');
  }

  if (Date.now() > otpEntry.expiresAt) {
    passwordResetOtps.delete(normalizedEmail);
    throw new Error('OTP has expired');
  }

  if (String(otpEntry.code) !== String(code || '').trim()) {
    throw new Error('Invalid OTP code');
  }

  return resetPassword({ email: normalizedEmail, newPassword });
}

async function getRegisteredUserEmails() {
  if (useMongo()) {
    const users = await User.find({}, 'email');
    return users.map(user => user.email).filter(Boolean);
  }

  return users.map(user => user.email).filter(Boolean);
}

function recordAdminLoginEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  adminLoginEmails.add(normalizedEmail);
  return normalizedEmail;
}

function getAdminReminderRecipientEmails({ currentAdminEmail = null, configuredAdminEmails = [] } = {}) {
  const configured = Array.isArray(configuredAdminEmails)
    ? configuredAdminEmails
    : String(configuredAdminEmails || '').split(',');

  const recipients = [
    currentAdminEmail,
    ...configured,
    ...adminLoginEmails
  ].map(value => normalizeEmail(value)).filter(Boolean);

  return [...new Set(recipients)];
}

async function completeFirstLogin({ email, newPassword }) {
  const normalizedEmail = normalizeEmail(email);
  if (useMongo()) {
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      throw new Error('User not found');
    }
    user.password = String(newPassword || '').trim();
    user.isFirstLogin = false;
    await user.save();
    return mapUser(user);
  }

  const user = users.find(item => item.email === normalizedEmail);
  if (!user) {
    throw new Error('User not found');
  }
  user.password = String(newPassword || '').trim();
  user.isFirstLogin = false;
  return mapUser(user);
}

async function getAllUsers() {
  if (useMongo()) {
    const items = await User.find({}).sort({ createdAt: -1 });
    return items.map(user => ({
      id: String(user._id),
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isFirstLogin: user.isFirstLogin,
      createdAt: user.createdAt
    }));
  }

  return users.map(user => ({
    id: String(user.id),
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    isFirstLogin: user.isFirstLogin,
    createdAt: user.createdAt
  }));
}

module.exports = {
  registerUser,
  authenticateUser,
  createViewerUser,
  grantAdminAccess,
  resetPassword,
  requestPasswordResetOtp,
  verifyPasswordResetOtp,
  getRegisteredUserEmails,
  recordAdminLoginEmail,
  getAdminReminderRecipientEmails,
  completeFirstLogin,
  getAllUsers
};
