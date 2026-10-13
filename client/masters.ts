import { api, openWin, GridList, formWin, confirmBox, toast, pick, money, drcr, esc, type Field } from './ui.ts';
import { seeCost } from './session.ts';

export interface Ledger { id: number; name: string; group_id: number; group_name: string; nature: string; city: string; phone: string; gstin: string; state: string; address: string; opening: number; opening_type: string; credit_limit: number; balance: number; is_system: number }
export interface Item { id: number; name: string; company: string; unit: string; pack: string; hsn: string; gst_rate: number; mrp: number; sale_rate: number; purchase_rate: number; opening_stock: number; min_stock: number; reorder_qty: number; stock: number }
interface Group { id: number; name: string; nature: string }

// ------------------------------------------------------------------ ledgers
export async function ledgerForm(existing?: Partial<Ledger>, defaultGroup?: string): Promise<Ledger | null> {
  const groups = await api<Group[]>('/groups');
  const gDefault = groups.find((g) => g.name === (defaultGroup ?? 'Sundry Debtors'))?.id;
  const fields: Field[] = [
    { name: 'name', label: 'Name', required: true, upper: true },
    { name: 'group_id', label: 'Group', type: 'select', options: groups.map((g) => ({ value: g.id, label: g.name })) },
    { name: 'address', label: 'Address' },
    { name: 'city', label: 'City / Station', upper: true },
    { name: 'phone', label: 'Mobile / Phone' },
    { name: 'gstin', label: 'GSTIN', upper: true },
    { name: 'state', label: 'State' },
    { name: 'opening', label: 'Opening Balance', type: 'number' },
    { name: 'opening_type', label: 'Dr / Cr', type: 'select', options: [{ value: 'Dr', label: 'Dr' }, { value: 'Cr', label: 'Cr' }] },
    { name: 'credit_limit', label: 'Credit Limit', type: 'number' },
  ];
  const values = { group_id: gDefault, state: 'Chhattisgarh', opening_type: 'Dr', ...existing };
  const saved = await formWin(existing?.id ? `Modify Ledger : ${existing.name}` : 'Ledger Master - Add', fields, values,
    (v) => (existing?.id ? api(`/ledgers/${existing.id}`, { method: 'PUT', body: v }) : api('/ledgers', { method: 'POST', body: v })));
  if (!saved) return null;
  return api<Ledger>(`/ledgers/${saved.id ?? existing?.id}`);
}

export async function ledgerList(group?: string) {
  const w = openWin(group ? `Ledger List - ${group}` : 'List of Accounts', 'wide',
    '<span><b>F2</b> Add</span><span><b>F3</b> Modify</span><span><b>Enter</b> Ledger A/c</span><span><b>Del</b> Delete</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<Ledger>(w.body, [
    { title: 'Ledger Name', get: (r) => r.name },
    { title: 'Group', get: (r) => r.group_name },
    { title: 'Station', get: (r) => r.city },
    { title: 'Phone', get: (r) => r.phone },
    { title: 'GSTIN', get: (r) => r.gstin },
    { title: 'Balance', get: (r) => drcr(r.balance), num: true },
  ], (r) => r.name);
  const load = async () => g.setRows(await api<Ledger[]>(`/ledgers${group ? `?group=${encodeURIComponent(group)}` : ''}`), true);
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if (k === 'F2') { ledgerForm(undefined, group).then((r) => r && load()); return true; }
    if (k === 'F3' && cur) { ledgerForm(cur).then((r) => r && load()); return true; }
    if (k === 'Enter' && cur) { import('./reports.ts').then((m) => m.ledgerStatement(cur)); return true; }
    if (k === 'Delete' && cur) {
      confirmBox(`Delete ledger "${cur.name}" ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/ledgers/${cur.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (e) { toast((e as Error).message, true); }
      });
      return true;
    }
    return false;
  };
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
export async function itemForm(existing?: Partial<Item>): Promise<Item | null> {
  const fields: Field[] = [
    { name: 'name', label: 'Item Name', required: true, upper: true },
    { name: 'company', label: 'Company', upper: true },
    { name: 'unit', label: 'Unit', upper: true },
    { name: 'pack', label: 'Packing', upper: true },
    { name: 'hsn', label: 'HSN/SAC Code' },
    { name: 'gst_rate', label: 'GST %', type: 'select', options: [0, 0.25, 3, 5, 12, 18, 28].map((v) => ({ value: v, label: `${v} %` })) },
    { name: 'mrp', label: 'M.R.P.', type: 'number' },
    { name: 'sale_rate', label: 'Sale Rate', type: 'number' },
    { name: 'purchase_rate', label: 'Purchase Rate', type: 'number' },
    { name: 'opening_stock', label: 'Opening Stock', type: 'number' },
    { name: 'min_stock', label: 'Minimum Stock', type: 'number' },
    { name: 'reorder_qty', label: 'Re-Order Qty', type: 'number' },
  ];
  // Roles without the cost power never see (or overwrite) the purchase rate.
  const shown = seeCost() ? fields : fields.filter((f) => f.name !== 'purchase_rate');
  const saved = await formWin(existing?.id ? `Modify Item : ${existing.name}` : 'Item Master - Add', shown, { unit: 'PCS', gst_rate: 18, ...existing },
    (v) => (existing?.id ? api(`/items/${existing.id}`, { method: 'PUT', body: v }) : api('/items', { method: 'POST', body: v })));
  if (!saved) return null;
  return api<Item>(`/items/${saved.id ?? existing?.id}`);
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
  const w = openWin('Item List', 'wide', '<span><b>F2</b> Add</span><span><b>F3</b> Modify</span><span><b>F4 / Enter</b> Item Register</span><span><b>F10</b> Available stock only</span><span><b>Del</b> Delete</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<Item>(w.body, itemCols, (r) => `${r.name} ${r.company}`);
  let onlyStock = false;
  let all: Item[] = [];
  const show = () => g.setRows(onlyStock ? all.filter((i) => i.stock > 0) : all, true);
  const load = async () => { all = await api<Item[]>('/items'); show(); };
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if (k === 'F2') { itemForm().then((r) => r && load()); return true; }
    if (k === 'F3' && cur) { itemForm(cur).then((r) => r && load()); return true; }
    if ((k === 'F4' || k === 'Enter') && cur) { itemRegister(cur); return true; }
    if (k === 'F10') { onlyStock = !onlyStock; toast(onlyStock ? 'Showing available stock only' : 'Showing all items'); show(); return true; }
    if (k === 'Delete' && cur) {
      confirmBox(`Delete item "${cur.name}" ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/items/${cur.id}`, { method: 'DELETE' }); toast('Deleted'); load(); } catch (e) { toast((e as Error).message, true); }
      });
      return true;
    }
    return false;
  };
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
  const w = openWin('Party GST No. / State', 'wide', '<span><b>F3</b> Modify</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<Ledger>(w.body, [
    { title: 'Party', get: (r) => r.name }, { title: 'Group', get: (r) => r.group_name },
    { title: 'GSTIN', get: (r) => r.gstin || '— Unregistered —' }, { title: 'State', get: (r) => r.state },
  ], (r) => r.name);
  g.setRows(rows);
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    if (k === 'F3' && g.current) { ledgerForm(g.current).then(async (r) => r && g.setRows(await api('/ledgers?group=Sundry Debtors,Sundry Creditors'), true)); return true; }
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
