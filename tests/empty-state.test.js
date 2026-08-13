const test = require('node:test');
const assert = require('node:assert/strict');
const { initialEvents, initialTasks, initialAttendees } = require('../src/inMemoryStore');

test('starter data leaves attendee list empty until entries are created', () => {
  assert.deepEqual(initialEvents, []);
  assert.deepEqual(initialTasks, []);
  assert.deepEqual(initialAttendees, []);
});
