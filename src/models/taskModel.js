const mongoose = require('mongoose');

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  assignee: String,
  dueDate: { type: Date, required: true },
  status: { type: String, default: 'Pending' },
  progress: { type: Number, default: 0 },
  notes: String
}, { timestamps: true });

module.exports = mongoose.model('Task', taskSchema);
