// Cofounder — frontend
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const api = {
  get: (url) => fetch(url).then(r => r.json()),
  post: (url, body) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  patch: (url, body) => fetch(url, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(r => r.json()),
  del: (url) => fetch(url, { method: 'DELETE' }).then(r => r.json()),
};

const state = {
  view: 'dashboard',
  projects: [],
  tasks: [],
  chats: [],
  currentChat: null,
};

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  if (isNaN(d)) return s;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const daysFromNow = (s) => {
  if (!s) return null;
  const d = new Date(s);
  const today = new Date(); today.setHours(0,0,0,0);
  return Math.round((d - today) / 86400000);
};
const dueLabel = (s) => {
  const n = daysFromNow(s);
  if (n === null) return '';
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${Math.abs(n)}d overdue`;
  if (n < 7) return `in ${n}d`;
  return fmtDate(s);
};
const escapeHtml = (s) => (s || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 2200);
}

// ===== View switching =====
function setView(name) {
  state.view = name;
  $$('.view').forEach(v => v.classList.add('hidden'));
  $(`#view-${name}`).classList.remove('hidden');
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === name));
  if (name === 'dashboard') renderDashboard();
  if (name === 'projects') renderProjects();
  if (name === 'tasks') renderKanban();
  if (name === 'chats') renderChats();
  if (name === 'analytics') renderAnalytics();
}

$$('.nav-item').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
$$('[data-goto]').forEach(b => b.addEventListener('click', () => setView(b.dataset.goto)));

// ===== Loaders =====
async function loadAll() {
  const [projects, tasks, chats] = await Promise.all([
    api.get('/api/projects'),
    api.get('/api/tasks'),
    api.get('/api/chats'),
  ]);
  state.projects = projects;
  state.tasks = tasks;
  state.chats = chats;
}

// ===== Dashboard =====
async function renderDashboard() {
  await loadAll();
  const active = state.projects.filter(p => p.status === 'active').length;
  const doing = state.tasks.filter(t => t.status === 'doing').length;
  const todo = state.tasks.filter(t => t.status === 'todo').length;
  const done = state.tasks.filter(t => t.status === 'done').length;
  const overdue = state.tasks.filter(t => t.status !== 'done' && t.due_date && daysFromNow(t.due_date) < 0).length;

  $('#dash-stats').innerHTML = `
    ${statCard('Active projects', active, `${state.projects.length} total`)}
    ${statCard('In progress', doing, `${todo} waiting`)}
    ${statCard('Completed', done, 'across all projects')}
    ${statCard('Overdue', overdue, overdue ? 'needs attention' : 'all caught up', overdue ? 'warn' : '')}
  `;

  $('#dash-projects').innerHTML = state.projects.filter(p => p.status === 'active').slice(0, 5).map(p => {
    const pct = p.task_count ? Math.round((p.task_done / p.task_count) * 100) : 0;
    return `
      <div class="project-row" data-id="${p.id}">
        <span class="pr-dot" style="background:${p.color}"></span>
        <div class="pr-name">${escapeHtml(p.name)}</div>
        <div class="pr-progress">${p.task_done}/${p.task_count} · ${pct}%</div>
      </div>
    `;
  }).join('') || `<div class="muted small">No active projects yet.</div>`;

  $$('#dash-projects .project-row').forEach(r => r.addEventListener('click', () => setView('projects')));

  const upcoming = state.tasks.filter(t => t.status !== 'done').slice(0, 6);
  $('#dash-tasks').innerHTML = upcoming.map(t => taskRow(t)).join('') || `<div class="muted small">No open tasks — nice.</div>`;
  bindTaskRowToggles();
}

function statCard(label, value, sub, mod) {
  return `<div class="stat-card ${mod || ''}">
    <div class="stat-label">${label}</div>
    <div class="stat-value">${value}</div>
    <div class="stat-sub">${sub}</div>
  </div>`;
}

function taskRow(t) {
  return `
    <div class="task-row ${t.status === 'done' ? 'done' : ''}" data-id="${t.id}">
      <div class="tr-check">${t.status === 'done' ? '✓' : ''}</div>
      <div class="tr-title">${escapeHtml(t.title)}</div>
      <span class="priority-pill ${t.priority}">${t.priority}</span>
      <div class="tr-meta">${t.due_date ? dueLabel(t.due_date) : ''}</div>
    </div>
  `;
}

function bindTaskRowToggles() {
  $$('.task-row').forEach(row => {
    row.addEventListener('click', async () => {
      const id = row.dataset.id;
      const t = state.tasks.find(x => x.id == id);
      if (!t) return;
      const next = t.status === 'done' ? 'todo' : 'done';
      await api.patch(`/api/tasks/${id}`, { status: next });
      toast(next === 'done' ? 'Marked done' : 'Re-opened');
      if (state.view === 'dashboard') renderDashboard();
      else if (state.view === 'tasks') renderKanban();
    });
  });
}

// ===== Projects =====
async function renderProjects() {
  state.projects = await api.get('/api/projects');
  $('#projects-grid').innerHTML = state.projects.map(p => {
    const pct = p.task_count ? Math.round((p.task_done / p.task_count) * 100) : 0;
    return `
      <div class="project-card" data-id="${p.id}">
        <div class="pc-color" style="background:${p.color}"></div>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px">
          <h3>${escapeHtml(p.name)}</h3>
          <span class="status-pill ${p.status}">${p.status.replace('_',' ')}</span>
        </div>
        <div class="pc-desc">${escapeHtml(p.description) || '<span class="muted">No description</span>'}</div>
        <div class="progress-bar"><div style="width:${pct}%"></div></div>
        <div class="pc-meta">
          <span>${p.task_done}/${p.task_count} tasks · ${pct}%</span>
          <span>${p.deadline ? 'Due ' + fmtDate(p.deadline) : ''}</span>
        </div>
      </div>
    `;
  }).join('') || `<div class="muted">No projects yet — create your first one.</div>`;
  $$('.project-card').forEach(c => c.addEventListener('click', () => openProjectModal(c.dataset.id)));
}

function openProjectModal(id) {
  const p = id ? state.projects.find(x => x.id == id) : null;
  openModal(p ? 'Edit project' : 'New project', `
    <div class="field"><label>Name</label><input name="name" required value="${escapeHtml(p?.name || '')}" /></div>
    <div class="field"><label>Description</label><textarea name="description" rows="3">${escapeHtml(p?.description || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Status</label>
        <select name="status">
          ${['active','on_hold','done'].map(s => `<option value="${s}" ${p?.status===s?'selected':''}>${s.replace('_',' ')}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Deadline</label><input type="date" name="deadline" value="${p?.deadline || ''}" /></div>
    </div>
    <div class="field"><label>Color</label>
      <select name="color">
        ${[['#D97757','Coral'],['#8B7355','Plum'],['#6B8E7F','Moss'],['#A98B6F','Sand'],['#C99A4B','Amber']].map(([c,n]) =>
          `<option value="${c}" ${p?.color===c?'selected':''}>${n}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      ${p ? `<button type="button" class="btn btn-danger" id="modal-delete">Delete</button>` : ''}
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${p ? 'Save' : 'Create'}</button>
    </div>
  `, async (data) => {
    if (p) await api.patch(`/api/projects/${p.id}`, data);
    else await api.post('/api/projects', data);
    toast(p ? 'Project saved' : 'Project created');
    closeModal();
    renderProjects();
  }, p ? async () => {
    if (confirm('Delete this project and all its tasks?')) {
      await api.del(`/api/projects/${p.id}`);
      toast('Project deleted'); closeModal(); renderProjects();
    }
  } : null);
}

$('#new-project-btn').addEventListener('click', () => openProjectModal());

// ===== Kanban / Tasks =====
async function renderKanban() {
  const [tasks, projects] = await Promise.all([api.get('/api/tasks'), api.get('/api/projects')]);
  state.tasks = tasks; state.projects = projects;
  const cols = { todo: [], doing: [], done: [] };
  tasks.forEach(t => cols[t.status]?.push(t));
  for (const [s, arr] of Object.entries(cols)) {
    $(`#col-${s}`).innerHTML = arr.map(t => taskCard(t)).join('') || `<div class="muted small" style="padding:8px">Nothing here yet.</div>`;
    $(`#count-${s}`).textContent = arr.length;
  }
  bindKanban();
}

function taskCard(t) {
  return `
    <div class="task-card" draggable="true" data-id="${t.id}">
      <div class="tc-title">${escapeHtml(t.title)}</div>
      <div class="tc-meta">
        ${t.project_name ? `<span class="tc-project" style="color:${t.project_color}">● ${escapeHtml(t.project_name)}</span>` : ''}
        <span class="priority-pill ${t.priority}">${t.priority}</span>
        ${t.due_date ? `<span>${dueLabel(t.due_date)}</span>` : ''}
        ${t.assignee ? `<span>${escapeHtml(t.assignee)}</span>` : ''}
      </div>
    </div>
  `;
}

function bindKanban() {
  let dragId = null;
  $$('.task-card').forEach(card => {
    card.addEventListener('dragstart', e => { dragId = card.dataset.id; card.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
    card.addEventListener('click', () => openTaskModal(card.dataset.id));
  });
  $$('.kanban-col').forEach(col => {
    col.addEventListener('dragover', e => { e.preventDefault(); col.classList.add('drag-over'); });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async e => {
      e.preventDefault(); col.classList.remove('drag-over');
      if (!dragId) return;
      const newStatus = col.dataset.status;
      await api.patch(`/api/tasks/${dragId}`, { status: newStatus });
      dragId = null;
      renderKanban();
    });
  });
}

function openTaskModal(id) {
  const t = id ? state.tasks.find(x => x.id == id) : null;
  openModal(t ? 'Edit task' : 'New task', `
    <div class="field"><label>Title</label><input name="title" required value="${escapeHtml(t?.title || '')}" /></div>
    <div class="field"><label>Notes</label><textarea name="notes" rows="3">${escapeHtml(t?.notes || '')}</textarea></div>
    <div class="field-row">
      <div class="field"><label>Project</label>
        <select name="project_id">
          <option value="">—</option>
          ${state.projects.map(p => `<option value="${p.id}" ${t?.project_id==p.id?'selected':''}>${escapeHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Status</label>
        <select name="status">
          ${['todo','doing','done'].map(s => `<option value="${s}" ${t?.status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="field-row">
      <div class="field"><label>Priority</label>
        <select name="priority">
          ${['low','medium','high'].map(s => `<option value="${s}" ${t?.priority===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div class="field"><label>Due date</label><input type="date" name="due_date" value="${t?.due_date || ''}" /></div>
    </div>
    <div class="field"><label>Assignee</label><input name="assignee" value="${escapeHtml(t?.assignee || '')}" /></div>
    <div class="modal-actions">
      ${t ? `<button type="button" class="btn btn-danger" id="modal-delete">Delete</button>` : ''}
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">${t ? 'Save' : 'Create'}</button>
    </div>
  `, async (data) => {
    if (data.project_id === '') data.project_id = null;
    if (data.due_date === '') data.due_date = null;
    if (t) await api.patch(`/api/tasks/${t.id}`, data);
    else await api.post('/api/tasks', data);
    toast(t ? 'Task saved' : 'Task created');
    closeModal();
    if (state.view === 'tasks') renderKanban(); else renderDashboard();
  }, t ? async () => {
    if (confirm('Delete this task?')) {
      await api.del(`/api/tasks/${t.id}`);
      toast('Task deleted'); closeModal(); renderKanban();
    }
  } : null);
}

$('#new-task-btn').addEventListener('click', () => openTaskModal());
$('#quick-new-task').addEventListener('click', () => openTaskModal());

// ===== Chats =====
async function renderChats() {
  state.chats = await api.get('/api/chats');
  state.projects = await api.get('/api/projects');
  $('#chat-list').innerHTML = state.chats.map(c => `
    <div class="chat-item ${state.currentChat?.id == c.id ? 'active' : ''}" data-id="${c.id}">
      <div class="ci-title">${escapeHtml(c.title)}</div>
      <div class="ci-preview">${escapeHtml(c.last_message || 'No messages yet')}</div>
      <div class="ci-meta">${c.project_name ? '● ' + escapeHtml(c.project_name) : 'General'} · ${c.message_count} msg</div>
    </div>
  `).join('') || `<div class="muted small" style="padding:14px">No chats yet.</div>`;
  $$('.chat-item').forEach(el => el.addEventListener('click', () => loadChat(el.dataset.id)));
  if (state.currentChat) loadChat(state.currentChat.id, true);
}

async function loadChat(id, silent = false) {
  state.currentChat = await api.get(`/api/chats/${id}`);
  $$('.chat-item').forEach(el => el.classList.toggle('active', el.dataset.id == id));
  $('#chat-title').textContent = state.currentChat.title;
  $('#chat-meta').textContent = state.currentChat.project_name ? `Linked to ${state.currentChat.project_name}` : 'General chat';
  $('#delete-chat-btn').classList.remove('hidden');
  $('#chat-form').classList.remove('hidden');
  renderMessages(state.currentChat.messages);
  if (!silent) $('#chat-input').focus();
}

function renderMessages(msgs) {
  const box = $('#chat-messages');
  if (!msgs.length) {
    box.innerHTML = `<div class="chat-empty">Say hi to start the conversation.</div>`;
    return;
  }
  box.innerHTML = msgs.map(m => `
    <div class="msg ${m.role}">
      <div class="msg-avatar">${m.role === 'user' ? 'PK' : '✦'}</div>
      <div class="msg-bubble">${escapeHtml(m.content)}</div>
    </div>
  `).join('');
  box.scrollTop = box.scrollHeight;
}

$('#chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = $('#chat-input');
  const content = input.value.trim();
  if (!content || !state.currentChat) return;
  input.value = '';
  // Optimistic render
  const optimistic = [...state.currentChat.messages, { role: 'user', content }];
  renderMessages(optimistic);
  const { messages } = await api.post(`/api/chats/${state.currentChat.id}/messages`, { content });
  state.currentChat.messages = messages;
  renderMessages(messages);
  // Refresh side preview
  state.chats = await api.get('/api/chats');
  $$('.chat-item').forEach(el => {
    const c = state.chats.find(x => x.id == el.dataset.id);
    if (c) $('.ci-preview', el).textContent = c.last_message || 'No messages yet';
  });
});

$('#chat-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('#chat-form').requestSubmit(); }
});

$('#new-chat-btn').addEventListener('click', () => {
  openModal('New chat', `
    <div class="field"><label>Title</label><input name="title" required placeholder="e.g. Q3 planning" /></div>
    <div class="field"><label>Link to project (optional)</label>
      <select name="project_id">
        <option value="">No project</option>
        ${state.projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('')}
      </select>
    </div>
    <div class="modal-actions">
      <button type="button" class="btn btn-ghost" id="modal-cancel">Cancel</button>
      <button type="submit" class="btn btn-primary">Create</button>
    </div>
  `, async (data) => {
    if (!data.project_id) data.project_id = null;
    const chat = await api.post('/api/chats', data);
    toast('Chat created'); closeModal();
    await renderChats();
    loadChat(chat.id);
  });
});

$('#delete-chat-btn').addEventListener('click', async () => {
  if (!state.currentChat) return;
  if (confirm('Delete this chat?')) {
    await api.del(`/api/chats/${state.currentChat.id}`);
    state.currentChat = null;
    toast('Chat deleted');
    $('#chat-title').textContent = 'Select a chat';
    $('#chat-meta').textContent = '';
    $('#delete-chat-btn').classList.add('hidden');
    $('#chat-form').classList.add('hidden');
    $('#chat-messages').innerHTML = `<div class="chat-empty">Pick a conversation on the left, or start a new one.</div>`;
    renderChats();
  }
});

// ===== Analytics =====
async function renderAnalytics() {
  const data = await api.get('/api/analytics');
  const { stats, byProject, completion } = data;
  $('#analytics-stats').innerHTML = `
    ${statCard('Projects', stats.projects_total, `${stats.projects_active} active · ${stats.projects_done} done`)}
    ${statCard('Tasks', stats.tasks_total, `${stats.tasks_done} done · ${stats.tasks_doing} in progress`)}
    ${statCard('Chats', stats.chats_total, `${stats.messages_total} messages exchanged`)}
    ${statCard('Completion', stats.tasks_total ? Math.round(stats.tasks_done / stats.tasks_total * 100) + '%' : '—', 'across all tasks')}
  `;
  $('#analytics-by-project').innerHTML = byProject.map(p => {
    const total = p.total || 1;
    const dPct = (p.done / total) * 100;
    const iPct = (p.doing / total) * 100;
    const tPct = (p.todo / total) * 100;
    return `
      <div class="bp-row">
        <span class="pr-dot" style="background:${p.color}"></span>
        <div class="bp-name">${escapeHtml(p.name)}</div>
        <div class="bp-bar" title="${p.done} done · ${p.doing} doing · ${p.todo} todo">
          <div class="seg-done" style="width:${dPct}%"></div>
          <div class="seg-doing" style="width:${iPct}%"></div>
          <div class="seg-todo" style="width:${tPct}%"></div>
        </div>
        <div class="bp-counts">${p.done}/${p.total}</div>
      </div>
    `;
  }).join('') || `<div class="muted small">No projects yet.</div>`;

  drawCompletionChart(completion);
}

function drawCompletionChart(data) {
  const canvas = $('#completion-chart');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Build 14-day window
  const days = [];
  const today = new Date(); today.setHours(0,0,0,0);
  for (let i = 13; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const hit = data.find(x => x.day === key);
    days.push({ label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }), value: hit ? hit.done : 0 });
  }

  const padL = 36, padR = 16, padT = 18, padB = 28;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const max = Math.max(3, ...days.map(d => d.value));
  const barW = innerW / days.length * 0.6;
  const gap = innerW / days.length * 0.4;

  // Grid lines
  ctx.strokeStyle = '#EFE9DC'; ctx.lineWidth = 1;
  ctx.font = '11px Inter, sans-serif'; ctx.fillStyle = '#8C8275';
  for (let i = 0; i <= 4; i++) {
    const y = padT + (innerH / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(W - padR, y); ctx.stroke();
    const v = Math.round(max - (max / 4) * i);
    ctx.fillText(String(v), 8, y + 4);
  }

  // Bars
  days.forEach((d, i) => {
    const x = padL + i * (barW + gap) + gap / 2;
    const h = (d.value / max) * innerH;
    const y = padT + innerH - h;
    ctx.fillStyle = d.value > 0 ? '#D97757' : '#E6DECF';
    ctx.fillRect(x, y, barW, h || 2);
    if (i % 2 === 0) {
      ctx.fillStyle = '#8C8275';
      ctx.fillText(d.label, x - 4, H - 8);
    }
  });
}

// ===== Modal =====
const modal = $('#modal');
function openModal(title, html, onSubmit, onDelete) {
  $('#modal-title').textContent = title;
  $('#modal-form').innerHTML = html;
  modal.classList.remove('hidden');
  $('#modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const data = {};
    new FormData(e.target).forEach((v, k) => { data[k] = v; });
    await onSubmit(data);
  };
  const cancel = $('#modal-cancel'); if (cancel) cancel.onclick = closeModal;
  const del = $('#modal-delete'); if (del && onDelete) del.onclick = onDelete;
}
function closeModal() { modal.classList.add('hidden'); }
$('#modal-close').addEventListener('click', closeModal);
modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// ===== Boot =====
setView('dashboard');
