function calculateReminderSchedule(eventDate) {
  const base = new Date(eventDate);
  return [
    { label: '7 days before', daysBefore: 7, date: new Date(base.getTime() - 7 * 24 * 60 * 60 * 1000) },
    { label: '3 days before', daysBefore: 3, date: new Date(base.getTime() - 3 * 24 * 60 * 60 * 1000) },
    { label: '1 day before', daysBefore: 1, date: new Date(base.getTime() - 24 * 60 * 60 * 1000) }
  ];
}

function parseDateValue(value) {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Date(`${value}T00:00:00Z`);
  }
  return new Date(value);
}

function isSameOrAfter(left, right) {
  return parseDateValue(left).getTime() >= parseDateValue(right).getTime();
}

function isBefore(left, right) {
  return parseDateValue(left).getTime() < parseDateValue(right).getTime();
}

function buildReminderSummary(events, tasks, now = new Date()) {
  const nowDate = new Date(now);
  const today = nowDate.toISOString().slice(0, 10);

  const upcomingEvents = events.filter(event => event.status !== 'Completed' && event.status !== 'Cancelled' && isSameOrAfter(event.date, today));
  const overdueTasks = tasks.filter(task => task.status !== 'Completed' && task.status !== 'Cancelled' && isBefore(task.dueDate, today));
  const upcomingTasks = tasks.filter(task => task.status !== 'Completed' && task.status !== 'Cancelled' && isSameOrAfter(task.dueDate, today));

  return {
    upcomingEvents,
    overdueTasks,
    upcomingTasks,
    today
  };
}

function getUpcomingItemsForReminders(events, tasks, windowDays = 7, now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + windowDays);

  const upcomingItems = [];

  const normalizedEvents = events
    .filter(event => event.status !== 'Completed' && event.status !== 'Cancelled')
    .map(event => ({
      id: event.id,
      type: 'event',
      title: event.name || 'Event',
      owner: event.coordinator || event.department || 'Team',
      dueDate: parseDateValue(event.startDate || event.date),
      source: event
    }));

  const normalizedTasks = tasks
    .filter(task => task.status !== 'Completed' && task.status !== 'Cancelled')
    .map(task => ({
      id: task.id,
      type: 'task',
      title: task.title || 'Task',
      owner: task.assignee || 'Team',
      dueDate: parseDateValue(task.dueDate),
      source: task
    }));

  [...normalizedEvents, ...normalizedTasks].forEach(item => {
    if (!item.dueDate || item.dueDate.toString() === 'Invalid Date') {
      return;
    }

    calculateReminderSchedule(item.dueDate).forEach(reminder => {
      const reminderDate = reminder.date;
      if (reminderDate >= start && reminderDate <= end) {
        upcomingItems.push({
          id: item.id,
          type: item.type,
          title: item.title,
          owner: item.owner,
          dueDate: item.dueDate.toISOString().slice(0, 10),
          reminderLabel: reminder.label,
          reminderDate: reminderDate.toISOString().slice(0, 10)
        });
      }
    });
  });

  return upcomingItems;
}

module.exports = { calculateReminderSchedule, buildReminderSummary, getUpcomingItemsForReminders };
