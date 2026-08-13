const initialEvents = [];

const initialTasks = [];

const initialNotifications = [];

const initialAttendees = [];

const initialDocuments = [];

const initialAuditLogs = [];

function buildDashboardSummary(events = initialEvents, tasks = initialTasks, notifications = initialNotifications) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const upcomingEvents = events.filter(event => ['Planning', 'Confirmed'].includes(event.status) && new Date(event.date) >= today);
  const planningEvents = events.filter(event => event.status === 'Planning').length;
  const confirmedEvents = events.filter(event => event.status === 'Confirmed').length;
  const completedEvents = events.filter(event => event.status === 'Completed').length;

  const outstandingTasks = tasks.filter(task => !['Completed', 'Cancelled'].includes(task.status));
  const overdueTasks = outstandingTasks.filter(task => new Date(task.dueDate) < today);
  const tasksDueSoon = outstandingTasks.filter(task => {
    const dueDate = new Date(task.dueDate);
    const diffDays = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 3;
  });

  return {
    totalEvents: events.length,
    upcomingEvents: upcomingEvents.length,
    planningEvents,
    confirmedEvents,
    completedEvents,
    outstandingTasks: outstandingTasks.length,
    overdueTasks: overdueTasks.length,
    tasksDueSoon: tasksDueSoon.length,
    events,
    tasks,
    notifications: notifications.slice(0, 5)
  };
}

function syncEventAttendees(existingAttendees = [], event = {}) {
  if (!event || !Array.isArray(event.attendees)) {
    return existingAttendees;
  }

  const eventId = event.id || 'unknown-event';
  const eventName = event.name || 'Event';
  const roster = existingAttendees.filter(item => item.eventId !== eventId);

  const synced = event.attendees
    .filter(Boolean)
    .map((attendee, index) => ({
      id: attendee.id || `event-att-${eventId}-${index}`,
      eventId,
      eventName,
      name: attendee.name || 'Unnamed attendee',
      email: attendee.email || '',
      status: attendee.status || 'Confirmed',
      role: attendee.role || attendee.directorRole || '',
      createdAt: attendee.createdAt || new Date().toISOString()
    }));

  return [...roster, ...synced];
}

module.exports = {
  initialEvents,
  initialTasks,
  initialNotifications,
  initialAttendees,
  initialDocuments,
  initialAuditLogs,
  buildDashboardSummary,
  syncEventAttendees
};
