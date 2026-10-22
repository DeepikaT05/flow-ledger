import { api, openWin, GridList, formWin, confirmBox, toast, pick, money, drcr, esc, type Field } from './ui.ts';
import { seeCost, canDelete, NO_DELETE } from './session.ts';
import { productScreen } from './productform.ts';

export interface Ledger { id: number; name: string; group_id: number; group_name: string; nature: string; city: string; phone: string; gstin: string; state: string; address: string; opening: number; opening_type: string; credit_limit: number; balance: number; is_system: number; details?: string }
export interface Item { id: number; name: string; company: string; unit: string; pack: string; hsn: string; gst_rate: number; mrp: number; sale_rate: number; purchase_rate: number; opening_stock: number; min_stock: number; reorder_qty: number; stock: number }
interface Group { id: number; name: string; nature: string }

import { ledgerScreen } from './ledgerform.ts';

// ------------------------------------------------------------------ ledgers
export async function ledgerForm(existing?: Partial<Ledger>, defaultGroup?: string): Promise<Ledger | null> {
  return ledgerScreen(existing, defaultGroup);
}

export async function ledgerList(group?: string) {
  const m = await import('./ledgers.ts');
  return m.ledgerAlteration(group);
}


export async function pickLedger(title = 'Select Party', group?: string, initial = ''): Promise<Ledger | null> {
  const rows = await api<Ledger[]>(`/ledgers${group ? `?group=${encodeURIComponent(group)}` : ''}`);
  return pick<Ledger>({
    title, rows, initial, size: 'wide', key: (r) => r.name,
    cols: [
      { title: 'Name', get: (r) => r.name }, { title: 'Station', get: (r) => r.city },
      { title: 'Group', get: (r) => r.group_name }, { title: 'Balance', get: (r) => drcr(r.balance), num: true },
    ],
    onNew: () => ledgerForm(undefined, group?.split(',')[0]),
  });
}

export async function groupList() {
  const w = openWin('Account Groups', 'mid', '<span><b>F2</b> Add</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '60vh';
  const g = new GridList<Group>(w.body, [{ title: 'Group', get: (r) => r.name }, { title: 'Nature', get: (r) => r.nature }], (r) => r.name);
  const load = async () => g.setRows(await api<Group[]>('/groups'));
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    if (k === 'F2') { groupForm().then((r) => r && load()); return true; }
    return false;
  };
}
export function groupForm() {
  return formWin('Add Account Group', [
    { name: 'name', label: 'Group Name', required: true },
    { name: 'nature', label: 'Nature', type: 'select', options: ['ASSET', 'LIABILITY', 'INCOME', 'EXPENSE'].map((v) => ({ value: v, label: v })) },
  ], {}, (v) => api('/groups', { method: 'POST', body: v }));
}

// ------------------------------------------------------------------ items
/** F2 NEW PRODUCT / F3 MODIFY PRODUCT (the MARG product screen). */
export function itemForm(existing?: Partial<Item>): Promise<Item | null> {
  return productScreen(existing);
}

const itemCols = [
  { title: 'Item Name', get: (r: Item) => r.name },
  { title: 'Pack', get: (r: Item) => r.pack },
  { title: 'Company', get: (r: Item) => r.company },
  { title: 'Stock', get: (r: Item) => r.stock, num: true },
  { title: 'MRP', get: (r: Item) => r.mrp, money: true },
  { title: 'Rate', get: (r: Item) => r.sale_rate, money: true },
  { title: 'GST%', get: (r: Item) => r.gst_rate, num: true },
];

export async function itemList() {
  const m = await import('./stock.ts');
  return m.closingStock(['MAIN STORE']);
}

// ------------------------------------------------------------------ price list (rate updation)
/**
 * Masters → Rate & Discount Master → Price List. Like MARG: pick the item, Enter opens its
 * price list box (M.R.P., Rate-A, Purchase Rate), Ctrl+W saves. With `byCompany` the
 * company is asked first (Selected Company/Item).
 */
export async function priceList(byCompany = false) {
  let all = await api<Item[]>('/items');
  let company = '';
  if (byCompany) {
    const names = [...new Set(all.map((i) => i.company || ''))].sort().map((name) => ({ name, items: all.filter((i) => (i.company || '') === name).length }));
    const c = await pick<{ name: string; items: number }>({
      title: 'Select Company', rows: names, key: (r) => r.name, size: 'mid',
      cols: [{ title: 'Company', get: (r) => r.name || '(No Company)' }, { title: 'Items', get: (r) => r.items, num: true }],
    });
    if (!c) return;
    company = c.name;
  }
  const w = openWin(`Price List${byCompany ? ` : ${company || '(No Company)'}` : ' : All Items'}`, 'wide',
    '<span><b>Enter</b> Change Rates</span><span><b>F2</b> New Item</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<Item>(w.body, [
    { title: 'Item Name', get: (r) => r.name }, { title: 'Pack', get: (r) => r.pack }, { title: 'Company', get: (r) => r.company },
    { title: 'Stock', get: (r) => r.stock, num: true }, { title: 'M.R.P.', get: (r) => r.mrp, money: true },
    { title: 'Rate-A', get: (r) => r.sale_rate, money: true },
    { title: 'Purc. Rate', get: (r) => (r.purchase_rate == null || !seeCost() ? '****' : money(r.purchase_rate)), num: true },
    { title: 'GST%', get: (r) => r.gst_rate, num: true },
  ], (r) => `${r.name} ${r.company}`);
  const load = async () => {
    all = await api<Item[]>('/items');
    g.setRows(byCompany ? all.filter((i) => (i.company || '') === company) : all, true);
  };
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if (k === 'Enter' && cur) { rateUpdate(cur).then((r) => { if (r) load(); }); return true; }
    if (k === 'F2') { itemForm().then((r) => r && load()); return true; }
    return false;
  };
}

/** The price list box of one item. Saving also updates its batches' rates when asked. */
async function rateUpdate(it: Item): Promise<boolean> {
  const fields: Field[] = [
    { name: 'mrp', label: 'M.R.P.', type: 'number' },
    { name: 'sale_rate', label: 'Rate-A', type: 'number' },
    ...(seeCost() ? [{ name: 'purchase_rate', label: 'Purchase Rate', type: 'number' } as Field] : []),
    { name: 'batches', label: 'Update Batch Rates also', type: 'select', options: [{ value: 'Y', label: 'Yes' }, { value: 'N', label: 'No' }] },
  ];
  let batches = 0;
  const saved = await formWin(`Price List : ${it.name}${it.pack ? ` ${it.pack}` : ''}`, fields,
    { mrp: it.mrp, sale_rate: it.sale_rate, purchase_rate: it.purchase_rate, batches: 'Y' },
    async (v) => {
      const r = await api<{ batches: number }>(`/items/${it.id}/rates`, {
        method: 'PUT', body: { mrp: Number(v.mrp), sale_rate: Number(v.sale_rate), purchase_rate: seeCost() ? Number(v.purchase_rate) : null, batches: v.batches === 'Y' },
      });
      batches = r.batches;
      return r;
    });
  if (!saved) return false;
  toast(`Rates updated : ${it.name}${batches ? ` (${batches} batch${batches > 1 ? 'es' : ''})` : ''}`);
  return true;
}

export async function pickItem(initial = ''): Promise<Item | null> {
  const rows = await api<Item[]>('/items');
  return pick<Item>({ title: 'Select Item', rows, cols: itemCols, key: (r) => r.name, initial, size: 'wide', onNew: () => itemForm({ name: initial.toUpperCase() }) });
}

const TYPE_LABEL: Record<string, string> = {
  SALE: 'Sale', PURCHASE: 'Purchase', SALE_CHALLAN: 'Sale Chl', PURCHASE_CHALLAN: 'Purc Chl',
  SALE_RETURN: 'Sale Ret', PURCHASE_RETURN: 'Purc Ret', COUNTER_SALE: 'Counter',
};
export async function itemRegister(item?: Item) {
  const it = item ?? (await pickItem());
  if (!it) return;
  const rows = await api<any[]>(`/items/${it.id}/register`);
  const w = openWin(`Item Register : ${it.name}`, 'wide', '<span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const IN = ['PURCHASE', 'PURCHASE_CHALLAN', 'SALE_RETURN'];
  let bal = Number(it.opening_stock);
  const data = rows.map((r) => {
    const q = Number(r.qty) + Number(r.free);
    const inQ = IN.includes(r.type) ? q : 0;
    const outQ = IN.includes(r.type) ? 0 : q;
    bal += inQ - outQ;
    return { ...r, inQ, outQ, bal };
  });
  const g = new GridList<any>(w.body, [
    { title: 'Date', get: (r) => r.date }, { title: 'Type', get: (r) => TYPE_LABEL[r.type] ?? r.type },
    { title: 'No.', get: (r) => r.no }, { title: 'Party', get: (r) => r.party },
    { title: 'In', get: (r) => r.inQ || '', num: true }, { title: 'Out', get: (r) => r.outQ || '', num: true },
    { title: 'Rate', get: (r) => r.rate, money: true }, { title: 'Balance', get: (r) => r.bal, num: true },
  ]);
  g.footerRow = () => `<tr class="total"><td colspan="7">Opening ${it.opening_stock} &nbsp; | &nbsp; Closing Stock</td><td class="n">${esc(bal)}</td></tr>`;
  g.setRows(data);
  w.onKey = (_e, k) => g.nav(k);
}

// ------------------------------------------------------------------ misc masters
export async function companyForm() {
  const c = await api('/company');
  await formWin('Company Profile (F1)', [
    { name: 'name', label: 'Company Name', required: true, upper: true },
    { name: 'address1', label: 'Address 1', upper: true },
    { name: 'address2', label: 'Address 2', upper: true },
    { name: 'gstin', label: 'GSTIN', upper: true },
    { name: 'state', label: 'State' },
    { name: 'phone', label: 'Phone' },
    { name: 'email', label: 'E-Mail' },
  ], c, (v) => api('/company', { method: 'PUT', body: v }));
  document.dispatchEvent(new Event('company-changed'));
}

export async function partyGstList() {
  const rows = await api<Ledger[]>('/ledgers?group=Sundry Debtors,Sundry Creditors');
  const w = openWin('Party GST No. / State', 'wide', '<span><b>F2</b> Add</span><span><b>F3</b> Modify</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<Ledger>(w.body, [
    { title: 'Party', get: (r) => r.name }, { title: 'Group', get: (r) => r.group_name },
    { title: 'GSTIN', get: (r) => r.gstin || '— Unregistered —' }, { title: 'State', get: (r) => r.state },
  ], (r) => r.name);
  g.setRows(rows);
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const reload = async () => g.setRows(await api('/ledgers?group=Sundry Debtors,Sundry Creditors'), true);
    if (k === 'F2') { ledgerForm().then((r) => r && reload()); return true; }
    if (k === 'F3' && g.current) { ledgerForm(g.current).then((r) => r && reload()); return true; }
    return false;
  };
}

// ------------------------------------------------------------------ salesman (M.R.) master
interface Salesman { id: number; name: string; area: string }
export async function salesmanList() {
  const w = openWin('Salesman Master (M.R.)', 'mid', '<span><b>F2</b> Add</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '55vh';
  const g = new GridList<Salesman>(w.body, [
    { title: 'Salesman / M.R.', get: (r) => r.name }, { title: 'Area', get: (r) => r.area },
  ], (r) => r.name);
  const load = async () => g.setRows(await api<Salesman[]>('/salesmen'), true);
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    if (k === 'F2') {
      formWin('Add Salesman', [
        { name: 'name', label: 'Name', required: true, upper: true },
        { name: 'area', label: 'Area / Station', upper: true },
      ], {}, (v) => api('/salesmen', { method: 'POST', body: v })).then((r) => r && load());
      return true;
    }
    return false;
  };
}

export async function masterStats() {
  const [l, i, g] = await Promise.all([api<Ledger[]>('/ledgers'), api<Item[]>('/items'), api<Group[]>('/groups')]);
  const w = openWin('Master Statistics', 'small', '<span><b>Esc</b> Close</span>');
  w.body.innerHTML = `<table class="grid">
    <tr><td>Account Groups</td><td class="n">${g.length}</td></tr>
    <tr><td>Ledgers</td><td class="n">${l.length}</td></tr>
    <tr><td>Customers</td><td class="n">${l.filter((x) => x.group_name === 'Sundry Debtors').length}</td></tr>
    <tr><td>Suppliers</td><td class="n">${l.filter((x) => x.group_name === 'Sundry Creditors').length}</td></tr>
    <tr><td>Items</td><td class="n">${i.length}</td></tr>
    <tr><td>Stock Value (Purchase Rate)</td><td class="n">${seeCost() ? money(i.reduce((s, x) => s + x.stock * x.purchase_rate, 0)) : '****'}</td></tr></table>`;
}

export async function exportLedgers() {
  const rows = await api<Ledger[]>('/ledgers');
  const head = ['Name', 'Group', 'Address', 'City', 'Phone', 'GSTIN', 'State', 'Opening', 'Dr/Cr', 'Balance'];
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [head.join(','), ...rows.map((r) => [r.name, r.group_name, r.address, r.city, r.phone, r.gstin, r.state, r.opening, r.opening_type, r.balance].map(q).join(','))].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'ledgers.csv';
  a.click();
  toast('Ledger export downloaded');
}
