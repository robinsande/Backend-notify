const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: 'Task' },
  type: { type: String, required: true },
  channel: { type: String, default: 'in-app' },
  recipient: String,
  status: { type: String, default: 'scheduled' },
  sentAt: Date,
  message: String
}, { timestamps: true });

module.exports = mongoose.model('Notification', notificationSchema);
