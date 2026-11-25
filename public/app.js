/* VPS Turnover — интерфейс приложения */
(() => {
'use strict';
const DEMO = !!window.VPS_DEMO;
const LOGO = window.VPS_LOGO || '/logo.png';
const mem = {};
const store = { get: (k) => { try { return store.get(k); } catch { return mem[k] ?? null; } }, set: (k, v) => { try { store.set(k, v); } catch { mem[k] = String(v); } }, del: (k) => { try { store.del(k); } catch { delete mem[k]; } } };
const $app = document.getElementById('app');
const S = { token: store.get('vps_token'), user: null, vapidKey: null, people: [], filter: store.get('vps_filter') || 'all' };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const kindBadge = (k) => k ? `<span class="badge ${/reno/i.test(k) ? 'reno' : /refresh/i.test(k) ? 'refresh' : ''}">${esc(k)}</span>` : '';
const isoDay = (d) => d ? d.slice(0, 10) : '';
const fmtDate = (d) => { if (!d) return ''; const x = new Date(d.length <= 10 ? d + 'T12:00' : d.replace(' ', 'T') + 'Z'); return isNaN(x) ? d : x.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) + (d.length > 10 ? ' ' + x.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : ''); };
const fmtWhen = (d) => { if (!d) return ''; const x = new Date(/[TZ+]/.test(d.slice(10)) ? d : d.replace(' ', 'T') + 'Z'); return isNaN(x) ? d : x.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); };
const shortProp = (p) => (p || '').replace(/bcIMC Realty Corporation,\s*/i, '').replace(/ Holdings Inc\.?/i, '');

function toast(text, cls = '') {
  document.querySelectorAll('.toast').forEach((x) => x.remove());
  const t = document.createElement('div'); t.className = 'toast ' + cls; t.textContent = text; t.onclick = () => t.remove(); document.body.appendChild(t);
  setTimeout(() => t.remove(), cls ? 4000 : 2500);
}

async function api(method, url, body) {
  if (DEMO) return window.VPS_MOCK(method, url, body, S.token);
  const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json', ...(S.token ? { Authorization: 'Bearer ' + S.token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 && url !== '/api/login') { logout(true); throw new Error(j.error || 'Please sign in'); }
  if (!r.ok) throw new Error(j.error || 'Error');
  return j;
}

function modal(text, { input = null, ok = 'Yes', danger = false } = {}) {
  return new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet"><p style="margin:4px 0 12px;font-size:16px">${esc(text)}</p>${input != null ? `<div class="field"><textarea id="mIn" style="min-height:80px">${esc(input)}</textarea></div>` : ''}
      <div class="row" style="gap:8px"><button class="btn sec" data-r="0">Cancel</button><button class="btn ${danger ? 'red' : ''}" data-r="1">${esc(ok)}</button></div></div>`;
    bg.onclick = (e) => { const b = e.target.closest('[data-r]'); if (!b && e.target !== bg) return; const yes = b && b.dataset.r === '1'; const v = input != null ? bg.querySelector('#mIn').value : yes; bg.remove(); resolve(yes ? v : (input != null ? null : false)); };
    document.body.appendChild(bg); const i = bg.querySelector('#mIn'); if (i) i.focus();
  });
}
const confirmBox = (t, o) => modal(t, o);
const promptBox = (t, v = '') => modal(t, { input: v, ok: 'Save' });

function sheet(title, options) {
  return new Promise((resolve) => {
    const bg = document.createElement('div'); bg.className = 'sheet-bg';
    bg.innerHTML = `<div class="sheet"><h3>${esc(title)}</h3>${options.map((o, i) => `<button class="opt" data-i="${i}">${esc(o.label)}</button>`).join('')}<button class="opt" data-i="-1" style="color:var(--muted)">Cancel</button></div>`;
    bg.onclick = (e) => { const b = e.target.closest('[data-i]'); if (b || e.target === bg) { bg.remove(); const i = b ? +b.dataset.i : -1; resolve(i >= 0 ? options[i] : null); } };
    document.body.appendChild(bg);
  });
}

// ---------- вход ----------
async function showLogin() {
  S.people = DEMO ? await api('GET', '/api/people') : await fetch('/api/people').then((r) => r.json()).catch((e) => ({ error: e.message }));
  if (!Array.isArray(S.people)) { $app.innerHTML = `<header><h1>VPS Turnover</h1></header><main><div class="card"><b>The app can't reach its database.</b><p class="small">${esc(S.people.error || '')}</p><button class="btn" onclick="location.reload()">Try again</button></div></main>`; return; }
  let sel = null, pin = '';
  const draw = () => {
    if (!sel) {
      $app.innerHTML = `<header><img class="logo" src="${LOGO}" alt="VPS"><h1>Turnover</h1></header>${demoBar()}<main><img class="biglogo" src="${LOGO}" alt="VPS Construction"><h2>Who are you?</h2>
        ${S.people.map((p) => `<button class="list-btn" data-id="${p.id}"><b>${esc(p.name)}</b></button>`).join('')}</main>`;
      $app.querySelectorAll('[data-id]').forEach((b) => b.onclick = () => { sel = S.people.find((p) => p.id == b.dataset.id); draw(); });
    } else {
      $app.innerHTML = `<header><button id="back">‹</button><h1>${esc(sel.name)}</h1></header>${demoBar()}<main>
        <p class="muted" style="text-align:center;margin-top:24px">Enter your PIN${DEMO ? ` <br><small>(demo: ${sel.id === 1 ? '0000' : '1111'})</small>` : ''}</p>
        <div class="pin">${[0, 1, 2, 3].map((i) => `<i class="${i < pin.length ? 'f' : ''}"></i>`).join('')}</div>
        <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map((k) => k === '' ? '<span></span>' : `<button data-k="${k}">${k}</button>`).join('')}</div></main>`;
      $app.querySelector('#back').onclick = () => { sel = null; pin = ''; draw(); };
      $app.querySelectorAll('[data-k]').forEach((b) => b.onclick = async () => {
        const k = b.dataset.k; if (k === '⌫') pin = pin.slice(0, -1); else if (pin.length < 4) pin += k;
        draw();
        if (pin.length === 4) {
          try { const r = await api('POST', '/api/login', { id: sel.id, pin }); S.token = r.token; store.set('vps_token', r.token); boot(); }
          catch (e) { toast(e.message); pin = ''; draw(); }
        }
      });
    }
  };
  draw();
}

function logout(silent) {
  if (!silent && S.token) api('POST', '/api/logout').catch(() => {});
  S.token = null; S.user = null; store.del('vps_token'); showLogin();
}

function demoBar() {
  return DEMO ? `<div class="demo">Demo: data is saved only in this browser; notifications appear at the bottom of the screen.${S.user ? ' <button id="switchUser">Switch user</button>' : ''} <button id="resetDemo">Reset</button></div>` : '';
}

// ---------- каркас ----------
function layout(title, body, opts = {}) {
  const tabs = [['my', '✔︎', 'My tasks'], ['apts', '🏠', 'Units'], ['feed', '🔔', 'Activity']];
  if (S.user.role === 'admin') tabs.push(['people', '👥', 'People']);
  tabs.push(['more', '⚙︎', 'More']);
  const cur = location.hash.slice(1).split('-')[0] || 'my';
  $app.innerHTML = `<header>${opts.back ? `<button id="back">‹</button>` : `<img class="logo" src="${LOGO}" alt="VPS">`}<h1>${esc(title)}</h1>${opts.action || ''}</header>${demoBar()}
    <main>${body}</main>
    <nav>${tabs.map(([k, i, l]) => `<button class="${cur === k || (cur === 'apt' && k === 'apts') || (cur === 'new' && k === 'apts') || (cur === 'edit' && k === 'apts') || (cur === 'archive' && k === 'apts') ? 'on' : ''}" data-go="${k}"><span class="i">${i}</span>${l}</button>`).join('')}</nav>`;
  if (!opts.noAi) { const f = document.createElement('button'); f.className = 'aifab'; f.innerHTML = '✨ Ask AI'; f.onclick = () => { location.hash = 'ai'; }; $app.appendChild(f); }
  $app.querySelectorAll('[data-go]').forEach((b) => b.onclick = () => { location.hash = b.dataset.go; });
  if (opts.back) $app.querySelector('#back').onclick = () => history.length > 1 ? history.back() : (location.hash = opts.back);
  bindDemo();
}
function bindDemo() {
  const r = $app.querySelector('#resetDemo'); if (r) r.onclick = async () => { if (await confirmBox('Reset the demo to its original data?')) { store.del('vps_demo_state_v5'); window.__vpsMem = null; logout(true); } };
  const s = $app.querySelector('#switchUser'); if (s) s.onclick = () => logout(true);
}

// ---------- мои задачи ----------
async function viewMy() {
  const tasks = await api('GET', '/api/my-tasks');
  const open = tasks.filter((t) => !t.done), done = tasks.filter((t) => t.done);
  const group = (list) => { const m = new Map(); list.forEach((t) => { const k = t.apartment_id; if (!m.has(k)) m.set(k, { t, items: [] }); m.get(k).items.push(t); }); return [...m.values()]; };
  let body = '';
  if (!tasks.length) body = `<div class="empty">No tasks assigned to you yet.<br><br>All units are in the “Units” tab.</div>`;
  else {
    body += `<p class="muted" style="margin:4px">To do: <b>${open.length}</b> · done: ${done.length}. Tap the box when you finish the work.</p>`;
    for (const g of group(open)) body += aptTaskCard(g);
    if (done.length) { body += `<h2>Completed</h2>`; for (const g of group(done)) body += aptTaskCard(g); }
  }
  layout(`Hi, ${S.user.name}`, body);
  bindChecks(viewMy);
}
function aptTaskCard(g) {
  const t = g.t;
  return `<div class="card"><div class="row" data-apt="${t.apartment_id}" style="cursor:pointer"><div class="grow"><b>Unit ${esc(t.unit)}</b> · ${esc(shortProp(t.property))}</div>${kindBadge(t.kind)}<span class="muted">›</span></div>
    ${t.planned_date ? `<div class="muted small">Due: ${fmtDate(t.planned_date)}</div>` : ''}
    <div style="margin-top:6px">${g.items.map((x) => taskRow(x, { mine: true })).join('')}</div></div>`;
}
function taskRow(t, o = {}) {
  const can = S.user.role === 'admin' || !t.assignee_id || t.assignee_id === S.user.id;
  const isAdmin = S.user.role === 'admin';
  return `<div class="task ${t.done ? 'isdone' : ''}">
    <button class="chk ${t.done ? 'on' : ''}" data-task="${t.id}" data-done="${t.done ? 1 : 0}" ${can ? '' : 'disabled'} aria-label="Done">${t.done ? '✓' : ''}</button>
    <div class="grow"><div class="t1">${esc(t.description || t.item)}</div>
      <div class="who">${esc(t.item && t.description ? t.item : '')}${o.mine ? '' : t.assignee_name ? `${t.item && t.description ? ' · ' : ''}👷 <b>${esc(t.assignee_name)}</b>` : ''}
      ${t.done ? `<br><span style="color:var(--ok)">✅ Done by <b style="color:var(--ok)">${esc(t.done_by_name || (o.mine ? S.user.name : '—'))}</b> · ${fmtWhen(t.done_at)}</span>` : ''}</div>
      ${isAdmin && !o.mine ? `<button class="assign" data-assign="${t.id}">${t.assignee_name ? 'Reassign' : '+ Assign'}</button> <button class="assign" data-edit="${t.id}" style="color:var(--muted)">✎</button>` : ''}
    </div></div>`;
}
function bindChecks(refresh) {
  $app.querySelectorAll('[data-apt]').forEach((el) => el.onclick = () => location.hash = 'apt-' + el.dataset.apt);
  $app.querySelectorAll('[data-task]').forEach((b) => b.onclick = async () => {
    const wasDone = b.dataset.done === '1';
    if (wasDone && !await confirmBox('Mark this task as not done?')) return;
    b.disabled = true;
    try { await api('POST', `/api/tasks/${b.dataset.task}/done`, { done: !wasDone }); if (!wasDone) toast('Done ✓ Notification sent'); refresh(); }
    catch (e) { toast(e.message); b.disabled = false; }
  });
}

function datesLine(a, big) {
  const parts = [];
  if (a.move_out) parts.push(`move-out ${fmtDate(a.move_out)}`);
  if (a.planned_date) parts.push(`${big ? '<b>' : ''}due ${fmtDate(a.planned_date)}${big ? '</b>' : ''}`);
  if (a.move_in) parts.push(`move-in ${fmtDate(a.move_in)}`);
  if (!parts.length) return '';
  return big ? `<div class="small" style="margin-top:4px">📅 ${parts.join(' · ')}</div>` : parts.join(' · ') + ' · ';
}
// ---------- квартиры ----------
async function viewApts(archived) {
  const list = await api('GET', '/api/apartments' + (archived ? '?archived=1' : ''));
  const props = [...new Set(list.map((a) => shortProp(a.property)))].sort();
  const f = props.includes(S.filter) || S.filter === '__un' ? S.filter : 'all';
  const shown = list.filter((a) => f === 'all' || (f === '__un' ? a.unassigned > 0 : shortProp(a.property) === f));
  let body = `<div class="filters"><button class="chip ${f === 'all' ? 'on' : ''}" data-f="all">All (${list.length})</button>${S.user.role === 'admin' ? `<button class="chip ${f === '__un' ? 'on' : ''}" data-f="__un">Needs assigning (${list.filter((a) => a.unassigned > 0).length})</button>` : ''}${props.map((p) => `<button class="chip ${f === p ? 'on' : ''}" data-f="${esc(p)}">${esc(p)}</button>`).join('')}</div>`;
  if (!shown.length) body += `<div class="empty">${archived ? 'Archive is empty' : 'No units yet'}</div>`;
  for (const a of shown) {
    const pct = a.total ? Math.round((a.done / a.total) * 100) : 0;
    body += `<button class="list-btn" data-apt="${a.id}"><div class="row"><div class="grow"><b style="font-size:17px">Unit ${esc(a.unit)}</b> <span class="muted">· ${esc(shortProp(a.property))}</span></div>${kindBadge(a.kind)}</div>
      <div class="row muted small" style="margin-top:4px"><span class="grow">${datesLine(a)}${a.done}/${a.total} tasks</span>${a.mine_left ? `<span class="badge" style="background:var(--warnbg);color:var(--warn)">yours: ${a.mine_left}</span>` : ''}${S.user.role === 'admin' && a.unassigned ? ` <span class="badge" style="background:#fde8e6;color:#b02a1c">unassigned: ${a.unassigned}</span>` : ''}${a.total && a.done === a.total ? '<span class="badge done">Complete</span>' : ''}</div>
      <div class="bar"><i style="width:${pct}%"></i></div></button>`;
  }
  body += `<button class="btn sec" id="arch" style="margin-top:8px">${archived ? '← Back to active units' : 'Archive'}</button>`;
  if (S.user.role === 'admin') body += `<button class="btn sec" id="export" style="margin-top:8px">⬇ Export to Excel / Google Sheets</button>`;
  layout(archived ? 'Archive' : 'Units', body, { action: S.user.role === 'admin' && !archived ? '<button id="add">+ Unit</button>' : '' });
  const ex = $app.querySelector('#export'); if (ex) ex.onclick = exportCsv;
  $app.querySelectorAll('[data-f]').forEach((b) => b.onclick = () => { S.filter = b.dataset.f; store.set('vps_filter', S.filter); viewApts(archived); });
  $app.querySelectorAll('[data-apt]').forEach((b) => b.onclick = () => location.hash = 'apt-' + b.dataset.apt);
  $app.querySelector('#arch').onclick = () => location.hash = archived ? 'apts' : 'archive';
  const add = $app.querySelector('#add'); if (add) add.onclick = () => location.hash = 'new';
}

async function viewApt(id) {
  const a = await api('GET', '/api/apartments/' + id);
  const isAdmin = S.user.role === 'admin';
  const done = a.tasks.filter((t) => t.done).length, pct = a.tasks.length ? Math.round(done / a.tasks.length * 100) : 0;
  const sections = []; a.tasks.forEach((t) => { let s = sections.find((x) => x.name === t.section); if (!s) sections.push(s = { name: t.section, items: [] }); s.items.push(t); });
  let body = `<div class="card"><div class="row"><div class="grow"><b style="font-size:18px">Unit ${esc(a.unit)}</b></div>${kindBadge(a.kind)}</div>
    <div class="muted">${esc(a.property)}${a.region ? ', ' + esc(a.region) : ''}</div>
    ${a.code ? `<div class="muted small">Code: ${esc(a.code)}</div>` : ''}${datesLine(a, true)}${a.po ? `<div class="small">🧾 PO: <b>${esc(a.po)}</b></div>` : ''}
    ${a.notes ? `<div class="small muted" style="margin-top:4px">${esc(a.notes)}</div>` : ''}
    <div class="row small" style="margin-top:8px"><span class="grow">Done ${done} of ${a.tasks.length}</span><b>${pct}%</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`;
  for (const s of sections) {
    body += `<div class="card"><div class="row"><h3 class="grow" style="margin:0">${esc(s.name || 'Tasks')}</h3>${isAdmin ? `<button class="assign" data-assign-sec="${esc(s.name)}">Assign whole section</button>` : ''}</div>
      ${s.items.map((t) => taskRow(t)).join('')}</div>`;
  }
  if (isAdmin) body += `<button class="btn sec" id="addTask">+ Add task</button>
    <div class="row" style="margin-top:10px;gap:8px"><button class="btn sec" id="editApt">Edit</button><button class="btn sec" id="archApt">${a.archived ? 'Restore' : 'Archive'}</button><button class="btn red" id="delApt">Delete</button></div>`;
  layout(`Unit ${a.unit}`, body, { back: 'apts' });
  bindChecks(() => viewApt(id));
  if (!isAdmin) return;
  const pickPerson = async (title) => {
    const users = (await api('GET', '/api/users')).filter((u) => u.active);
    const o = await sheet(title, [...users.map((u) => ({ label: u.name, id: u.id })), { label: '— Nobody (unassign)', id: null }]);
    return o;
  };
  $app.querySelectorAll('[data-assign]').forEach((b) => b.onclick = async () => {
    const o = await pickPerson('Who does this task?'); if (!o) return;
    await api('POST', '/api/assign', { taskIds: [+b.dataset.assign], assignee_id: o.id }); viewApt(id);
  });
  $app.querySelectorAll('[data-assign-sec]').forEach((b) => b.onclick = async () => {
    const o = await pickPerson(`Assign: ${b.dataset.assignSec}`); if (!o) return;
    const ids = a.tasks.filter((t) => t.section === b.dataset.assignSec).map((t) => t.id);
    await api('POST', '/api/assign', { taskIds: ids, assignee_id: o.id }); viewApt(id);
  });
  $app.querySelectorAll('[data-edit]').forEach((b) => b.onclick = async () => {
    const t = a.tasks.find((x) => x.id == b.dataset.edit);
    const o = await sheet(t.description || t.item, [{ label: '✎ Edit text', k: 'e' }, { label: '🗑 Delete task', k: 'd' }]); if (!o) return;
    if (o.k === 'd') { if (await confirmBox('Delete this task?')) { await api('DELETE', '/api/tasks/' + t.id); viewApt(id); } return; }
    const d = await promptBox('What needs to be done:', t.description || t.item); if (d == null) return;
    await api('PUT', '/api/tasks/' + t.id, { section: t.section, item: t.item, description: d.trim() }); viewApt(id);
  });
  $app.querySelector('#addTask').onclick = async () => {
    const secs = [...sections.map((s) => s.name), 'Other'].filter((v, i, arr) => v && arr.indexOf(v) === i);
    const o = await sheet('Which section?', secs.map((s) => ({ label: s }))); if (!o) return;
    const d = await promptBox('What needs to be done?'); if (!d || !d.trim()) return;
    await api('POST', `/api/apartments/${id}/tasks`, { section: o.label, item: '', description: d.trim() }); viewApt(id);
  };
  $app.querySelector('#editApt').onclick = () => location.hash = 'edit-' + id;
  $app.querySelector('#archApt').onclick = async () => { await api('PUT', '/api/apartments/' + id, { ...a, archived: !a.archived }); toast(a.archived ? 'Restored' : 'Moved to archive'); location.hash = 'apts'; };
  $app.querySelector('#delApt').onclick = async () => { if (await confirmBox(`Delete unit ${a.unit} and all its tasks?`)) { await api('DELETE', '/api/apartments/' + id); location.hash = 'apts'; } };
}

// ---------- разбор текста письма ----------
// «Painting & Cleaning» делим на два раздела, чтобы покраску и уборку можно было назначать разным людям
const splitSec = (sec, item) => /^painting\s*&\s*cleaning$/i.test(sec) ? (/clean/i.test(item) ? 'Cleaning' : 'Painting') : sec;
const KNOWN_SECTIONS = ['painting & cleaning', 'bathroom(s)', 'bathroom', 'bathrooms', 'miscellaneous items', 'other items', 'interior', 'kitchen', 'exterior', 'flooring', 'appliances', 'laundry'];
function parseEmail(text) {
  const out = { region: '', property: '', unit: '', code: '', kind: '', notes: '', tasks: [] };
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.replace(/ /g, ' ').trim()).filter(Boolean);
  const head = (re) => { const l = lines.find((x) => re.test(x)); return l ? l.replace(re, '').trim() : ''; };
  out.region = head(/^region\s*:\s*/i); out.property = head(/^property\s*:\s*/i); out.unit = head(/^unit\s*(no|number|#)?\.?\s*:\s*/i);
  out.code = head(/^(project|job)\s*code\s*:\s*/i); const c = head(/^contractor\s*:\s*/i); if (c) out.notes = 'Contractor: ' + c;
  if (/\breno\b/i.test(text)) out.kind = 'Reno'; else if (/\brefresh\b/i.test(text)) out.kind = 'Refresh';
  let start = lines.findIndex((l) => /^item\b/i.test(l) && /description/i.test(l));
  if (start < 0) { start = lines.findIndex((l) => /^item$/i.test(l)); if (start >= 0 && /^description$/i.test(lines[start + 1] || '')) start++; }
  if (start < 0) start = lines.findIndex((l) => KNOWN_SECTIONS.includes(l.toLowerCase())) - 1;
  let section = '', pending = null;
  for (const l of lines.slice(start + 1)) {
    if (/^(region|property|unit|project code|job code|contractor)\s*:/i.test(l)) continue;
    const parts = l.split(/\t+|\s{2,}|\s\|\s/).map((x) => x.trim()).filter(Boolean);
    if (parts.length === 1 && KNOWN_SECTIONS.includes(l.toLowerCase())) { section = l; pending = null; continue; }
    if (parts.length >= 2) { out.tasks.push({ section: splitSec(section, parts[0]), item: parts[0], description: parts.slice(1).join(' ') }); pending = null; continue; }
    if (pending == null) pending = l; else { out.tasks.push({ section: splitSec(section, pending), item: pending, description: l }); pending = null; }
  }
  if (pending) out.tasks.push({ section, item: '', description: pending });
  return out;
}

// таблица-график (Move Out Date / Suite / Completion / Move In / Notes / PO)
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12, янв: 1, фев: 2, мар: 3, апр: 4, мая: 5, май: 5, июн: 6, июл: 7, авг: 8, сен: 9, окт: 10, ноя: 11, дек: 12 };
function toISO(d) {
  d = (d || '').trim(); if (!d) return '';
  let m = d.match(/^(\d{1,2})[-\s./]([a-zа-я]{3})/i), day, mon;
  if (m) { day = +m[1]; mon = MONTHS[m[2].toLowerCase()]; }
  else if ((m = d.match(/^([a-z]{3})[a-z]*[-\s.]?(\d{1,2})/i))) { day = +m[2]; mon = MONTHS[m[1].toLowerCase()]; }
  else if ((m = d.match(/^(\d{4})-(\d{2})-(\d{2})/))) return m[0];
  if (!mon) return '';
  const now = new Date(); let y = now.getFullYear(); if (mon - (now.getMonth() + 1) < -6) y++; else if (mon - (now.getMonth() + 1) > 6) y--;
  return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
function isSchedule(text) { return /move\s*out/i.test(text) && /suite|unit/i.test(text); }
function parseSchedule(text) {
  const rows = text.replace(/\r/g, '').split('\n').map((l) => l.split('\t').map((c) => c.replace(/\u00a0/g, ' ').trim()));
  const hi = rows.findIndex((r) => r.some((c) => /move\s*out/i.test(c)) && r.some((c) => /^(suite|unit)/i.test(c)));
  const pm = text.match(/([A-Z][\w&' ]{1,40}?\s(?:Residences|Apartments|Towers?|Place|Court|Village))/);
  const res = { property: pm ? pm[1].trim().replace(/\s+Residences$/i, '') : '', apartments: [], error: '' };
  if (hi < 0) { res.error = 'Could not find the table header (Move Out Date / Suite).'; return res; }
  const H = rows[hi].map((c) => c.toLowerCase());
  const col = (re) => H.findIndex((c) => re.test(c));
  const ci = { out: col(/move\s*out/), unit: col(/^(suite|unit)/), done: col(/complet/), mi: col(/move\s*in/), notes: col(/note/), po: col(/^po\b|p\.o\./) };
  let kind = '';
  for (const r of rows.slice(hi + 1)) {
    const filled = r.filter(Boolean);
    if (!filled.length) continue;
    if (filled.length === 1 && !/^\d/.test(filled[0]) && !toISO(filled[0])) { if (/sincerely|thank|regards/i.test(filled[0])) break; kind = filled[0]; continue; }
    const unit = r[ci.unit] || ''; if (!/\d/.test(unit)) { if (res.apartments.length) break; continue; }
    const a = { unit, move_out: toISO(r[ci.out]), planned_date: ci.done >= 0 ? toISO(r[ci.done]) : '', move_in: ci.mi >= 0 ? toISO(r[ci.mi]) : '', notes: ci.notes >= 0 ? r[ci.notes] || '' : '', po: ci.po >= 0 ? (r[ci.po] || '').replace(/^po\s*#?\s*/i, '') : '', kind };
    a.tasks = /paint/i.test(kind) || /clean/i.test(kind) || !kind ? [{ section: 'Painting', item: 'Painting', description: 'Paint entire unit' }, { section: 'Cleaning', item: 'Cleaning', description: 'Clean entire unit' }] : [];
    res.apartments.push(a);
  }
  if (!res.apartments.length) res.error = 'Table found but it has no units. Copy the whole table.';
  return res;
}

async function viewEdit(id) {
  const a = id ? await api('GET', '/api/apartments/' + id) : { region: 'Alberta', property: '', unit: '', code: '', kind: '', planned_date: '', move_out: '', move_in: '', po: '', notes: '', tasks: [] };
  let parsed = null;
  const body = `${!id ? `<div class="card"><b>Quick add: paste the email</b><p class="muted small" style="margin:4px 0 8px">Open the email in Outlook, select all, copy and paste it here. Both kinds work: a work order for one unit (Item / Description) and a turnover schedule for many units (Move Out Date / Suite / PO).</p>
      <div class="field"><textarea id="paste" placeholder="Region: Alberta&#10;Property: …&#10;Unit No: …&#10;…"></textarea></div><button class="btn sec" id="parse">Read email</button><div id="preview"></div></div>` : ''}
    <div class="card">
      <div class="field"><label>Unit number *</label><input id="unit" value="${esc(a.unit)}"></div>
      <div class="field"><label>Property</label><input id="property" value="${esc(a.property)}" list="props"></div>
      <div class="field"><label>Job type</label><select id="kind">${['', 'Reno', 'Refresh', 'Paint and Clean', ...(a.kind && !['Reno', 'Refresh', 'Paint and Clean'].includes(a.kind) ? [a.kind] : [])].map((k) => `<option ${a.kind === k ? 'selected' : ''} value="${k}">${k || '—'}</option>`).join('')}</select></div>
      <div class="field"><label>Move-out date</label><input id="move_out" type="date" value="${esc(a.move_out)}"></div>
      <div class="field"><label>Completion due</label><input id="planned_date" type="date" value="${esc(a.planned_date)}"></div>
      <div class="field"><label>New move-in</label><input id="move_in" type="date" value="${esc(a.move_in)}"></div>
      <div class="field"><label>PO</label><input id="po" value="${esc(a.po)}"></div>
      <div class="field"><label>Project code</label><input id="code" value="${esc(a.code)}"></div>
      <div class="field"><label>Region</label><input id="region" value="${esc(a.region)}"></div>
      <div class="field"><label>Notes</label><input id="notes" value="${esc(a.notes)}"></div>
      <button class="btn" id="save">Save</button></div>`;
  layout(id ? 'Edit unit' : 'New unit', body, { back: id ? 'apt-' + id : 'apts' });
  const f = (k) => $app.querySelector('#' + k);
  if (!id) f('parse').onclick = async () => {
    const text = f('paste').value;
    if (isSchedule(text)) {
      const sc = parseSchedule(text);
      if (sc.error) { f('preview').innerHTML = `<p class="small" style="color:var(--red)">${esc(sc.error)}</p>`; return; }
      f('preview').innerHTML = `<p class="small" style="margin:10px 0 6px">This is a schedule: <b>${sc.apartments.length}</b> units found. Existing units will be updated (dates, PO, notes); new ones will be added.</p>
        <div class="field"><label>Property</label><input id="schedProp" value="${esc(sc.property)}" list="props"></div>
        <div class="muted small" style="margin-bottom:10px">${sc.apartments.map((a) => `• Unit ${esc(a.unit)}: move-out ${fmtDate(a.move_out) || '—'}${a.planned_date ? ', due ' + fmtDate(a.planned_date) : ''}${a.move_in ? ', move-in ' + fmtDate(a.move_in) : ''}${a.po ? ', PO ' + esc(a.po) : ''}`).join('<br>')}</div>
        <button class="btn" id="doImport">Import ${sc.apartments.length} units</button>`;
      f('doImport').onclick = async () => {
        const property = f('schedProp').value.trim();
        const r = await api('POST', '/api/import', { apartments: sc.apartments.map((a) => ({ ...a, property })) });
        toast(`Added: ${r.added}, updated: ${r.updated}`); S.filter = shortProp(property); location.hash = 'apts';
      };
      return;
    }
    parsed = parseEmail(text);
    ['unit', 'property', 'code', 'region', 'notes'].forEach((k) => { if (parsed[k]) f(k).value = parsed[k]; });
    if (parsed.kind) f('kind').value = parsed.kind;
    f('preview').innerHTML = parsed.tasks.length ? `<p class="small" style="margin:10px 0 0">Tasks found: <b>${parsed.tasks.length}</b></p><div class="muted small">${parsed.tasks.slice(0, 50).map((t) => `• ${esc(t.section ? t.section + ': ' : '')}${esc(t.description || t.item)}`).join('<br>')}</div>`
      : `<p class="small" style="color:var(--red)">Could not find the work list. Make sure the Item / Description table was copied.</p>`;
    if (!parsed.unit) toast('Unit number not found, please type it in');
  };
  f('save').onclick = async () => {
    const data = { ...a, unit: f('unit').value.trim(), property: f('property').value.trim(), kind: f('kind').value, planned_date: f('planned_date').value, move_out: f('move_out').value, move_in: f('move_in').value, po: f('po').value.trim(), code: f('code').value.trim(), region: f('region').value.trim(), notes: f('notes').value.trim() };
    if (!data.unit) return toast('Enter the unit number');
    if (id) { await api('PUT', '/api/apartments/' + id, data); location.hash = 'apt-' + id; }
    else { data.tasks = parsed?.tasks || []; const r = await api('POST', '/api/apartments', data); toast('Unit added'); location.hash = 'apt-' + r.id; }
  };
}

// ---------- лента ----------
async function viewFeed() {
  const ev = await api('GET', '/api/events');
  const body = ev.length ? ev.map((e) => `<div class="card" ${e.apartment_id ? `data-apt="${e.apartment_id}" style="cursor:pointer"` : ''}><div>${esc(e.text)}</div><div class="muted small">${fmtWhen(e.created_at)}</div></div>`).join('')
    : '<div class="empty">Completed work will show up here.</div>';
  layout('Activity', body);
  $app.querySelectorAll('[data-apt]').forEach((el) => el.onclick = () => location.hash = 'apt-' + el.dataset.apt);
}

// ---------- люди ----------
async function viewPeople() {
  const users = await api('GET', '/api/users');
  let body = `<p class="muted" style="margin:4px">🔔 — this person gets a notification when someone marks work as done.</p>`;
  body += users.map((u) => `<button class="list-btn" data-u="${u.id}" style="${u.active ? '' : 'opacity:.5'}"><div class="row"><div class="grow"><b>${esc(u.name)}</b> ${u.role === 'admin' ? '<span class="badge">admin</span>' : ''}${u.active ? '' : ' <span class="badge">disabled</span>'}
    <div class="muted small">PIN: ${esc(u.pin)}${u.devices ? ` · phones with notifications: ${u.devices}` : ''}</div></div>${u.notify ? '🔔' : ''}</div></button>`).join('');
  layout('People', body, { action: '<button id="addU">+ Add</button>' });
  $app.querySelector('#addU').onclick = () => editUser(null);
  $app.querySelectorAll('[data-u]').forEach((b) => b.onclick = () => editUser(users.find((u) => u.id == b.dataset.u)));
}
function editUser(u) {
  const x = u || { name: '', pin: String(Math.floor(1000 + Math.random() * 9000)), role: 'worker', notify: 0, active: 1 };
  const body = `<div class="card"><div class="field"><label>Name</label><input id="name" value="${esc(x.name)}"></div>
    <div class="field"><label>Sign-in PIN (4 digits)</label><input id="pin" inputmode="numeric" value="${esc(x.pin)}"></div>
    <label class="toggle"><input type="checkbox" id="notify" ${x.notify ? 'checked' : ''}> Gets notified when work is done</label>
    <label class="toggle"><input type="checkbox" id="admin" ${x.role === 'admin' ? 'checked' : ''}> Admin (adds units and people)</label>
    ${u ? `<label class="toggle"><input type="checkbox" id="active" ${x.active ? 'checked' : ''}> Active (can sign in)</label>` : ''}
    <button class="btn" id="save" style="margin-top:10px">Save</button></div>`;
  layout(u ? x.name : 'New person', body, { back: 'people' });
  const f = (k) => $app.querySelector('#' + k);
  f('save').onclick = async () => {
    const d = { name: f('name').value.trim(), pin: f('pin').value.trim(), notify: f('notify').checked, role: f('admin').checked ? 'admin' : 'worker', active: u ? f('active').checked : true };
    try { if (u) await api('PUT', '/api/users/' + u.id, d); else await api('POST', '/api/users', d); toast('Saved'); viewPeople(); } catch (e) { toast(e.message); }
  };
}

// ---------- ещё / уведомления ----------
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
async function pushState() {
  if (DEMO) return 'demo';
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return isIOS && !standalone ? 'ios-install' : 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready; const sub = await reg.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}
async function enablePush() {
  const perm = await Notification.requestPermission(); if (perm !== 'granted') { toast('Notifications not allowed'); return false; }
  const reg = await navigator.serviceWorker.ready;
  const key = Uint8Array.from(atob(S.vapidKey.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - S.vapidKey.length % 4) % 4)), (c) => c.charCodeAt(0));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api('POST', '/api/subscribe', sub.toJSON()); return true;
}
async function viewSettings() {
  const st = await pushState();
  const pushText = {
    on: '✅ Notifications are on for this phone.', off: 'Notifications are off for this phone.', denied: 'Notifications are blocked. Allow them for this site in your browser settings.',
    'ios-install': 'On iPhone, notifications work only after adding the app to the Home Screen: tap Share ⬆︎ → “Add to Home Screen”, then open the app from its icon.',
    unsupported: 'This browser does not support notifications. Open the app in Chrome (Android) or Safari (iPhone).', demo: 'In the demo, notifications appear at the bottom of the screen. In the real app they arrive on the phone like messages.' }[st];
  const body = `<div class="card"><b>${esc(S.user.name)}</b><div class="muted small">${S.user.role === 'admin' ? 'Admin' : 'Staff'} · ${S.user.notify ? 'gets notified when work is done' : 'does not get work notifications'}</div></div>
    <div class="card"><b>Notifications</b><p class="small">${pushText}</p>${st === 'off' ? '<button class="btn" id="push">Turn on notifications</button>' : ''}${st === 'on' ? '<button class="btn sec" id="test">Send a test</button>' : ''}</div>
    ${!standalone && !DEMO ? `<div class="card"><b>Install on your phone</b><p class="small">${isIOS ? 'Safari: Share ⬆︎ → “Add to Home Screen”.' : 'Chrome: menu ⋮ → “Add to Home screen” / “Install app”.'}</p></div>` : ''}
    <button class="btn sec" id="arch" style="margin-bottom:10px">Unit archive</button>
    <button class="btn red" id="out">Sign out</button>`;
  layout('More', body);
  const p = $app.querySelector('#push'); if (p) p.onclick = async () => { try { if (await enablePush()) { toast('Done! Notifications are on'); viewSettings(); } } catch (e) { toast('Failed: ' + e.message); } };
  const t = $app.querySelector('#test'); if (t) t.onclick = () => api('POST', '/api/test-push').then(() => toast('Sent'));
  $app.querySelector('#arch').onclick = () => location.hash = 'archive';
  $app.querySelector('#out').onclick = () => logout();
}

// ---------- export ----------
async function exportCsv() {
  const o = await sheet('Export to a file (opens in Excel or Google Sheets)', [{ label: '✅ Completed units (all tasks done)', v: 'done' }, { label: '📋 All units and tasks', v: 'all' }]);
  if (!o) return;
  if (DEMO) return toast('Export works in the real app. The demo has no server.');
  try {
    const r = await fetch('/api/export?scope=' + o.v, { headers: { Authorization: 'Bearer ' + S.token } });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Export failed');
    const name = (r.headers.get('Content-Disposition') || '').match(/filename="(.+?)"/)?.[1] || 'VPS-turnover.csv';
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Downloaded: ' + name);
  } catch (e) { toast(e.message); }
}

// ---------- AI assistant ----------
S.chat = [];
const mdLite = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^\s*[-*•] /gm, '• ').replace(/\n/g, '<br>');
function viewAi() {
  const tips = S.user.role === 'admin'
    ? ['What is due this week?', 'Which units still have unassigned tasks?', 'What was finished today?', 'Is anything overdue?']
    : ['What do I have left to do?', 'Which of my units are due first?', 'What did I finish this week?'];
  const msgs = S.chat.map((m) => `<div class="msg ${m.role}">${m.role === 'model' ? mdLite(m.text) : esc(m.text)}</div>`).join('');
  const body = `<div id="chat">${msgs || `<div class="card"><b>✨ AI assistant</b><p class="small" style="margin:6px 0 0">Ask anything about units, tasks, dates and who is doing what. You can write in English or Russian.</p></div>
    <div class="filters" style="flex-wrap:wrap">${tips.map((t) => `<button class="chip" data-tip="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}
    ${S.aiBusy ? '<div class="msg model muted">Thinking…</div>' : ''}</div>
    <form id="aiForm" class="aibar"><input id="aiIn" placeholder="Ask a question…" autocomplete="off" ${S.aiBusy ? 'disabled' : ''}><button class="btn sm" ${S.aiBusy ? 'disabled' : ''}>Send</button></form>`;
  layout('AI assistant', body, { noAi: true, action: S.chat.length ? '<button id="clr">Clear</button>' : '' });
  const send = async (text) => {
    if (!text.trim() || S.aiBusy) return;
    S.chat.push({ role: 'user', text: text.trim() }); S.aiBusy = true; viewAi();
    try { const r = await api('POST', '/api/ai', { messages: S.chat }); S.chat.push({ role: 'model', text: r.text }); }
    catch (e) { S.chat.push({ role: 'model', text: '⚠️ ' + e.message }); }
    S.aiBusy = false; if (location.hash === '#ai') viewAi();
  };
  $app.querySelectorAll('[data-tip]').forEach((b) => b.onclick = () => send(b.dataset.tip));
  $app.querySelector('#aiForm').onsubmit = (e) => { e.preventDefault(); send($app.querySelector('#aiIn').value); };
  const c = $app.querySelector('#clr'); if (c) c.onclick = () => { S.chat = []; viewAi(); };
  window.scrollTo(0, document.body.scrollHeight);
  if (!S.aiBusy) $app.querySelector('#aiIn').focus({ preventScroll: true });
}

// ---------- маршрутизация ----------
async function route() {
  if (!S.user) return;
  const [r, id] = location.hash.slice(1).split('-');
  try {
    if (r === 'apts') await viewApts(false);
    else if (r === 'archive') await viewApts(true);
    else if (r === 'apt') await viewApt(id);
    else if (r === 'new' && S.user.role === 'admin') await viewEdit(null);
    else if (r === 'edit' && S.user.role === 'admin') await viewEdit(id);
    else if (r === 'feed') await viewFeed();
    else if (r === 'people' && S.user.role === 'admin') await viewPeople();
    else if (r === 'more') await viewSettings();
    else if (r === 'ai') { viewAi(); return; }
    else await viewMy();
    window.scrollTo(0, 0);
  } catch (e) { toast(e.message); }
}
window.addEventListener('hashchange', route);

async function boot() {
  if (!DEMO && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (!S.token) return showLogin();
  try { const me = await api('GET', '/api/me'); S.user = me.user; S.vapidKey = me.vapidKey; } catch { return logout(true); }
  if (DEMO) window.VPS_ON_PUSH = (title, text) => toast(`🔔 ${title}\n${text}`, 'push');
  route();
  // напоминание включить уведомления тем, кто их получает
  if (!DEMO && S.user.notify && (await pushState()) === 'off' && !store.get('pushAsked')) { store.set('pushAsked', 1); setTimeout(() => toast('Turn on notifications in the More tab'), 1200); }
}
boot();
})();
