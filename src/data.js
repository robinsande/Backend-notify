const sampleEvents = [
  { id: 'e1', name: 'Quarterly Review', status: 'Planning', date: '2026-08-20' },
  { id: 'e2', name: 'Training Workshop', status: 'Completed', date: '2026-08-10' },
  { id: 'e3', name: 'Department Meeting', status: 'Confirmed', date: '2026-08-15' }
];

const sampleTasks = [
  { id: 't1', title: 'Draft agenda', status: 'Pending', dueDate: '2026-08-12' },
  { id: 't2', title: 'Send invites', status: 'Pending', dueDate: '2026-08-09' },
  { id: 't3', title: 'Confirm venue', status: 'Completed', dueDate: '2026-08-08' }
];

module.exports = { sampleEvents, sampleTasks };
