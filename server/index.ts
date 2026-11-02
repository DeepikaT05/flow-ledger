import express, { type Request, type Response, type NextFunction } from 'express';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import type { SQLInputValue } from 'node:sqlite';
import { db, sysDb, tx, sysLedger, SYS, dataDir, companyRow, companyDb, currentFy, hashPassword, type Row } from './db.ts';
import { authMiddleware, registerAuthRoutes, maskCost, authOf, can, bindCompany, setSessionCompany, setSessionYear } from './auth.ts';

const app = express();
app.use(express.json());
app.use(express.static(join(process.cwd(), 'public')));
app.use('/api', authMiddleware);   // login + role checks for every API call

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);

type Handler = (req: Request, res: Response) => unknown;
const h = (fn: Handler) => (req: Request, res: Response, next: NextFunction) => {
  try {
    bindCompany(req);   // this request's company file; fn runs synchronously right after
    const out = fn(req, res);
    if (out !== undefined && !res.headersSent) res.json(maskCost(req, out));
  } catch (e) {
    next(e);
  }
};

// ---------------------------------------------------------------- stock
const IN_TYPES = `'PURCHASE','PURCHASE_CHALLAN','SALE_RETURN'`;
const OUT_TYPES = `'SALE','SALE_CHALLAN','COUNTER_SALE','PURCHASE_RETURN'`;
const STOCK_SQL = `
  SELECT i.*, i.opening_stock
    + COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
                WHERE bi.item_id=i.id AND b.type IN (${IN_TYPES})),0)
    - COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills b ON b.id=bi.bill_id
                WHERE bi.item_id=i.id AND b.type IN (${OUT_TYPES})),0) AS stock
  FROM items i`;

// ---------------------------------------------------------------- company / groups
// The open company, with fy_start / fy_end of the year chosen on SELECT TO EXECUTE.
app.get('/api/company', h((req) => {
  const c = db.prepare('SELECT * FROM company WHERE id=1').get() as Row;
  const y = db.prepare('SELECT * FROM company_years WHERE id=?').get(authOf(req).yearId ?? -1) as Row | undefined;
  // COMPANY CREATION's Working Style / Selection decide how batches are taken in bills.
  const det = JSON.parse(String((companyRow(authOf(req).companyId) as { details?: string } | undefined)?.details ?? '{}')) as Record<string, string>;
  const style = det.style_alt || 'Self-Secondary';
  return { ...c, company_id: authOf(req).companyId, working_style: style, business_type: det.business ?? '',
    ...(y ? { fy_start: y.fy_start, fy_end: y.fy_end, year_code: y.code } : {}) };
}));
app.put('/api/company', h((req) => {
  const c = req.body;
  db.prepare('UPDATE company SET name=?,address1=?,address2=?,gstin=?,state=?,email=?,phone=? WHERE id=1')
    .run(c.name, c.address1 ?? '', c.address2 ?? '', c.gstin ?? '', c.state ?? '', c.email ?? '', c.phone ?? '');
  sysDb.prepare('UPDATE companies SET address1=?,address2=?,gstin=?,state=? WHERE id=?')
    .run(c.address1 ?? '', c.address2 ?? '', c.gstin ?? '', c.state ?? '', authOf(req).companyId ?? -1);
  return { ok: true };
}));

// ---------------------------------------------------------------- LIST OF COMPANIES
/** Licence holder shown on the login screen (before anyone has logged in). */
app.get('/api/licence', h(() => {
  const c = sysDb.prepare('SELECT name FROM companies ORDER BY id LIMIT 1').get() as { name: string } | undefined;
  return { user: c?.name ?? '' };
}));
app.get('/api/companies', h(() => (sysDb.prepare('SELECT * FROM companies ORDER BY name').all() as Row[]).map((c) => {
  const { pw_salt: _s, pw_hash: _h, ...det } = JSON.parse(String(c.details ?? '{}')) as Record<string, string>;
  return { ...c, details: JSON.stringify({ ...det, has_password: _h ? '1' : '' }) };
})));
const companyFields = (b: Record<string, unknown>) => {
  const name = String(b.name ?? '').trim().toUpperCase();
  if (!name) throw new Error('Company name is required');
  return [name, String(b.station ?? '').trim().toUpperCase(), String(b.address1 ?? ''), String(b.address2 ?? ''),
    String(b.gstin ?? ''), String(b.state ?? '')];
};
/** COMPANY CREATION's extra fields: a flat object of short strings, merged over what is stored. */
const companyDetails = (b: Record<string, unknown>, old = '{}') => {
  const out: Record<string, string> = JSON.parse(old || '{}');
  const d = b.details;
  if (d && typeof d === 'object') {
    for (const [k, v] of Object.entries(d as Record<string, unknown>).slice(0, 60)) {
      if (k.startsWith('pw_') || k === 'has_password' || !/^[a-z_0-9]{1,30}$/.test(k) || (typeof v !== 'string' && typeof v !== 'number')) continue;
      if (k === 'password') {   // kept only as a hash; blank leaves the old one
        if (String(v)) { const p = hashPassword(String(v)); out.pw_salt = p.salt; out.pw_hash = p.hash; }
        continue;
      }
      out[k] = String(v).slice(0, 200);
    }
  }
  return out;
};
const isDate = (s: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(String(s)));
app.post('/api/companies', h((req) => {
  const f = companyFields(req.body ?? {});
  const det = companyDetails(req.body ?? {});
  let fy = currentFy();
  let fyEnd = `${Number(fy.slice(0, 4)) + 1}-03-31`;
  if (isDate(req.body?.fy_start)) {
    fy = String(req.body.fy_start);
    fyEnd = isDate(req.body?.fy_end) && String(req.body.fy_end) > fy ? String(req.body.fy_end) : `${Number(fy.slice(0, 4)) + 1}-03-31`;
  }
  const file = `companies/c${Date.now().toString(36)}.db`;
  const r = sysDb.prepare('INSERT INTO companies (name,station,address1,address2,gstin,state,file,details) VALUES (?,?,?,?,?,?,?,?)').run(...f, file, JSON.stringify(det));
  const c = companyRow(r.lastInsertRowid)!;
  const d = companyDb(c);   // creates the file: groups, system ledgers, first year
  d.prepare('UPDATE company SET fy_start=?, fy_end=?, email=?, phone=? WHERE id=1').run(fy, fyEnd, det.email ?? '', det.phone ?? '');
  d.prepare("UPDATE company_years SET fy_start=?, fy_end=? WHERE code='A01'").run(fy, fyEnd);
  return { id: c.id };
}));
app.put('/api/companies/:id', h((req) => {
  const c = companyRow(req.params.id);
  if (!c) throw new Error('Company not found');
  const f = companyFields(req.body ?? {});
  const det = companyDetails(req.body ?? {}, (c as { details?: string }).details);
  sysDb.prepare('UPDATE companies SET name=?,station=?,address1=?,address2=?,gstin=?,state=?,details=? WHERE id=?').run(...f, JSON.stringify(det), c.id);
  companyDb(c).prepare('UPDATE company SET name=?,address1=?,address2=?,gstin=?,state=?,email=?,phone=? WHERE id=1')
    .run(f[1] ? `${f[0]}-${f[1]}` : f[0], f[2], f[3], f[4], f[5], det.email ?? '', det.phone ?? '');
  return { ok: true };
}));
/** C — BACKUP OF FINANCIAL YEAR: a full copy of the company file in data/backup/. */
app.post('/api/companies/:id/backup', h((req) => {
  const c = companyRow(req.params.id);
  if (!c) throw new Error('Company not found');
  const d = companyDb(c);
  mkdirSync(join(dataDir, 'backup'), { recursive: true });
  const stamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14);
  const file = `backup/${(c.station || c.name).replace(/[^A-Za-z0-9]+/g, '_')}-${stamp}.db`;
  d.exec(`VACUUM INTO '${join(dataDir, file).replace(/'/g, "''")}'`);
  d.prepare("UPDATE company_years SET backup_upto=date('now','localtime')").run();
  return { file: `data/${file}` };
}));
/** E — NEW FINANCIAL YEAR: adds the year after the latest one. */
app.post('/api/companies/:id/new-year', h((req) => {
  const c = companyRow(req.params.id);
  if (!c) throw new Error('Company not found');
  const d = companyDb(c);
  const last = d.prepare('SELECT fy_end FROM company_years ORDER BY fy_end DESC LIMIT 1').get() as { fy_end: string };
  const y = Number(last.fy_end.slice(0, 4));
  const n = (d.prepare('SELECT COUNT(*) AS n FROM company_years').get() as { n: number }).n;
  const code = `A${String(n + 1).padStart(2, '0')}`;
  d.prepare('INSERT INTO company_years (code,fy_start,fy_end) VALUES (?,?,?)').run(code, `${y}-04-01`, `${y + 1}-03-31`);
  return { code, fy_start: `${y}-04-01`, fy_end: `${y + 1}-03-31` };
}));
/** MARG GATEWAY: open a company for this session. */
app.post('/api/session/company', h((req) => {
  const c = companyRow(req.body?.id);
  if (!c) throw new Error('Company not found');
  companyDb(c);
  setSessionCompany(req, c.id);
  return c;
}));
/** SELECT TO EXECUTE: the financial year to run. */
app.post('/api/session/year', h((req) => {
  if (!authOf(req).companyId) throw new Error('Select a company first');
  const y = db.prepare('SELECT * FROM company_years WHERE id=?').get(req.body?.id) as Row | undefined;
  if (!y) throw new Error('Year not found');
  setSessionYear(req, Number(y.id));
  return y;
}));
const MARG_GROUPS: [string, string][] = [
  ['Sundry Debtors', 'ASSET'],
  ['Sundry Debtors (E-Commerce)', 'ASSET'],
  ['Sundry Debtors (Field Staff)', 'ASSET'],
  ['Sundry Creditors', 'LIABILITY'],
  ['Cash-in-hand', 'ASSET'],
  ['Bank Accounts', 'ASSET'],
  ['Bank O/D Account', 'LIABILITY'],
  ['Sales Accounts', 'INCOME'],
  ['Purchase Accounts', 'EXPENSE'],
  ['Duties & Taxes', 'LIABILITY'],
  ['Tax - CGST', 'LIABILITY'],
  ['Tax - IGST', 'LIABILITY'],
  ['Tax - SGST', 'LIABILITY'],
  ['Direct Expenses', 'EXPENSE'],
  ['Indirect Expenses', 'EXPENSE'],
  ['Direct Incomes', 'INCOME'],
  ['Indirect Incomes', 'INCOME'],
  ['Capital Account', 'LIABILITY'],
  ['Loans (Liability)', 'LIABILITY'],
  ['Secured Loans', 'LIABILITY'],
  ['Unsecured Loans', 'LIABILITY'],
  ['Fixed Assets', 'ASSET'],
  ['Tangible Assets', 'ASSET'],
  ['Current Assets', 'ASSET'],
  ['Current Liabilities', 'LIABILITY'],
  ['Suspense Account (Temporary A/cs)', 'LIABILITY'],
  ['Investments', 'ASSET'],
];

app.get('/api/groups', h(() => {
  const existing = new Set((db.prepare('SELECT name FROM account_groups').all() as any[]).map((r) => String(r.name).toLowerCase()));
  const ins = db.prepare('INSERT INTO account_groups (name,nature,is_system) VALUES (?,?,1)');
  for (const [n, t] of MARG_GROUPS) {
    if (!existing.has(n.toLowerCase())) {
      ins.run(n, t);
    }
  }
  return db.prepare('SELECT * FROM account_groups ORDER BY name').all();
}));
app.post('/api/groups', h((req) => {
  const { name, nature } = req.body;
  const r = db.prepare('INSERT INTO account_groups (name,nature) VALUES (?,?)').run(name, nature);
  return { id: Number(r.lastInsertRowid) };
}));

// ---------------------------------------------------------------- ledgers
const LEDGER_BAL = `
  SELECT l.*, g.name AS group_name, g.nature,
    (CASE WHEN l.opening_type='Dr' THEN l.opening ELSE -l.opening END)
    + COALESCE((SELECT SUM(debit-credit) FROM ledger_entries e WHERE e.ledger_id=l.id),0) AS balance
  FROM ledgers l JOIN account_groups g ON g.id=l.group_id`;

app.get('/api/ledgers', h((req) => {
  const group = req.query.group as string | undefined;
  if (group) {
    const names = group.split(',');
    return db.prepare(`${LEDGER_BAL} WHERE g.name IN (${names.map(() => '?').join(',')}) ORDER BY l.name`).all(...names);
  }
  return db.prepare(`${LEDGER_BAL} ORDER BY l.name`).all();
}));
app.get('/api/ledgers/:id', h((req) => db.prepare(`${LEDGER_BAL} WHERE l.id=?`).get(req.params.id)));

function ledgerDetails(b: Row, old = '{}'): string {
  let base: Record<string, unknown> = {};
  try { base = JSON.parse(old || '{}'); } catch { /* start empty */ }
  if (b.details && typeof b.details === 'object') {
    for (const [k, v] of Object.entries(b.details as Record<string, unknown>).slice(0, 100)) {
      if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') base[k] = v;
    }
  }
  return JSON.stringify(base);
}
function ledgerArgs(b: Row): SQLInputValue[] {
  return [
    String(b.name ?? '').trim(),
    Number(b.group_id) || 1,
    String(b.address ?? ''),
    String(b.city ?? ''),
    String(b.phone ?? ''),
    String(b.gstin ?? ''),
    String(b.state ?? ''),
    num(b.opening),
    b.opening_type === 'Cr' ? 'Cr' : 'Dr',
    num(b.credit_limit),
  ] as SQLInputValue[];
}
app.post('/api/ledgers', h((req) => {
  const name = String(req.body?.name ?? '').trim();
  if (!name) throw new Error('Ledger name is required');
  const r = db.prepare(`INSERT INTO ledgers (name,group_id,address,city,phone,gstin,state,opening,opening_type,credit_limit,details)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(...ledgerArgs(req.body), ledgerDetails(req.body));
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/ledgers/:id', h((req) => {
  const cur = db.prepare('SELECT * FROM ledgers WHERE id=?').get(req.params.id) as Row | undefined;
  if (!cur) throw new Error('Ledger not found');
  const merged: Row = {
    name: req.body.name !== undefined ? req.body.name : cur.name,
    group_id: req.body.group_id !== undefined ? req.body.group_id : cur.group_id,
    address: req.body.address !== undefined ? req.body.address : (cur.address ?? ''),
    city: req.body.city !== undefined ? req.body.city : (cur.city ?? ''),
    phone: req.body.phone !== undefined ? req.body.phone : (cur.phone ?? ''),
    gstin: req.body.gstin !== undefined ? req.body.gstin : (cur.gstin ?? ''),
    state: req.body.state !== undefined ? req.body.state : (cur.state ?? ''),
    opening: req.body.opening !== undefined ? req.body.opening : (cur.opening ?? 0),
    opening_type: req.body.opening_type !== undefined ? req.body.opening_type : (cur.opening_type ?? 'Dr'),
    credit_limit: req.body.credit_limit !== undefined ? req.body.credit_limit : (cur.credit_limit ?? 0),
  };
  const details = ledgerDetails(req.body, (cur.details as string) || '{}');
  db.prepare(`UPDATE ledgers SET name=?,group_id=?,address=?,city=?,phone=?,gstin=?,state=?,opening=?,opening_type=?,credit_limit=?,details=?
    WHERE id=?`).run(...ledgerArgs(merged), details, req.params.id);
  return { ok: true };
}));
app.delete('/api/ledgers/:id', h((req) => {
  const l = db.prepare('SELECT is_system FROM ledgers WHERE id=?').get(req.params.id) as { is_system: number } | undefined;
  if (l?.is_system) throw new Error('System ledger cannot be deleted');
  const used = db.prepare('SELECT 1 FROM ledger_entries WHERE ledger_id=? UNION SELECT 1 FROM bills WHERE party_id=? LIMIT 1')
    .get(req.params.id, req.params.id);
  if (used) throw new Error('Ledger has transactions, cannot delete');
  db.prepare('DELETE FROM ledgers WHERE id=?').run(req.params.id);
  return { ok: true };
}));

// ---------------------------------------------------------------- items
app.get('/api/items', h(() => db.prepare(`${STOCK_SQL} ORDER BY i.name`).all()));
// ITEM REGISTER (Current Stock → Enter): opening, every bill in the period with RECEIVE /
// ISSUE / running BALANCE, and the Opening / Sales-S/R / Purchase-P/R / Other / Balance box.
// Cost-based values sit under "value" so roles without the cost power get them masked.
app.get('/api/items/:id/stock-register', h((req) => {
  const { from = '0000-01-01', to = '9999-12-31' } = req.query as Record<string, string>;
  const item = db.prepare(`${STOCK_SQL} WHERE i.id=?`).get(req.params.id) as Row & { opening_stock: number; purchase_rate: number };
  if (!item) throw new Error('Item not found');
  const move = (where: string, ...args: SQLInputValue[]) => (db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN b.type IN (${IN_TYPES}) THEN bi.qty+bi.free ELSE 0 END),0) -
      COALESCE(SUM(CASE WHEN b.type IN (${OUT_TYPES}) THEN bi.qty+bi.free ELSE 0 END),0) AS q
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id WHERE bi.item_id=? ${where}`).get(req.params.id, ...args) as { q: number }).q;
  const openQty = r2(item.opening_stock + move('AND b.date < ?', from));
  const rows = (db.prepare(`SELECT b.id AS bill_id, b.type, b.no, b.date, COALESCE(NULLIF(b.walkin_name,''), '') AS walkin, l.name AS party,
      bi.batch, bi.expiry, bi.qty, bi.free, bi.rate, bi.disc_pct, bi.mrp, bi.amount,
      CASE WHEN b.type IN (${IN_TYPES}) THEN bi.qty+bi.free ELSE 0 END AS receive,
      CASE WHEN b.type IN (${OUT_TYPES}) THEN bi.qty+bi.free ELSE 0 END AS issue
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN ledgers l ON l.id=b.party_id
    WHERE bi.item_id=? AND b.date BETWEEN ? AND ? ORDER BY b.date, b.id`).all(req.params.id, from, to) as Row[]);
  let bal = openQty;
  const out = rows.map((r: any) => ({ ...r, balance: (bal = r2(bal + r.receive - r.issue)) }));
  const sum = (types: string[], key: 'qty' | 'amount', sign: (t: string) => number) =>
    r2(rows.filter((r: any) => types.includes(r.type)).reduce((s, r: any) => s + sign(r.type) * (key === 'qty' ? r.qty + r.free : r.amount), 0));
  const saleT = ['SALE', 'COUNTER_SALE', 'SALE_RETURN'], purT = ['PURCHASE', 'PURCHASE_RETURN'], otherT = ['SALE_CHALLAN', 'PURCHASE_CHALLAN'];
  const sgn = (t: string) => (t.endsWith('RETURN') ? -1 : 1);
  const cost = item.purchase_rate;
  return {
    item, from, to, rows: out,
    summary: {
      opening: { qty: openQty, value: r2(openQty * cost) },
      sales: { qty: sum(saleT, 'qty', sgn), amount: sum(saleT, 'amount', sgn) },
      purchase: { qty: sum(purT, 'qty', sgn), amount: sum(purT, 'amount', sgn) },
      other: { qty: r2(rows.filter((r: any) => otherT.includes(r.type)).reduce((s, r: any) => s + r.receive - r.issue, 0)) },
      balance: { qty: bal, value: r2(bal * cost) },
    },
  };
}));
app.get('/api/items/:id', h((req) => db.prepare(`${STOCK_SQL} WHERE i.id=?`).get(req.params.id)));
function itemArgs(b: Row): SQLInputValue[] {
  return [String(b.name ?? '').trim(), b.company ?? '', b.unit || 'PCS', String(b.pack ?? '').trim(), b.hsn ?? '', num(b.gst_rate), num(b.mrp),
    num(b.sale_rate), num(b.purchase_rate), num(b.opening_stock), num(b.min_stock), num(b.reorder_qty), String(b.expiry ?? ''), String(b.batch ?? '').toUpperCase()] as SQLInputValue[];
}
/** NEW PRODUCT's extra fields: short strings merged over the stored ones. */
function itemDetails(b: Row, old = '{}'): string {
  const out: Record<string, string> = JSON.parse(old || '{}');
  if (b.details && typeof b.details === 'object') {
    for (const [k, v] of Object.entries(b.details as Record<string, unknown>).slice(0, 80)) {
      if (/^[a-z_0-9]{1,30}$/.test(k) && (typeof v === 'string' || typeof v === 'number')) out[k] = String(v).slice(0, 200);
    }
  }
  return JSON.stringify(out);
}
/** Same NAME + PACKING as another product → say which one, instead of the generic duplicate message. */
function checkItemUnique(b: Row, id?: unknown) {
  const name = String(b.name ?? '').trim();
  if (!name) throw new Error('Enter the Product name');
  const pack = String(b.pack ?? '').trim();
  const dup = db.prepare('SELECT name, pack FROM items WHERE name=? COLLATE NOCASE AND pack=? COLLATE NOCASE AND id<>?').get(name, pack, Number(id ?? 0)) as Row | undefined;
  if (dup) throw new Error(`Product "${dup.name}${dup.pack ? ` ${dup.pack}` : ''}" already exists — change the Product name or Packing`);
}
app.post('/api/items', h((req) => {
  checkItemUnique(req.body ?? {});
  const r = db.prepare(`INSERT INTO items (name,company,unit,pack,hsn,gst_rate,mrp,sale_rate,purchase_rate,opening_stock,min_stock,reorder_qty,expiry,batch,details)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...itemArgs(req.body), itemDetails(req.body));
  const itemId = Number(r.lastInsertRowid);
  const openQty = num(req.body?.opening_stock);
  const exp = String(req.body?.expiry ?? '');
  const bat = String(req.body?.batch ?? '').toUpperCase();
  if (openQty > 0 || exp || bat) {
    db.prepare(`INSERT INTO batches (item_id,batch,expiry,mrp,rate,f_rate,purchase_rate,opening_qty,supplier)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        itemId,
        bat || 'OPENING',
        exp,
        num(req.body?.mrp),
        num(req.body?.sale_rate),
        num(req.body?.sale_rate),
        num(req.body?.purchase_rate),
        openQty,
        'OPENING BALANCE'
      );
  }
  return { id: itemId };
}));
app.put('/api/items/:id', h((req) => {
  const body = { ...req.body };
  checkItemUnique(body, req.params.id);
  // The form showed a masked purchase rate to this role — keep the stored one.
  if (!can(authOf(req), 'feature.view_cost')) {
    body.purchase_rate = (db.prepare('SELECT purchase_rate FROM items WHERE id=?').get(req.params.id) as { purchase_rate: number } | undefined)?.purchase_rate ?? 0;
  }
  const old = (db.prepare('SELECT details FROM items WHERE id=?').get(req.params.id) as { details: string } | undefined)?.details;
  db.prepare(`UPDATE items SET name=?,company=?,unit=?,pack=?,hsn=?,gst_rate=?,mrp=?,sale_rate=?,purchase_rate=?,
    opening_stock=?,min_stock=?,reorder_qty=?,expiry=?,batch=?,details=? WHERE id=?`).run(...itemArgs(body), itemDetails(body, old), req.params.id);

  const itemId = Number(req.params.id);
  const exp = String(body.expiry ?? '');
  const bat = String(body.batch ?? '').toUpperCase();
  const openQty = num(body.opening_stock);
  const existingBatch = db.prepare('SELECT id, opening_qty FROM batches WHERE item_id=? ORDER BY id ASC LIMIT 1').get(itemId) as { id: number; opening_qty: number } | undefined;
  if (existingBatch) {
    if (exp || bat || openQty > 0) {
      db.prepare('UPDATE batches SET batch=COALESCE(NULLIF(?,\'\'), batch), expiry=?, mrp=?, rate=?, f_rate=?, purchase_rate=?, opening_qty=? WHERE id=?')
        .run(bat, exp, num(body.mrp), num(body.sale_rate), num(body.sale_rate), num(body.purchase_rate), openQty || existingBatch.opening_qty, existingBatch.id);
    }
  } else if (openQty > 0 || exp || bat) {
    db.prepare(`INSERT INTO batches (item_id,batch,expiry,mrp,rate,f_rate,purchase_rate,opening_qty,supplier)
      VALUES (?,?,?,?,?,?,?,?,?)`).run(
        itemId,
        bat || 'OPENING',
        exp,
        num(body.mrp),
        num(body.sale_rate),
        num(body.sale_rate),
        num(body.purchase_rate),
        openQty,
        'OPENING BALANCE'
      );
  }
  return { ok: true };
}));
// PRICE LIST (Masters → Rate & Discount Master → Price List): change only an item's rates.
// `batches` also rewrites the rates of its batches, since billing picks the batch's rate.
app.put('/api/items/:id/rates', h((req) => tx(() => {
  const b = req.body ?? {};
  const it = db.prepare('SELECT purchase_rate FROM items WHERE id=?').get(req.params.id) as { purchase_rate: number } | undefined;
  if (!it) throw new Error('Item not found');
  // A role that saw the purchase rate masked keeps the stored one.
  const pr = can(authOf(req), 'feature.view_cost') && b.purchase_rate != null ? num(b.purchase_rate) : it.purchase_rate;
  db.prepare('UPDATE items SET mrp=?, sale_rate=?, purchase_rate=? WHERE id=?').run(num(b.mrp), num(b.sale_rate), pr, req.params.id);
  // Billing reads the batch's rate on the same basis as the item's Rate-A, so they stay in step.
  const n = b.batches ? db.prepare('UPDATE batches SET mrp=?, rate=?, purchase_rate=? WHERE item_id=?').run(num(b.mrp), num(b.sale_rate), pr, req.params.id).changes : 0;
  return { ok: true, batches: Number(n) };
})));
app.delete('/api/items/:id', h((req) => {
  if (db.prepare('SELECT 1 FROM bill_items WHERE item_id=? LIMIT 1').get(req.params.id)) throw new Error('Item has transactions, cannot delete');
  db.prepare('DELETE FROM items WHERE id=?').run(req.params.id);
  return { ok: true };
}));
app.get('/api/items/:id/register', h((req) => db.prepare(`
  SELECT b.date, b.type, b.no, l.name AS party, bi.qty, bi.free, bi.rate, bi.amount, bi.batch
  FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN ledgers l ON l.id=b.party_id
  WHERE bi.item_id=? ORDER BY b.date, b.id`).all(req.params.id)));

// ---------------------------------------------------------------- bills
const BILL_PREFIX: Record<string, string> = {
  SALE: 'A', PURCHASE: 'P', SALE_CHALLAN: 'SC', PURCHASE_CHALLAN: 'CP',
  SALE_RETURN: 'CN', PURCHASE_RETURN: 'PR', COUNTER_SALE: 'CS',   // sale return = credit note, CN… as in MARG
};
function nextNo(table: 'bills' | 'vouchers', type: string, prefix: string) {
  const r = db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE type=?`).get(type) as { c: number };
  let n = r.c + 1;
  while (db.prepare(`SELECT 1 FROM ${table} WHERE type=? AND no=?`).get(type, `${prefix}${String(n).padStart(6, '0')}`)) n++;
  return `${prefix}${String(n).padStart(6, '0')}`;
}
app.get('/api/bills/next-no', h((req) => {
  const type = String(req.query.type);
  return { no: nextNo('bills', type, BILL_PREFIX[type] ?? 'X') };
}));
app.get('/api/bills', h((req) => {
  const { type, from, to, party } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const args: string[] = [];
  if (type) { const t = type.split(','); where.push(`b.type IN (${t.map(() => '?').join(',')})`); args.push(...t); }
  if (from) { where.push('b.date >= ?'); args.push(from); }
  if (to) { where.push('b.date <= ?'); args.push(to); }
  if (party) { where.push('b.party_id = ?'); args.push(party); }
  return db.prepare(`SELECT b.*, l.name AS party FROM bills b JOIN ledgers l ON l.id=b.party_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.date DESC, b.id DESC`).all(...args);
}));
app.get('/api/bills/:id', h((req) => {
  const bill = db.prepare('SELECT b.*, l.name AS party FROM bills b JOIN ledgers l ON l.id=b.party_id WHERE b.id=?').get(req.params.id);
  if (!bill) throw new Error('Bill not found');
  const lines = db.prepare(`SELECT bi.*, i.name AS item_name, i.unit, i.pack, i.hsn, i.gst_rate AS item_gst FROM bill_items bi JOIN items i ON i.id=bi.item_id
    WHERE bill_id=? ORDER BY bi.id`).all(req.params.id) as any[];
  for (const l of lines) {
    if ((!l.gst_rate || Number(l.gst_rate) === 0) && l.item_gst) l.gst_rate = l.item_gst;
    if ((!l.tax || Number(l.tax) === 0) && l.gst_rate) {
      const taxable = Number(l.taxable) || (Number(l.qty) * Number(l.rate));
      l.tax = Math.round(taxable * Number(l.gst_rate) / 100 * 100) / 100;
    }
  }
  const payments = db.prepare(`SELECT bp.*, l.name AS ledger FROM bill_payments bp JOIN ledgers l ON l.id=bp.ledger_id
    WHERE bill_id=? ORDER BY bp.id`).all(req.params.id);
  // Money received against the bill so far: paid on the bill + receipts adjusted to it (BILL LEVIES).
  const adjusted = (db.prepare('SELECT COALESCE(SUM(amount),0) AS s FROM voucher_adjustments WHERE bill_id=?').get(req.params.id) as { s: number }).s;
  const returned = (db.prepare("SELECT COALESCE(SUM(net),0) AS s FROM bills WHERE type='SALE_RETURN' AND against_bill_id=?").get(req.params.id) as { s: number }).s;
  const received = r2((payments as { amount: number }[]).reduce((s, p) => s + p.amount, 0) + adjusted + returned);
  return { ...bill, lines, payments, received };
}));

interface BillLineIn { item_id: number; batch_id?: number; batch?: string; expiry?: string; qty: number; free?: number; rate: number; disc_pct?: number; gst_rate?: number; mrp?: number }
interface PaymentIn { ledger_id: number; amount: number; remark?: string; detail?: string }
interface BillIn {
  type: string; no?: string; date: string; party_id: number; mode?: string; narration?: string; lines: BillLineIn[];
  ref_no?: string; ref_date?: string; reason?: string; against_bill_id?: number | null; calc_type?: string;
  mr_id?: number; sale_type?: string; walkin_name?: string; walkin_gstin?: string; walkin_mobile?: string; walkin_address?: string;
  payments?: PaymentIn[];
  cd_pct?: number; cd_amt?: number; freight?: number; other_charges?: number; round_off?: number;
}

function computeBill(b: BillIn) {
  const lines = b.lines.filter((l) => l.item_id && num(l.qty) + num(l.free) > 0).map((l) => {
    let gst = num(l.gst_rate);
    if (!gst) {
      const it = db.prepare('SELECT gst_rate FROM items WHERE id=?').get(l.item_id) as { gst_rate: number } | undefined;
      if (it?.gst_rate) gst = num(it.gst_rate);
    }
    const qty = num(l.qty), rate = num(l.rate), disc = num(l.disc_pct);
    const gross = r2(qty * rate);
    const taxable = r2(gross * (1 - disc / 100));
    const tax = r2(taxable * gst / 100);
    return { ...l, qty, free: num(l.free), rate, disc_pct: disc, gst_rate: gst, gross, taxable, tax, amount: r2(taxable + tax) };
  });
  if (!lines.length) throw new Error('Bill has no items');
  const gross = r2(lines.reduce((s, l) => s + l.gross, 0));
  const taxable = r2(lines.reduce((s, l) => s + l.taxable, 0));
  const tax = r2(lines.reduce((s, l) => s + l.tax, 0));
  const cd_pct = num(b.cd_pct);
  let cd_amt = num(b.cd_amt);
  if (cd_pct > 0 && !cd_amt) {
    cd_amt = r2(taxable * (cd_pct / 100));
  }
  const freight = num(b.freight);
  const other_charges = num(b.other_charges);
  const subtotal = r2(taxable + tax - cd_amt + freight + other_charges);
  const round_off = b.round_off != null && b.round_off !== undefined ? r2(num(b.round_off)) : r2(Math.round(subtotal) - subtotal);
  const net = r2(subtotal + round_off);
  return { lines, gross, discount: r2(gross - taxable), taxable, tax, cd_pct, cd_amt, freight, other_charges, round_off, net };
}

function postBill(id: number) {
  const b = db.prepare('SELECT * FROM bills WHERE id=?').get(id) as Row & {
    type: string; mode: string; party_id: number; date: string; no: string;
    taxable: number; tax: number; net: number; round_off: number; narration: string;
    cd_amt?: number; freight?: number; other_charges?: number;
  };
  db.prepare("DELETE FROM ledger_entries WHERE source='BILL' AND source_id=?").run(id);
  if (b.type.includes('CHALLAN')) return; // challans move stock only
  const party = b.mode === 'CASH' || b.type === 'COUNTER_SALE' ? sysLedger(SYS.CASH) : b.party_id;
  const halfA = r2(b.tax / 2), halfB = r2(b.tax - halfA);
  const isSale = b.type === 'SALE' || b.type === 'COUNTER_SALE' || b.type === 'SALE_RETURN';
  const isReturn = b.type.endsWith('RETURN');
  // Sale: party Dr / income Cr. Purchase: expense Dr / party Cr. Returns flip the sides.
  const partyDr = isSale !== isReturn;
  const main = isSale ? (isReturn ? SYS.SALE_RET : SYS.SALES) : (isReturn ? SYS.PUR_RET : SYS.PURCHASE);
  const [cg, sg] = isSale ? [SYS.CGST_OUT, SYS.SGST_OUT] : [SYS.CGST_IN, SYS.SGST_IN];
  const ins = db.prepare(`INSERT INTO ledger_entries (source,source_id,date,ledger_id,debit,credit,vtype,vno,narration)
    VALUES ('BILL',?,?,?,?,?,?,?,?)`);
  const put = (ledger: number, amt: number, dr: boolean) => {
    if (Math.abs(amt) < 0.005) return;
    if (amt < 0) { amt = -amt; dr = !dr; }
    ins.run(id, b.date, ledger, dr ? amt : 0, dr ? 0 : amt, b.type, b.no, b.narration ?? '');
  };
  // Cash / UPI / bank collected on the bill hits those ledgers; only the rest sits on the party.
  const pays = db.prepare('SELECT ledger_id, amount FROM bill_payments WHERE bill_id=?').all(id) as { ledger_id: number; amount: number }[];
  const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
  for (const p of pays) put(p.ledger_id, p.amount, partyDr);
  put(party, r2(b.net - paid), partyDr);
  put(sysLedger(main), b.taxable, !partyDr);
  put(sysLedger(cg), halfA, !partyDr);
  put(sysLedger(sg), halfB, !partyDr);
  if (b.cd_amt) {
    let cdId = (db.prepare("SELECT id FROM ledgers WHERE name LIKE 'Cash Discount%'").get() as { id: number } | undefined)?.id;
    if (!cdId) {
      const gid = (db.prepare("SELECT id FROM account_groups WHERE name='Indirect Expenses'").get() as { id: number } | undefined)?.id;
      if (gid) cdId = Number(db.prepare("INSERT INTO ledgers (name, group_id, is_system) VALUES ('Cash Discount', ?, 1)").run(gid).lastInsertRowid);
    }
    if (cdId) put(cdId, b.cd_amt, partyDr);
  }
  if (b.freight) {
    let frId = (db.prepare("SELECT id FROM ledgers WHERE name LIKE 'Freight%'").get() as { id: number } | undefined)?.id;
    if (!frId) {
      const gid = (db.prepare("SELECT id FROM account_groups WHERE name='Direct Expenses' OR name='Indirect Incomes'").get() as { id: number } | undefined)?.id;
      if (gid) frId = Number(db.prepare("INSERT INTO ledgers (name, group_id, is_system) VALUES ('Freight & Transport', ?, 1)").run(gid).lastInsertRowid);
    }
    if (frId) put(frId, b.freight, !partyDr);
  }
  if (b.other_charges) {
    let ocId = (db.prepare("SELECT id FROM ledgers WHERE name LIKE 'Other Charges%'").get() as { id: number } | undefined)?.id;
    if (!ocId) {
      const gid = (db.prepare("SELECT id FROM account_groups WHERE name='Indirect Incomes' OR name='Direct Incomes'").get() as { id: number } | undefined)?.id;
      if (gid) ocId = Number(db.prepare("INSERT INTO ledgers (name, group_id, is_system) VALUES ('Other Charges', ?, 1)").run(gid).lastInsertRowid);
    }
    if (ocId) put(ocId, b.other_charges, !partyDr);
  }
  put(sysLedger(SYS.ROUND), b.round_off, !partyDr);
}

function saveBill(body: BillIn, id?: number) {
  if (!BILL_PREFIX[body.type]) throw new Error('Invalid bill type');
  if (!body.party_id) throw new Error('Select party');
  if (body.type === 'SALE_RETURN' && !String(body.reason ?? '').trim()) throw new Error('Reason for the sale return is required');
  const c = computeBill(body);
  return tx(() => {
    const no = body.no?.trim() || nextNo('bills', body.type, BILL_PREFIX[body.type]);
    const args = [body.type, no, body.date, body.party_id, body.mode === 'CASH' ? 'CASH' : 'CREDIT',
      c.gross, c.discount, c.taxable, c.tax, c.cd_pct, c.cd_amt, c.freight, c.other_charges, c.round_off, c.net, body.narration ?? '',
      body.mr_id ?? null, body.sale_type === 'CENTRAL' ? 'CENTRAL' : 'LOCAL',
      body.walkin_name ?? '', body.walkin_gstin ?? '', body.walkin_mobile ?? '', body.walkin_address ?? '',
      body.ref_no ?? '', body.ref_date ?? '', body.reason ?? '', body.against_bill_id || null, body.calc_type ?? ''] as SQLInputValue[];
    let billId = id;
    if (billId) {
      db.prepare(`UPDATE bills SET type=?,no=?,date=?,party_id=?,mode=?,gross=?,discount=?,taxable=?,tax=?,cd_pct=?,cd_amt=?,freight=?,other_charges=?,round_off=?,net=?,narration=?,
        mr_id=?,sale_type=?,walkin_name=?,walkin_gstin=?,walkin_mobile=?,walkin_address=?,ref_no=?,ref_date=?,reason=?,against_bill_id=?,calc_type=?
        WHERE id=?`).run(...args, billId);
      db.prepare('DELETE FROM bill_items WHERE bill_id=?').run(billId);
      db.prepare('DELETE FROM bill_payments WHERE bill_id=?').run(billId);
    } else {
      billId = Number(db.prepare(`INSERT INTO bills (type,no,date,party_id,mode,gross,discount,taxable,tax,cd_pct,cd_amt,freight,other_charges,round_off,net,narration,
        mr_id,sale_type,walkin_name,walkin_gstin,walkin_mobile,walkin_address,ref_no,ref_date,reason,against_bill_id,calc_type)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(...args).lastInsertRowid);
    }
    const insL = db.prepare(`INSERT INTO bill_items (bill_id,item_id,batch_id,batch,expiry,qty,free,rate,disc_pct,gst_rate,mrp,taxable,tax,amount)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    // Purchase / purchase challan / sale return: a batch typed on the bill becomes a batch of the item
    // (the same batch + M.R.P. is reused), so it shows in the BATCH window at sale time.
    if (IN_TYPES.includes(`'${body.type}'`)) {
      const supplier = (db.prepare('SELECT name FROM ledgers WHERE id=?').get(body.party_id) as { name: string } | undefined)?.name ?? '';
      const findB = db.prepare('SELECT id FROM batches WHERE item_id=? AND batch=? COLLATE NOCASE AND ABS(mrp-?)<0.005');
      const findBByName = db.prepare('SELECT id FROM batches WHERE item_id=? AND batch=? COLLATE NOCASE');
      const insB = db.prepare(`INSERT INTO batches (item_id,batch,expiry,mrp,rate,f_rate,purchase_rate,opening_qty,supplier,invoice_no,invoice_date)
        VALUES (?,?,?,?,?,?,?,0,?,?,?)`);
      for (const l of c.lines) {
        const batch = String(l.batch ?? '').trim().toUpperCase();
        if (!batch) continue;

        // Verify if provided batch_id actually matches the line's batch name
        if (l.batch_id) {
          const ex = db.prepare('SELECT id, batch FROM batches WHERE id=?').get(l.batch_id) as { id: number; batch: string } | undefined;
          if (!ex || ex.batch.trim().toUpperCase() !== batch) {
            // User modified or entered a new batch name! Clear batch_id so it doesn't get assigned to old batch
            l.batch_id = undefined;
          }
        }

        if (!l.batch_id) {
          const found = (num(l.mrp) > 0 ? findB.get(l.item_id, batch, num(l.mrp)) : findBByName.get(l.item_id, batch)) as { id: number } | undefined;
          if (found) {
            l.batch_id = found.id;
          } else {
            const it = db.prepare('SELECT sale_rate, purchase_rate FROM items WHERE id=?').get(l.item_id) as { sale_rate: number; purchase_rate: number } | undefined;
            const sale = num(it?.sale_rate);
            const pRate = body.type === 'SALE_RETURN' ? 0 : (l.rate || num(it?.purchase_rate));
            l.batch_id = Number(insB.run(l.item_id, batch, l.expiry ?? '', num(l.mrp), sale, sale, pRate,
              supplier, body.type === 'SALE_RETURN' ? '' : (body.ref_no || no), body.date).lastInsertRowid);
          }
        }

        // Update expiry and latest purchase details
        if (l.batch_id) {
          if (l.expiry) {
            db.prepare("UPDATE batches SET expiry=? WHERE id=? AND (expiry IS NULL OR expiry='' OR expiry!=?)").run(l.expiry, l.batch_id, l.expiry);
          }
          if (body.type === 'PURCHASE') {
            db.prepare("UPDATE batches SET purchase_rate=?, invoice_no=?, invoice_date=?, supplier=? WHERE id=?").run(l.rate, body.ref_no || no, body.date, supplier, l.batch_id);
          }
        }
      }
    }
    for (const l of c.lines) {
      insL.run(billId, l.item_id, l.batch_id ?? null, l.batch ?? '', l.expiry ?? '', l.qty, l.free, l.rate, l.disc_pct, l.gst_rate, num(l.mrp), l.taxable, l.tax, l.amount);
    }
    const insP = db.prepare('INSERT INTO bill_payments (bill_id,ledger_id,amount,remark,detail) VALUES (?,?,?,?,?)');
    for (const p of body.payments ?? []) {
      if (p.ledger_id && num(p.amount)) insP.run(billId, p.ledger_id, r2(num(p.amount)), p.remark ?? '', p.detail ?? '');
    }
    postBill(billId);
    return { id: billId, no, net: c.net };
  });
}
app.post('/api/bills', h((req) => saveBill(req.body)));
app.put('/api/bills/:id', h((req) => saveBill(req.body, Number(req.params.id))));
app.delete('/api/bills/:id', h((req) => tx(() => {
  db.prepare("DELETE FROM ledger_entries WHERE source='BILL' AND source_id=?").run(req.params.id);
  db.prepare('DELETE FROM bills WHERE id=?').run(req.params.id);
  return { ok: true };
})));

// ---------------------------------------------------------------- users, roles, login (see auth.ts)
registerAuthRoutes(app, h);

// ---------------------------------------------------------------- salesmen (M.R.) / batches / payment modes
app.get('/api/salesmen', h(() => db.prepare('SELECT * FROM salesmen ORDER BY name').all()));
app.post('/api/salesmen', h((req) => {
  const r = db.prepare('INSERT INTO salesmen (name,area) VALUES (?,?)').run(String(req.body.name).toUpperCase(), req.body.area ?? '');
  return { id: Number(r.lastInsertRowid) };
}));

const BATCH_STOCK = `
  SELECT b.id, b.item_id, b.batch, b.expiry, b.mrp, b.rate, b.f_rate, b.purchase_rate,
    b.opening_qty, b.supplier, b.invoice_no, b.invoice_date,
    i.name AS item_name, i.unit, i.pack, i.gst_rate, i.company, i.hsn,
    b.opening_qty
    + COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE bi.batch_id=b.id AND bl.type IN (${IN_TYPES})),0)
    - COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE bi.batch_id=b.id AND bl.type IN (${OUT_TYPES})),0) AS stock
  FROM batches b JOIN items i ON i.id=b.item_id
  UNION ALL
  SELECT 0 AS id, i.id AS item_id, COALESCE(NULLIF(i.batch,''), 'OPENING') AS batch,
    i.expiry, i.mrp, i.sale_rate AS rate, i.sale_rate AS f_rate, i.purchase_rate,
    i.opening_stock AS opening_qty, 'OPENING BALANCE' AS supplier, '' AS invoice_no, '' AS invoice_date,
    i.name AS item_name, i.unit, i.pack, i.gst_rate, i.company, i.hsn,
    i.opening_stock
    + COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE bi.item_id=i.id AND (bi.batch_id IS NULL OR bi.batch_id=0) AND bl.type IN (${IN_TYPES})),0)
    - COALESCE((SELECT SUM(bi.qty+bi.free) FROM bill_items bi JOIN bills bl ON bl.id=bi.bill_id
                WHERE bi.item_id=i.id AND (bi.batch_id IS NULL OR bi.batch_id=0) AND bl.type IN (${OUT_TYPES})),0) AS stock
  FROM items i
  WHERE NOT EXISTS (SELECT 1 FROM batches b WHERE b.item_id=i.id)`;
app.get('/api/items/:id/batches', h((req) => db.prepare(`SELECT * FROM (${BATCH_STOCK}) bs WHERE bs.item_id=? ORDER BY bs.expiry, bs.batch`).all(req.params.id)));
app.post('/api/items/:id/batches', h((req) => {
  const b = req.body;
  const r = db.prepare(`INSERT INTO batches (item_id,batch,expiry,mrp,rate,f_rate,purchase_rate,opening_qty,supplier,invoice_no,invoice_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.params.id, String(b.batch ?? '').toUpperCase(), b.expiry ?? '', num(b.mrp), num(b.rate),
    num(b.f_rate) || num(b.rate), num(b.purchase_rate), num(b.opening_qty), b.supplier ?? '', b.invoice_no ?? '', b.invoice_date ?? '');
  return { id: Number(r.lastInsertRowid) };
}));
app.put('/api/batches/:id', h((req) => {
  const b = req.body;
  const cur = db.prepare('SELECT * FROM batches WHERE id=?').get(Number(req.params.id)) as Row | undefined;
  if (!cur) throw new Error('Batch not found');
  const batchNo = String(b.batch !== undefined ? b.batch : (cur.batch ?? '')).toUpperCase();
  const exp = String(b.expiry !== undefined ? b.expiry : (cur.expiry ?? ''));
  const mrp = b.mrp !== undefined ? num(b.mrp) : num(cur.mrp);
  const rate = b.rate !== undefined ? num(b.rate) : num(cur.rate);
  const fRate = b.f_rate !== undefined ? num(b.f_rate) : num(cur.f_rate ?? cur.rate);
  const pRate = b.purchase_rate !== undefined ? num(b.purchase_rate) : num(cur.purchase_rate);
  const openQty = b.opening_qty !== undefined ? num(b.opening_qty) : num(cur.opening_qty);
  db.prepare(`UPDATE batches SET batch=?, expiry=?, mrp=?, rate=?, f_rate=?, purchase_rate=?, opening_qty=? WHERE id=?`)
    .run(batchNo, exp, mrp, rate, fRate, pRate, openQty, Number(req.params.id));
  return { ok: true };
}));
app.get('/api/payment-modes', h(() => db.prepare(`SELECT * FROM (${LEDGER_BAL}) WHERE group_name IN ('Cash-in-hand','Bank Accounts') ORDER BY
  CASE WHEN name='Cash' THEN 0 ELSE 1 END, name`).all()));
app.get('/api/years', h(() => db.prepare('SELECT * FROM company_years ORDER BY code DESC').all()));

// ---------------------------------------------------------------- party pending bills / CUSTOMER STATUS (receipt entry)
const daysSince = (d: string) => Math.max(0, Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d)) / 864e5));
/**
 * Credit bills of a party still not fully settled. kind SALE = sale bills (receipt / credit note),
 * PURCHASE = purchase bills (payment / debit note). `exclude` = the voucher being modified.
 */
function pendingBills(partyId: number, exclude = 0, kind: 'SALE' | 'PURCHASE' = 'SALE') {
  const ret = kind === 'PURCHASE' ? 'PURCHASE_RETURN' : 'SALE_RETURN';
  const fy = (db.prepare('SELECT fy_start FROM company WHERE id=1').get() as { fy_start: string } | undefined)?.fy_start ?? '';
  const rows = db.prepare(`SELECT b.id, b.no, b.date, b.net,
      b.net - COALESCE((SELECT SUM(amount) FROM bill_payments WHERE bill_id=b.id),0)
            - COALESCE((SELECT SUM(amount) FROM voucher_adjustments WHERE bill_id=b.id AND voucher_id<>?),0)
            - COALESCE((SELECT SUM(r.net) FROM bills r WHERE r.type=? AND r.against_bill_id=b.id),0) AS balance
    FROM bills b WHERE b.party_id=? AND b.type=? AND b.mode<>'CASH' ORDER BY b.date, b.id`).all(exclude, ret, partyId, kind) as
    { id: number; no: string; date: string; net: number; balance: number }[];
  // MARG marks bills from an earlier financial year with "*".
  return rows.filter((r) => r.balance > 0.004).map((r) => ({ ...r, balance: r2(r.balance), ref: `${r.date < fy ? '*' : ''}${r.no}`, days: daysSince(r.date) }));
}
// SALE RETURN "Select From Sold": the items and batches this party has bought.
app.get('/api/ledgers/:id/sold-items', h((req) => db.prepare(`SELECT bi.item_id, i.name, i.pack, i.unit, i.gst_rate, bi.batch_id, bi.batch, bi.expiry,
    MAX(bi.mrp) AS mrp, MAX(bi.rate) AS rate, SUM(bi.qty+bi.free) AS qty, MAX(b.date) AS last_date, MAX(b.no) AS last_no
  FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN items i ON i.id=bi.item_id
  WHERE b.party_id=? AND b.type IN ('SALE','COUNTER_SALE') GROUP BY bi.item_id, bi.batch ORDER BY i.name`).all(req.params.id)));
const billKind = (k: unknown) => (k === 'PURCHASE' ? 'PURCHASE' : 'SALE');
app.get('/api/ledgers/:id/pending-bills', h((req) => pendingBills(Number(req.params.id), Number(req.query.exclude) || 0, billKind(req.query.kind))));
// CUSTOMER STATUS (kind SALE: last sale / receipts) or SUPPLIER STATUS (kind PURCHASE: last purchase / payments).
app.get('/api/ledgers/:id/status', h((req) => {
  const id = Number(req.params.id);
  const l = db.prepare(`${LEDGER_BAL} WHERE l.id=?`).get(id) as Row & { balance: number; group_name: string };
  if (!l) throw new Error('Ledger not found');
  const isSupplier = req.query.kind ? req.query.kind === 'PURCHASE' : (l.group_name === 'Sundry Creditors');
  const kind = isSupplier ? 'PURCHASE' : 'SALE';
  const bills = pendingBills(id, 0, kind);
  const pur = isSupplier;
  const lastSale = db.prepare(`SELECT net, date FROM bills WHERE party_id=? AND type IN (${pur ? `'PURCHASE'` : `'SALE','COUNTER_SALE'`}) ORDER BY date DESC, id DESC LIMIT 1`).get(id) as { net: number; date: string } | undefined;
  const [own, other] = pur ? ['debit', 'credit'] : ['credit', 'debit'];
  const receipts = db.prepare(`SELECT v.date, vl.${own} AS amount,
      (SELECT l2.name FROM voucher_lines v2 JOIN ledgers l2 ON l2.id=v2.ledger_id WHERE v2.voucher_id=v.id AND v2.${other}>0 LIMIT 1) AS mode
    FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id=v.id
    WHERE v.type=? AND vl.ledger_id=? AND vl.${own}>0 ORDER BY v.date DESC, v.id DESC LIMIT 6`).all(pur ? 'PAYMENT' : 'RECEIPT', id) as { date: string; amount: number; mode: string }[];
  let det: Record<string, string> = {};
  try { det = JSON.parse(String(l.details || '{}')); } catch { /* ignore */ }
  const phoneStr = String(l.phone || '');
  const mob = det.mobile || (phoneStr.length === 10 ? phoneStr : '') || '';
  const crLimit = Number(l.credit_limit || 0);
  const crBills = Number(det.credit_limit_bills || 0);
  const crDays = Number(det.due_days || det.credit_days || 0);

  const stats = db.prepare(`SELECT COALESCE(SUM(net), 0) AS total_val, COUNT(*) AS cnt
    FROM bills WHERE party_id=? AND type IN (${pur ? `'PURCHASE'` : `'SALE','COUNTER_SALE'`})`).get(id) as { total_val: number; cnt: number };
  const totalVal = Number(stats.total_val || 0);
  const avgPM = Math.round(totalVal / 12);
  const avgPW = Math.round(totalVal / 52);
  const avgPD = Math.round(totalVal / 365);
  const turnoverRatio = l.balance ? (totalVal / Math.max(1, Math.abs(l.balance))).toFixed(2) : (totalVal > 0 ? '1.00' : '0.00');
  const avgCollDays = bills.length ? Math.round(bills.reduce((s, b) => s + b.days, 0) / bills.length) : 0;
  const maxDays = bills.length ? Math.max(...bills.map((b) => b.days)) : 0;

  return {
    name: l.name, phone: l.phone ?? '', balance: r2(l.balance),
    mobile: mob, payid: mob ? `${mob},` : '',
    type_desc: det.ledger_category ? `${det.ledger_category} - Indicate` : 'Manual-Only Indicate',
    is_supplier: isSupplier,
    credit_limit: crLimit,
    credit_limit_bills: crBills,
    credit_days: crDays,
    turnover_ratio: turnoverRatio,
    avg_pm: avgPM,
    avg_pw: avgPW,
    avg_pd: avgPD,
    avg_coll_days: avgCollDays,
    bills: bills.length, days: maxDays,
    last_sale: lastSale ? { ...lastSale, days: daysSince(lastSale.date) } : null,
    last_receipt: receipts[0] ? { ...receipts[0], days: daysSince(receipts[0].date) } : null,
    receipts: receipts.map((r) => ({ ...r, days: daysSince(r.date) })),
    os_bills: bills,
  };
}));

// ---------------------------------------------------------------- vouchers
const V_PREFIX: Record<string, string> = { RECEIPT: 'R', PAYMENT: 'PY', CONTRA: 'C', JOURNAL: 'J', DEBIT_NOTE: 'DN', CREDIT_NOTE: 'CN' };
app.get('/api/vouchers/next-no', h((req) => {
  const type = String(req.query.type);
  return { no: nextNo('vouchers', type, V_PREFIX[type] ?? 'V') };
}));
app.get('/api/vouchers', h((req) => {
  const { type, from, to } = req.query as Record<string, string | undefined>;
  const where: string[] = [];
  const args: string[] = [];
  if (type) { where.push('v.type=?'); args.push(type); }
  if (from) { where.push('v.date>=?'); args.push(from); }
  if (to) { where.push('v.date<=?'); args.push(to); }
  return db.prepare(`SELECT v.*, (SELECT SUM(debit) FROM voucher_lines WHERE voucher_id=v.id) AS amount,
    (SELECT GROUP_CONCAT(l.name, ', ') FROM voucher_lines vl JOIN ledgers l ON l.id=vl.ledger_id WHERE vl.voucher_id=v.id) AS ledgers
    FROM vouchers v ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY v.date DESC, v.id DESC`).all(...args);
}));
app.get('/api/vouchers/:id', h((req) => {
  const v = db.prepare('SELECT * FROM vouchers WHERE id=?').get(req.params.id);
  if (!v) throw new Error('Voucher not found');
  const lines = db.prepare(`SELECT vl.*, l.name AS ledger FROM voucher_lines vl JOIN ledgers l ON l.id=vl.ledger_id
    WHERE voucher_id=? ORDER BY vl.id`).all(req.params.id);
  const adjustments = db.prepare(`SELECT a.*, b.no AS bill_no, b.date AS bill_date, b.net AS bill_net FROM voucher_adjustments a
    LEFT JOIN bills b ON b.id=a.bill_id WHERE a.voucher_id=? ORDER BY a.id`).all(req.params.id);
  return { ...v, lines, adjustments };
}));
interface AdjIn { bill_id?: number | null; amount: number; remark?: string }
interface VoucherIn { type: string; no?: string; date: string; narration?: string; lines: { ledger_id: number; debit?: number; credit?: number }[]; adjustments?: AdjIn[] }
function saveVoucher(body: VoucherIn, id?: number) {
  if (!V_PREFIX[body.type]) throw new Error('Invalid voucher type');
  const lines = body.lines.filter((l) => l.ledger_id && (num(l.debit) || num(l.credit)))
    .map((l) => ({ ledger_id: l.ledger_id, debit: r2(num(l.debit)), credit: r2(num(l.credit)) }));
  const dr = r2(lines.reduce((s, l) => s + l.debit, 0));
  const cr = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (lines.length < 2) throw new Error('Voucher needs at least one debit and one credit');
  if (dr !== cr) throw new Error(`Debit (${dr}) and Credit (${cr}) do not match`);
  return tx(() => {
    const no = body.no?.trim() || nextNo('vouchers', body.type, V_PREFIX[body.type]);
    let vid = id;
    if (vid) {
      db.prepare('UPDATE vouchers SET type=?,no=?,date=?,narration=? WHERE id=?').run(body.type, no, body.date, body.narration ?? '', vid);
      db.prepare('DELETE FROM voucher_lines WHERE voucher_id=?').run(vid);
      db.prepare("DELETE FROM ledger_entries WHERE source='VOUCHER' AND source_id=?").run(vid);
    } else {
      vid = Number(db.prepare('INSERT INTO vouchers (type,no,date,narration) VALUES (?,?,?,?)')
        .run(body.type, no, body.date, body.narration ?? '').lastInsertRowid);
    }
    const insV = db.prepare('INSERT INTO voucher_lines (voucher_id,ledger_id,debit,credit) VALUES (?,?,?,?)');
    const insE = db.prepare(`INSERT INTO ledger_entries (source,source_id,date,ledger_id,debit,credit,vtype,vno,narration)
      VALUES ('VOUCHER',?,?,?,?,?,?,?,?)`);
    for (const l of lines) {
      insV.run(vid, l.ledger_id, l.debit, l.credit);
      insE.run(vid, body.date, l.ledger_id, l.debit, l.credit, body.type, no, body.narration ?? '');
    }
    // Bill adjustment (RECEIPT). Left alone when the caller doesn't send it (e.g. the plain modify screen).
    if (Array.isArray(body.adjustments)) {
      db.prepare('DELETE FROM voucher_adjustments WHERE voucher_id=?').run(vid);
      const insA = db.prepare('INSERT INTO voucher_adjustments (voucher_id,bill_id,amount,remark) VALUES (?,?,?,?)');
      for (const a of body.adjustments) if (r2(num(a.amount))) insA.run(vid, a.bill_id || null, r2(num(a.amount)), a.remark ?? '');
    }
    return { id: vid, no };
  });
}
app.post('/api/vouchers', h((req) => saveVoucher(req.body)));
app.put('/api/vouchers/:id', h((req) => saveVoucher(req.body, Number(req.params.id))));
app.delete('/api/vouchers/:id', h((req) => tx(() => {
  db.prepare("DELETE FROM ledger_entries WHERE source='VOUCHER' AND source_id=?").run(req.params.id);
  db.prepare('DELETE FROM vouchers WHERE id=?').run(req.params.id);
  return { ok: true };
})));

// ---------------------------------------------------------------- reports
// MARG DAY BOOK / SALE BOOK: one row per bill or voucher (date, party, remark, debit,
// credit, type). Day book = everything that happened; sale book = sales whose money is in.
const BOOK_TYPE: Record<string, string> = {
  SALE: 'Sale', COUNTER_SALE: 'Cntr', SALE_CHALLAN: 'S.Ch', PURCHASE: 'Purc', PURCHASE_CHALLAN: 'P.Ch',
  SALE_RETURN: 'S.Rt', PURCHASE_RETURN: 'P.Rt',
  RECEIPT: 'Rcpt', PAYMENT: 'Pymt', CONTRA: 'Ctra', JOURNAL: 'Jrnl', DEBIT_NOTE: 'D.N.', CREDIT_NOTE: 'C.N.',
};
// Which column the amount goes in: money / goods going out to the party are Debit.
const BILL_DEBIT = new Set(['SALE', 'COUNTER_SALE', 'SALE_CHALLAN', 'PURCHASE_RETURN']);
interface BookRow { source: 'BILL' | 'VOUCHER'; source_id: number; vtype: string; type: string; date: string; no: string; party: string; remark: string; narration: string; debit: number; credit: number }

function bookBills(from: string, to: string, where = '', ledger = 0): BookRow[] {
  const rows = db.prepare(`SELECT b.id, b.type, b.date, b.no, b.net, b.narration, b.walkin_name, l.name AS party, b.party_id, g.name AS grp, b.mode,
      COALESCE((SELECT SUM(amount) FROM bill_payments WHERE bill_id=b.id),0)
      + COALESCE((SELECT SUM(amount) FROM voucher_adjustments WHERE bill_id=b.id),0)
      + COALESCE((SELECT SUM(r.net) FROM bills r WHERE r.type='SALE_RETURN' AND r.against_bill_id=b.id),0) AS received
    FROM bills b JOIN ledgers l ON l.id=b.party_id JOIN account_groups g ON g.id=l.group_id
    WHERE b.date BETWEEN ? AND ? ${where}
      ${ledger ? `AND (b.party_id=? OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.source='BILL' AND e.source_id=b.id AND e.ledger_id=?))` : ''}
    ORDER BY b.date, b.id`).all(from, to, ...(ledger ? [ledger, ledger] : [])) as Row[];

  return rows.map((b: any) => ({
    source: 'BILL', source_id: b.id, vtype: b.type, type: BOOK_TYPE[b.type] ?? b.type, date: b.date, no: b.no,
    party: b.party, remark: b.no, narration: b.narration ?? '', received: b.received, mode: b.mode, grp: b.grp, net: b.net,
    debit: BILL_DEBIT.has(b.type) ? b.net : 0, credit: BILL_DEBIT.has(b.type) ? 0 : b.net,
  }));
}

function bookVouchers(from: string, to: string, ledger = 0): BookRow[] {
  const vs = db.prepare(`SELECT * FROM vouchers v WHERE v.date BETWEEN ? AND ?
      ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as Row[];
  const linesOf = db.prepare(`SELECT vl.debit, vl.credit, vl.ledger_id, l.name, g.name AS grp FROM voucher_lines vl JOIN ledgers l ON l.id=vl.ledger_id
    JOIN account_groups g ON g.id=l.group_id WHERE vl.voucher_id=? ORDER BY vl.id`);

  return vs.map((v: any) => {
    const ls = linesOf.all(v.id) as { debit: number; credit: number; name: string; grp: string }[];
    const amount = r2(ls.reduce((s, l) => s + l.debit, 0));
    const cashGrp = (g: string) => g === 'Cash-in-hand' || g === 'Bank Accounts';
    const pick = v.type === 'RECEIPT' || v.type === 'CREDIT_NOTE'
      ? ls.find((l) => l.credit > 0 && !cashGrp(l.grp)) ?? ls.find((l) => l.credit > 0)
      : ls.find((l) => l.debit > 0 && (v.type === 'CONTRA' || !cashGrp(l.grp))) ?? ls.find((l) => l.debit > 0);
    const credit = v.type === 'RECEIPT' || v.type === 'CREDIT_NOTE';
    return {
      source: 'VOUCHER' as const, source_id: v.id, vtype: v.type, type: BOOK_TYPE[v.type] ?? v.type, date: v.date, no: v.no,
      party: pick?.name ?? '', remark: v.narration || v.no, narration: v.narration ?? '',
      debit: credit ? 0 : amount, credit: credit ? amount : 0,
    };
  });
}
const byDate = (a: BookRow, b: BookRow) =>
  a.date.localeCompare(b.date)
  || (a.source === b.source ? a.source_id - b.source_id : a.source === 'BILL' ? -1 : 1)
  || (b.debit - a.debit);

interface TSideRow {
  particulars: string;
  type: string;
  amount: number;
}

function buildDayBookTFormat(from: string, to: string, ledger = 0) {
  const creditRows: TSideRow[] = [];
  const debitRows: TSideRow[] = [];

  const vlines = db.prepare(`SELECT vl.debit, vl.credit, vl.ledger_id, l.name, g.name AS grp
    FROM voucher_lines vl
    JOIN ledgers l ON l.id=vl.ledger_id
    JOIN account_groups g ON g.id=l.group_id
    WHERE vl.voucher_id=?
    ORDER BY vl.id`);

  // 1. Receipts (type = 'RECEIPT')
  const rcptVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='RECEIPT' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  for (const v of rcptVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string; grp: string }[];
    for (const l of lines) {
      if (l.credit > 0) creditRows.push({ particulars: l.name, type: 'Rcpt', amount: r2(l.credit) });
      if (l.debit > 0) debitRows.push({ particulars: l.name, type: 'Rcpt', amount: r2(l.debit) });
    }
  }

  // 2. Payments (type = 'PAYMENT')
  const pymtVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='PAYMENT' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  for (const v of pymtVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string; grp: string }[];
    for (const l of lines) {
      if (l.debit > 0) debitRows.push({ particulars: l.name, type: 'Pymt', amount: r2(l.debit) });
      if (l.credit > 0) creditRows.push({ particulars: l.name, type: 'Pymt', amount: r2(l.credit) });
    }
  }

  // 3. Contra (type = 'CONTRA')
  const ctraVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='CONTRA' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  for (const v of ctraVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string; grp: string }[];
    for (const l of lines) {
      if (l.credit > 0) creditRows.push({ particulars: l.name, type: 'Ctra', amount: r2(l.credit) });
      if (l.debit > 0) debitRows.push({ particulars: l.name, type: 'Ctra', amount: r2(l.debit) });
    }
  }

  // 4. Journal (type = 'JOURNAL')
  const jrnlVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='JOURNAL' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  for (const v of jrnlVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string; grp: string }[];
    for (const l of lines) {
      if (l.credit > 0) creditRows.push({ particulars: l.name, type: 'Jrnl', amount: r2(l.credit) });
      if (l.debit > 0) debitRows.push({ particulars: l.name, type: 'Jrnl', amount: r2(l.debit) });
    }
  }

  // 5. Purchases (type = 'PURCHASE')
  const purcBills = db.prepare(`SELECT b.id, b.date, b.no, b.net, l.name AS party FROM bills b
    JOIN ledgers l ON l.id=b.party_id
    WHERE b.type='PURCHASE' AND b.date BETWEEN ? AND ?
    ${ledger ? `AND (b.party_id=? OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.source='BILL' AND e.source_id=b.id AND e.ledger_id=?))` : ''}
    ORDER BY b.date, b.id`).all(from, to, ...(ledger ? [ledger, ledger] : [])) as { id: number; date: string; no: string; net: number; party: string }[];

  let totalPurc = 0;
  for (const b of purcBills) {
    creditRows.push({ particulars: b.party, type: 'Purc', amount: r2(b.net) });
    totalPurc += b.net;
  }
  totalPurc = r2(totalPurc);

  // 6. Purchase Returns / Debit Notes (bills type='PURCHASE_RETURN' or vouchers type='DEBIT_NOTE')
  const prBills = db.prepare(`SELECT b.id, b.date, b.no, b.net, l.name AS party FROM bills b
    JOIN ledgers l ON l.id=b.party_id
    WHERE b.type='PURCHASE_RETURN' AND b.date BETWEEN ? AND ?
    ${ledger ? `AND (b.party_id=? OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.source='BILL' AND e.source_id=b.id AND e.ledger_id=?))` : ''}
    ORDER BY b.date, b.id`).all(from, to, ...(ledger ? [ledger, ledger] : [])) as { id: number; date: string; no: string; net: number; party: string }[];

  const dnVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='DEBIT_NOTE' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  let totalDN = 0;
  for (const b of prBills) {
    debitRows.push({ particulars: b.party, type: 'D/N', amount: r2(b.net) });
    totalDN += b.net;
  }
  for (const v of dnVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string }[];
    for (const l of lines) {
      if (l.debit > 0) {
        debitRows.push({ particulars: l.name, type: 'D/N', amount: r2(l.debit) });
        totalDN += l.debit;
      }
    }
  }
  totalDN = r2(totalDN);
  if (totalDN > 0) {
    creditRows.push({ particulars: 'DAY D/N', type: 'D/n', amount: totalDN });
  }

  // 7. Sales (type IN ('SALE', 'COUNTER_SALE'))
  const saleBills = db.prepare(`SELECT b.id, b.date, b.no, b.net, b.mode, b.type, b.walkin_name, l.name AS party FROM bills b
    JOIN ledgers l ON l.id=b.party_id
    WHERE b.type IN ('SALE','COUNTER_SALE') AND b.date BETWEEN ? AND ?
    ${ledger ? `AND (b.party_id=? OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.source='BILL' AND e.source_id=b.id AND e.ledger_id=?))` : ''}
    ORDER BY b.date, b.id`).all(from, to, ...(ledger ? [ledger, ledger] : [])) as any[];

  const paysOf = db.prepare('SELECT bp.amount, l.name FROM bill_payments bp JOIN ledgers l ON l.id=bp.ledger_id WHERE bp.bill_id=?');

  let totalSale = 0;
  let totalCashSale = 0;
  for (const b of saleBills) {
    totalSale += b.net;
    if (b.mode === 'CASH' || b.type === 'COUNTER_SALE') {
      totalCashSale += b.net;
    } else {
      const pays = paysOf.all(b.id) as { amount: number; name: string }[];
      const paid = r2(pays.reduce((s, p) => s + p.amount, 0));
      const rem = r2(b.net - paid);
      for (const p of pays) {
        if (p.amount > 0) debitRows.push({ particulars: p.name, type: 'Sale', amount: r2(p.amount) });
      }
      if (rem > 0 || pays.length === 0) {
        debitRows.push({ particulars: b.party, type: '', amount: rem > 0 ? rem : r2(b.net) });
      }
    }
  }
  totalSale = r2(totalSale);
  totalCashSale = r2(totalCashSale);
  if (totalCashSale > 0) {
    debitRows.push({ particulars: 'CASH', type: 'Sale', amount: totalCashSale });
  }
  if (totalSale > 0) {
    creditRows.push({ particulars: 'DAY SALE', type: 'Sale', amount: totalSale });
  }

  // 8. Sales Returns / Credit Notes (bills type='SALE_RETURN' or vouchers type='CREDIT_NOTE')
  const srBills = db.prepare(`SELECT b.id, b.date, b.no, b.net, l.name AS party FROM bills b
    JOIN ledgers l ON l.id=b.party_id
    WHERE b.type='SALE_RETURN' AND b.date BETWEEN ? AND ?
    ${ledger ? `AND (b.party_id=? OR EXISTS (SELECT 1 FROM ledger_entries e WHERE e.source='BILL' AND e.source_id=b.id AND e.ledger_id=?))` : ''}
    ORDER BY b.date, b.id`).all(from, to, ...(ledger ? [ledger, ledger] : [])) as { id: number; date: string; no: string; net: number; party: string }[];

  const cnVs = db.prepare(`SELECT v.id, v.no, v.date FROM vouchers v
    WHERE v.type='CREDIT_NOTE' AND v.date BETWEEN ? AND ?
    ${ledger ? 'AND EXISTS (SELECT 1 FROM voucher_lines x WHERE x.voucher_id=v.id AND x.ledger_id=?)' : ''}
    ORDER BY v.date, v.id`).all(from, to, ...(ledger ? [ledger] : [])) as { id: number; no: string; date: string }[];

  let totalCN = 0;
  for (const b of srBills) {
    creditRows.push({ particulars: b.party, type: 'C/N', amount: r2(b.net) });
    totalCN += b.net;
  }
  for (const v of cnVs) {
    const lines = vlines.all(v.id) as { debit: number; credit: number; name: string }[];
    for (const l of lines) {
      if (l.credit > 0) {
        creditRows.push({ particulars: l.name, type: 'C/N', amount: r2(l.credit) });
        totalCN += l.credit;
      }
    }
  }
  totalCN = r2(totalCN);
  if (totalCN > 0) {
    debitRows.push({ particulars: 'DAY C/N', type: 'C/n', amount: totalCN });
  }

  // 9. DAY PURCHASE on Debit side
  if (totalPurc > 0) {
    debitRows.push({ particulars: 'DAY PURCHASE', type: 'Purc', amount: totalPurc });
  }

  // Consolidate identical (particulars, type) rows for CASH
  const groupRows = (list: TSideRow[]) => {
    const map = new Map<string, TSideRow>();
    const res: TSideRow[] = [];
    for (const r of list) {
      const key = `${r.particulars.toUpperCase()}//${r.type.toUpperCase()}`;
      if (r.particulars.toUpperCase() === 'CASH' && map.has(key)) {
        const item = map.get(key)!;
        item.amount = r2(item.amount + r.amount);
      } else {
        const copy = { ...r };
        res.push(copy);
        map.set(key, copy);
      }
    }
    return res;
  };

  const finalCredit = groupRows(creditRows);
  const finalDebit = groupRows(debitRows);

  const totalCredit = r2(finalCredit.reduce((s, r) => s + r.amount, 0));
  const totalDebit = r2(finalDebit.reduce((s, r) => s + r.amount, 0));

  return {
    credit: finalCredit,
    debit: finalDebit,
    totalCredit,
    totalDebit,
    total: totalCredit
  };
}

app.get('/api/reports/day-book', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const ledger = Number(req.query.ledger) || 0;
  return [...bookBills(from, to, '', ledger), ...bookVouchers(from, to, ledger)].sort(byDate);
}));
app.get('/api/reports/day-book-tformat', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const ledger = Number(req.query.ledger) || 0;
  return buildDayBookTFormat(from, to, ledger);
}));
// Sale book: only sales whose money has been received — cash / counter sales, sales paid
// on the bill, and credit sales once receipts have settled them in full.
app.get('/api/reports/sale-book', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  return bookBills(from, to, "AND b.type IN ('SALE','COUNTER_SALE')", 0).filter((b: any) =>
    b.mode === 'CASH' || b.vtype === 'COUNTER_SALE' || b.grp === 'Cash-in-hand' || b.received >= b.net - 0.005);
}));
app.get('/api/reports/ledger/:id', h((req) => {
  const { from = '0000-01-01', to = '9999-12-31' } = req.query as Record<string, string>;
  const l = db.prepare(`${LEDGER_BAL} WHERE l.id=?`).get(req.params.id) as Row & { opening: number; opening_type: string };
  if (!l) throw new Error('Ledger not found');
  const base = l.opening_type === 'Dr' ? l.opening : -l.opening;
  const prior = db.prepare('SELECT COALESCE(SUM(debit-credit),0) AS s FROM ledger_entries WHERE ledger_id=? AND date<?').get(req.params.id, from) as { s: number };
  const rows = db.prepare(`SELECT e.*, (SELECT GROUP_CONCAT(l2.name, ', ') FROM ledger_entries e2 JOIN ledgers l2 ON l2.id=e2.ledger_id
      WHERE e2.source=e.source AND e2.source_id=e.source_id AND e2.ledger_id<>e.ledger_id) AS against
    FROM ledger_entries e WHERE ledger_id=? AND date BETWEEN ? AND ? ORDER BY date, id`).all(req.params.id, from, to);
  return { ledger: l, opening: r2(base + prior.s), rows };
}));

// LEDGER ACCOUNTS (All Ledgers, Alt+L): every ledger with its opening, debit, credit and
// balance up to a date, plus whether it has unpaid credit sale bills (shown in red).
app.get('/api/reports/ledger-accounts', h((req) => {
  const upto = String(req.query.upto || '9999-12-31');
  return db.prepare(`SELECT l.id, l.name, l.city, l.address, l.phone, l.gstin, l.state, l.details, l.credit_limit, g.name AS group_name,
      (CASE WHEN l.opening_type='Dr' THEN l.opening ELSE -l.opening END) AS opening,
      COALESCE((SELECT SUM(debit) FROM ledger_entries e WHERE e.ledger_id=l.id AND e.date<=?),0) AS debit,
      COALESCE((SELECT SUM(credit) FROM ledger_entries e WHERE e.ledger_id=l.id AND e.date<=?),0) AS credit,
      EXISTS (SELECT 1 FROM bills b WHERE b.party_id=l.id AND b.type='SALE' AND b.mode<>'CASH' AND b.date<=?
        AND b.net - COALESCE((SELECT SUM(amount) FROM bill_payments WHERE bill_id=b.id),0)
                  - COALESCE((SELECT SUM(amount) FROM voucher_adjustments WHERE bill_id=b.id),0)
                  - COALESCE((SELECT SUM(r.net) FROM bills r WHERE r.type='SALE_RETURN' AND r.against_bill_id=b.id),0) > 0.004) AS has_due
    FROM ledgers l JOIN account_groups g ON g.id=l.group_id
    ORDER BY CASE WHEN g.name IN ('Cash-in-hand','Bank Accounts') THEN 0 ELSE 1 END, l.name`).all(upto, upto, upto)
    .map((r: any) => ({ ...r, credit_limit: Number(r.credit_limit || 0), balance: r2(r.opening + r.debit - r.credit), has_due: !!r.has_due }));
}));

app.get('/api/reports/trial-balance', h(() => db.prepare(`SELECT * FROM (${LEDGER_BAL}) WHERE ABS(balance) > 0.004 ORDER BY group_name, name`).all()));

app.get('/api/reports/outstanding', h((req) => {
  const group = req.query.kind === 'payable' ? 'Sundry Creditors' : 'Sundry Debtors';
  return db.prepare(`SELECT * FROM (${LEDGER_BAL}) WHERE group_name=? AND ABS(balance) > 0.004 ORDER BY name`).all(group);
}));

app.get('/api/reports/stock', h(() => db.prepare(`SELECT *, stock*purchase_rate AS value FROM (${STOCK_SQL}) ORDER BY name`).all()));
app.get('/api/reports/reorder', h(() => db.prepare(`SELECT * FROM (${STOCK_SQL}) WHERE stock <= min_stock ORDER BY name`).all()));

app.get('/api/reports/daybook', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  return db.prepare(`SELECT e.date, e.vtype, e.vno, l.name AS ledger, e.debit, e.credit, e.narration
    FROM ledger_entries e JOIN ledgers l ON l.id=e.ledger_id WHERE e.date BETWEEN ? AND ? ORDER BY e.date, e.source, e.source_id, e.id`).all(from, to);
}));

app.get('/api/reports/gross-profit', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  return db.prepare(`SELECT b.id, b.date, b.no, l.name AS party, SUM(bi.taxable) AS sale, SUM(bi.qty*i.purchase_rate) AS cost,
      SUM(bi.taxable) - SUM(bi.qty*i.purchase_rate) AS profit
    FROM bills b JOIN bill_items bi ON bi.bill_id=b.id JOIN items i ON i.id=bi.item_id JOIN ledgers l ON l.id=b.party_id
    WHERE b.type IN ('SALE','COUNTER_SALE') AND b.date BETWEEN ? AND ? GROUP BY b.id ORDER BY b.date, b.id`).all(from, to);
}));

app.get('/api/reports/mis', h((req) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const { from = todayStr, to = todayStr } = req.query as Record<string, string>;
  const sum = (types: string) => (db.prepare(`SELECT COALESCE(SUM(net),0) AS s, COUNT(*) AS c FROM bills WHERE type IN (${types}) AND date BETWEEN ? AND ?`).get(from, to)) as { s: number; c: number };
  const vsum = (type: string) => (db.prepare(`SELECT COALESCE(SUM(vl.debit),0) AS s, COUNT(DISTINCT v.id) AS c FROM vouchers v JOIN voucher_lines vl ON vl.voucher_id=v.id
    WHERE v.type=? AND v.date BETWEEN ? AND ?`).get(type, from, to)) as { s: number; c: number };
  const cash = db.prepare(`${LEDGER_BAL} WHERE l.name=?`).get(SYS.CASH) as { balance: number } | undefined;
  const bank = db.prepare(`SELECT COALESCE(SUM(balance),0) AS s FROM (${LEDGER_BAL}) WHERE group_name='Bank Accounts'`).get() as { s: number };
  const recv = db.prepare(`SELECT COALESCE(SUM(balance),0) AS s FROM (${LEDGER_BAL}) WHERE group_name='Sundry Debtors'`).get() as { s: number };
  const pay = db.prepare(`SELECT COALESCE(SUM(balance),0) AS s FROM (${LEDGER_BAL}) WHERE group_name='Sundry Creditors'`).get() as { s: number };
  const gp = db.prepare(`SELECT
      COALESCE(SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.taxable ELSE bi.taxable END), 0) AS saleTaxable,
      COALESCE(SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty * i.purchase_rate) ELSE bi.qty * i.purchase_rate END), 0) AS saleCost
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN items i ON i.id=bi.item_id
    WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN') AND b.date BETWEEN ? AND ?`).get(from, to) as { saleTaxable: number; saleCost: number };
  return {
    from, to,
    sales: sum(`'SALE','COUNTER_SALE'`), purchase: sum(`'PURCHASE'`),
    saleReturn: sum(`'SALE_RETURN'`), purchaseReturn: sum(`'PURCHASE_RETURN'`),
    receipt: vsum('RECEIPT'), payment: vsum('PAYMENT'),
    cash: cash ? cash.balance : 0, bank: bank ? bank.s : 0,
    receivable: recv ? recv.s : 0, payable: pay ? -pay.s : 0,
    profit: {
      sales: r2(gp.saleTaxable),
      cost: r2(gp.saleCost),
      gp: r2(gp.saleTaxable - gp.saleCost),
      margin: gp.saleTaxable > 0 ? r2(((gp.saleTaxable - gp.saleCost) / gp.saleTaxable) * 100) : 0,
    },
  };
}));

// ---------------------------------------------------------------- stock / daily / GST reports
app.get('/api/reports/stock-value', h(() => {
  const opening = db.prepare('SELECT COALESCE(SUM(opening_stock*purchase_rate),0) AS v FROM items').get() as { v: number };
  const closing = db.prepare(`SELECT COALESCE(SUM(MAX(stock,0)*purchase_rate),0) AS v FROM (${STOCK_SQL})`).get() as { v: number };
  return { opening: r2(opening.v), closing: r2(closing.v) };
}));
app.get('/api/reports/batch-stock', h(() => db.prepare(`SELECT * FROM (${BATCH_STOCK}) bs ORDER BY bs.item_name COLLATE NOCASE, bs.expiry, bs.batch`).all()));

app.get('/api/reports/mode-of-payment', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const modes = db.prepare(`SELECT l.name AS mode, COUNT(DISTINCT b.id) AS bills, SUM(bp.amount) AS amount
    FROM bill_payments bp JOIN bills b ON b.id=bp.bill_id JOIN ledgers l ON l.id=bp.ledger_id
    WHERE b.date BETWEEN ? AND ? GROUP BY l.id ORDER BY l.name`).all(from, to) as { mode: string; bills: number; amount: number }[];
  // Whatever wasn't collected on the bill stays on the party's account.
  const credit = db.prepare(`SELECT COUNT(*) AS bills, COALESCE(SUM(b.net - COALESCE(p.paid,0)),0) AS amount
    FROM bills b LEFT JOIN (SELECT bill_id, SUM(amount) AS paid FROM bill_payments GROUP BY bill_id) p ON p.bill_id=b.id
    WHERE b.type IN ('SALE','COUNTER_SALE') AND b.date BETWEEN ? AND ? AND b.net - COALESCE(p.paid,0) > 0.004`).get(from, to) as { bills: number; amount: number };
  return credit.amount ? [...modes, { mode: 'CREDIT (Pending on party)', bills: credit.bills, amount: r2(credit.amount) }] : modes;
}));

app.get('/api/reports/item-sale', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const itemId = Number(req.query.item_id) || 0;
  const company = req.query.company ? String(req.query.company).trim() : '';
  const partyId = Number(req.query.party_id) || 0;

  const conds: string[] = [];
  const args: SQLInputValue[] = [from, to];
  if (itemId) { conds.push('i.id = ?'); args.push(itemId); }
  if (company) { conds.push('UPPER(i.company) = UPPER(?)'); args.push(company); }
  if (partyId) { conds.push('b.party_id = ?'); args.push(partyId); }
  const extraWhere = conds.length ? 'AND ' + conds.join(' AND ') : '';

  return db.prepare(`SELECT i.id AS item_id, i.name, i.pack, i.company,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty+bi.free) ELSE bi.qty+bi.free END) AS qty,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.taxable ELSE bi.taxable END) AS taxable,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.tax ELSE bi.tax END) AS tax,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.qty ELSE bi.qty END * i.purchase_rate) AS cost
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN items i ON i.id=bi.item_id
    WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN') AND b.date BETWEEN ? AND ?
    ${extraWhere}
    GROUP BY i.id ORDER BY taxable DESC`).all(...args)
    .map((r: any) => ({ ...r, qty: r2(r.qty), taxable: r2(r.taxable), tax: r2(r.tax), cost: r.cost != null ? r2(r.cost) : null }));
}));

app.get('/api/reports/item-sale-detail', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const itemId = Number(req.query.item_id) || 0;
  const itemName = req.query.name ? String(req.query.name).trim() : '';
  const company = req.query.company ? String(req.query.company).trim() : '';
  const partyId = Number(req.query.party_id) || 0;

  const conds: string[] = [];
  const args: SQLInputValue[] = [from, to];
  if (itemId) { conds.push('i.id = ?'); args.push(itemId); }
  else if (itemName) { conds.push('UPPER(i.name) = UPPER(?)'); args.push(itemName); }
  if (company) { conds.push('UPPER(i.company) = UPPER(?)'); args.push(company); }
  if (partyId) { conds.push('b.party_id = ?'); args.push(partyId); }
  const extraWhere = conds.length ? 'AND ' + conds.join(' AND ') : '';

  const item = itemId ? db.prepare('SELECT id, name, pack, company, hsn, purchase_rate, mrp, sale_rate FROM items WHERE id = ?').get(itemId)
             : itemName ? db.prepare('SELECT id, name, pack, company, hsn, purchase_rate, mrp, sale_rate FROM items WHERE UPPER(name) = UPPER(?) LIMIT 1').get(itemName)
             : null;

  const rows = db.prepare(`SELECT b.id AS bill_id, b.date, b.type, b.no, b.party_id,
      CASE WHEN b.walkin_name IS NOT NULL AND TRIM(b.walkin_name) <> '' THEN b.walkin_name ELSE l.name END AS party,
      i.id AS item_id, i.name AS item_name, i.pack, i.company,
      COALESCE(bi.batch, '') AS batch, COALESCE(bi.expiry, '') AS expiry,
      CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty) ELSE bi.qty END AS qty,
      CASE WHEN b.type='SALE_RETURN' THEN -(bi.free) ELSE bi.free END AS free,
      bi.rate, bi.disc_pct,
      CASE WHEN b.type='SALE_RETURN' THEN -bi.taxable ELSE bi.taxable END AS taxable,
      CASE WHEN b.type='SALE_RETURN' THEN -bi.tax ELSE bi.tax END AS tax,
      CASE WHEN b.type='SALE_RETURN' THEN -bi.amount ELSE bi.amount END AS amount
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN items i ON i.id = bi.item_id
    JOIN ledgers l ON l.id = b.party_id
    WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN') AND b.date BETWEEN ? AND ?
    ${extraWhere}
    ORDER BY b.date DESC, b.id DESC`).all(...args)
    .map((r: any) => ({ ...r, qty: r2(r.qty), free: r2(r.free), rate: r2(r.rate), taxable: r2(r.taxable), tax: r2(r.tax), amount: r2(r.amount) }));

  return { item, rows };
}));

app.get('/api/reports/party-sale-detail', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const partyId = Number(req.query.party_id) || 0;
  if (!partyId) throw new Error('Party ID is required');

  const party = db.prepare(`${LEDGER_BAL} WHERE l.id = ?`).get(partyId);
  const bills = db.prepare(`SELECT b.id AS bill_id, b.date, b.type, b.no, b.mode, b.gross, b.discount, b.taxable, b.tax, b.round_off, b.net,
      (SELECT GROUP_CONCAT(i.name || ' (' || bi.qty || ')', ', ')
       FROM bill_items bi JOIN items i ON i.id=bi.item_id WHERE bi.bill_id=b.id) AS items_summary
    FROM bills b
    WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN') AND b.party_id = ? AND b.date BETWEEN ? AND ?
    ORDER BY b.date DESC, b.id DESC`).all(partyId, from, to)
    .map((r: any) => ({
      ...r,
      gross: r2(r.gross),
      discount: r2(r.discount),
      taxable: r2(r.taxable),
      tax: r2(r.tax),
      round_off: r2(r.round_off),
      net: r2(r.net)
    }));
  return { party, bills };
}));

app.get('/api/companies-list', h(() => {
  return db.prepare(`SELECT DISTINCT TRIM(company) AS company FROM items WHERE company IS NOT NULL AND TRIM(company) <> '' ORDER BY company COLLATE NOCASE`).all();
}));

// Sale / purchase summaries grouped by party, company, item, M.R., HSN, GST %, day or month
// (Marg's Party / Company / M.R. / Day / Month Wise Summary and G.P. summaries). Returns
// net of returns; `pivot=month` adds the month so the client can lay months out as columns.
const SUMMARY_KEYS: Record<string, string> = {
  party: 'l.name', company: "COALESCE(NULLIF(i.company,''),'(No Company)')", item: "i.name || CASE WHEN i.pack<>'' THEN ' ' || i.pack ELSE '' END",
  mr: "COALESCE(s.name,'(No M.R.)')", hsn: "COALESCE(NULLIF(i.hsn,''),'(No HSN)')", gst: "printf('GST %g%%', bi.gst_rate)",
  day: 'b.date', month: 'substr(b.date,1,7)',
};
app.get('/api/reports/summary', h((req) => {
  const { from, to, side, by, pivot } = req.query as Record<string, string>;
  const key = SUMMARY_KEYS[by];
  if (!key) throw new Error('Unknown summary');
  const [types, ret] = side === 'PURCHASE' ? [`'PURCHASE'`, 'PURCHASE_RETURN'] : [`'SALE','COUNTER_SALE'`, 'SALE_RETURN'];
  const sg = `(CASE WHEN b.type='${ret}' THEN -1 ELSE 1 END)`;
  const pivotCol = pivot === 'month' ? 'substr(b.date,1,7)'
                 : pivot === 'week' ? "strftime('%Y-W%W', b.date)"
                 : pivot === 'day' ? 'b.date'
                 : "''";

  const conds: string[] = [];
  const args: SQLInputValue[] = [from, to];
  if (req.query.company) {
    conds.push('UPPER(i.company) = UPPER(?)');
    args.push(String(req.query.company).trim());
  }
  if (req.query.party_id) {
    conds.push('b.party_id = ?');
    args.push(Number(req.query.party_id));
  }
  const extraWhere = conds.length ? 'AND ' + conds.join(' AND ') : '';
  const idSelect = by === 'party' ? 'l.id AS id, l.city,' : by === 'mr' ? 'COALESCE(s.id, 0) AS id,' : by === 'item' ? 'i.id AS id, i.pack, i.company,' : '';

  return db.prepare(`SELECT ${idSelect} ${key} AS name, ${pivotCol} AS month, ${pivotCol} AS period_key,
      COUNT(DISTINCT CASE WHEN b.type<>'${ret}' THEN b.id END) AS bills,
      COUNT(DISTINCT CASE WHEN b.type='${ret}' THEN b.id END) AS returns,
      SUM(${sg}*(bi.qty+bi.free)) AS qty, SUM(${sg}*bi.taxable) AS taxable, SUM(${sg}*bi.tax) AS tax,
      SUM(${sg}*bi.amount) AS amount, SUM(${sg}*bi.qty*i.purchase_rate) AS cost
    FROM bill_items bi JOIN bills b ON b.id=bi.bill_id JOIN items i ON i.id=bi.item_id JOIN ledgers l ON l.id=b.party_id
    LEFT JOIN salesmen s ON s.id=b.mr_id
    WHERE b.type IN (${types},'${ret}') AND b.date BETWEEN ? AND ?
    ${extraWhere}
    GROUP BY 1, 2 ORDER BY ${by === 'day' || by === 'month' || pivot === 'day' || pivot === 'week' || pivot === 'month' ? '2, 1' : 'amount DESC'}`).all(...args)
    .map((r: any) => ({ ...r, qty: r2(r.qty), taxable: r2(r.taxable), tax: r2(r.tax), amount: r2(r.amount), cost: r2(r.cost) }));
}));

// M.R. Wise Sale Analysis: Summary (by Salesman) and Detailed (M.R. + All Items)
app.get('/api/reports/mr-sale', h((req) => {
  const todayStr = new Date().toISOString().slice(0, 10);
  const from = String(req.query.from || todayStr);
  const to = String(req.query.to || todayStr);
  const mode = String(req.query.mode || 'summary');
  const mrId = req.query.mr_id != null && req.query.mr_id !== '' && req.query.mr_id !== 'all' ? Number(req.query.mr_id) : null;

  const mrCond = mrId != null
    ? mrId === 0
      ? ` AND (COALESCE(b.mr_id, s.id, CAST(json_extract(l.details, '$.mr_id') AS INTEGER)) IS NULL OR COALESCE(b.mr_id, s.id, CAST(json_extract(l.details, '$.mr_id') AS INTEGER)) = 0)`
      : ` AND (COALESCE(b.mr_id, s.id, CAST(json_extract(l.details, '$.mr_id') AS INTEGER)) = ${mrId})`
    : '';

  if (mode === 'items') {
    const sql = `
      SELECT
        COALESCE(s.id, 0) AS mr_id,
        COALESCE(s.name, NULLIF(json_extract(l.details, '$.mr_name'), ''), '(No M.R. / Direct)') AS mr_name,
        COALESCE(s.area, '') AS mr_area,
        i.id AS item_id,
        i.name AS item_name,
        COALESCE(i.pack, '') AS pack,
        COALESCE(i.company, '') AS company,
        COALESCE(bi.batch, '') AS batch,
        COALESCE(bi.expiry, '') AS expiry,
        COUNT(DISTINCT b.id) AS bills_count,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty) ELSE bi.qty END) AS qty,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.free) ELSE bi.free END) AS free_qty,
        AVG(bi.rate) AS rate,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty * bi.rate) ELSE bi.qty * bi.rate END) AS gross_amt,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -((bi.qty * bi.rate) - bi.taxable) ELSE ((bi.qty * bi.rate) - bi.taxable) END) AS disc_amt,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.taxable ELSE bi.taxable END) AS taxable,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.tax ELSE bi.tax END) AS tax,
        SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.amount ELSE bi.amount END) AS net_amt
      FROM bill_items bi
      JOIN bills b ON b.id = bi.bill_id
      JOIN items i ON i.id = bi.item_id
      JOIN ledgers l ON l.id = b.party_id
      LEFT JOIN salesmen s ON s.id = COALESCE(b.mr_id, CAST(json_extract(l.details, '$.mr_id') AS INTEGER))
      WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN')
        AND b.date BETWEEN ? AND ?
        ${mrCond}
      GROUP BY 1, 2, 3, i.id, bi.batch
      ORDER BY mr_name ASC, i.name ASC, bi.batch ASC
    `;
    return db.prepare(sql).all(from, to).map((r: any) => ({
      ...r,
      qty: r2(r.qty),
      free_qty: r2(r.free_qty),
      rate: r2(r.rate),
      gross_amt: r2(r.gross_amt),
      disc_amt: r2(r.disc_amt),
      taxable: r2(r.taxable),
      tax: r2(r.tax),
      net_amt: r2(r.net_amt),
    }));
  }

  const sql = `
    SELECT
      COALESCE(s.id, 0) AS mr_id,
      COALESCE(s.name, NULLIF(json_extract(l.details, '$.mr_name'), ''), '(No M.R. / Direct)') AS mr_name,
      COALESCE(s.area, '') AS mr_area,
      COUNT(DISTINCT CASE WHEN b.type IN ('SALE','COUNTER_SALE') THEN b.id END) AS sale_bills,
      COUNT(DISTINCT CASE WHEN b.type = 'SALE_RETURN' THEN b.id END) AS return_bills,
      COUNT(DISTINCT b.id) AS total_bills,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty) ELSE bi.qty END) AS qty,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.free) ELSE bi.free END) AS free_qty,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -(bi.qty * bi.rate) ELSE bi.qty * bi.rate END) AS gross_amt,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -((bi.qty * bi.rate) - bi.taxable) ELSE ((bi.qty * bi.rate) - bi.taxable) END) AS disc_amt,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.taxable ELSE bi.taxable END) AS taxable,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.tax ELSE bi.tax END) AS tax,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN 0 ELSE bi.amount END) AS sale_amt,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN bi.amount ELSE 0 END) AS return_amt,
      SUM(CASE WHEN b.type='SALE_RETURN' THEN -bi.amount ELSE bi.amount END) AS net_amt
    FROM bill_items bi
    JOIN bills b ON b.id = bi.bill_id
    JOIN ledgers l ON l.id = b.party_id
    LEFT JOIN salesmen s ON s.id = COALESCE(b.mr_id, CAST(json_extract(l.details, '$.mr_id') AS INTEGER))
    WHERE b.type IN ('SALE','COUNTER_SALE','SALE_RETURN')
      AND b.date BETWEEN ? AND ?
      ${mrCond}
    GROUP BY 1, 2, 3
    ORDER BY net_amt DESC, mr_name ASC
  `;
  return db.prepare(sql).all(from, to).map((r: any) => ({
    ...r,
    qty: r2(r.qty),
    free_qty: r2(r.free_qty),
    gross_amt: r2(r.gross_amt),
    disc_amt: r2(r.disc_amt),
    taxable: r2(r.taxable),
    tax: r2(r.tax),
    sale_amt: r2(r.sale_amt),
    return_amt: r2(r.return_amt),
    net_amt: r2(r.net_amt),
  }));
}));


// Outstanding ageing: each party's unpaid credit sale bills split into age slabs (days since bill date).
app.get('/api/reports/ageing', h((req) => {
  const upto = String(req.query.upto || new Date().toISOString().slice(0, 10));
  const due = db.prepare(`SELECT l.id, l.name, l.city, l.phone, b.date,
      b.net - COALESCE((SELECT SUM(amount) FROM bill_payments WHERE bill_id=b.id),0)
            - COALESCE((SELECT SUM(amount) FROM voucher_adjustments WHERE bill_id=b.id),0)
            - COALESCE((SELECT SUM(r.net) FROM bills r WHERE r.type='SALE_RETURN' AND r.against_bill_id=b.id),0) AS due
    FROM bills b JOIN ledgers l ON l.id=b.party_id
    WHERE b.type='SALE' AND b.mode<>'CASH' AND b.date<=?`).all(upto) as { id: number; name: string; city: string; phone: string; date: string; due: number }[];
  const SLABS = [30, 60, 90, 180];
  const by = new Map<number, Row>();
  for (const d of due) {
    if (d.due <= 0.004) continue;
    const days = Math.round((Date.parse(upto) - Date.parse(d.date)) / 864e5);
    const slab = SLABS.findIndex((s) => days <= s);
    const p = by.get(d.id) ?? { id: d.id, name: d.name, city: d.city, phone: d.phone, bills: 0, s0: 0, s1: 0, s2: 0, s3: 0, s4: 0, total: 0 };
    p[`s${slab < 0 ? 4 : slab}`] = r2(Number(p[`s${slab < 0 ? 4 : slab}`]) + d.due);
    p.total = r2(Number(p.total) + d.due);
    p.bills = Number(p.bills) + 1;
    by.set(d.id, p);
  }
  return [...by.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}));

app.get('/api/reports/gstr3b', h((req) => {
  const { from, to } = req.query as Record<string, string>;
  const sum = (types: string) => db.prepare(`SELECT COALESCE(SUM(taxable),0) AS taxable, COALESCE(SUM(tax),0) AS tax, COUNT(*) AS bills
    FROM bills WHERE type IN (${types}) AND date BETWEEN ? AND ?`).get(from, to) as { taxable: number; tax: number; bills: number };
  const sales = sum(`'SALE','COUNTER_SALE'`), saleRet = sum(`'SALE_RETURN'`);
  const purch = sum(`'PURCHASE'`), purRet = sum(`'PURCHASE_RETURN'`);
  const outTax = r2(sales.tax - saleRet.tax), inTax = r2(purch.tax - purRet.tax);
  return {
    outward: { taxable: r2(sales.taxable - saleRet.taxable), tax: outTax, bills: sales.bills, returns: saleRet.bills },
    inward: { taxable: r2(purch.taxable - purRet.taxable), tax: inTax, bills: purch.bills, returns: purRet.bills },
    payable: r2(outTax - inTax),
  };
}));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const msg = err.message.includes('UNIQUE') ? 'Duplicate entry — name / number already exists' : err.message;
  res.status(400).json({ error: msg });
});

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, () => console.log(`Flow Ledger ERP running at http://localhost:${PORT}`));

// ---------------------------------------------------------------- admin panel
// A separate page on its own port for companies, users and roles. It serves only
// admin-public/ and hands /api/* to the same app, so data, sessions and every
// permission check are shared with the ERP. CORS is open so a mobile app (APK)
// can call it; that is safe because auth is a Bearer token, not a cookie.
const ADMIN_PORT = Number(process.env.ADMIN_PORT) || 3100;
const admin = express();
admin.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});
admin.use(express.static(join(process.cwd(), 'admin-public')));
admin.use((req, res, next) => (req.path.startsWith('/api/') ? app(req, res, next) : next()));
admin.listen(ADMIN_PORT, () => console.log(`Flow Ledger SuperAdmin running at http://localhost:${ADMIN_PORT}`));
