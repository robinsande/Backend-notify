const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: String,
  date: { type: Date, required: true },
  venue: String,
  department: String,
  coordinator: String,
  status: { type: String, default: 'Planning' },
  attendees: [{ name: String, status: String }],
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }]
}, { timestamps: true });

module.exports = mongoose.model('Event', eventSchema);
