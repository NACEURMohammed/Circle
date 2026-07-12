function normalizeId(value) {
  return String(value);
}

function syncMutualContacts(currentUser, otherUser) {
  const currentContacts = new Set((currentUser.contacts || []).map(normalizeId));
  const otherContacts = new Set((otherUser.contacts || []).map(normalizeId));

  currentContacts.add(normalizeId(otherUser._id));
  otherContacts.add(normalizeId(currentUser._id));

  currentUser.contacts = Array.from(currentContacts);
  otherUser.contacts = Array.from(otherContacts);
}

function removeMutualContacts(currentUser, otherUser) {
  const currentContacts = new Set((currentUser.contacts || []).map(normalizeId));
  const otherContacts = new Set((otherUser.contacts || []).map(normalizeId));

  currentContacts.delete(normalizeId(otherUser._id));
  otherContacts.delete(normalizeId(currentUser._id));

  currentUser.contacts = Array.from(currentContacts);
  otherUser.contacts = Array.from(otherContacts);
}

module.exports = { syncMutualContacts, removeMutualContacts };
