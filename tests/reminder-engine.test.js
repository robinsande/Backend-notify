const test = require('node:test');
const assert = require('node:assert/strict');
const { calculateReminderSchedule, buildReminderSummary } = require('../src/reminderEngine');

test('calculateReminderSchedule returns expected reminder dates', () => {
  const eventDate = new Date('2026-08-20T00:00:00Z');
  const reminders = calculateReminderSchedule(eventDate);
  assert.deepEqual(reminders.map(r => r.label), ['7 days before', '3 days before', '1 day before']);
  assert.equal(reminders[0].date.toISOString().slice(0, 10), '2026-08-13');
  assert.equal(reminders[1].date.toISOString().slice(0, 10), '2026-08-17');
  assert.equal(reminders[2].date.toISOString().slice(0, 10), '2026-08-19');
});

test('buildReminderSummary reports overdue and upcoming items', () => {
  const events = [
    { id: 'e1', name: 'Launch', status: 'Planning', date: '2026-08-20' },
    { id: 'e2', name: 'Review', status: 'Completed', date: '2026-08-10' }
  ];
  const tasks = [
    { id: 't1', title: 'Draft agenda', status: 'Pending', dueDate: '2026-08-12' },
    { id: 't2', title: 'Send invites', status: 'Pending', dueDate: '2026-08-09' }
  ];
  const summary = buildReminderSummary(events, tasks, new Date('2026-08-11T00:00:00Z'));
  assert.equal(summary.upcomingEvents.length, 1);
  assert.equal(summary.overdueTasks.length, 1);
  assert.equal(summary.upcomingTasks.length, 1);
});
