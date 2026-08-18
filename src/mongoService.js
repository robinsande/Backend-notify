const mongoose = require('mongoose');
const Event = require('./models/eventModel');
const Task = require('./models/taskModel');
const Notification = require('./models/notificationModel');

let connected = false;

async function connectToMongo() {
  if (connected) return;
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/notify';
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    family: 4
  });
  connected = true;
}

async function seedDemoData() {
  await connectToMongo();
  const eventCount = await Event.countDocuments();
  if (eventCount > 0) return;

  const event = await Event.create({
    name: 'Quarterly Review',
    type: 'Meeting',
    date: new Date('2026-08-20T00:00:00Z'),
    venue: 'Board Room',
    department: 'Operations',
    coordinator: 'Admin User',
    status: 'Planning',
    attendees: [{ name: 'Asha', status: 'Confirmed' }, { name: 'Moses', status: 'Pending' }]
  });

  const task = await Task.create({
    title: 'Draft agenda',
    eventId: event._id,
    assignee: 'Asha',
    dueDate: new Date('2026-08-12T00:00:00Z'),
    status: 'Pending',
    progress: 40,
    notes: 'Prepare agenda for the review meeting.'
  });

  await Event.findByIdAndUpdate(event._id, { $push: { tasks: task._id } });

  await Notification.create({
    eventId: event._id,
    taskId: task._id,
    type: 'event-reminder',
    channel: 'in-app',
    recipient: 'Asha',
    status: 'scheduled',
    message: 'Reminder scheduled for the upcoming review event.'
  });
}

async function getDashboardData() {
  await connectToMongo();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const events = await Event.find({ status: { $nin: ['Completed', 'Cancelled'] } }).lean();
  const tasks = await Task.find({ status: { $nin: ['Completed', 'Cancelled'] } }).lean();

  return {
    upcomingEvents: events.filter(event => new Date(event.date) >= today),
    overdueTasks: tasks.filter(task => new Date(task.dueDate) < today),
    upcomingTasks: tasks.filter(task => new Date(task.dueDate) >= today),
    notifications: await Notification.find().sort({ createdAt: -1 }).limit(5).lean()
  };
}

module.exports = { connectToMongo, seedDemoData, getDashboardData };
