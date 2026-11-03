import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { DEFAULT_ROLES } from '../shared/perms.ts';
import { menuPermsFromFeatures, leavesForAction } from '../shared/menuPerms.ts';
import { USER_MENU, type MenuEntry } from '../client/menu.ts';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

export const dataDir = join(process.cwd(), 'data');
mkdirSync(join(dataDir, 'companies'), { recursive: true });

function open(file: string) {
  const d = new DatabaseSync(join(dataDir, file));
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return d;
}

/**
 * data/marg.db is the system file: users, roles and the LIST OF COMPANIES. It is also
 * the data file of the first company (TAMRAKAR AGROTECH), so existing data stays put.
 * Every other company has its own file in data/companies/.
 */
export const sysDb = open('marg.db');
/** The open company's database — switched per request by useCompany(). */
export let db: DatabaseSync = sysDb;

const COMPANY_SCHEMA = `
CREATE TABLE IF NOT EXISTS company (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL, address1 TEXT, address2 TEXT, gstin TEXT, state TEXT,
  fy_start TEXT NOT NULL, fy_end TEXT NOT NULL, email TEXT, phone TEXT
);
CREATE TABLE IF NOT EXISTS account_groups (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
  nature TEXT NOT NULL CHECK (nature IN ('ASSET','LIABILITY','INCOME','EXPENSE')),
  is_system INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  group_id INTEGER NOT NULL REFERENCES account_groups(id),
  address TEXT, city TEXT, phone TEXT, gstin TEXT, state TEXT,
  opening REAL NOT NULL DEFAULT 0, opening_type TEXT NOT NULL DEFAULT 'Dr',
  credit_limit REAL NOT NULL DEFAULT 0, is_system INTEGER NOT NULL DEFAULT 0,
  details TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL COLLATE NOCASE,   -- unique together with pack (items_name_pack)
  company TEXT, unit TEXT NOT NULL DEFAULT 'PCS', pack TEXT, hsn TEXT,
  gst_rate REAL NOT NULL DEFAULT 0, mrp REAL NOT NULL DEFAULT 0,
  sale_rate REAL NOT NULL DEFAULT 0, purchase_rate REAL NOT NULL DEFAULT 0,
  opening_stock REAL NOT NULL DEFAULT 0, min_stock REAL NOT NULL DEFAULT 0,
  reorder_qty REAL NOT NULL DEFAULT 0,
  expiry TEXT DEFAULT '', batch TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('SALE','PURCHASE','SALE_CHALLAN','PURCHASE_CHALLAN','SALE_RETURN','PURCHASE_RETURN','COUNTER_SALE')),
  no TEXT NOT NULL, date TEXT NOT NULL,
  party_id INTEGER NOT NULL REFERENCES ledgers(id),
  mode TEXT NOT NULL DEFAULT 'CREDIT',
  gross REAL NOT NULL DEFAULT 0, discount REAL NOT NULL DEFAULT 0,
  taxable REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0,
  cd_pct REAL NOT NULL DEFAULT 0, cd_amt REAL NOT NULL DEFAULT 0,
  freight REAL NOT NULL DEFAULT 0, other_charges REAL NOT NULL DEFAULT 0,
  round_off REAL NOT NULL DEFAULT 0, net REAL NOT NULL DEFAULT 0,
  narration TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (type, no)
);
CREATE TABLE IF NOT EXISTS bill_items (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES items(id),
  batch TEXT, expiry TEXT, qty REAL NOT NULL, free REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL, disc_pct REAL NOT NULL DEFAULT 0,
  gst_rate REAL NOT NULL DEFAULT 0, taxable REAL NOT NULL, tax REAL NOT NULL,
  amount REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS vouchers (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('RECEIPT','PAYMENT','CONTRA','JOURNAL','DEBIT_NOTE','CREDIT_NOTE')),
  no TEXT NOT NULL, date TEXT NOT NULL, narration TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (type, no)
);
CREATE TABLE IF NOT EXISTS voucher_lines (
  id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
  debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0
);
-- Every financial effect lands here, so all books/reports read from one table.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id INTEGER PRIMARY KEY,
  source TEXT NOT NULL CHECK (source IN ('BILL','VOUCHER')),
  source_id INTEGER NOT NULL, date TEXT NOT NULL,
  ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
  debit REAL NOT NULL DEFAULT 0, credit REAL NOT NULL DEFAULT 0,
  vtype TEXT NOT NULL, vno TEXT NOT NULL, narration TEXT
);
CREATE INDEX IF NOT EXISTS ix_le_ledger ON ledger_entries(ledger_id, date);
CREATE INDEX IF NOT EXISTS ix_le_source ON ledger_entries(source, source_id);
CREATE INDEX IF NOT EXISTS ix_bi_item ON bill_items(item_id);
-- added for the Marg-style SALE ENTRY screen (M.R., batches, payment modes)
CREATE TABLE IF NOT EXISTS salesmen (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, area TEXT
);
CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  batch TEXT NOT NULL DEFAULT '', expiry TEXT, mrp REAL NOT NULL DEFAULT 0,
  rate REAL NOT NULL DEFAULT 0, f_rate REAL NOT NULL DEFAULT 0, purchase_rate REAL NOT NULL DEFAULT 0,
  opening_qty REAL NOT NULL DEFAULT 0, supplier TEXT, invoice_no TEXT, invoice_date TEXT
);
CREATE TABLE IF NOT EXISTS bill_payments (
  id INTEGER PRIMARY KEY,
  bill_id INTEGER NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  ledger_id INTEGER NOT NULL REFERENCES ledgers(id),
  amount REAL NOT NULL, remark TEXT, detail TEXT
);
CREATE TABLE IF NOT EXISTS company_years (
  id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, fy_start TEXT NOT NULL, fy_end TEXT NOT NULL,
  backup_upto TEXT, freez_upto TEXT
);
CREATE INDEX IF NOT EXISTS ix_batch_item ON batches(item_id);
-- RECEIPT bill adjustment: which sale bills a receipt settles (Adj Ref), or an on-account New Ref (bill_id NULL).
CREATE TABLE IF NOT EXISTS voucher_adjustments (
  id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
  bill_id INTEGER REFERENCES bills(id) ON DELETE CASCADE,
  amount REAL NOT NULL, remark TEXT
);
CREATE INDEX IF NOT EXISTS ix_vadj_bill ON voucher_adjustments(bill_id);
`;
// New columns on existing tables (ignored when they already exist).
const COMPANY_ALTERS = [
  // NEW PRODUCT's fields that have no column of their own (status, hide, color type, rack, schedule H1 …), as JSON.
  "ALTER TABLE items ADD COLUMN details TEXT NOT NULL DEFAULT '{}'",
  "ALTER TABLE items ADD COLUMN expiry TEXT DEFAULT ''",
  "ALTER TABLE items ADD COLUMN batch TEXT DEFAULT ''",
  // CREATE LEDGER's full fields (contact person, phone off/res, DL, licence, VAT, food, route …), as JSON.
  "ALTER TABLE ledgers ADD COLUMN details TEXT NOT NULL DEFAULT '{}'",
  // SALE RETURN: the customer's Party No. / Dt, the reason, the bill returned against and the calculation type.
  'ALTER TABLE bills ADD COLUMN ref_no TEXT',
  'ALTER TABLE bills ADD COLUMN ref_date TEXT',
  'ALTER TABLE bills ADD COLUMN reason TEXT',
  'ALTER TABLE bills ADD COLUMN against_bill_id INTEGER',
  'ALTER TABLE bills ADD COLUMN calc_type TEXT',
  'ALTER TABLE bills ADD COLUMN mr_id INTEGER',
  "ALTER TABLE bills ADD COLUMN sale_type TEXT NOT NULL DEFAULT 'LOCAL'",
  'ALTER TABLE bills ADD COLUMN walkin_name TEXT',
  'ALTER TABLE bills ADD COLUMN walkin_gstin TEXT',
  'ALTER TABLE bills ADD COLUMN walkin_mobile TEXT',
  'ALTER TABLE bills ADD COLUMN walkin_address TEXT',
  'ALTER TABLE bill_items ADD COLUMN batch_id INTEGER',
  'ALTER TABLE bill_items ADD COLUMN mrp REAL NOT NULL DEFAULT 0',
  'ALTER TABLE bills ADD COLUMN cd_pct REAL NOT NULL DEFAULT 0',
  'ALTER TABLE bills ADD COLUMN cd_amt REAL NOT NULL DEFAULT 0',
  'ALTER TABLE bills ADD COLUMN freight REAL NOT NULL DEFAULT 0',
  'ALTER TABLE bills ADD COLUMN other_charges REAL NOT NULL DEFAULT 0',
];

export const SYS = {
  CASH: 'Cash',
  SALES: 'Sales A/c',
  PURCHASE: 'Purchase A/c',
  CGST_OUT: 'Output CGST',
  SGST_OUT: 'Output SGST',
  CGST_IN: 'Input CGST',
  SGST_IN: 'Input SGST',
  ROUND: 'Round Off',
  SALE_RET: 'Sales Return A/c',
  PUR_RET: 'Purchase Return A/c',
} as const;

/** The financial year running today (April to March). */
export function currentFy() {
  const d = new Date();
  return `${d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear()}-04-01`;
}

export interface CompanyInfo { name: string; address1?: string; address2?: string; gstin?: string; state?: string; fy_start: string }

/**
 * A product is unique by NAME + PACKING (KASOL 500ML and KASOL 1LTR are two items).
 * Files made before this had UNIQUE on the name alone: rebuild that table once.
 */
function itemsUniqueByPack(d: DatabaseSync) {
  const sql = (d.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='items'").get() as { sql: string } | undefined)?.sql ?? '';
  if (/name TEXT NOT NULL UNIQUE/i.test(sql)) {
    const cols = (d.prepare('PRAGMA table_info(items)').all() as { name: string }[]).map((c) => c.name).join(',');
    d.exec('PRAGMA foreign_keys = OFF');
    try {
      d.exec('BEGIN');
      d.exec(`CREATE TABLE items_new (${sql.slice(sql.indexOf('(') + 1, sql.lastIndexOf(')')).replace(/name TEXT NOT NULL UNIQUE COLLATE NOCASE/i, 'name TEXT NOT NULL COLLATE NOCASE')})`);
      d.exec(`INSERT INTO items_new (${cols}) SELECT ${cols} FROM items`);
      d.exec('DROP TABLE items');
      d.exec('ALTER TABLE items_new RENAME TO items');
      d.exec('COMMIT');
    } catch (e) { d.exec('ROLLBACK'); throw e; } finally { d.exec('PRAGMA foreign_keys = ON'); }
  }
  d.exec("UPDATE items SET pack='' WHERE pack IS NULL");
  d.exec('CREATE UNIQUE INDEX IF NOT EXISTS items_name_pack ON items (name COLLATE NOCASE, pack COLLATE NOCASE)');
}

/** Schema, account groups, system ledgers and the first year for a company file. `demo` adds sample data. */
function initCompany(d: DatabaseSync, info: CompanyInfo, demo: boolean) {
  d.exec(COMPANY_SCHEMA);
  for (const sql of COMPANY_ALTERS) { try { d.exec(sql); } catch { /* column already there */ } }
  itemsUniqueByPack(d);
  if (demo) demoExtras(d);   // also tops up an existing demo file (batches, modes, years)
  if (d.prepare('SELECT 1 FROM company').get()) return;

  const y = Number(info.fy_start.slice(0, 4));
  const st = info.state ?? '';
  d.prepare(`INSERT INTO company (id,name,address1,address2,gstin,state,fy_start,fy_end,email)
    VALUES (1,?,?,?,?,?,?,?,?)`).run(info.name, info.address1 ?? '', info.address2 ?? '', info.gstin ?? '', st,
    `${y}-04-01`, `${y + 1}-03-31`, '');

  const groups: [string, string][] = [
    ['Sundry Debtors', 'ASSET'], ['Sundry Creditors', 'LIABILITY'],
    ['Cash-in-hand', 'ASSET'], ['Bank Accounts', 'ASSET'],
    ['Sales Accounts', 'INCOME'], ['Purchase Accounts', 'EXPENSE'],
    ['Duties & Taxes', 'LIABILITY'], ['Direct Expenses', 'EXPENSE'],
    ['Indirect Expenses', 'EXPENSE'], ['Direct Incomes', 'INCOME'],
    ['Indirect Incomes', 'INCOME'], ['Capital Account', 'LIABILITY'],
    ['Loans (Liability)', 'LIABILITY'], ['Fixed Assets', 'ASSET'],
    ['Current Assets', 'ASSET'], ['Current Liabilities', 'LIABILITY'],
  ];
  const insG = d.prepare('INSERT INTO account_groups (name,nature,is_system) VALUES (?,?,1)');
  for (const [n, t] of groups) insG.run(n, t);
  const gid = (n: string) => (d.prepare('SELECT id FROM account_groups WHERE name=?').get(n) as { id: number }).id;

  const insL = d.prepare('INSERT INTO ledgers (name,group_id,is_system,state) VALUES (?,?,1,?)');
  insL.run(SYS.CASH, gid('Cash-in-hand'), st);
  insL.run(SYS.SALES, gid('Sales Accounts'), st);
  insL.run(SYS.SALE_RET, gid('Sales Accounts'), st);
  insL.run(SYS.PURCHASE, gid('Purchase Accounts'), st);
  insL.run(SYS.PUR_RET, gid('Purchase Accounts'), st);
  for (const n of [SYS.CGST_OUT, SYS.SGST_OUT, SYS.CGST_IN, SYS.SGST_IN]) insL.run(n, gid('Duties & Taxes'), st);
  insL.run(SYS.ROUND, gid('Indirect Expenses'), st);

  if (!demo) {
    d.prepare('INSERT INTO company_years (code,fy_start,fy_end) VALUES (?,?,?)').run('A01', `${y}-04-01`, `${y + 1}-03-31`);
    return;
  }
  const insP = d.prepare(`INSERT INTO ledgers (name,group_id,address,city,phone,gstin,state,opening,opening_type)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  insP.run('State Bank of India', gid('Bank Accounts'), 'Main Branch', 'Durg', '', '', st, 50000, 'Dr');
  insP.run('Ramesh Kisan Kendra', gid('Sundry Debtors'), 'Dhamdha', 'Durg', '9876543210', '', st, 0, 'Dr');
  insP.run('Shree Krishi Seva', gid('Sundry Debtors'), 'Bemetara Road', 'Bemetara', '9876500011', '22ABCDE1234F1Z5', st, 2500, 'Dr');
  insP.run('Bayer CropScience Ltd', gid('Sundry Creditors'), 'MIDC', 'Raipur', '', '22AAACB1234C1Z1', st, 0, 'Cr');
  insP.run('UPL Limited', gid('Sundry Creditors'), 'Industrial Area', 'Raipur', '', '22AAACU5678D1Z2', st, 15000, 'Cr');
  insP.run('Capital A/c', gid('Capital Account'), '', '', '', '', st, 37500, 'Cr');
  insP.run('Shop Rent', gid('Indirect Expenses'), '', '', '', '', st, 0, 'Dr');

  const insI = d.prepare(`INSERT INTO items (name,company,unit,pack,hsn,gst_rate,mrp,sale_rate,purchase_rate,opening_stock,min_stock,reorder_qty)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  insI.run('CONFIDOR 100ML', 'BAYER', 'BTL', '100ML', '38089199', 18, 450, 410, 340, 40, 10, 24);
  insI.run('ROUNDUP 1LTR', 'BAYER', 'BTL', '1LTR', '38089390', 18, 620, 560, 470, 25, 5, 12);
  insI.run('SAAF 500GM', 'UPL', 'PKT', '500GM', '38089290', 18, 380, 340, 280, 60, 15, 30);
  insI.run('UREA 45KG', 'IFFCO', 'BAG', '45KG', '31021000', 5, 266.5, 266.5, 242, 100, 20, 50);
  insI.run('DAP 50KG', 'IFFCO', 'BAG', '50KG', '31053000', 5, 1350, 1350, 1260, 50, 10, 25);
  insI.run('PADDY SEED MTU1010 10KG', 'NSC', 'BAG', '10KG', '10061010', 0, 650, 600, 500, 30, 10, 20);
  demoExtras(d);
}

/** Demo M.R.s, payment-mode ledgers, batches and past years — each only when missing. */
function demoExtras(d: DatabaseSync) {
  const c = d.prepare('SELECT fy_start, state FROM company WHERE id=1').get() as { fy_start: string; state: string } | undefined;
  if (!c) return;   // runs again once the company row exists
  const gid = (n: string) => (d.prepare('SELECT id FROM account_groups WHERE name=?').get(n) as { id: number }).id;
  if (!d.prepare('SELECT 1 FROM salesmen').get()) {
    const ins = d.prepare('INSERT INTO salesmen (name,area) VALUES (?,?)');
    ins.run('RAJA MR', 'DURG');
    ins.run('SONU', 'DHAMDHA');
  }
  if (!d.prepare('SELECT 1 FROM company_years').get()) {
    const ins = d.prepare('INSERT INTO company_years (code,fy_start,fy_end,backup_upto) VALUES (?,?,?,?)');
    const y0 = Number(c.fy_start.slice(0, 4));
    for (let i = 0; i < 4; i++) {
      const y = y0 - i;
      ins.run(`A0${5 - i}`, `${y}-04-01`, `${y + 1}-03-31`, i === 0 ? null : `${y + 1}-03-31`);
    }
  }
  // Payment modes are simply the cash / bank ledgers, as in Marg.
  for (const [name, group] of [['CASH KHAD', 'Cash-in-hand'], ['AXIS BANK', 'Bank Accounts'], ['GOOGLE PAY', 'Bank Accounts']] as const) {
    if (!d.prepare('SELECT 1 FROM ledgers WHERE name=?').get(name)) {
      d.prepare('INSERT INTO ledgers (name,group_id,state) VALUES (?,?,?)').run(name, gid(group), c.state);
    }
  }
  if (!d.prepare('SELECT 1 FROM batches').get()) {
    for (const it of d.prepare('SELECT * FROM items').all() as Row[]) demoBatches(d, it);
  }
  seedMockItems(d);
}

/** Two demo batches (60% / 40% of the opening stock) for an item. */
function demoBatches(d: DatabaseSync, it: Row) {
  const ins = d.prepare(`INSERT INTO batches (item_id,batch,expiry,mrp,rate,f_rate,purchase_rate,opening_qty,supplier,invoice_no,invoice_date)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`);
  const id = it.id as number, mrp = it.mrp as number, rate = it.sale_rate as number, pr = it.purchase_rate as number;
  const stock = it.opening_stock as number;
  ins.run(id, 'B001', '2028-03-31', mrp, rate, rate, pr, Math.ceil(stock * 0.6), 'MONTU BHAIYA', '14012401', '2026-01-14');
  ins.run(id, 'B002', '2029-06-30', mrp, rate, rate, pr, Math.floor(stock * 0.4), 'BAYER CROPSCIENCE LTD', '22045612', '2026-04-22');
}

// Mock products: name, company, unit, pack, hsn, gst%, mrp, sale rate, purchase rate, opening stock, min stock, reorder qty
const MOCK_ITEMS: [string, string, string, string, string, number, number, number, number, number, number, number][] = [
  ['CORAGEN 60ML', 'FMC', 'BTL', '60ML', '38089199', 18, 950, 880, 760, 30, 8, 20],
  ['AMISTAR TOP 200ML', 'SYNGENTA', 'BTL', '200ML', '38089290', 18, 1150, 1060, 920, 24, 6, 12],
  ['KARATE 250ML', 'SYNGENTA', 'BTL', '250ML', '38089199', 18, 520, 480, 400, 36, 10, 24],
  ['TILT 250ML', 'SYNGENTA', 'BTL', '250ML', '38089290', 18, 690, 640, 545, 20, 5, 12],
  ['NATIVO 100GM', 'BAYER', 'PKT', '100GM', '38089290', 18, 560, 520, 440, 28, 8, 20],
  ['ULALA 150GM', 'UPL', 'PKT', '150GM', '38089199', 18, 740, 690, 590, 18, 5, 12],
  ['WEEDMAR 500ML', 'DHANUKA', 'BTL', '500ML', '38089390', 18, 310, 290, 235, 40, 10, 24],
  ['GLYCEL 1LTR', 'EXCEL', 'BTL', '1LTR', '38089390', 18, 540, 495, 410, 22, 6, 12],
  ['MANCOZEB 75WP 500GM', 'INDOFIL', 'PKT', '500GM', '38089290', 18, 290, 265, 210, 50, 12, 30],
  ['CHLORPYRIFOS 20EC 1LTR', 'DHANUKA', 'BTL', '1LTR', '38089199', 18, 560, 515, 430, 26, 6, 12],
  ['NEEM OIL 1500PPM 1LTR', 'MULTIPLEX', 'BTL', '1LTR', '38089199', 18, 580, 540, 440, 22, 6, 12],
  ['NPK 12:32:16 50KG', 'IFFCO', 'BAG', '50KG', '31052000', 5, 1470, 1470, 1380, 40, 10, 25],
  ['MOP 50KG', 'IPL', 'BAG', '50KG', '31042000', 5, 1700, 1700, 1590, 30, 8, 20],
  ['SSP 50KG', 'COROMANDEL', 'BAG', '50KG', '31031900', 5, 450, 450, 410, 60, 15, 30],
  ['ZINC SULPHATE 5KG', 'COROMANDEL', 'BAG', '5KG', '28332990', 5, 420, 390, 330, 35, 10, 20],
  ['NANO UREA 500ML', 'IFFCO', 'BTL', '500ML', '31021000', 5, 225, 225, 200, 80, 20, 48],
  ['NPK 19:19:19 1KG', 'MAHADHAN', 'PKT', '1KG', '31059090', 5, 180, 165, 135, 70, 15, 40],
  ['HUMIC ACID 1KG', 'GODREJ AGROVET', 'PKT', '1KG', '31010099', 5, 350, 320, 255, 25, 6, 12],
  ['WHEAT SEED HD2967 40KG', 'NSC', 'BAG', '40KG', '10011900', 0, 1800, 1700, 1480, 20, 5, 10],
  ['SOYBEAN SEED JS9560 30KG', 'MAHABEEJ', 'BAG', '30KG', '12019000', 0, 2850, 2700, 2380, 15, 4, 10],
  ['HYBRID MAIZE SEED 4KG', 'PIONEER', 'PKT', '4KG', '10051000', 0, 1650, 1560, 1350, 25, 6, 12],
  ['TOMATO SEED 10GM', 'SEMINIS', 'PKT', '10GM', '12099190', 0, 620, 580, 480, 40, 10, 24],
  ['KNAPSACK SPRAYER 16LTR', 'ASPEE', 'PCS', '16LTR', '84242000', 12, 2450, 2250, 1850, 10, 3, 6],
  ['MULCHING FILM 400MTR', 'GARWARE', 'ROL', '400MTR', '39201099', 18, 3200, 2950, 2500, 8, 2, 5],
];

/** Adds any mock product the company doesn't have yet, with its demo batches. */
export function seedMockItems(d: DatabaseSync) {
  const has = d.prepare('SELECT 1 FROM items WHERE name=?');
  const ins = d.prepare(`INSERT INTO items (name,company,unit,pack,hsn,gst_rate,mrp,sale_rate,purchase_rate,opening_stock,min_stock,reorder_qty)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const m of MOCK_ITEMS) {
    if (has.get(m[0])) continue;
    const id = Number(ins.run(...m).lastInsertRowid);
    demoBatches(d, d.prepare('SELECT * FROM items WHERE id=?').get(id) as Row);
  }
}

// ---------------------------------------------------------------- system file: users, roles, companies
sysDb.exec(`
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  is_super INTEGER NOT NULL DEFAULT 0,
  perms TEXT NOT NULL DEFAULT '[]'          -- JSON array of permission keys
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL, hash TEXT NOT NULL, is_admin INTEGER NOT NULL DEFAULT 0,
  role_id INTEGER REFERENCES roles(id)
);
-- LIST OF COMPANIES. file = the company's database, relative to data/.
CREATE TABLE IF NOT EXISTS companies (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, station TEXT NOT NULL DEFAULT '',
  address1 TEXT, address2 TEXT, gstin TEXT, state TEXT,
  file TEXT NOT NULL UNIQUE
);
`);
try { sysDb.exec('ALTER TABLE users ADD COLUMN role_id INTEGER REFERENCES roles(id)'); } catch { /* already there */ }
try { sysDb.exec("ALTER TABLE users ADD COLUMN access_type TEXT NOT NULL DEFAULT 'BOTH'"); } catch { /* already there */ }
try { sysDb.exec("ALTER TABLE users ADD COLUMN app_perms TEXT NOT NULL DEFAULT '{}'"); } catch { /* already there */ }
// Companies the user may open, as "1,3"; '' = every company.
try { sysDb.exec("ALTER TABLE users ADD COLUMN company_ids TEXT NOT NULL DEFAULT ''"); } catch { /* already there */ }
// COMPANY CREATION's other fields (phone, licences, working style …) as JSON.
try { sysDb.exec("ALTER TABLE companies ADD COLUMN details TEXT NOT NULL DEFAULT '{}'"); } catch { /* already there */ }
export const SEED_DEMO = process.env.SEED_DEMO === 'true';

// The first company lives in marg.db itself if demo data is enabled.
if (SEED_DEMO) {
  initCompany(sysDb, {
    name: 'TAMRAKAR AGROTECH-DURG', address1: 'SHOP NO.34,KRISHI UPAJ MANDI DHAMDHA', address2: 'ROAD DURG (C.G.)',
    gstin: '22', state: 'Chhattisgarh', fy_start: '2026-04-01',
  }, true);
} else {
  sysDb.exec(COMPANY_SCHEMA);
  for (const sql of COMPANY_ALTERS) { try { sysDb.exec(sql); } catch { /* column already there */ } }
  itemsUniqueByPack(sysDb);
}

/** scrypt password hashing — keeps plain passwords out of the database file. */
export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return { salt, hash: scryptSync(password, salt, 64).toString('hex') };
}
export function checkPassword(password: string, salt: string, hash: string) {
  const a = Buffer.from(hash, 'hex');
  const b = scryptSync(password, salt, 64);
  return a.length === b.length && timingSafeEqual(a, b);
}

function seedSystem() {
  if (!sysDb.prepare('SELECT 1 FROM roles').get()) {
    const ins = sysDb.prepare('INSERT INTO roles (name,is_super,perms) VALUES (?,?,?)');
    for (const r of DEFAULT_ROLES) ins.run(r.name, r.is_super ? 1 : 0, JSON.stringify(r.perms));
  }
  // Roles saved with the old 33 feature permissions → one permission per menu item.
  try { sysDb.exec('ALTER TABLE roles ADD COLUMN menu_perms INTEGER NOT NULL DEFAULT 0'); } catch { /* already there */ }
  const old = sysDb.prepare('SELECT id, is_super, perms FROM roles WHERE menu_perms=0').all() as { id: number; is_super: number; perms: string }[];
  const setPerms = sysDb.prepare('UPDATE roles SET perms=?, menu_perms=1 WHERE id=?');
  for (const r of old) setPerms.run(r.is_super ? '[]' : JSON.stringify(menuPermsFromFeatures(JSON.parse(r.perms) as string[])), r.id);   // SuperAdmin needs no list

  const roleId = (n: string) => (sysDb.prepare('SELECT id FROM roles WHERE name=?').get(n) as { id: number }).id;
  if (!sysDb.prepare('SELECT 1 FROM users').get()) {
    const ins = sysDb.prepare('INSERT INTO users (name,salt,hash,is_admin,role_id) VALUES (?,?,?,?,?)');
    const saUser = (process.env.SUPERADMIN_USER || 'NK').trim().toUpperCase();
    const saPass = process.env.SUPERADMIN_PASS || 'marg';
    const sa = hashPassword(saPass);
    ins.run(saUser, sa.salt, sa.hash, 1, roleId('SUPERADMIN'));
    const admin = hashPassword('admin');
    ins.run('ADMIN', admin.salt, admin.hash, 1, roleId('ADMIN'));
  }
  // USER role: the short My Menu bar. It gets the menu items that open the same screens
  // as My Menu, so SuperAdmin can still untick any of them in Roles & Permissions.
  if (!sysDb.prepare("SELECT 1 FROM roles WHERE name='USER'").get()) {
    const actions: string[] = [];
    const walk = (items: MenuEntry[]) => items.forEach((m) => { if (m === '-') return; if (m.action) actions.push(m.action); if (m.children) walk(m.children); });
    walk(USER_MENU);
    const perms = [...new Set(actions.flatMap((a) => leavesForAction(a).slice(0, 1).map((l) => l.key)))];
    sysDb.prepare("INSERT INTO roles (name,is_super,perms,menu_perms) VALUES ('USER',0,?,1)").run(JSON.stringify(perms));
    if (!sysDb.prepare("SELECT 1 FROM users WHERE name='USER'").get()) {
      const u = hashPassword('user');
      sysDb.prepare('INSERT INTO users (name,salt,hash,is_admin,role_id) VALUES (?,?,?,0,?)').run('USER', u.salt, u.hash, roleId('USER'));
    }
  }
  // One-time fixes to stored data, each run once (so a later untick by SuperAdmin sticks).
  sysDb.exec('CREATE TABLE IF NOT EXISTS migrations (name TEXT PRIMARY KEY)');
  const once = (name: string, fn: () => void) => {
    if (sysDb.prepare('SELECT 1 FROM migrations WHERE name=?').get(name)) return;
    fn();
    sysDb.prepare('INSERT INTO migrations (name) VALUES (?)').run(name);
  };
  // My Menu → Challan became PURCHASE CHALLAN (as in MARG): give the USER role that menu item.
  once('user-role-purchase-challan', () => {
    const r = sysDb.prepare("SELECT id, perms FROM roles WHERE name='USER'").get() as { id: number; perms: string } | undefined;
    const leaf = leavesForAction('bill.new:PURCHASE_CHALLAN')[0];
    if (!r || !leaf) return;
    const perms = new Set(JSON.parse(r.perms) as string[]);
    perms.add(leaf.key);
    sysDb.prepare('UPDATE roles SET perms=? WHERE id=?').run(JSON.stringify([...perms]), r.id);
  });
  // Users created before roles existed: NK becomes SuperAdmin, everyone else Admin.
  sysDb.prepare("UPDATE users SET role_id=? WHERE role_id IS NULL AND name='NK'").run(roleId('SUPERADMIN'));
  sysDb.prepare('UPDATE users SET role_id=? WHERE role_id IS NULL').run(roleId('ADMIN'));
  // There must always be at least one SuperAdmin who can get back in.
  const supers = sysDb.prepare('SELECT COUNT(*) AS c FROM users u JOIN roles r ON r.id=u.role_id WHERE r.is_super=1').get() as { c: number };
  if (!supers.c) sysDb.prepare('UPDATE users SET role_id=? WHERE id=(SELECT MIN(id) FROM users)').run(roleId('SUPERADMIN'));

  if (SEED_DEMO && !sysDb.prepare('SELECT 1 FROM companies').get()) {
    const c = sysDb.prepare('SELECT * FROM company WHERE id=1').get() as Row | undefined;
    if (c) {
      const ins = sysDb.prepare('INSERT INTO companies (name,station,address1,address2,gstin,state,file) VALUES (?,?,?,?,?,?,?)');
      ins.run('ABC', 'ABC', 'TEST', '', '', 'Chhattisgarh', 'companies/abc.db');
      ins.run('BARTAN SHOP', 'BASH', '', '', '', 'Chhattisgarh', 'companies/bash.db');
      ins.run('TAMRAKAR AGROTECH', 'DURG', c.address1 as string, c.address2 as string, c.gstin as string, c.state as string, 'marg.db');
    }
  }
}
seedSystem();

// ---------------------------------------------------------------- companies
export interface CompanyRow { id: number; name: string; station: string; address1: string; address2: string; gstin: string; state: string; file: string }

export const companyRow = (id: unknown) => sysDb.prepare('SELECT * FROM companies WHERE id=?').get(Number(id)) as CompanyRow | undefined;

const open_ = new Map<string, DatabaseSync>([['marg.db', sysDb]]);
/** The database of a company, created (with account groups and system ledgers) on first use. */
export function companyDb(c: CompanyRow): DatabaseSync {
  let d = open_.get(c.file);
  if (!d) {
    d = open(c.file);
    initCompany(d, { name: c.station ? `${c.name}-${c.station}` : c.name, address1: c.address1, address2: c.address2, gstin: c.gstin, state: c.state, fy_start: currentFy() }, false);
    open_.set(c.file, d);
  }
  return d;
}

/** Point `db` at a company's file for the request being handled. */
export function useCompany(id: number) {
  const c = companyRow(id);
  if (!c) throw new Error('Company not found — select it again from the company list (F1)');
  db = companyDb(c);
  return c;
}

export type Row = Record<string, unknown>;

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

export function sysLedger(name: string): number {
  const r = db.prepare('SELECT id FROM ledgers WHERE name=?').get(name) as { id: number } | undefined;
  if (!r) throw new Error(`System ledger missing: ${name}`);
  return r.id;
}
