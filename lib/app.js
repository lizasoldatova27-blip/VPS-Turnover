// VPS Turnover — API (Express + Postgres + web push). Works on Vercel and locally.
const express = require('express');
const { Pool } = require('pg');
const webpush = require('web-push');
const crypto = require('crypto');

const CONN = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
const pool = new Pool({ connectionString: CONN, max: 3, ssl: /localhost|127\.0\.0\.1/.test(CONN || '') ? false : { rejectUnauthorized: false } });
pool.on('error', (e) => console.error('db pool error', e.message));
const q = async (sql, params = []) => (await pool.query(sql, params)).rows;
const one = async (sql, params) => (await q(sql, params))[0];

const TZ = process.env.APP_TIMEZONE || 'America/Edmonton';
const SHORT = (p) => (p || '').replace(/bcIMC Realty Corporation,\s*/i, '').replace(/ Holdings Inc\.?/i, '');

// ---------- schema, first-run data, push keys ----------
let ready;
function init() {
  if (!ready) ready = (async () => {
    await q(`
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS users (id SERIAL PRIMARY KEY, name TEXT NOT NULL, pin TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'worker',
  notify BOOLEAN NOT NULL DEFAULT false, active BOOLEAN NOT NULL DEFAULT true, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS apartments (id SERIAL PRIMARY KEY, region TEXT DEFAULT '', property TEXT DEFAULT '', unit TEXT NOT NULL, code TEXT DEFAULT '',
  kind TEXT DEFAULT '', planned_date TEXT DEFAULT '', move_out TEXT DEFAULT '', move_in TEXT DEFAULT '', po TEXT DEFAULT '', notes TEXT DEFAULT '',
  archived BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS tasks (id SERIAL PRIMARY KEY, apartment_id INT NOT NULL REFERENCES apartments(id) ON DELETE CASCADE,
  section TEXT DEFAULT '', item TEXT DEFAULT '', description TEXT DEFAULT '', position INT DEFAULT 0,
  assignee_id INT REFERENCES users(id) ON DELETE SET NULL, done BOOLEAN NOT NULL DEFAULT false,
  done_by INT REFERENCES users(id) ON DELETE SET NULL, done_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS events (id SERIAL PRIMARY KEY, text TEXT NOT NULL, apartment_id INT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS login_fails (key TEXT PRIMARY KEY, n INT NOT NULL, t TIMESTAMPTZ NOT NULL);
CREATE INDEX IF NOT EXISTS tasks_apt ON tasks(apartment_id);
CREATE INDEX IF NOT EXISTS tasks_assignee ON tasks(assignee_id);`);
    // push keys: from env, else generated once and stored
    let keys = process.env.VAPID_PUBLIC_KEY && { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    if (!keys) {
      const row = await one("SELECT value FROM settings WHERE key='vapid'");
      if (row) keys = JSON.parse(row.value);
      else { keys = webpush.generateVAPIDKeys(); await q("INSERT INTO settings(key,value) VALUES('vapid',$1) ON CONFLICT (key) DO NOTHING", [JSON.stringify(keys)]); keys = JSON.parse((await one("SELECT value FROM settings WHERE key='vapid'")).value); }
    }
    webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:admin@vpsconstruction.ca', keys.publicKey, keys.privateKey);
    // first run: two admins, the team, and units from the emails (locked so parallel cold starts seed once)
    const lock = await pool.connect(); await lock.query('SELECT pg_advisory_lock(4242)');
    try {
    const { c } = await one('SELECT COUNT(*)::int c FROM users');
    if (!c) {
      const first = await one("INSERT INTO users(name,pin,role,notify) VALUES($1,$2,'admin',true) RETURNING id", [process.env.ADMIN_NAME || 'Liza', process.env.ADMIN_PIN || '0000']);
      if (first.id === 1) {
        // everyone except the first admin gets a random PIN; Liza sees and hands them out in the People tab
        const pin = () => String(crypto.randomInt(1000, 10000));
        await q("INSERT INTO users(name,pin,role,notify) VALUES('Stephen',$1,'admin',true)", [pin()]);
        for (const n of ['Ben', 'Denis', 'Trevor', 'Sam', 'Mark', 'Shane', 'Dima']) await q("INSERT INTO users(name,pin,role) VALUES($1,$2,'worker')", [n, pin()]);
        for (const a of require('../seed.json')) await createApartment(a);
      }
    }
    } finally { await lock.query('SELECT pg_advisory_unlock(4242)').catch(() => {}); lock.release(); }
    return keys;
  })().catch((e) => { ready = null; throw e; });
  return ready;
}

async function createApartment(a) {
  const { id } = await one(`INSERT INTO apartments(region,property,unit,code,kind,planned_date,notes,move_out,move_in,po)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [a.region || '', a.property || '', a.unit, a.code || '', a.kind || '', a.planned_date || '', a.notes || '', a.move_out || '', a.move_in || '', a.po || '']);
  const tasks = a.tasks || [];
  if (tasks.length) await q(`INSERT INTO tasks(apartment_id,section,item,description,position,assignee_id)
    SELECT $1, s, i, d, p, NULLIF(w,0) FROM unnest($2::text[], $3::text[], $4::text[], $5::int[], $6::int[]) AS x(s,i,d,p,w)`,
    [id, tasks.map((t) => t.section || ''), tasks.map((t) => t.item || ''), tasks.map((t) => t.description || ''), tasks.map((_, i) => i), tasks.map((t) => Number(t.assignee_id) || 0)]);
  return id;
}

async function notify(title, body, url, excludeUserId) {
  const subs = await q(`SELECT s.endpoint, s.data FROM subscriptions s JOIN users u ON u.id=s.user_id
    WHERE u.notify AND u.active AND u.id <> $1`, [excludeUserId ?? -1]);
  const payload = JSON.stringify({ title, body, url: url || '/' });
  await Promise.all(subs.map(async (s) => {
    try { await webpush.sendNotification(JSON.parse(s.data), payload, { TTL: 86400 }); }
    catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await q('DELETE FROM subscriptions WHERE endpoint=$1', [s.endpoint]);
      else console.error('push error', e.statusCode, e.body || e.message);
    }
  }));
}

// ---------- API ----------
const app = express();
app.use(express.json({ limit: '1mb' }));
const h = (fn) => async (req, res, next) => { try { if (!CONN) return res.status(503).json({ error: 'Database is not connected yet (Vercel → Storage → Neon → Connect, then Redeploy).' }); await init(); await fn(req, res, next); } catch (e) { console.error(e); res.status(500).json({ error: 'Server error: ' + e.message }); } };

const auth = h(async (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const u = token && await one('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=$1 AND u.active', [token]);
  if (!u) return res.status(401).json({ error: 'Please sign in' });
  req.user = u; next();
});
const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admins only' });
const pubUser = (u) => ({ id: u.id, name: u.name, role: u.role, notify: !!u.notify, active: !!u.active });

app.get('/api/health', async (req, res) => {
  const out = { database_configured: !!CONN };
  try { await pool.query('SELECT 1'); out.database_ok = true; } catch (e) { out.database_ok = false; out.error = e.message; }
  res.json(out);
});
app.get('/api/people', h(async (req, res) => res.json(await q('SELECT id,name FROM users WHERE active ORDER BY (role=\'admin\') DESC, id'))));

app.post('/api/login', h(async (req, res) => {
  const { id, pin } = req.body || {};
  const key = (req.headers['x-forwarded-for'] || req.ip || '').split(',')[0] + ':' + id;
  const f = await one("SELECT n FROM login_fails WHERE key=$1 AND t > now() - interval '10 minutes'", [key]);
  if (f && f.n >= 8) return res.status(429).json({ error: 'Too many attempts, wait 10 minutes' });
  const u = await one('SELECT * FROM users WHERE id=$1 AND active', [Number(id) || 0]);
  if (!u || u.pin !== String(pin)) {
    await q(`INSERT INTO login_fails(key,n,t) VALUES($1,1,now()) ON CONFLICT (key) DO UPDATE SET
      n = CASE WHEN login_fails.t > now() - interval '10 minutes' THEN login_fails.n + 1 ELSE 1 END, t = now()`, [key]);
    return res.status(401).json({ error: 'Wrong PIN' });
  }
  await q('DELETE FROM login_fails WHERE key=$1', [key]);
  const token = crypto.randomBytes(24).toString('hex');
  await q('INSERT INTO sessions(token,user_id) VALUES($1,$2)', [token, u.id]);
  res.json({ token, user: pubUser(u) });
}));

app.get('/api/me', auth, h(async (req, res) => res.json({ user: pubUser(req.user), vapidKey: (await init()).publicKey })));
app.post('/api/logout', auth, h(async (req, res) => { await q('DELETE FROM sessions WHERE token=$1', [req.headers.authorization.replace('Bearer ', '')]); res.json({ ok: true }); }));

app.post('/api/subscribe', auth, h(async (req, res) => {
  const sub = req.body; if (!sub?.endpoint) return res.status(400).json({ error: 'bad subscription' });
  await q('INSERT INTO subscriptions(endpoint,user_id,data) VALUES($1,$2,$3) ON CONFLICT (endpoint) DO UPDATE SET user_id=EXCLUDED.user_id, data=EXCLUDED.data', [sub.endpoint, req.user.id, JSON.stringify(sub)]);
  res.json({ ok: true });
}));
app.post('/api/test-push', auth, h(async (req, res) => {
  const subs = await q('SELECT data FROM subscriptions WHERE user_id=$1', [req.user.id]);
  for (const s of subs) { try { await webpush.sendNotification(JSON.parse(s.data), JSON.stringify({ title: 'Test', body: 'Notifications work 👍', url: '/' })); } catch (e) { console.error(e.message); } }
  res.json({ sent: subs.length });
}));

app.get('/api/apartments', auth, h(async (req, res) => {
  const archived = req.query.archived === '1';
  res.json(await q(`SELECT a.*, COUNT(t.id)::int total, COUNT(t.id) FILTER (WHERE t.done)::int done,
      COUNT(t.id) FILTER (WHERE t.assignee_id=$1)::int mine, COUNT(t.id) FILTER (WHERE t.assignee_id=$1 AND NOT t.done)::int mine_left,
      COUNT(t.id) FILTER (WHERE t.assignee_id IS NULL AND NOT t.done)::int unassigned
    FROM apartments a LEFT JOIN tasks t ON t.apartment_id=a.id WHERE a.archived=$2 GROUP BY a.id
    ORDER BY COALESCE(NULLIF(a.planned_date,''),NULLIF(a.move_out,''),'9999'), a.property, a.unit`, [req.user.id, archived]));
}));

app.get('/api/apartments/:id', auth, h(async (req, res) => {
  const a = await one('SELECT * FROM apartments WHERE id=$1', [Number(req.params.id) || 0]);
  if (!a) return res.status(404).json({ error: 'Not found' });
  a.tasks = await q(`SELECT t.*, ua.name assignee_name, ud.name done_by_name FROM tasks t
    LEFT JOIN users ua ON ua.id=t.assignee_id LEFT JOIN users ud ON ud.id=t.done_by WHERE apartment_id=$1 ORDER BY position, t.id`, [a.id]);
  res.json(a);
}));

app.get('/api/my-tasks', auth, h(async (req, res) => {
  res.json(await q(`SELECT t.*, a.property, a.unit, a.kind, a.planned_date, ud.name done_by_name FROM tasks t JOIN apartments a ON a.id=t.apartment_id
    LEFT JOIN users ud ON ud.id=t.done_by WHERE t.assignee_id=$1 AND NOT a.archived
    ORDER BY t.done, COALESCE(NULLIF(a.planned_date,''),NULLIF(a.move_out,''),'9999'), a.property, a.unit, t.position`, [req.user.id]));
}));

app.post('/api/apartments', auth, admin, h(async (req, res) => {
  const a = req.body || {}; if (!a.unit) return res.status(400).json({ error: 'Enter the unit number' });
  res.json({ id: await createApartment(a) });
}));
app.post('/api/import', auth, admin, h(async (req, res) => {
  let added = 0, updated = 0;
  for (const a of req.body?.apartments || []) {
    if (!a.unit) continue;
    const ex = await one('SELECT * FROM apartments WHERE unit=$1 AND property=$2 AND NOT archived', [a.unit, a.property || '']);
    if (!ex) { await createApartment(a); added++; continue; }
    const m = { ...ex }; for (const k of ['move_out', 'move_in', 'planned_date', 'po', 'notes', 'kind', 'code']) if (a[k]) m[k] = a[k];
    await q('UPDATE apartments SET move_out=$1,move_in=$2,planned_date=$3,po=$4,notes=$5,kind=$6,code=$7 WHERE id=$8', [m.move_out, m.move_in, m.planned_date, m.po, m.notes, m.kind, m.code, ex.id]);
    const have = new Set((await q('SELECT lower(description) d FROM tasks WHERE apartment_id=$1', [ex.id])).map((r) => r.d));
    for (const t of a.tasks || []) if (!have.has((t.description || '').toLowerCase())) await q('INSERT INTO tasks(apartment_id,section,item,description,position) VALUES($1,$2,$3,$4,1000)', [ex.id, t.section || '', t.item || '', t.description || '']);
    updated++;
  }
  res.json({ added, updated });
}));
app.put('/api/apartments/:id', auth, admin, h(async (req, res) => {
  const a = req.body || {};
  await q('UPDATE apartments SET region=$1,property=$2,unit=$3,code=$4,kind=$5,planned_date=$6,notes=$7,archived=$8,move_out=$9,move_in=$10,po=$11 WHERE id=$12',
    [a.region || '', a.property || '', a.unit, a.code || '', a.kind || '', a.planned_date || '', a.notes || '', !!a.archived, a.move_out || '', a.move_in || '', a.po || '', req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/apartments/:id', auth, admin, h(async (req, res) => { await q('DELETE FROM apartments WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

app.post('/api/apartments/:id/tasks', auth, admin, h(async (req, res) => {
  const t = req.body || {};
  const { p } = await one('SELECT COALESCE(MAX(position),0)+1 p FROM tasks WHERE apartment_id=$1', [req.params.id]);
  const r = await one('INSERT INTO tasks(apartment_id,section,item,description,position,assignee_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',
    [req.params.id, t.section || 'Other', t.item || '', t.description || '', p, t.assignee_id || null]);
  res.json({ id: r.id });
}));
app.post('/api/assign', auth, admin, h(async (req, res) => {
  const { taskIds, assignee_id } = req.body || {};
  await q('UPDATE tasks SET assignee_id=$1 WHERE id = ANY($2::int[])', [assignee_id || null, (taskIds || []).map(Number)]);
  res.json({ ok: true });
}));
app.put('/api/tasks/:id', auth, admin, h(async (req, res) => {
  const t = req.body || {};
  await q('UPDATE tasks SET section=$1, item=$2, description=$3 WHERE id=$4', [t.section || '', t.item || '', t.description || '', req.params.id]);
  res.json({ ok: true });
}));
app.delete('/api/tasks/:id', auth, admin, h(async (req, res) => { await q('DELETE FROM tasks WHERE id=$1', [req.params.id]); res.json({ ok: true }); }));

// tick / untick a task; ticking notifies everyone with notifications on
app.post('/api/tasks/:id/done', auth, h(async (req, res) => {
  const t = await one('SELECT t.*, a.property, a.unit FROM tasks t JOIN apartments a ON a.id=t.apartment_id WHERE t.id=$1', [Number(req.params.id) || 0]);
  if (!t) return res.status(404).json({ error: 'Not found' });
  if (req.user.role !== 'admin' && t.assignee_id && t.assignee_id !== req.user.id) return res.status(403).json({ error: 'This task is assigned to someone else' });
  const done = req.body?.done !== false;
  if (done) await q('UPDATE tasks SET done=true, done_by=$1, done_at=now() WHERE id=$2', [req.user.id, t.id]);
  else await q('UPDATE tasks SET done=false, done_by=NULL, done_at=NULL WHERE id=$1', [t.id]);
  if (done) {
    const place = `${SHORT(t.property)} · unit ${t.unit}`;
    const what = t.description || t.item;
    await q('INSERT INTO events(text,apartment_id) VALUES($1,$2)', [`${req.user.name}: “${what}” — ${place}`, t.apartment_id]);
    await notify(`✅ ${req.user.name} completed a task`, `${what}\n${place}`, `/#apt-${t.apartment_id}`, req.user.id);
    const { c } = await one('SELECT COUNT(*)::int c FROM tasks WHERE apartment_id=$1 AND NOT done', [t.apartment_id]);
    if (c === 0) {
      await q('INSERT INTO events(text,apartment_id) VALUES($1,$2)', [`🎉 All work complete — ${place}`, t.apartment_id]);
      await notify('🎉 Unit ready', `All work complete: ${place}`, `/#apt-${t.apartment_id}`);
    }
  }
  res.json({ ok: true });
}));

app.get('/api/events', auth, h(async (req, res) => res.json(await q('SELECT * FROM events ORDER BY id DESC LIMIT 100'))));

// people (admins only)
app.get('/api/users', auth, admin, h(async (req, res) => {
  res.json(await q(`SELECT u.id,u.name,u.pin,u.role,u.notify,u.active,
    (SELECT COUNT(*)::int FROM subscriptions s WHERE s.user_id=u.id) devices FROM users u ORDER BY u.active DESC, u.name`));
}));
app.post('/api/users', auth, admin, h(async (req, res) => {
  const u = req.body || {}; if (!u.name || !/^\d{4}$/.test(u.pin || '')) return res.status(400).json({ error: 'Name and a 4-digit PIN are required' });
  const r = await one('INSERT INTO users(name,pin,role,notify) VALUES($1,$2,$3,$4) RETURNING id', [u.name.trim(), u.pin, u.role === 'admin' ? 'admin' : 'worker', !!u.notify]);
  res.json({ id: r.id });
}));
app.put('/api/users/:id', auth, admin, h(async (req, res) => {
  const u = req.body || {}; if (!u.name || !/^\d{4}$/.test(u.pin || '')) return res.status(400).json({ error: 'Name and a 4-digit PIN are required' });
  if (Number(req.params.id) === req.user.id && (u.role !== 'admin' || !u.active)) return res.status(400).json({ error: 'You cannot remove your own admin access' });
  await q('UPDATE users SET name=$1, pin=$2, role=$3, notify=$4, active=$5 WHERE id=$6', [u.name.trim(), u.pin, u.role === 'admin' ? 'admin' : 'worker', !!u.notify, !!u.active, req.params.id]);
  if (!u.active) await q('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------- export to CSV (opens in Excel / Google Sheets) ----------
app.get('/api/export', auth, admin, h(async (req, res) => {
  const scope = req.query.scope === 'all' ? 'all' : 'done';
  const rows = await q(`WITH s AS (SELECT apartment_id, COUNT(*) total, COUNT(*) FILTER (WHERE done) d FROM tasks GROUP BY apartment_id)
    SELECT a.property, a.unit, a.kind, a.move_out, a.planned_date, a.move_in, a.po, a.code, a.notes, a.archived,
      t.section, t.item, t.description, t.done, t.done_at, ua.name assignee, ud.name done_by
    FROM apartments a JOIN s ON s.apartment_id=a.id JOIN tasks t ON t.apartment_id=a.id
    LEFT JOIN users ua ON ua.id=t.assignee_id LEFT JOIN users ud ON ud.id=t.done_by
    WHERE $1 = 'all' OR s.total = s.d
    ORDER BY a.property, a.unit, t.position, t.id`, [scope]);
  const when = (d) => d ? new Date(d).toLocaleString('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '';
  const cell = (v) => { const x = String(v ?? ''); return /[",\n\r]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
  const head = ['Property', 'Unit', 'Job type', 'Move-out', 'Due', 'Move-in', 'PO', 'Project code', 'Section', 'Task', 'Assigned to', 'Done', 'Done by', 'Done at', 'Archived', 'Notes'];
  const lines = [head.join(',')].concat(rows.map((r) => [SHORT(r.property), r.unit, r.kind, r.move_out, r.planned_date, r.move_in, r.po, r.code, r.section,
    r.description || r.item, r.assignee, r.done ? 'Yes' : 'No', r.done_by, when(r.done_at), r.archived ? 'Yes' : 'No', r.notes].map(cell).join(',')));
  const day = new Date().toLocaleDateString('en-CA', { timeZone: TZ });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="VPS-turnover-${scope === 'all' ? 'all' : 'completed'}-${day}.csv"`);
  res.send('\ufeff' + lines.join('\r\n'));
}));

// ---------- AI assistant (Google Gemini, key stays on the server) ----------
async function buildContext(user) {
  const apts = await q(`SELECT a.*, COUNT(t.id)::int total, COUNT(t.id) FILTER (WHERE t.done)::int done FROM apartments a
    LEFT JOIN tasks t ON t.apartment_id=a.id WHERE NOT a.archived GROUP BY a.id ORDER BY a.property, a.unit`);
  const tasks = await q(`SELECT t.apartment_id, t.section, t.description, t.item, t.done, t.done_at, ua.name assignee, ud.name done_by
    FROM tasks t JOIN apartments a ON a.id=t.apartment_id AND NOT a.archived LEFT JOIN users ua ON ua.id=t.assignee_id LEFT JOIN users ud ON ud.id=t.done_by
    ORDER BY t.apartment_id, t.position, t.id`);
  const people = await q("SELECT name, role, notify FROM users WHERE active ORDER BY name");
  const events = await q('SELECT text, created_at FROM events ORDER BY id DESC LIMIT 60');
  const when = (d) => d ? new Date(d).toLocaleString('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
  const byApt = new Map(); tasks.forEach((t) => { if (!byApt.has(t.apartment_id)) byApt.set(t.apartment_id, []); byApt.get(t.apartment_id).push(t); });
  let out = `TODAY: ${when(new Date())} (${TZ})\nSIGNED-IN USER: ${user.name} (${user.role === 'admin' ? 'admin' : 'staff'})\n\nPEOPLE:\n`;
  out += people.map((p) => `- ${p.name}${p.role === 'admin' ? ' (admin)' : ''}${p.notify ? ' [gets notifications]' : ''}`).join('\n');
  out += '\n\nUNITS AND TASKS (dates are YYYY-MM-DD):\n';
  for (const a of apts) {
    out += `\n## Unit ${a.unit} — ${SHORT(a.property)}${a.kind ? ' — ' + a.kind : ''} — ${a.done}/${a.total} done`;
    const meta = [a.move_out && 'move-out ' + a.move_out, a.planned_date && 'due ' + a.planned_date, a.move_in && 'move-in ' + a.move_in, a.po && 'PO ' + a.po, a.notes && 'notes: ' + a.notes].filter(Boolean);
    if (meta.length) out += '\n' + meta.join('; ');
    for (const t of byApt.get(a.id) || []) out += `\n- [${t.done ? 'x' : ' '}] ${t.section ? t.section + ': ' : ''}${t.description || t.item} — ${t.assignee ? 'assigned to ' + t.assignee : 'UNASSIGNED'}${t.done ? ` — done by ${t.done_by || '?'} ${when(t.done_at)}` : ''}`;
  }
  out += '\n\nRECENT ACTIVITY (newest first):\n' + events.map((e) => `- ${when(e.created_at)}: ${e.text}`).join('\n');
  return out;
}

app.post('/api/ai', auth, h(async (req, res) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(503).json({ error: 'The AI assistant is not set up yet (GEMINI_API_KEY is missing in Vercel).' });
  const history = (req.body?.messages || []).slice(-12).filter((m) => m && typeof m.text === 'string' && m.text.trim())
    .map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text.slice(0, 2000) }] }));
  if (!history.length || history[history.length - 1].role !== 'user') return res.status(400).json({ error: 'Ask a question' });
  const system = `You are the assistant inside "VPS Turnover", the app VPS Construction staff use to track apartment (unit) turnovers.
Answer questions using ONLY the data below: units, their dates, tasks, who is assigned, what is done and when, and recent activity.
Rules: be short and practical (a few lines or a short list). Reply in the language the user writes in (English, Russian or other).
Say "unit 2904 (SODO)" style references. If something is not in the data, say you don't know — never invent units, people, dates or PO numbers.
You cannot change anything in the app: if asked to assign, tick or edit, explain where to do it in the app (admins: open the unit → Assign / Edit; staff: tick the box in My tasks).
Dates: "due" = completion date, move-out/move-in are tenant dates. Overdue = due date before today and not all tasks done.

${await buildContext(req.user)}`;
  const model = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  const base = process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com';
  const r = await fetch(`${base}/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: history, generationConfig: { temperature: 0.2, maxOutputTokens: 1024 } }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { console.error('gemini error', r.status, JSON.stringify(j).slice(0, 500)); return res.status(502).json({ error: `AI error (${r.status}): ${j.error?.message || 'no answer'}` }); }
  const text = (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
  res.json({ text: text || 'Sorry, I could not answer that. Try asking in a different way.' });
}));

app.use('/api', (req, res) => res.status(404).json({ error: 'Unknown request' }));
module.exports = app;
