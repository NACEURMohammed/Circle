const test = require('node:test');
const assert = require('node:assert/strict');

const { syncMutualContacts, removeMutualContacts } = require('../utils/contacts');

test('adds both users to each others contact lists without duplicates', () => {
  const alice = { _id: 'alice-id', contacts: [] };
  const bob = { _id: 'bob-id', contacts: [] };

  syncMutualContacts(alice, bob);

  assert.deepEqual(alice.contacts.map(String), ['bob-id']);
  assert.deepEqual(bob.contacts.map(String), ['alice-id']);
});

test('removes a contact from both users when one removes it', () => {
  const alice = { _id: 'alice-id', contacts: ['bob-id'] };
  const bob = { _id: 'bob-id', contacts: ['alice-id'] };

  removeMutualContacts(alice, bob);

  assert.deepEqual(alice.contacts, []);
  assert.deepEqual(bob.contacts, []);
});
