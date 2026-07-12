/* ═══════════════════════════════════════════════════════════
   CERCLE — script.js
   Full client-side logic: auth, chat, contacts, files
═══════════════════════════════════════════════════════════ */

const API = '/api';
const palette = ['#C6427E', '#9B2F62', '#E8B647', '#4A7C8C', '#6B5CA5', '#3F8F5F'];

/* ─── State ─── */
let token = localStorage.getItem('cercle_token') || null;
let currentUser = JSON.parse(localStorage.getItem('cercle_user') || 'null');
let contacts = [];
let contactById = {};
let conversations = [];
let activeId = null;
let currentFilter = 'all';
let infoOpen = false;
let selectedMembers = new Set();
let selectedColor = 0;
const socket = io({ transports: ['websocket', 'polling'] });

socket.on('connect', () => {
  if (currentUser?.id) {
    socket.emit('register-user', currentUser.id);
  }
});

// Ensure we re-join rooms on reconnect
socket.on('connect', () => {
  try {
    if (currentUser?.id) socket.emit('register-user', currentUser.id);
    conversations.forEach((c) => {
      try { socket.emit('join-room', c.id); } catch (e) {}
    });
  } catch (e) {}
});

/* ─────────────────────────────────────
   HELPERS
───────────────────────────────────── */
function gradFor(seed) {
  const i = (typeof seed === 'number' ? seed : seed.charCodeAt ? seed.charCodeAt(0) : 0) % palette.length;
  const j = (i + 2) % palette.length;
  return `linear-gradient(135deg,${palette[i]},${palette[j]})`;
}

function initialsOf(name) {
  return (name || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function authHeaders() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
}

function showToast(msg, duration = 2800) {
  let el = document.getElementById('globalToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'globalToast';
    el.className = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), duration);
}

function isImage(type) {
  return type && type.startsWith('image/');
}

/* ─────────────────────────────────────
   AUTH
───────────────────────────────────── */
function showAuthError(cardId, msg) {
  const el = document.getElementById(cardId === 'loginCard' ? 'loginError' : 'registerError');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
}
function clearAuthErrors() {
  ['loginError', 'registerError'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) { el.textContent = ''; el.classList.remove('show'); }
  });
}

function showCard(id) {
  ['loginCard', 'registerCard', 'verifyCard'].forEach((c) => {
    document.getElementById(c)?.classList.toggle('hidden', c !== id);
  });
}

async function doLogin() {
  clearAuthErrors();
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('loginPassword').value;
  if (!email || !password) { showAuthError('loginCard', 'Please fill in all fields.'); return; }

  const btn = document.getElementById('loginBtn');
  btn.classList.add('loading'); btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError('loginCard', data.message || 'Login failed'); return; }

    token = data.token;
    currentUser = data.user;
    localStorage.setItem('cercle_token', token);
    localStorage.setItem('cercle_user', JSON.stringify(currentUser));
    enterApp();
  } catch (e) {
    showAuthError('loginCard', 'Network error. Is the server running?');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

async function doRegister() {
  clearAuthErrors();
  const name = document.getElementById('regName').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const password = document.getElementById('regPassword').value;
  if (!name || !email || !password) { showAuthError('registerCard', 'Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError('registerCard', 'Password must be at least 6 characters.'); return; }

  const btn = document.getElementById('registerBtn');
  btn.classList.add('loading'); btn.disabled = true;

  try {
    const res = await fetch(`${API}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password })
    });
    const data = await res.json();
    if (!res.ok) { showAuthError('registerCard', data.message || 'Registration failed'); return; }

    // If email failed to send, inform the user with actionable guidance
    if (data.emailSent === false) {
      document.getElementById('verifyMsg').textContent =
        `Account created, but we couldn't send a verification email. Check server email settings or contact support.`;
      if (data.previewUrl) {
        const p = document.createElement('div');
        p.style.marginTop = '10px';
        p.innerHTML = `Preview email: <a href="${data.previewUrl}" target="_blank">Open</a>`;
        document.getElementById('registerCard').appendChild(p);
      }
    } else {
      document.getElementById('verifyMsg').textContent =
        `We sent a verification link to ${email}. Click it to activate your account.`;
      if (data.previewUrl) {
        const p = document.createElement('div');
        p.style.marginTop = '10px';
        p.innerHTML = `Preview email (dev): <a href="${data.previewUrl}" target="_blank">Open</a>`;
        document.getElementById('registerCard').appendChild(p);
      }
    }
    showCard('verifyCard');
  } catch (e) {
    showAuthError('registerCard', 'Network error. Is the server running?');
  } finally {
    btn.classList.remove('loading'); btn.disabled = false;
  }
}

function logout() {
  token = null; currentUser = null;
  localStorage.removeItem('cercle_token');
  localStorage.removeItem('cercle_user');
  contacts = []; contactById = {}; conversations = []; activeId = null; infoOpen = false;
  document.getElementById('appRoot').style.display = 'none';
  document.getElementById('authOverlay').classList.remove('hidden');
  showCard('loginCard');
}

function enterApp() {
  document.getElementById('authOverlay').classList.add('hidden');
  const app = document.getElementById('appRoot');
  app.style.display = 'grid';
  // Update me-row
  document.getElementById('meName').textContent = currentUser.name;
  document.getElementById('meAvatar').textContent = initialsOf(currentUser.name);
  document.getElementById('meAvatar').style.background = gradFor(currentUser.id.charCodeAt(1) || 1);
  bootstrap();
}

/* ─────────────────────────────────────
   DATA LOADING
───────────────────────────────────── */
function normalizeMessages(msgs) {
  return (msgs || []).map((m) => ({
    id: m.id,
    from: m.senderId === currentUser.id ? 'me' : m.senderId,
    text: m.content || '',
    time: formatTime(m.createdAt),
    fileUrl: m.fileUrl || null,
    fileName: m.fileName || null,
    fileType: m.fileType || null,
    deleted: m.deleted || false
  }));
}

async function loadContacts() {
  const res = await fetch(`${API}/messages/contacts`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  contacts = (data.contacts || []).map((c) => ({ ...c, initials: initialsOf(c.name), online: true }));
  contactById = Object.fromEntries(contacts.map((c) => [c.id, c]));
}

async function loadConversations() {
  const res = await fetch(`${API}/messages/conversations`, { headers: authHeaders() });
  if (!res.ok) return;
  const data = await res.json();
  conversations = (data.conversations || []).map((conv) => ({
    ...conv,
    messages: normalizeMessages(conv.messages || []),
    time: conv.time ? formatTime(conv.time) : 'Now',
    unread: 0
  }));
  if (!activeId && conversations.length) activeId = conversations[0].id;
}

async function bootstrap() {
  await loadContacts();
  await loadConversations();
  renderAll();
  if (currentUser?.id) {
    socket.emit('register-user', currentUser.id);
  }
  // Join socket rooms
  conversations.forEach((c) => socket.emit('join-room', c.id));
}

/* ─────────────────────────────────────
   RENDER HELPERS
───────────────────────────────────── */
function memberNames(conv) {
  return (conv.members || []).map((id) => contactById[id]?.name?.split(' ')[0] || 'Member');
}

function renderAvatar(conv) {
  if (conv.type === 'direct') {
    const contact = contactById[conv.contact];
    if (!contact) return `<div class="avatar" style="background:${gradFor(1)}">?</div>`;
    return `<div class="avatar" style="background:${gradFor(conv.contact.charCodeAt ? conv.contact.charCodeAt(1) : 1)}">${contact.initials}<span class="presence-dot"></span></div>`;
  }
  return renderCluster(conv.members || [], conv.color || 0);
}

function renderCluster(memberIds, colorSeed) {
  const positions = [
    { t: 0, l: 8, s: 24 },
    { t: 16, l: 0, s: 20 },
    { t: 16, l: 24, s: 20 }
  ];
  const ids = memberIds.slice(0, 3);
  let nodes = '';
  ids.forEach((id, idx) => {
    const contact = contactById[id];
    const pos = positions[idx] || positions[0];
    const label = contact ? contact.initials.slice(0, 1) : '?';
    nodes += `<div class="node" style="top:${pos.t}px;left:${pos.l}px;width:${pos.s}px;height:${pos.s}px;font-size:${pos.s * 0.4}px;background:${gradFor((id.charCodeAt ? id.charCodeAt(0) : 0) + idx + colorSeed)}">${label}</div>`;
  });
  return `<div class="cluster">${nodes}</div>`;
}

/* ─── Conversation List ─── */
function renderContactsPanel() {
  const wrap = document.getElementById('contactsList');
  if (!wrap) return;

  if (!contacts.length) {
    wrap.innerHTML = '<div class="contacts-empty">No contacts yet. Add one to start chatting.</div>';
    return;
  }

  wrap.innerHTML = contacts.map((c) => `
    <div class="contact-chip">
      <div class="contact-chip-main">
        <div class="avatar" style="background:${gradFor(c.id.charCodeAt ? c.id.charCodeAt(1) : 1)}">${c.initials}</div>
        <div class="contact-chip-name">${c.name}</div>
      </div>
      <div class="contact-chip-actions">
        <button class="contact-chip-btn" data-action="chat" data-id="${c.id}" title="Open chat">Chat</button>
        <button class="contact-chip-btn danger" data-action="delete" data-id="${c.id}" title="Delete contact">Delete</button>
      </div>
    </div>`).join('');

  wrap.querySelectorAll('[data-action="chat"]').forEach((btn) => {
    btn.addEventListener('click', () => openDirectConversation(btn.dataset.id));
  });

  wrap.querySelectorAll('[data-action="delete"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Remove this contact?')) return;
      await removeContact(btn.dataset.id);
    });
  });
}

function openDirectConversation(contactId) {
  const existing = conversations.find((c) => c.type === 'direct' && c.contact === contactId);
  if (existing) {
    activeId = existing.id;
    renderAll();
    return;
  }

  const contact = contactById[contactId];
  const newConv = {
    id: `d:${contactId}`,
    type: 'direct',
    name: contact?.name || 'Contact',
    contact: contactId,
    time: 'Now',
    unread: 0,
    messages: []
  };

  conversations.unshift(newConv);
  activeId = newConv.id;
  renderAll();
  socket.emit('join-room', newConv.id);
}

function renderConvList() {
  const list = document.getElementById('convList');
  const query = document.getElementById('searchInput').value.trim().toLowerCase();
  const items = conversations.filter((c) => {
    if (currentFilter !== 'all' && c.type !== currentFilter) return false;
    if (query && !c.name.toLowerCase().includes(query)) return false;
    return true;
  });

  if (!items.length) {
    list.innerHTML = '<div style="padding:30px 10px;text-align:center;color:var(--slate-light);font-size:13px;">No conversations yet</div>';
    return;
  }

  list.innerHTML = items.map((c) => {
    const last = c.messages?.[c.messages.length - 1];
    let preview = '';
    if (last) {
      if (last.fileUrl) preview = last.from === 'me' ? 'You sent a file' : 'Sent a file';
      else preview = last.from === 'me' ? `You: ${last.text}` : last.text;
    }
    return `
      <button class="conv-item ${c.id === activeId ? 'active' : ''}" data-id="${c.id}">
        ${renderAvatar(c)}
        <div class="conv-body">
          <div class="conv-top">
            <span class="conv-name">${c.name}</span>
            <span class="conv-time">${c.time || ''}</span>
          </div>
          <div class="conv-preview">
            <span>${preview}</span>
            ${c.unread ? `<span class="unread-badge">${c.unread}</span>` : ''}
          </div>
        </div>
        <button class="conv-delete" data-id="${c.id}" title="Delete conversation">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        </button>
      </button>`;
  }).join('');

  list.querySelectorAll('.conv-item').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.conv-delete')) return;
      activeId = el.dataset.id;
      const conv = conversations.find((c) => c.id === activeId);
      if (conv) conv.unread = 0;
      renderAll();
      if (window.innerWidth <= 880) document.getElementById('sidebar').classList.add('hide');
    });
  });

  list.querySelectorAll('.conv-delete').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm('Delete this conversation?')) return;
      await deleteConversation(btn.dataset.id);
    });
  });
}

/* ─── Chat Header ─── */
function renderHeader(conv) {
  const header = document.getElementById('chatHeader');
  const sub = conv.type === 'group'
    ? `${(conv.members || []).length} members · ${memberNames(conv).slice(0, 2).join(', ')}${(conv.members || []).length > 2 ? ' & others' : ''}`
    : 'Active now';

  header.innerHTML = `
    <button class="icon-btn back-btn" id="mobileBack" title="Back">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>
    </button>
    ${renderAvatar(conv)}
    <div class="title-wrap">
      <div class="conv-name">${conv.name}</div>
      <div class="conv-sub">${sub}</div>
    </div>
    <button class="icon-btn ${infoOpen ? 'on' : ''}" id="infoToggle" title="Conversation info">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    </button>`;

  document.getElementById('infoToggle').addEventListener('click', () => {
    infoOpen = !infoOpen;
    renderAll();
  });
  document.getElementById('mobileBack')?.addEventListener('click', () =>
    document.getElementById('sidebar').classList.remove('hide'));
}

/* ─── Messages ─── */
function renderMessages(conv) {
  const wrap = document.getElementById('messages');
  let html = '<div class="day-divider">Today</div>';

  (conv.messages || []).filter(m => !m.deleted).forEach((msg, idx, arr) => {
    const mine = msg.from === 'me';
    const prevSame = idx > 0 && arr[idx - 1].from === msg.from;
    const sender = mine ? null : contactById[msg.from];
    const senderName = sender?.name || 'Contact';
    const senderInitials = sender ? sender.initials : initialsOf(senderName);

    let bubbleContent = '';
    if (msg.fileUrl && isImage(msg.fileType)) {
      bubbleContent = `<img class="img-bubble" src="${msg.fileUrl}" alt="${msg.fileName || 'image'}"
        data-url="${msg.fileUrl}" data-name="${msg.fileName || 'image'}" loading="lazy">`;
    } else if (msg.fileUrl) {
      bubbleContent = `
        <div class="bubble file-bubble">
          <div class="file-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/></svg>
          </div>
          <div class="file-info">
            <div class="file-name">${msg.fileName || 'File'}</div>
          </div>
          <a class="file-download" href="${msg.fileUrl}" download="${msg.fileName || 'file'}" title="Download">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </a>
        </div>`;
    } else {
      bubbleContent = `<div class="bubble">${escHtml(msg.text)}</div>`;
    }

    html += `
      <div class="msg-row ${mine ? 'mine' : ''} ${prevSame ? 'grouped' : ''}" data-msg-id="${msg.id}">
        ${!mine ? `<div class="avatar" style="background:${gradFor(typeof msg.from === 'string' ? (msg.from.charCodeAt ? msg.from.charCodeAt(1) : 0) : 0)};width:28px;height:28px;font-size:11px;">${senderInitials}</div>` : ''}
        <div class="bubble-col">
          ${(!mine && !prevSame && conv.type === 'group') ? `<div class="msg-sender">${senderName}</div>` : ''}
          ${bubbleContent}
          <div class="msg-meta">${msg.time}</div>
        </div>
        ${mine ? `<button class="msg-delete-btn" data-id="${msg.id}" title="Delete">✕</button>` : ''}
      </div>`;
  });

  wrap.innerHTML = html;
  wrap.scrollTop = wrap.scrollHeight;

  // Image click → preview
  wrap.querySelectorAll('.img-bubble').forEach((img) => {
    img.addEventListener('click', () => openFilePreview(img.dataset.url, img.dataset.name));
  });

  // Delete message buttons
  wrap.querySelectorAll('.msg-delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => deleteMessage(btn.dataset.id, conv));
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/* ─── Info Panel ─── */
function renderInfoPanel(conv) {
  const panel = document.getElementById('infoPanel');
  const inner = document.getElementById('infoInner');
  panel.classList.toggle('open', infoOpen);
  if (!infoOpen) return;

  if (conv.type === 'group') {
    inner.innerHTML = `
      <div class="info-cluster-wrap">${renderCluster(conv.members || [], conv.color || 0)}</div>
      <div class="info-title">${conv.name}</div>
      <div class="info-sub">${(conv.members || []).length} members</div>
      <div class="info-section-label">Members</div>
      <div class="member-row">
        <div class="avatar" style="width:34px;height:34px;font-size:12px;background:${gradFor(currentUser.id.charCodeAt(1) || 1)}">${initialsOf(currentUser.name)}</div>
        <div><div class="member-name">${currentUser.name}</div><div class="member-role">You</div></div>
      </div>
      ${(conv.members || []).filter(id => id !== currentUser.id).map((id) => {
        const c = contactById[id];
        return `<div class="member-row">
          <div class="avatar" style="width:34px;height:34px;font-size:12px;background:${gradFor(id.charCodeAt ? id.charCodeAt(0) : 0)}">${c ? c.initials : '?'}</div>
          <div><div class="member-name">${c ? c.name : 'Member'}</div><div class="member-role">${c?.online ? 'Online' : 'Offline'}</div></div>
        </div>`;
      }).join('')}
      <div class="info-section-label">Actions</div>
      <button class="info-action-btn danger" id="deleteConvBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Leave &amp; delete circle
      </button>`;
  } else {
    const contact = contactById[conv.contact];
    inner.innerHTML = `
      <div class="info-cluster-wrap">
        <div class="avatar" style="width:72px;height:72px;font-size:24px;background:${gradFor(conv.contact.charCodeAt ? conv.contact.charCodeAt(1) : 1)}">
          ${contact ? contact.initials : '?'}
        </div>
      </div>
      <div class="info-title">${contact ? contact.name : 'Contact'}</div>
      <div class="info-sub">${contact?.email || ''}</div>
      <div class="info-sub" style="margin-top:-14px;">Active now</div>
      <div class="info-section-label">Actions</div>
      <button class="info-action-btn neutral" id="addContactInfoBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        View contact info
      </button>
      <button class="info-action-btn danger" id="removeContactBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
        Remove contact
      </button>
      <button class="info-action-btn danger" id="deleteConvBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
        Delete conversation
      </button>`;

    document.getElementById('removeContactBtn')?.addEventListener('click', async () => {
      if (!confirm(`Remove ${contact?.name} from your contacts?`)) return;
      await removeContact(conv.contact);
    });
  }

  document.getElementById('deleteConvBtn')?.addEventListener('click', async () => {
    if (!confirm('Delete this conversation?')) return;
    await deleteConversation(activeId);
  });
}

/* ─── Render All ─── */
function renderAll() {
  const conv = conversations.find((c) => c.id === activeId);
  renderContactsPanel();
  renderConvList();

  const chatContent = document.getElementById('chatContent');
  const emptyChat = document.getElementById('emptyChat');

  if (conv) {
    chatContent.style.display = 'flex';
    emptyChat.style.display = 'none';
    renderHeader(conv);
    renderMessages(conv);
    renderInfoPanel(conv);
  } else {
    chatContent.style.display = 'none';
    emptyChat.style.display = 'flex';
    document.getElementById('infoPanel').classList.remove('open');
  }
}

/* ─────────────────────────────────────
   SEND MESSAGE
───────────────────────────────────── */
async function sendMessage() {
  const input = document.getElementById('msgInput');
  const text = input.value.trim();
  if (!text) return;

  const conv = conversations.find((c) => c.id === activeId);
  if (!conv) return;

  let endpoint, body;
  if (conv.type === 'group') {
    endpoint = `${API}/messages/group-messages`;
    body = { groupId: conv.id.replace('g:', ''), content: text };
  } else {
    endpoint = `${API}/messages/messages`;
    body = { receiverId: conv.contact, content: text };
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  const data = await res.json();
  const msg = data.message;

  const localMsg = {
    id: msg.id,
    from: 'me',
    text,
    time: formatTime(msg.createdAt),
    fileUrl: null, fileName: null, fileType: null
  };
  conv.messages.push(localMsg);
  conv.time = formatTime(msg.createdAt);
  input.value = '';
  renderAll();

  // Broadcast via socket
  socket.emit('send-message', {
    roomId: conv.id,
    message: msg,
    recipientId: conv.type === 'group' ? null : conv.contact,
    senderId: currentUser?.id
  });
  // quick confirmation for mobile/outgoing
  try { showToast('Message sent'); } catch (e) {}
}

/* ─────────────────────────────────────
   FILE UPLOAD & SEND
───────────────────────────────────── */
async function sendFile(file) {
  const conv = conversations.find((c) => c.id === activeId);
  if (!conv) return;

  // Show upload indicator
  showUploadIndicator(true);

  try {
    const formData = new FormData();
    formData.append('file', file);

    const uploadRes = await fetch(`${API}/messages/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData
    });
    const uploadData = await uploadRes.json();
    if (!uploadRes.ok) { showToast('Upload failed: ' + uploadData.message); return; }

    // Send message with file info
    let endpoint, body;
    if (conv.type === 'group') {
      endpoint = `${API}/messages/group-messages`;
      body = { groupId: conv.id.replace('g:', ''), content: '', fileUrl: uploadData.fileUrl, fileName: uploadData.fileName, fileType: uploadData.fileType };
    } else {
      endpoint = `${API}/messages/messages`;
      body = { receiverId: conv.contact, content: '', fileUrl: uploadData.fileUrl, fileName: uploadData.fileName, fileType: uploadData.fileType };
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(body)
    });
    const data = await res.json();
    const msg = data.message;

    const localMsg = {
      id: msg.id,
      from: 'me',
      text: '',
      time: formatTime(msg.createdAt),
      fileUrl: uploadData.fileUrl,
      fileName: uploadData.fileName,
      fileType: uploadData.fileType
    };
    conv.messages.push(localMsg);
    conv.time = formatTime(msg.createdAt);
    renderAll();

    socket.emit('send-message', {
      roomId: conv.id,
      message: msg,
      recipientId: conv.type === 'group' ? null : conv.contact,
      senderId: currentUser?.id
    });
    showToast(`📎 ${uploadData.fileName} sent`);
  } finally {
    showUploadIndicator(false);
    document.getElementById('fileInput').value = '';
  }
}

function showUploadIndicator(show) {
  let el = document.getElementById('uploadIndicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'uploadIndicator';
    el.className = 'upload-indicator';
    el.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation:spin .7s linear infinite"><path d="M21 12a9 9 0 1 1-6.22-8.56"/></svg> Uploading…`;
    document.getElementById('chatMain').appendChild(el);
  }
  el.classList.toggle('show', show);
}

/* ─────────────────────────────────────
   FILE PREVIEW
───────────────────────────────────── */
function openFilePreview(url, name) {
  document.getElementById('previewFileName').textContent = name;
  const content = document.getElementById('previewContent');
  if (/\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name) || url) {
    content.innerHTML = `<img src="${url}" alt="${name}" style="max-width:100%;max-height:65vh;border-radius:12px;">`;
  } else {
    content.innerHTML = `<a href="${url}" download="${name}" class="auth-btn" style="text-decoration:none;">Download ${name}</a>`;
  }
  document.getElementById('filePreviewOverlay').classList.add('show');
}

/* ─────────────────────────────────────
   DELETE OPERATIONS
───────────────────────────────────── */
async function deleteMessage(msgId, conv) {
  if (!confirm('Delete this message?')) return;
  await fetch(`${API}/messages/messages/${msgId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  const idx = conv.messages.findIndex((m) => m.id === msgId);
  if (idx !== -1) conv.messages[idx].deleted = true;
  renderAll();
  socket.emit('message-deleted', { roomId: conv.id, messageId: msgId });
}

async function deleteConversation(convId) {
  await fetch(`${API}/messages/conversations/${convId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  conversations = conversations.filter((c) => c.id !== convId);
  if (activeId === convId) activeId = conversations[0]?.id || null;
  infoOpen = false;
  renderAll();
  showToast('Conversation deleted');
}

async function removeContact(contactId) {
  await fetch(`${API}/messages/contacts/${contactId}`, {
    method: 'DELETE',
    headers: authHeaders()
  });
  contacts = contacts.filter((c) => c.id !== contactId);
  delete contactById[contactId];
  conversations = conversations.filter((c) => !(c.type === 'direct' && c.contact === contactId));
  if (activeId === `d:${contactId}`) activeId = conversations[0]?.id || null;
  infoOpen = false;
  await loadContacts();
  renderAll();
  showToast('Contact removed');
}

/* ─────────────────────────────────────
   ADD CONTACT MODAL
───────────────────────────────────── */
let addContactTimeout = null;

function openAddContactModal() {
  document.getElementById('addContactSearch').value = '';
  document.getElementById('addContactResults').innerHTML =
    '<div style="padding:20px;text-align:center;color:var(--slate-light);font-size:12.5px;">Type to search users</div>';
  document.getElementById('addContactOverlay').classList.add('show');
  document.getElementById('addContactSearch').focus();
}

function closeAddContactModal() {
  document.getElementById('addContactOverlay').classList.remove('show');
}

async function searchUsers(query) {
  if (!query) {
    document.getElementById('addContactResults').innerHTML =
      '<div style="padding:20px;text-align:center;color:var(--slate-light);font-size:12.5px;">Type to search users</div>';
    return;
  }
  const res = await fetch(`${API}/messages/users/search?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
  const data = await res.json();
  const users = data.users || [];
  const wrap = document.getElementById('addContactResults');

  if (!users.length) {
    wrap.innerHTML = '<div style="padding:20px;text-align:center;color:var(--slate-light);font-size:12.5px;">No users found</div>';
    return;
  }

  wrap.innerHTML = users.map((u) => `
    <div class="contact-row" data-uid="${u.id}">
      <div class="avatar" style="width:36px;height:36px;font-size:12.5px;background:${gradFor(u.id.charCodeAt ? u.id.charCodeAt(1) : 1)}">${initialsOf(u.name)}</div>
      <div style="flex:1;min-width:0;">
        <div class="contact-name">${u.name}</div>
        <div class="contact-email">${u.email}</div>
      </div>
      <button class="add-btn ${u.isContact ? 'added' : ''}" data-uid="${u.id}" ${u.isContact ? 'disabled' : ''}>
        ${u.isContact ? '✓ Added' : 'Add'}
      </button>
    </div>`).join('');

  wrap.querySelectorAll('.add-btn:not([disabled])').forEach((btn) => {
    btn.addEventListener('click', async () => {
      btn.disabled = true;
      btn.textContent = '…';
      const res2 = await fetch(`${API}/messages/contacts`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ contactId: btn.dataset.uid })
      });
      const d = await res2.json();
      if (res2.ok) {
        btn.textContent = '✓ Added';
        btn.classList.add('added');
        // Refresh contacts & conversations
        await loadContacts();
        await loadConversations();
        renderAll();
        showToast(`${d.contact?.name} added to contacts`);
      } else {
        btn.disabled = false;
        btn.textContent = 'Add';
        showToast(d.message || 'Error adding contact');
      }
    });
  });
}

/* ─────────────────────────────────────
   CIRCLE (GROUP) MODAL
───────────────────────────────────── */
function openModal() {
  selectedMembers = new Set();
  selectedColor = 0;
  document.getElementById('groupNameInput').value = '';
  document.getElementById('contactSearch').value = '';
  renderSwatches();
  renderContactList();
  renderOrbitPreview();
  updateCreateBtn();
  document.getElementById('modalOverlay').classList.add('show');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

function renderSwatches() {
  const wrap = document.getElementById('swatches');
  wrap.innerHTML = palette.map((c, i) =>
    `<button class="swatch ${i === selectedColor ? 'selected' : ''}" data-i="${i}" style="background:${c}"></button>`
  ).join('');
  wrap.querySelectorAll('.swatch').forEach((el) => {
    el.addEventListener('click', () => {
      selectedColor = Number(el.dataset.i);
      renderSwatches();
      renderOrbitPreview();
    });
  });
}

function renderContactList() {
  const wrap = document.getElementById('contactList');
  const query = document.getElementById('contactSearch').value.trim().toLowerCase();
  const items = contacts.filter((c) => c.name.toLowerCase().includes(query));
  wrap.innerHTML = items.map((c) => `
    <button class="contact-row" data-id="${c.id}">
      <div class="avatar" style="width:36px;height:36px;font-size:12.5px;background:${gradFor(c.id.charCodeAt ? c.id.charCodeAt(1) : 1)}">${c.initials}<span class="presence-dot" style="border-color:var(--white)"></span></div>
      <span class="contact-name">${c.name}</span>
      <span class="checkbox ${selectedMembers.has(c.id) ? 'checked' : ''}">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </span>
    </button>`).join('') ||
    '<div style="padding:16px;text-align:center;color:var(--slate-light);font-size:12.5px;">No contacts found. Add contacts first!</div>';

  wrap.querySelectorAll('.contact-row').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.dataset.id;
      if (selectedMembers.has(id)) selectedMembers.delete(id);
      else selectedMembers.add(id);
      renderContactList();
      renderOrbitPreview();
      updateCreateBtn();
    });
  });
}

function renderOrbitPreview() {
  const wrap = document.getElementById('orbitPreview');
  const ids = Array.from(selectedMembers);
  if (!ids.length) {
    wrap.innerHTML = '<span class="orbit-empty">— select members below —</span>';
    return;
  }
  const radius = 34, center = 55;
  let nodes = '';
  ids.forEach((id, i) => {
    const angle = (i / ids.length) * Math.PI * 2 - Math.PI / 2;
    const x = center + radius * Math.cos(angle) - 20;
    const y = center + radius * Math.sin(angle) - 20;
    const c = contactById[id];
    nodes += `<div class="avatar" style="position:absolute;left:${x}px;top:${y}px;width:40px;height:40px;font-size:13px;background:${gradFor((id.charCodeAt ? id.charCodeAt(1) : 0) + selectedColor)};border:3px solid var(--paper);transition:all .25s">${c ? c.initials : '?'}</div>`;
  });
  wrap.innerHTML = `<div style="position:relative;width:110px;height:110px;">${nodes}</div>`;
}

function updateCreateBtn() {
  const btn = document.getElementById('createGroupBtn');
  const name = document.getElementById('groupNameInput').value.trim();
  btn.disabled = !(name.length > 0 && selectedMembers.size >= 2);
}

/* ─────────────────────────────────────
   SOCKET EVENTS
───────────────────────────────────── */
socket.on('new-message', (msg) => {
  if (!currentUser?.id) return;

  // Find the conversation this message belongs to
  let convId;
  if (msg.groupId) convId = `g:${msg.groupId}`;
  else if (msg.senderId === currentUser.id) convId = `d:${msg.receiverId}`;
  else convId = `d:${msg.senderId}`;

  let conv = conversations.find((c) => c.id === convId);

  // If conversation doesn't exist (e.g., new direct message), create a lightweight conv
  if (!conv) {
    const sender = contactById[msg.senderId] || null;
    conv = {
      id: convId,
      type: msg.groupId ? 'group' : 'direct',
      name: sender ? sender.name : (msg.groupName || (msg.senderId || 'Unknown')),
      contact: msg.senderId || null,
      members: msg.groupId ? (msg.members || []) : undefined,
      messages: []
    };
    conversations.unshift(conv);
    // join room for new conversation
    try { socket.emit('join-room', conv.id); } catch (e) {}
  }

  // Avoid duplicates (we already pushed our own messages locally)
  if (msg.senderId === currentUser.id) return;

  conv.messages.push({
    id: msg.id,
    from: msg.senderId,
    text: msg.content || '',
    time: formatTime(msg.createdAt),
    fileUrl: msg.fileUrl || null,
    fileName: msg.fileName || null,
    fileType: msg.fileType || null
  });
  conv.time = formatTime(msg.createdAt);
  if (conv.id !== activeId) conv.unread = (conv.unread || 0) + 1;
  renderAll();
});

socket.on('message-deleted', ({ messageId }) => {
  conversations.forEach((conv) => {
    const msg = conv.messages.find((m) => m.id === messageId);
    if (msg) msg.deleted = true;
  });
  renderAll();
});

socket.on('contact-added', async (payload) => {
  const otherUserId = payload.contact?.id || payload.userId || payload.contactId;
  if (!otherUserId || otherUserId === currentUser?.id) return;
  await loadContacts();
  await loadConversations();
  renderAll();
  showToast('A contact was added to your list');
});

/* ─────────────────────────────────────
   EVENT LISTENERS
───────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  /* ── Auth ── */
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('registerBtn').addEventListener('click', doRegister);
  document.getElementById('toRegister').addEventListener('click', () => { clearAuthErrors(); showCard('registerCard'); });
  document.getElementById('toLogin').addEventListener('click', () => { clearAuthErrors(); showCard('loginCard'); });
  document.getElementById('backToLogin').addEventListener('click', () => showCard('loginCard'));
  document.getElementById('logoutBtn').addEventListener('click', () => { if (confirm('Log out?')) logout(); });

  // Enter key on auth forms
  document.getElementById('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('loginEmail').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  document.getElementById('regPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') doRegister(); });

  // Toggle password visibility
  document.getElementById('loginEye').addEventListener('click', () => {
    const inp = document.getElementById('loginPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });
  document.getElementById('regEye').addEventListener('click', () => {
    const inp = document.getElementById('regPassword');
    inp.type = inp.type === 'password' ? 'text' : 'password';
  });

  /* ── Sidebar ── */
  document.getElementById('searchInput').addEventListener('input', renderConvList);
  document.getElementById('tabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.tab');
    if (!tab) return;
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    tab.classList.add('active');
    currentFilter = tab.dataset.filter;
    renderConvList();
  });

  /* ── Chat ── */
  document.getElementById('sendBtn').addEventListener('click', sendMessage);
  document.getElementById('msgInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') sendMessage(); });

  /* ── File upload ── */
  document.getElementById('attachBtn').addEventListener('click', () => document.getElementById('fileInput').click());
  document.getElementById('fileInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) sendFile(file);
  });

  /* ── File preview close ── */
  document.getElementById('closePreview').addEventListener('click', () =>
    document.getElementById('filePreviewOverlay').classList.remove('show'));
  document.getElementById('filePreviewOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('filePreviewOverlay'))
      document.getElementById('filePreviewOverlay').classList.remove('show');
  });

  /* ── Circle modal ── */
  document.getElementById('openModalBtn').addEventListener('click', openModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
  document.getElementById('contactSearch').addEventListener('input', renderContactList);
  document.getElementById('groupNameInput').addEventListener('input', updateCreateBtn);

  document.getElementById('createGroupBtn').addEventListener('click', async () => {
    const name = document.getElementById('groupNameInput').value.trim();
    const members = Array.from(selectedMembers);
    if (!name || members.length < 2) return;

    const allMembers = [currentUser.id, ...members];
    const res = await fetch(`${API}/messages/groups`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, members: allMembers, color: selectedColor })
    });
    const data = await res.json();

    const newConv = {
      id: `g:${data.group.id}`,
      type: 'group',
      name,
      color: selectedColor,
      members: allMembers,
      time: 'Now',
      unread: 0,
      messages: []
    };
    conversations.unshift(newConv);
    activeId = newConv.id;
    socket.emit('join-room', newConv.id);
    closeModal();
    renderAll();
    showToast(`Circle "${name}" created!`);
  });

  /* ── Add Contact modal ── */
  document.getElementById('openAddContactBtn').addEventListener('click', openAddContactModal);
  document.getElementById('openContactsAddBtn').addEventListener('click', openAddContactModal);
  document.getElementById('cancelAddContact').addEventListener('click', closeAddContactModal);
  document.getElementById('addContactOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('addContactOverlay')) closeAddContactModal();
  });
  document.getElementById('addContactSearch').addEventListener('input', (e) => {
    clearTimeout(addContactTimeout);
    addContactTimeout = setTimeout(() => searchUsers(e.target.value.trim()), 350);
  });

  /* ── Boot ── */
  // Mobile UX: hide the sidebar by default on small screens
  try {
    if (window.innerWidth <= 880) document.getElementById('sidebar').classList.add('hide');
  } catch (e) { /* ignore during auth screens */ }
  window.addEventListener('resize', () => {
    try {
      if (window.innerWidth > 880) document.getElementById('sidebar').classList.remove('hide');
    } catch (e) {}
  });

  if (token && currentUser) {
    enterApp();
  } else {
    showCard('loginCard');
  }
});
