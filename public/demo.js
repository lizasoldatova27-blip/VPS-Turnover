/* Демо-режим: тот же API, что у сервера, но данные хранятся в браузере (localStorage) */
(() => {
const KEY = 'vps_demo_state_v5';
const now = () => new Date().toISOString().slice(0, 19).replace('T', ' ');
function fresh() {
  const users = [
    { id: 1, name: 'Liza', pin: '0000', role: 'admin', notify: 1, active: 1 },
    { id: 9, name: 'Stephen', pin: '1111', role: 'admin', notify: 1, active: 1 },
    { id: 2, name: 'Ben', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 3, name: 'Denis', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 4, name: 'Trevor', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 5, name: 'Sam', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 6, name: 'Mark', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 7, name: 'Shane', pin: '1111', role: 'worker', notify: 0, active: 1 },
    { id: 8, name: 'Dima', pin: '1111', role: 'worker', notify: 0, active: 1 },
  ];
  // Покраска: в демо распределены только первые 4 квартиры, остальные ждут назначения
  const painters = [2, 3, 4, 5];
  const who = (t, i) => t.section === 'Cleaning' ? 1
    : t.section === 'Painting' || /additional painting/i.test(t.description) ? (i < 4 ? painters[i] : null)
    : /plumb|fixtures|shutoff|sink|tub/i.test(t.item + ' ' + t.description) ? 6
    : /general labour|demo|trash|garbage/i.test(t.item + ' ' + t.description) ? (i % 2 ? 8 : 7) : null;
  const apartments = [], tasks = []; let tid = 1;
  (window.VPS_SEED || []).forEach((a, i) => {
    const id = i + 1; apartments.push({ id, region: a.region || '', property: a.property || '', unit: a.unit, code: a.code || '', kind: a.kind || '', planned_date: a.planned_date || '', move_out: a.move_out || '', move_in: a.move_in || '', po: a.po || '', notes: a.notes || '', archived: 0 });
    (a.tasks || []).forEach((t, j) => {
      const w = who(t, i); const done = w && i < 2 && t.section === 'Painting' && j < 2;
      tasks.push({ id: tid++, apartment_id: id, section: t.section, item: t.item, description: t.description, position: j, assignee_id: w, done: done ? 1 : 0, done_by: done ? w : null, done_at: done ? '2026-11-21 16:00:00' : null });
    });
  });
  return { users, apartments, tasks, sessions: {}, events: [] };
}
const load = () => { try { return JSON.parse((()=>{try{return localStorage.getItem(KEY)}catch{return window.__vpsMem}})()) || fresh(); } catch { return fresh(); } };
const save = (st) => { const v = JSON.stringify(st); window.__vpsMem = v; try { localStorage.setItem(KEY, v); } catch {} };
const err = (m) => { throw new Error(m); };
const nextId = (arr) => arr.reduce((m, x) => Math.max(m, x.id), 0) + 1;

window.VPS_MOCK = async (method, url, body, token) => {
  const st = load(); const u = st.users.find((x) => x.id === st.sessions[token] && x.active);
  const q = url.split('?'); const path = q[0]; const params = new URLSearchParams(q[1] || '');
  const need = () => u || err('Please sign in'); const adm = () => (need().role === 'admin' ? u : err('Admins only'));
  const pub = (x) => ({ id: x.id, name: x.name, role: x.role, notify: !!x.notify, active: !!x.active });
  const name = (id) => st.users.find((x) => x.id === id)?.name || null;
  let m, out;
  const R = (meth, re) => method === meth && (m = path.match(re));
  if (R('GET', /^\/api\/people$/)) out = st.users.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name }));
  else if (R('POST', /^\/api\/login$/)) { const x = st.users.find((y) => y.id == body.id && y.active); if (!x || x.pin !== String(body.pin)) err('Wrong PIN'); const t = Math.random().toString(36).slice(2); st.sessions[t] = x.id; out = { token: t, user: pub(x) }; }
  else if (R('GET', /^\/api\/me$/)) out = { user: pub(need()), vapidKey: '' };
  else if (R('POST', /^\/api\/logout$/)) { delete st.sessions[token]; out = { ok: true }; }
  else if (R('GET', /^\/api\/apartments$/)) {
    need(); const arch = params.get('archived') === '1' ? 1 : 0;
    const key = (a) => a.planned_date || a.move_out || '9999';
    out = st.apartments.filter((a) => a.archived === arch).map((a) => { const ts = st.tasks.filter((t) => t.apartment_id === a.id); return { ...a, total: ts.length, done: ts.filter((t) => t.done).length, mine: ts.filter((t) => t.assignee_id === u.id).length, mine_left: ts.filter((t) => t.assignee_id === u.id && !t.done).length, unassigned: ts.filter((t) => !t.assignee_id && !t.done).length }; })
      .sort((a, b) => key(a).localeCompare(key(b)) || a.property.localeCompare(b.property) || a.unit.localeCompare(b.unit));
  }
  else if (R('GET', /^\/api\/apartments\/(\d+)$/)) { need(); const a = st.apartments.find((x) => x.id == m[1]) || err('Not found'); out = { ...a, tasks: st.tasks.filter((t) => t.apartment_id === a.id).sort((x, y) => x.position - y.position || x.id - y.id).map((t) => ({ ...t, assignee_name: name(t.assignee_id), done_by_name: name(t.done_by) })) }; }
  else if (R('GET', /^\/api\/my-tasks$/)) { need(); out = st.tasks.filter((t) => t.assignee_id === u.id).map((t) => { const a = st.apartments.find((x) => x.id === t.apartment_id); return a.archived ? null : { ...t, done_by_name: name(t.done_by), property: a.property, unit: a.unit, kind: a.kind, planned_date: a.planned_date }; }).filter(Boolean).sort((x, y) => x.done - y.done || (x.planned_date || '').localeCompare(y.planned_date || '') || x.apartment_id - y.apartment_id || x.position - y.position); }
  else if (R('POST', /^\/api\/apartments$/)) { adm(); const id = nextId(st.apartments); st.apartments.push({ ...body, id, archived: 0, tasks: undefined }); (body.tasks || []).forEach((t, i) => st.tasks.push({ id: nextId(st.tasks), apartment_id: id, section: t.section, item: t.item, description: t.description, position: i, assignee_id: null, done: 0, done_by: null, done_at: null })); out = { id }; }
  else if (R('POST', /^\/api\/import$/)) {
    adm(); let added = 0, updated = 0;
    for (const a of body.apartments) {
      const ex = st.apartments.find((x) => x.unit === a.unit && x.property === a.property && !x.archived);
      if (!ex) { const id = nextId(st.apartments); st.apartments.push({ region: '', code: '', ...a, id, archived: 0, tasks: undefined }); (a.tasks || []).forEach((t, i) => st.tasks.push({ id: nextId(st.tasks), apartment_id: id, ...t, position: i, assignee_id: null, done: 0 })); added++; continue; }
      for (const k of ['move_out', 'move_in', 'planned_date', 'po', 'notes', 'kind']) if (a[k]) ex[k] = a[k];
      updated++;
    }
    out = { added, updated };
  }
  else if (R('PUT', /^\/api\/apartments\/(\d+)$/)) { adm(); const a = st.apartments.find((x) => x.id == m[1]); Object.assign(a, { region: body.region, property: body.property, unit: body.unit, code: body.code, kind: body.kind, planned_date: body.planned_date, move_out: body.move_out, move_in: body.move_in, po: body.po, notes: body.notes, archived: body.archived ? 1 : 0 }); out = { ok: true }; }
  else if (R('DELETE', /^\/api\/apartments\/(\d+)$/)) { adm(); st.apartments = st.apartments.filter((x) => x.id != m[1]); st.tasks = st.tasks.filter((t) => t.apartment_id != m[1]); out = { ok: true }; }
  else if (R('POST', /^\/api\/apartments\/(\d+)\/tasks$/)) { adm(); const id = nextId(st.tasks); st.tasks.push({ id, apartment_id: +m[1], section: body.section, item: body.item, description: body.description, position: 999, assignee_id: null, done: 0 }); out = { id }; }
  else if (R('POST', /^\/api\/assign$/)) { adm(); st.tasks.forEach((t) => { if (body.taskIds.includes(t.id)) t.assignee_id = body.assignee_id; }); out = { ok: true }; }
  else if (R('PUT', /^\/api\/tasks\/(\d+)$/)) { adm(); Object.assign(st.tasks.find((t) => t.id == m[1]), { section: body.section, item: body.item, description: body.description }); out = { ok: true }; }
  else if (R('DELETE', /^\/api\/tasks\/(\d+)$/)) { adm(); st.tasks = st.tasks.filter((t) => t.id != m[1]); out = { ok: true }; }
  else if (R('POST', /^\/api\/tasks\/(\d+)\/done$/)) {
    need(); const t = st.tasks.find((x) => x.id == m[1]) || err('Not found');
    if (u.role !== 'admin' && t.assignee_id && t.assignee_id !== u.id) err('This task is assigned to someone else');
    const done = body?.done !== false; Object.assign(t, done ? { done: 1, done_by: u.id, done_at: now() } : { done: 0, done_by: null, done_at: null });
    out = { ok: true };
    if (done) {
      const a = st.apartments.find((x) => x.id === t.apartment_id); const place = `${a.property.replace(/bcIMC Realty Corporation,\s*/i, '').replace(/ Holdings Inc\.?/i, '')} · unit ${a.unit}`; const what = t.description || t.item;
      const to = st.users.filter((x) => x.notify && x.active && x.id !== u.id).map((x) => x.name);
      st.events.unshift({ id: nextId(st.events), text: `${u.name}: “${what}” — ${place}`, apartment_id: a.id, created_at: now() });
      setTimeout(() => window.VPS_ON_PUSH?.(`Push goes to: ${to.join(', ') || 'nobody (no one has notifications on)'}`, `✅ ${u.name} completed a task\n${what}\n${place}`), 300);
      if (!st.tasks.some((x) => x.apartment_id === a.id && !x.done)) { st.events.unshift({ id: nextId(st.events), text: `🎉 All work complete — ${place}`, apartment_id: a.id, created_at: now() }); setTimeout(() => window.VPS_ON_PUSH?.('🎉 Unit ready', `All work complete: ${place}`), 2600); }
    }
  }
  else if (R('GET', /^\/api\/events$/)) { need(); out = st.events.slice(0, 100); }
  else if (R('GET', /^\/api\/users$/)) { adm(); out = st.users.map((x) => ({ ...x, devices: 0 })).sort((a, b) => b.active - a.active || a.name.localeCompare(b.name)); }
  else if (R('POST', /^\/api\/users$/)) { adm(); if (!body.name || !/^\d{4}$/.test(body.pin)) err('Name and a 4-digit PIN are required'); const id = nextId(st.users); st.users.push({ id, name: body.name, pin: body.pin, role: body.role, notify: body.notify ? 1 : 0, active: 1 }); out = { id }; }
  else if (R('PUT', /^\/api\/users\/(\d+)$/)) { adm(); if (!body.name || !/^\d{4}$/.test(body.pin)) err('Name and a 4-digit PIN are required'); if (+m[1] === u.id && (body.role !== 'admin' || !body.active)) err('You cannot remove your own admin access'); Object.assign(st.users.find((x) => x.id == m[1]), { name: body.name, pin: body.pin, role: body.role, notify: body.notify ? 1 : 0, active: body.active ? 1 : 0 }); out = { ok: true }; }
  else if (R('POST', /^\/api\/(subscribe|test-push)$/)) out = { ok: true };
  else err('Unknown request ' + path);
  save(st);
  return JSON.parse(JSON.stringify(out));
};
})();
