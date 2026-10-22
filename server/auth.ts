// Login sessions + role-based access control.
// Every /api request (except login and the company name on the login screen) must
// carry a session token; the user's role is re-read on each request, so a change
// SuperAdmin makes to a role applies immediately — no re-login needed.
import type { Express, Request, Response, NextFunction } from 'express';
import { randomBytes } from 'node:crypto';
import { db, sysDb, hashPassword, checkPassword, useCompany, companyRow } from './db.ts';
import {
  PERMS, PERM_KEYS, SUPER, ANY_VOUCHER, ANY_BILL,
  billCreatePerm, billModifyPerm, voucherPerm,
} from '../shared/perms.ts';
import { GRANTABLE, featurePerms } from '../shared/menuPerms.ts';

/** perms = feature permissions derived from the role's ticks; menu = the ticked menu items + special powers. */
export interface AuthCtx { userId: number; name: string; role: string; isSuper: boolean; perms: Set<string>; menu: string[]; companyId?: number; yearId?: number }

// Ensure sessions table exists in sysDb for persistence across server restarts
sysDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    seen INTEGER NOT NULL,
    company_id INTEGER,
    year_id INTEGER
  );
  CREATE INDEX IF NOT EXISTS ix_sessions_seen ON sessions(seen);
`);

interface SessionRecord {
  userId: number;
  seen: number;
  companyId?: number;
  yearId?: number;
}

const SESSION_TTL = 12 * 3600 * 1000; // 12 hours
/** Memory cache of active sessions — synced with sysDb so server restarts never lose sessions. */
const sessions = new Map<string, SessionRecord>();

function loadSessionsFromDb() {
  try {
    const cutoff = Date.now() - SESSION_TTL;
    sysDb.prepare('DELETE FROM sessions WHERE seen < ?').run(cutoff);
    const rows = sysDb.prepare('SELECT * FROM sessions WHERE seen >= ?').all() as any[];
    for (const r of rows) {
      sessions.set(r.token, {
        userId: r.user_id,
        seen: r.seen,
        companyId: r.company_id ?? undefined,
        yearId: r.year_id ?? undefined,
      });
    }
  } catch (e) {
    console.error('Failed to load sessions from db:', e);
  }
}
loadSessionsFromDb();

function saveSessionToDb(token: string, s: SessionRecord) {
  try {
    sysDb.prepare(`
      INSERT INTO sessions (token, user_id, seen, company_id, year_id)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token) DO UPDATE SET
        user_id=excluded.user_id,
        seen=excluded.seen,
        company_id=excluded.company_id,
        year_id=excluded.year_id
    `).run(token, s.userId, s.seen, s.companyId ?? null, s.yearId ?? null);
  } catch (e) {
    console.error('Failed to save session to db:', e);
  }
}

function deleteSessionFromDb(token: string) {
  try {
    sysDb.prepare('DELETE FROM sessions WHERE token=?').run(token);
  } catch (e) {
    console.error('Failed to delete session from db:', e);
  }
}

const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

function loadUser(userId: number): AuthCtx | null {
  const u = sysDb.prepare(`SELECT u.id, u.name, r.name AS role, r.is_super, r.perms
    FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?`).get(userId) as
    { id: number; name: string; role: string; is_super: number; perms: string } | undefined;
  if (!u) return null;
  const menu = JSON.parse(u.perms) as string[];
  return { userId: u.id, name: u.name, role: u.role, isSuper: !!u.is_super, perms: new Set(featurePerms(menu)), menu };
}

export const authOf = (req: Request) => (req as unknown as { auth: AuthCtx }).auth;
export const can = (a: AuthCtx | undefined, key: string) => !!a && (a.isSuper || (key !== SUPER && a.perms.has(key)));

const permLabel = (k: string) => (k === SUPER ? 'SuperAdmin only' : PERMS.find((p) => p.key === k)?.label ?? k);

/** Required permissions: every inner list must have at least one key granted. */
type Need = string[][];

function billTypeOf(id: string) {
  return (db.prepare('SELECT type, date FROM bills WHERE id=?').get(id) as { type: string; date: string } | undefined);
}
function voucherTypeOf(id: string) {
  return (db.prepare('SELECT type, date FROM vouchers WHERE id=?').get(id) as { type: string; date: string } | undefined);
}

/** What a request needs. null = any logged-in user. `backdate` = the entry date to vet. */
function needsFor(req: Request, a: AuthCtx): { need: Need | null; backdate?: { date?: string; existing?: string } } {
  const m = req.method, p = req.path, b = req.body ?? {};
  const id = p.split('/')[2];

  if (/^\/roles/.test(p)) return { need: [[SUPER]] };
  if (/^\/users\/\d+\/password$/.test(p) && m === 'PUT') return { need: Number(id) === a.userId ? null : [[SUPER]] };
  if (/^\/users/.test(p)) return { need: [[SUPER]] };
  // Creating / editing companies, backups and new years: SuperAdmin.
  if (/^\/companies/.test(p) && m !== 'GET') return { need: [[SUPER]] };

  if (p === '/company' && m === 'PUT') return { need: [['masters.company']] };
  if (p === '/groups' && m === 'POST') return { need: [['masters.group']] };
  if (p === '/salesmen' && m === 'POST') return { need: [['masters.salesman']] };

  if (/^\/ledgers/.test(p)) {
    if (m === 'POST' || m === 'PUT') return { need: [['masters.ledger']] };
    if (m === 'DELETE') return { need: [['masters.ledger'], ['feature.delete']] };
  }
  if (/^\/items/.test(p)) {
    if (/\/(stock-)?register$/.test(p)) return { need: [['reports.stock', 'masters.item']] };
    if (/\/batches$/.test(p) && m === 'POST') return { need: [['masters.item', 'purchase.bill', 'purchase.challan']] };
    if (m === 'POST' || m === 'PUT') return { need: [['masters.item']] };
    if (m === 'DELETE') return { need: [['masters.item'], ['feature.delete']] };
  }

  if (/^\/bills/.test(p)) {
    if (p === '/bills/next-no') return { need: [[billCreatePerm(String(req.query.type))]] };
    if (m === 'GET') return { need: [[...ANY_BILL, 'books.registers', 'books.ledger']] };
    if (m === 'POST') return { need: [[billCreatePerm(b.type)]], backdate: { date: b.date } };
    const cur = billTypeOf(id);
    if (!cur) return { need: null };                          // route answers "not found"
    if (m === 'PUT') return { need: [[billModifyPerm(cur.type)], [billModifyPerm(b.type ?? cur.type)]], backdate: { date: b.date, existing: cur.date } };
    if (m === 'DELETE') return { need: [[billModifyPerm(cur.type)], ['feature.delete']] };
  }

  if (/^\/vouchers/.test(p)) {
    if (p === '/vouchers/next-no') return { need: [[voucherPerm(String(req.query.type))]] };
    if (m === 'GET') return { need: [[...ANY_VOUCHER, 'voucher.modify', 'books.daybook', 'books.registers']] };
    if (m === 'POST') return { need: [[voucherPerm(b.type)]], backdate: { date: b.date } };
    const cur = voucherTypeOf(id);
    if (!cur) return { need: null };
    if (m === 'PUT') return { need: [['voucher.modify'], [voucherPerm(b.type ?? cur.type)]], backdate: { date: b.date, existing: cur.date } };
    if (m === 'DELETE') return { need: [['voucher.modify'], ['feature.delete']] };
  }

  const r = p.match(/^\/reports\/([a-z0-9-]+)/)?.[1];
  if (r) {
    const map: Record<string, string[]> = {
      ledger: ['books.ledger', 'reports.outstanding'], 'ledger-accounts': ['books.ledger', 'reports.outstanding', 'ledger.list'],
      'trial-balance': ['reports.final'], 'stock-value': ['reports.final'],
      outstanding: ['reports.outstanding'],
      stock: ['reports.stock'], reorder: ['reports.stock'], 'batch-stock': ['reports.stock'],
      daybook: ['books.daybook'], 'day-book': ['books.daybook'], 'sale-book': ['books.registers'],
      'gross-profit': ['reports.profit'],
      mis: ['reports.daily'], 'mode-of-payment': ['reports.daily'], 'item-sale': ['reports.daily'],
      gstr3b: ['reports.gst'],
      summary: ['reports.daily', 'books.registers', 'reports.profit'], ageing: ['reports.outstanding'],
    };
    return { need: [map[r] ?? [SUPER]] };
  }
  return { need: null };
}

const PUBLIC = new Set(['POST /login', 'GET /login/users', 'GET /licence']);
/** Calls that work before a company is open. Everything else reads the company's file. */
const NO_COMPANY = /^\/(me|logout|perms|roles|users|companies|session)(\/|$)/;

const sessionOf = (req: Request) => sessions.get((req.headers.authorization ?? '').replace(/^Bearer /, ''));

/** Re-point `db` at this request's company. Handlers call it right before running (see `h`). */
export function bindCompany(req: Request) {
  const id = (req as unknown as { auth?: AuthCtx }).auth?.companyId;
  if (id) useCompany(id);
}

/** LIST OF COMPANIES → company chosen. Clears the year until SELECT TO EXECUTE. */
export function setSessionCompany(req: Request, companyId: number) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const s = sessionOf(req);
  if (s) {
    s.companyId = companyId;
    s.yearId = undefined;
    saveSessionToDb(token, s);
  }
}
export function setSessionYear(req: Request, yearId: number) {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  const s = sessionOf(req);
  if (s) {
    s.yearId = yearId;
    saveSessionToDb(token, s);
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC.has(`${req.method} ${req.path}`)) return next();
  const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
  let s = sessions.get(token);
  if (!s && token) {
    const row = sysDb.prepare('SELECT * FROM sessions WHERE token=?').get(token) as any;
    if (row && Date.now() - row.seen <= SESSION_TTL) {
      s = {
        userId: row.user_id,
        seen: row.seen,
        companyId: row.company_id ?? undefined,
        yearId: row.year_id ?? undefined,
      };
      sessions.set(token, s);
    }
  }
  if (!s || Date.now() - s.seen > SESSION_TTL) {
    if (token) {
      sessions.delete(token);
      deleteSessionFromDb(token);
    }
    res.status(401).json({ error: 'Session expired — please log in again (Ctrl+U)' });
    return;
  }
  const a = loadUser(s.userId);
  if (!a) {
    sessions.delete(token);
    deleteSessionFromDb(token);
    res.status(401).json({ error: 'User no longer exists' });
    return;
  }
  // Refresh seen timestamp in DB if more than 60s has passed since last update
  if (Date.now() - s.seen > 60000) {
    s.seen = Date.now();
    saveSessionToDb(token, s);
  }
  a.companyId = s.companyId;
  a.yearId = s.yearId;
  (req as unknown as { auth: AuthCtx }).auth = a;
  if (!NO_COMPANY.test(req.path)) {
    if (!s.companyId) { res.status(409).json({ error: 'No company open — select one from the LIST OF COMPANIES (F1)' }); return; }
    try { useCompany(s.companyId); } catch (e) { res.status(409).json({ error: (e as Error).message }); return; }
  }

  const { need, backdate } = needsFor(req, a);
  const missing = (need ?? []).find((anyOf) => !anyOf.some((k) => can(a, k)));
  if (missing) {
    res.status(403).json({ error: `Access denied — role ${a.role} needs: ${permLabel(missing[0])}` });
    return;
  }
  if (backdate?.date && !can(a, 'feature.backdate') && backdate.date !== today() && backdate.date !== backdate.existing) {
    res.status(403).json({ error: `Date change not allowed for role ${a.role} — use today's date` });
    return;
  }
  next();
}

/** Hide cost / margin figures from roles without "See purchase rate, cost, margin & profit". */
const COST_KEYS = new Set(['purchase_rate', 'cost', 'profit', 'value']);
export function maskCost(req: Request, data: unknown): unknown {
  if (req.method !== 'GET' || can(authOf(req), 'feature.view_cost')) return data;
  const strip = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(strip);
    if (v && typeof v === 'object') {
      return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, COST_KEYS.has(k) ? null : strip(x)]));
    }
    return v;
  };
  return strip(data);
}

// ---------------------------------------------------------------- routes
type H = (req: Request, res: Response) => unknown;

export function registerAuthRoutes(app: Express, h: (fn: H) => (req: Request, res: Response, next: NextFunction) => void) {
  const session = (a: AuthCtx, token?: string) => ({
    id: a.userId,
    name: a.name,
    role: a.role,
    is_super: a.isSuper,
    perms: a.isSuper ? PERM_KEYS : [...a.perms],
    menu: a.isSuper ? [...GRANTABLE] : a.menu,
    company_id: a.companyId,
    year_id: a.yearId,
    ...(token ? { token } : {}),
  });

  app.get('/api/login/users', h(() => sysDb.prepare('SELECT name FROM users ORDER BY name').all()));
  app.post('/api/login', h((req, res) => {
    const { name, password } = req.body ?? {};
    const u = sysDb.prepare('SELECT * FROM users WHERE name=?').get(String(name ?? '')) as
      { id: number; salt: string; hash: string } | undefined;
    if (!u || !checkPassword(String(password ?? ''), u.salt, u.hash)) {
      res.status(401).json({ error: 'Invalid User Name or Password' });
      return;
    }
    const a = loadUser(u.id);
    if (!a) { res.status(401).json({ error: 'User has no role' }); return; }
    const token = randomBytes(32).toString('hex');
    // Ctrl+U (change user) keeps the company and year that are open.
    const companyId = companyRow(req.body?.company_id)?.id;
    const sess: SessionRecord = {
      userId: u.id,
      seen: Date.now(),
      companyId,
      yearId: companyId ? Number(req.body?.year_id) || undefined : undefined,
    };
    sessions.set(token, sess);
    saveSessionToDb(token, sess);
    return { token, ...session(a, token) };
  }));
  app.post('/api/logout', h((req) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    sessions.delete(token);
    deleteSessionFromDb(token);
    return { ok: true };
  }));
  app.get('/api/me', h((req) => {
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '');
    return session(authOf(req), token);
  }));
  app.get('/api/perms', h(() => PERMS));

  // ---- roles (SuperAdmin only — enforced in needsFor)
  const cleanPerms = (p: unknown) => (Array.isArray(p) ? [...new Set(p.filter((k) => GRANTABLE.has(k)))] : []);
  app.get('/api/roles', h(() => (sysDb.prepare(`SELECT r.*, (SELECT COUNT(*) FROM users u WHERE u.role_id=r.id) AS users
    FROM roles r ORDER BY r.is_super DESC, r.name`).all() as { perms: string }[]).map((r) => ({ ...r, perms: JSON.parse(r.perms) }))));
  app.post('/api/roles', h((req) => {
    const name = String(req.body?.name ?? '').trim().toUpperCase();
    if (!name) throw new Error('Role name is required');
    const r = sysDb.prepare('INSERT INTO roles (name,is_super,perms,menu_perms) VALUES (?,0,?,1)').run(name, JSON.stringify(cleanPerms(req.body?.perms)));
    return { id: Number(r.lastInsertRowid) };
  }));
  app.put('/api/roles/:id', h((req) => {
    const role = sysDb.prepare('SELECT * FROM roles WHERE id=?').get(req.params.id) as { is_super: number; name: string } | undefined;
    if (!role) throw new Error('Role not found');
    if (role.is_super) throw new Error('SUPERADMIN always has every feature and cannot be changed');
    const name = req.body?.name ? String(req.body.name).trim().toUpperCase() : role.name;
    sysDb.prepare('UPDATE roles SET name=?, perms=? WHERE id=?').run(name, JSON.stringify(cleanPerms(req.body?.perms)), req.params.id);
    return { ok: true };
  }));
  app.delete('/api/roles/:id', h((req) => {
    const role = sysDb.prepare('SELECT is_super FROM roles WHERE id=?').get(req.params.id) as { is_super: number } | undefined;
    if (!role) throw new Error('Role not found');
    if (role.is_super) throw new Error('SUPERADMIN role cannot be deleted');
    if (sysDb.prepare('SELECT 1 FROM users WHERE role_id=?').get(req.params.id)) throw new Error('Move the users in this role to another role first');
    sysDb.prepare('DELETE FROM roles WHERE id=?').run(req.params.id);
    return { ok: true };
  }));

  // ---- users (SuperAdmin only, except changing your own password)
  const superCount = () => (sysDb.prepare('SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id=u.role_id WHERE r.is_super=1').get() as { c: number }).c;
  const isSuperUser = (id: string | number) => !!(sysDb.prepare('SELECT r.is_super FROM users u JOIN roles r ON r.id=u.role_id WHERE u.id=?').get(id) as { is_super: number } | undefined)?.is_super;

  app.get('/api/users', h(() => sysDb.prepare(`SELECT u.id, u.name, u.role_id, r.name AS role, r.is_super
    FROM users u LEFT JOIN roles r ON r.id=u.role_id ORDER BY r.is_super DESC, u.name`).all()));
  app.post('/api/users', h((req) => {
    const { name, password, role_id } = req.body ?? {};
    if (!name || !password) throw new Error('User name and password are required');
    if (!sysDb.prepare('SELECT 1 FROM roles WHERE id=?').get(role_id)) throw new Error('Select a role');
    const { salt, hash } = hashPassword(String(password));
    const r = sysDb.prepare('INSERT INTO users (name,salt,hash,role_id) VALUES (?,?,?,?)').run(String(name).trim().toUpperCase(), salt, hash, role_id);
    return { id: Number(r.lastInsertRowid) };
  }));
  app.put('/api/users/:id', h((req) => {
    const { role_id } = req.body ?? {};
    const role = sysDb.prepare('SELECT is_super FROM roles WHERE id=?').get(role_id) as { is_super: number } | undefined;
    if (!role) throw new Error('Select a role');
    if (isSuperUser(req.params.id) && !role.is_super && superCount() <= 1) throw new Error('This is the last SuperAdmin — create another SuperAdmin first');
    sysDb.prepare('UPDATE users SET role_id=? WHERE id=?').run(role_id, req.params.id);
    return { ok: true };
  }));
  app.put('/api/users/:id/password', h((req) => {
    const a = authOf(req);
    const { old_password, password } = req.body ?? {};
    const u = sysDb.prepare('SELECT * FROM users WHERE id=?').get(req.params.id) as { salt: string; hash: string } | undefined;
    if (!u) throw new Error('User not found');
    if (!password) throw new Error('New password is required');
    // SuperAdmin can reset anyone's password; others must prove the old one.
    if (!a.isSuper && !checkPassword(String(old_password ?? ''), u.salt, u.hash)) throw new Error('Old password is wrong');
    const { salt, hash } = hashPassword(String(password));
    sysDb.prepare('UPDATE users SET salt=?, hash=? WHERE id=?').run(salt, hash, req.params.id);
    return { ok: true };
  }));
  app.delete('/api/users/:id', h((req) => {
    if (Number(req.params.id) === authOf(req).userId) throw new Error('You cannot delete yourself');
    if (isSuperUser(req.params.id) && superCount() <= 1) throw new Error('This is the last SuperAdmin');
    sysDb.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    return { ok: true };
  }));
}
