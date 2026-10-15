// SALE ENTRY — modelled on the MARG ERP 9+ screen: header (Name / Bill No. / M.R. /
// Date / Type), the PRODUCT grid, the item + batch pickers, MODE OF PAYMENT and
// the "Exit W/o Save" box. Everything is driven from the keyboard.
import { api, esc, toast, h, today, money, openWin, type Win } from './ui.ts';
import { margBar, margPop, popList, margConfirm, margNumber, margAsk, notExist } from './margui.ts';
import { billDetails, pickBillItems, pickSold, saveInBox, type ReturnInfo } from './salereturn.ts';
import { ledgerForm, itemForm, type Ledger, type Item } from './masters.ts';
import { canAction, seeCost, canBackdate, session } from './session.ts';

/** Run `fn` only if the role may do `action`; otherwise say so. */
function allowed(action: string, what: string): boolean {
  if (canAction(action)) return true;
  toast(`Access denied — role ${session()?.role ?? ''} cannot use ${what}. Ask SuperAdmin.`, true);
  return false;
}

export const ENTRY_TITLE: Record<string, string> = {
  SALE: 'SALE ENTRY', PURCHASE: 'PURCHASE ENTRY', SALE_CHALLAN: 'SALE CHALLAN ENTRY',
  PURCHASE_CHALLAN: 'PURCHASE CHALLAN ENTRY', SALE_RETURN: 'SALE RETURN ENTRY',
  PURCHASE_RETURN: 'PURCHASE RETURN ENTRY', COUNTER_SALE: 'COUNTER SALE ENTRY',
};
export const FOOT_LABEL: Record<string, string> = {
  SALE: 'SALE', PURCHASE: 'PURCHASE', SALE_CHALLAN: 'SALE CHALLAN', PURCHASE_CHALLAN: 'PURCHASE CHALLAN',
  SALE_RETURN: 'SALE RETURN', PURCHASE_RETURN: 'PURC RETURN', COUNTER_SALE: 'COUNTER SALE',
};
const isPurchase = (t: string) => t.startsWith('PURCHASE');
/** Entries that debit the party (its balance goes up); returns and purchases credit it. */
const PARTY_DR = new Set(['SALE', 'COUNTER_SALE', 'SALE_CHALLAN', 'PURCHASE_RETURN']);

interface Batch {
  id: number; item_id: number; batch: string; expiry: string; mrp: number; rate: number; f_rate: number;
  purchase_rate: number; stock: number; supplier: string; invoice_no: string; invoice_date: string;
  item_name: string; unit: string; pack: string; gst_rate: number; company: string; hsn: string;
}
interface Salesman { id: number; name: string; area: string }
interface Row {
  item_id?: number; name?: string; pack?: string; batch_id?: number; batch?: string; expiry?: string;
  qty: number; free: number; rate: number; disc: number; gst: number; mrp?: number; cost?: number;
  stock?: number; unit?: string;
}
interface Payment { ledger_id: number; ledger: string; amount: number; remark: string; detail: string }


const blank = (): Row => ({ qty: 0, free: 0, rate: 0, disc: 0, gst: 0 });
const r2 = (n: number) => Math.round(n * 100) / 100;
const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
/** Cost figures arrive as null for roles without "See purchase rate, cost…". */
const c2 = (n: unknown) => (n == null ? '****' : f2(n));
const margin = (rate: number, cost: number | null) => (cost == null ? '****' : cost ? (((rate - cost) / cost) * 100).toFixed(2) : '0.00');
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const iso = (d: string) => {
  const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
};
const expShort = (e: string) => (e ? `${e.slice(5, 7)}/${e.slice(2, 4)}` : '');
function calc(r: Row) {
  const gross = r2(r.qty * r.rate);
  const taxable = r2(gross * (1 - r.disc / 100));
  const tax = r2(taxable * r.gst / 100);
  return { gross, taxable, tax, amount: r2(taxable + tax) };
}

const GRID_COLS: { key: keyof Row; label: string; w: string; num?: boolean; edit?: boolean }[] = [
  { key: 'name', label: 'PRODUCT', w: '34%' },
  { key: 'pack', label: 'PACK', w: '9%' },
  { key: 'batch', label: 'BATCH', w: '11%' },
  { key: 'qty', label: 'QTY', w: '10%', num: true, edit: true },
  { key: 'rate', label: 'RATE', w: '11%', num: true, edit: true },
  { key: 'disc', label: 'DIS1%', w: '8%', num: true, edit: true },
];
const TOOLS = ['SALE', 'PURC', 'SC', 'PC', 'COPY', 'PASTE', 'SR', 'PR', 'O/S', 'BE', 'CASH', 'VOU', 'HOLD', 'PUSH', 'QRID', 'SAVE'];
const TOOL_TYPE: Record<string, string> = { SALE: 'SALE', PURC: 'PURCHASE', SC: 'SALE_CHALLAN', PC: 'PURCHASE_CHALLAN', SR: 'SALE_RETURN', PR: 'PURCHASE_RETURN' };

// ------------------------------------------------------------------ pickers
/** LEDGERS popup — two-column party list with balances and the party detail panel. */
export async function pickParty(initial = '', group?: string): Promise<Ledger | null> {
  // group: e.g. 'Cash-in-hand,Bank Accounts' for a contra entry.
  const load = () => api<Ledger[]>(`/ledgers${group ? `?group=${encodeURIComponent(group)}` : ''}`);
  let rows = await load();
  let balanceOnly = false;
  const show = (all: Ledger[]) => (balanceOnly ? all.filter((l) => Math.abs(l.balance) > 0.004) : all);
  return popList<Ledger>({
    title: 'LEDGERS', rows: show(rows), findLabel: 'Name ? >>', width: '830px', showHeader: false, initial,
    search: (r) => r.name,
    cols: [
      { title: 'Name', get: (r) => r.name.toUpperCase(), width: '45%' },
      { title: 'Station', get: (r) => (r.city ?? '').toUpperCase(), width: '30%' },
      { title: 'Balance', get: (r) => (Math.abs(r.balance) > 0.004 ? `${f2(Math.abs(r.balance))} ${r.balance >= 0 ? 'Dr' : 'Cr'}` : ''), num: true },
    ],
    rowCls: (r) => (r.balance < -0.004 ? 'due' : ''),
    detail: (r) => !r ? '' : `<div>Address&nbsp;: <b>${esc((r.address || r.name).toUpperCase())}</b></div><div>[${esc(r.group_name)}]</div>
      <div>&nbsp;</div><div>[${r.gstin ? esc(r.gstin) : 'UNREGISTERED'}]</div>
      <div>Phone&nbsp;&nbsp;&nbsp;: <b>${esc(r.phone ?? '')}</b></div><div>[${esc((r.state ?? '').toUpperCase())}]</div>
      <div>D.L.No.&nbsp;: &nbsp; &nbsp; S.T.No.:</div><div></div>
      <div>Area&nbsp;&nbsp;&nbsp;&nbsp;: &nbsp; &nbsp; Route&nbsp;&nbsp;:</div><div></div>`,
    foot: '<span><b>F2</b>-New</span><span><b>F3</b>-Edit</span><span><b>F4</b>-Ledger</span><span><b>F6</b>-PDC</span><span><b>F7</b>-All</span>' +
      '<span><b>F8</b>-O/S</span><span><b>F10</b>-Balance Only</span><span><b>?</b>-Search</span><span><b>Alt+S</b>-Filter</span><span>[Top Ordering]</span>',
    onKey: (k, cur, pop) => {
      if (k === 'F2') { if (!allowed('ledger.add', 'New Ledger')) return true; ledgerForm().then(async (l) => { if (l) { rows = await load(); pop.setRows(show(rows)); } }); return true; }
      if (k === 'F3' && cur) { if (!allowed('ledger.list', 'Edit Ledger')) return true; ledgerForm(cur).then(async (l) => { if (l) { rows = await load(); pop.setRows(show(rows)); } }); return true; }
      if (k === 'F10') { balanceOnly = !balanceOnly; pop.setRows(show(rows)); return true; }
      if (k === 'F7') { balanceOnly = false; pop.setRows(rows); return true; }
      if (k === 'F4' || k === 'F8') {
        if (cur && allowed(k === 'F4' ? 'report.ledger' : 'report.outstanding:receivable', k === 'F4' ? 'Ledger statement' : 'Outstanding')) import('./reports.ts').then((m) => m.ledgerStatement(cur)).catch((e) => toast((e as Error).message, true));
        return true;
      }
      return false;
    },
  });
}

/** PARTY DETAIL — the walk-in customer box that MARG shows for a CASH party. */
interface Walkin { name: string; gstin: string; mobile: string; address: string }
function partyDetail(company: { state: string }, init: Walkin): Promise<Walkin | null> {
  return new Promise((resolve) => {
    const w = margPop('PARTY DETAIL', '<span><b>F2</b>-Party List</span><span><b>Enter</b>-Next</span><span><b>Esc</b>-Back</span>', '760px');
    const form = h('div', { class: 'marg-form' });
    const fields: [string, keyof Walkin][] = [['Party Name', 'name'], ['GST No.', 'gstin'], ['D.L.No.', 'address'], ['Mobile', 'mobile']];
    form.innerHTML = `
      <label>Party Name</label><input data-k="name" style="text-transform:uppercase">
      <label>GST No.</label><input data-k="gstin" style="text-transform:uppercase">
      <label>State</label><div><select><option>Yes</option><option>No</option></select> &nbsp; <b>22-CHHATTISGARH</b></div>
      <label>D.L.No.</label><input data-k="address" style="text-transform:uppercase">
      <label>Mobile</label><input data-k="mobile">
      <label>Address</label><input data-k="addr2" style="text-transform:uppercase">
      <label>Pin Code</label><input><label>PAN/Lic.No.</label><input>
      <label>E-Mail</label><input><label>Order No</label><input>
      <label>Booked by</label><input><label>Remark</label><input>`;
    w.body.append(form);
    const inputs = [...form.querySelectorAll('input')] as HTMLInputElement[];
    const get = (k: keyof Walkin) => (form.querySelector(`[data-k="${k}"]`) as HTMLInputElement | null)?.value ?? '';
    for (const [, k] of fields) {
      const el = form.querySelector(`[data-k="${k}"]`) as HTMLInputElement | null;
      if (el) el.value = init[k] ?? '';
    }
    inputs[0].focus();
    let done = false;
    const finish = (v: Walkin | null) => { if (done) return; done = true; w.close(); resolve(v); };
    w.onKey = (e, k) => {
      const i = inputs.indexOf(e.target as HTMLInputElement);
      if (k === 'Enter') {
        if (i >= 0 && i < inputs.length - 1) { inputs[i + 1].focus(); return true; }
        finish({ name: get('name'), gstin: get('gstin'), mobile: get('mobile'), address: get('address') });
        return true;
      }
      if (k === 'ArrowDown' && i >= 0 && i < inputs.length - 1) { inputs[i + 1].focus(); return true; }
      if (k === 'ArrowUp' && i > 0) { inputs[i - 1].focus(); return true; }
      if (k === 'Escape') { finish({ name: get('name'), gstin: get('gstin'), mobile: get('mobile'), address: get('address') }); return true; }
      return false;
    };
    void company;
  });
}

/** M.R. (salesman) list. */
async function pickMR(): Promise<Salesman | null> {
  const rows = await api<Salesman[]>('/salesmen');
  return popList<Salesman>({
    title: 'M.R.', rows, search: (r) => r.name, showHeader: false, width: '640px', findLabel: 'Find ? >>',
    cols: [{ title: 'Name', get: (r) => r.name }, { title: 'Area', get: (r) => r.area }],
    foot: '<span><b>F2</b>-New</span><span><b>F7</b>-Clear Filter</span><span><b>?</b>-Search</span><span><b>Tab</b>-Multiple Select</span><span><b>Esc</b>-Skip</span>',
    onKey: (k, _cur, pop) => {
      if (k === 'F2') {
        if (!allowed('salesman.list', 'Salesman master')) return true;
        const name = prompt('New M.R. name');
        if (name) api('/salesmen', { method: 'POST', body: { name } }).then(async () => pop.setRows(await api('/salesmen')));
        return true;
      }
      return false;
    },
  });
}

/** Item search — STORE:MAIN STORE, with the rate / margin / company detail panel. */
async function pickProduct(initial: string): Promise<Item | null> {
  const rows = await api<Item[]>('/items');
  return popList<Item>({
    title: 'STORE:MAIN STORE', rows, search: (r) => `${r.name} ${r.company}`, width: '1020px', findLabel: 'Find Name ? >>', initial,
    detailCols: 3,
    cols: [
      { title: 'DESCRIPTION', get: (r) => r.name.toUpperCase(), width: '42%' },
      { title: 'PACKING', get: (r) => (r.pack ?? '').toUpperCase(), width: '18%' },
      { title: 'STOCK', get: (r) => (r.stock > 0 ? r.stock : '-'), num: true, width: '10%' },
      { title: 'UNIT', get: (r) => r.unit, width: '10%' },
      { title: 'RATE-A', get: (r) => f2(r.sale_rate), num: true, width: '14%' },
    ],
    detail: (r) => !r ? '' : `
      <div>PurRate: <b>${c2(r.purchase_rate)}</b></div><div>M.R.P. &nbsp;: <b>${f2(r.mrp)}</b></div><div>Company: <b>${esc(r.company || 'OTHERS')}</b></div>
      <div>Cost &nbsp;&nbsp;: <b>${c2(r.purchase_rate)}</b></div><div>Rate &nbsp;&nbsp;: <b>${f2(r.sale_rate)}</b></div><div>Salt &nbsp;&nbsp;:</div>
      <div>Margin%: <b>${margin(r.sale_rate, r.purchase_rate)}</b></div>
      <div>Tax-T-I: <b>${f2(r.gst_rate)}</b></div><div>HSN/SAC: <b>${esc(r.hsn ?? '')}</b></div>
      <div>W/oDeal: <b>${c2(r.purchase_rate)}</b></div><div>F.Rate&nbsp;: <b>${f2(r.sale_rate)}</b></div><div>Mfr. &nbsp;&nbsp;: &nbsp; Stock : <b>${r.stock}</b></div>
      <div>PurDeal:</div><div>Deal[F]:</div><div>Conv. &nbsp;: 0 &nbsp; BOX : 0</div>
      <div>PurDisc:</div><div>Scheme&nbsp;: 0</div><div>Barcode:</div>`,
    foot: '<span><b>Alt+F1</b>-Help</span><span><b>F4</b>-Reg.</span><span><b>F5</b>-Index</span><span><b>F6</b>-Old_Rate</span>' +
      '<span><b>F10/?</b>-Filter</span><span><b>F9</b>-Comp</span><span><b>F7/F8</b>-Salt</span><span><b>Ctrl+Tab</b>-Detail</span>' +
      '<span><b>Ctrl+W</b>-Fast</span><span><b>F2</b>-New</span><span><b>+</b>-Label</span>',
    onKey: (k, cur, pop) => {
      if (k === 'F2') { if (!allowed('item.add', 'New Item')) return true; itemForm({ name: initial.toUpperCase() }).then(async (i) => { if (i) pop.setRows(await api('/items')); }); return true; }
      if (k === 'F3' && cur) { if (!allowed('item.list', 'Edit Item')) return true; itemForm(cur).then(async (i) => { if (i) pop.setRows(await api('/items')); }); return true; }
      if (k === 'F4' && cur) { if (allowed('item.register', 'Item Register')) import('./masters.ts').then((m) => m.itemRegister(cur)).catch((e) => toast((e as Error).message, true)); return true; }
      return false;
    },
  });
}

/** Returned by pickBatch when the user asks for a new batch (F2), or the item has none yet on a purchase. */
const NEW_BATCH = { id: -1 } as Batch;
/** BATCH window for the chosen item. `allowNew`: purchase-side entries, where new batches come in (F2-New Batch). */
async function pickBatch(item: Item, allowNew = false): Promise<Batch | null> {
  const rows = await api<Batch[]>(`/items/${item.id}/batches`);
  const total = rows.reduce((s, b) => s + b.stock, 0);
  if (!rows.length) {
    if (allowNew) return NEW_BATCH;
    toast('No batch found — purchase this item first (Purchase → Batch)', true);
    return null;
  }
  return popList<Batch>({
    onKey: (k, _cur, pop) => { if (allowNew && (k === 'F2' || k === 'Insert')) { pop.close(NEW_BATCH); return true; } },
    title: `${item.name.toUpperCase()} ${item.pack ?? ''}`, rows, search: (r) => r.batch, width: '1020px',
    findLabel: 'Find ? >>', extra: `Total : ${total}`, detailCols: 3,
    cols: [
      { title: 'BATCH', get: (r) => r.batch, width: '22%' },
      { title: 'STOCK', get: (r) => r.stock, num: true, width: '10%' },
      { title: 'UNIT', get: (r) => r.unit, width: '10%' },
      { title: 'RATE-A', get: (r) => f2(r.rate), num: true, width: '14%' },
      { title: 'F.RATE', get: (r) => f2(r.f_rate), num: true, width: '14%' },
      { title: 'M.R.P.', get: (r) => f2(r.mrp), num: true, width: '14%' },
      { title: 'EXP.', get: (r) => expShort(r.expiry), width: '10%' },
    ],
    detail: (r) => !r ? '' : `
      <div>PurRate: <b>${c2(r.purchase_rate)}</b></div><div>M.R.P. &nbsp;: <b>${f2(r.mrp)}</b></div><div>Supp. &nbsp;: <b>${esc(r.supplier ?? '')}</b></div>
      <div>Cost &nbsp;&nbsp;: <b>${c2(r.purchase_rate)}</b></div><div>Rate &nbsp;&nbsp;: <b>${f2(r.rate)}</b></div>
      <div>Invoice: <b>${esc(r.invoice_no ?? '')}</b> &nbsp; Hold: 0</div>
      <div>Margin%: <b>${margin(r.rate, r.purchase_rate)}</b></div>
      <div>Tax-T-I: <b>${f2(r.gst_rate)}</b></div>
      <div>Date &nbsp;&nbsp;: <b>${dmy(r.invoice_date ?? '')}</b> &nbsp; Days: ${r.invoice_date ? Math.max(0, Math.round((Date.now() - new Date(r.invoice_date).getTime()) / 864e5)) : 0}</div>
      <div>W/oDeal: <b>${c2(r.purchase_rate)}</b></div><div>F.Rate&nbsp;: <b>${f2(r.f_rate)}</b></div><div>Packin&nbsp;: <b>${esc(r.pack ?? '')}</b></div>
      <div>PurDeal:</div><div>Deal[F]:</div><div>Conv. &nbsp;: 0</div>
      <div>PurDisc:</div><div>Scheme&nbsp;: 0</div><div>Barcode:</div>`,
    foot: (allowNew ? '<span><b>F2</b>-New Batch</span>' : '') + '<span><b>F3</b>-Edit</span><span><b>F5</b>-Register</span><span><b>Ins</b>-Balance</span><span><b>F10</b>-All</span><span><b>Alt+~</b>-Rates</span>',
  });
}

/**
 * Sale side batch, by the company's Selection (as in MARG):
 * Self — the BATCH window; Fifo — the earliest-expiring batch in stock, no window;
 * Manual — type the batch number (the BATCH window opens if it isn't found).
 */
async function chooseBatch(item: Item, style: string): Promise<Batch | null> {
  if (style.startsWith('Fifo')) {
    const rows = await api<Batch[]>(`/items/${item.id}/batches`);
    const first = rows.filter((b) => b.stock > 0).sort((a, b) => (a.expiry || '9999').localeCompare(b.expiry || '9999') || a.id - b.id)[0];
    if (first) return first;
    toast('No batch in stock — choose from the list', true);
  } else if (style.startsWith('Manual')) {
    const rows = await api<Batch[]>(`/items/${item.id}/batches`);
    for (;;) {
      const t = await margAsk('Batch', '');
      if (t == null) return null;
      const hit = rows.find((b) => b.batch.toUpperCase() === t.trim().toUpperCase());
      if (hit) return hit;
      toast(`Batch "${t.toUpperCase()}" not found — choose from the list`, true);
      break;
    }
  }
  return pickBatch(item);
}

// ------------------------------------------------------------------ the screen
export async function saleEntry(type = 'SALE', billId?: number) {
  const [company, modes] = await Promise.all([api<any>('/company'), api<Ledger[]>('/payment-modes')]);
  let rows: Row[] = [blank()];
  let party: Ledger | null = null;
  let walkin: Walkin = { name: '', gstin: '', mobile: '', address: '' };
  let mr: Salesman | null = null;
  let payments: Payment[] = [];
  let editing = billId;
  let dirty = false;
  let saleType = 'LOCAL';
  // SALE RETURN: Party No. / Dt (the customer's slip) and the BILL DETAILS answers.
  const isRet = type === 'SALE_RETURN';
  // Sale return and purchase challan carry the party's own slip: Entry No / Party No / Dt.
  const refEntry = isRet || type === 'PURCHASE_CHALLAN';
  let retInfo: ReturnInfo | null = null;

  const w = openWin(ENTRY_TITLE[type], 'full', '');
  w.el.classList.add('marg');
  const screen = h('div', { class: 'marg-screen' });
  const bar = margBar(ENTRY_TITLE[type]);
  screen.innerHTML = `
    <div class="marg-head">
      <label>Name</label><input class="val" data-f="name" readonly>
      <label>Date</label><input class="val date" data-f="date">
      ${refEntry
        ? `<label>Entry No.</label><div><input class="val" data-f="no" size="10"> <span style="color:var(--marg-lbl)">Party No:</span> <input class="val" data-f="pno" size="10" autocomplete="off">
            <span style="color:var(--marg-lbl)">Dt:</span> <input class="val" data-f="pdt" size="10"> <span style="color:var(--marg-lbl)">M.R.:</span> <input class="val" data-f="mr" readonly size="8"></div>`
        : '<label>Bill No.</label><div><input class="val" data-f="no" size="10"> <span style="color:var(--marg-lbl)">M.R.:</span> <input class="val" data-f="mr" readonly size="10"></div>'}
      <label>Type</label><input class="val" data-f="type" readonly>
      ${isRet ? '<span></span><div class="sr-import">[ Import -&gt; F10-Online F11-Scan QRCode ]</div>' : ''}
    </div>
    <div class="marg-rows"><table class="marg-grid"><thead><tr>
      ${GRID_COLS.map((c) => `<th class="${c.num ? 'n' : ''}" style="width:${c.w}">${c.key === 'rate' && isPurchase(type) ? 'P.RATE' : c.label}</th>`).join('')}
      <th class="n">AMOUNT</th></tr></thead><tbody></tbody></table></div>
    <div class="marg-foot">
      <div class="info1"></div><div class="info2"></div><div class="info3"></div>
    </div>
    <div style="font-size:12px;padding:1px 8px" class="cal"></div>
    <div class="marg-tools">${TOOLS.map((t) => `<span data-t="${t}" class="${t === 'SAVE' ? 'save' : t === 'QRID' ? 'hot' : ''}">${t}</span>`).join('')}</div>
    <div class="marg-invoice">
      <div><div class="store">Store : <b>MAIN STORE</b></div><div class="sale">${FOOT_LABEL[type]}</div><div style="font-size:13px">Last Bills :</div></div>
      <div class="amt">Invoice Value<b class="inv">0.00</b></div>
    </div>`;
  screen.prepend(bar);
  w.body.append(screen);

  const $ = (s: string) => screen.querySelector(s) as HTMLInputElement;
  const nameI = $('[data-f=name]'), dateI = $('[data-f=date]'), noI = $('[data-f=no]'), mrI = $('[data-f=mr]'), typeI = $('[data-f=type]');
  const pnoI = $('[data-f=pno]') as HTMLInputElement | null, pdtI = $('[data-f=pdt]') as HTMLInputElement | null;
  // "No back-dated entry" roles bill on today's date only (the server checks too).
  if (!canBackdate()) { dateI.readOnly = true; dateI.title = 'Back-dated entry is not allowed for your role'; }
  const tbody = screen.querySelector('tbody')!;
  const setBar = (t: string) => { (bar.firstElementChild as HTMLElement).textContent = t; };

  // ---------------------------------------------------------------- painting
  function renderRows() {
    const filler = Math.max(0, 12 - rows.length);
    const cell = (r: Row, i: number, c: typeof GRID_COLS[number]) => {
      const v = r[c.key];
      if (c.edit) return `<td class="n"><input data-r="${i}" data-c="${c.key}" class="num" value="${r.item_id ? (v ?? 0) : ''}"></td>`;
      if (c.key === 'name') {
        const hint = !r.item_id && i === 0 && party ? ' placeholder="← key to change Bill No."' : '';
        return `<td><input data-r="${i}" data-c="name" value="${esc(v ?? '')}" autocomplete="off"${hint}></td>`;
      }
      return `<td class="${c.num ? 'n' : ''}">${esc(v ?? '')}</td>`;
    };
    tbody.innerHTML = rows.map((r, i) => `<tr data-r="${i}">${GRID_COLS.map((c) => cell(r, i, c)).join('')}
        <td class="n">${r.item_id ? f2(calc(r).amount) : ''}</td></tr>`).join('')
      + Array.from({ length: filler }, () => `<tr>${GRID_COLS.map(() => '<td></td>').join('')}<td></td></tr>`).join('');
    renderTotals();
  }
  function totals() {
    const live = rows.filter((r) => r.item_id);
    const t = live.map(calc);
    const gross = r2(t.reduce((s, x) => s + x.gross, 0));
    const taxable = r2(t.reduce((s, x) => s + x.taxable, 0));
    const tax = r2(t.reduce((s, x) => s + x.tax, 0));
    const net = Math.round(taxable + tax);
    const mrpValue = r2(live.reduce((s, r) => s + r.qty * (r.mrp ?? 0), 0));
    return { live, gross, taxable, tax, net, mrpValue, roundOff: r2(net - taxable - tax) };
  }
  function renderTotals() {
    const { live, gross, taxable, tax, net, mrpValue } = totals();
    const cur = rows[curRow];
    screen.querySelector('.info1')!.innerHTML = `
      <div><span class="k">Item</span>: <b>${esc(cur?.name ?? '')}</b></div>
      <div><span class="k">Batch</span>: <b>${esc(cur?.batch ?? '')}</b></div>
      <div><span class="k">Expiry</span>: <b>${esc(expShort(cur?.expiry ?? ''))}</b> &nbsp; Stock: <b>${cur?.stock ?? ''}</b></div>
      ${refEntry ? `<div><span class="k">M.R.P.</span>: <b>${cur?.mrp ? f2(cur.mrp) : ''}</b> &nbsp; SRate: <b>${cur?.item_id ? f2(cur.rate) : ''}</b></div>` : ''}
      <div><span class="k">Chall.</span>: &nbsp; Date :</div>`;
    screen.querySelector('.info2')!.innerHTML = `
      <div class="kv"><span class="k">MRP Value :</span><b>${f2(mrpValue)}</b></div>
      <div class="kv"><span class="k">Amount :</span><b>${f2(gross)}</b></div>
      <div class="kv"><span class="k">Balance :</span><b>${party ? f2(Math.abs(party.balance + (PARTY_DR.has(type) ? net : -net))) : '0.00'}</b></div>`;
    screen.querySelector('.info3')!.innerHTML = `
      <div class="kv"><span class="k">VALUE OF GOODS</span><b>${f2(taxable)}</b></div>
      <div class="kv"><span class="k">DISCOUNT</span><b>${f2(gross - taxable)}</b></div>
      <div class="kv"><span class="k">GST%</span><b>${f2(tax)}</b></div>
      <div class="kv"><span class="k">CASH DISCOUNT</span><b>0.00</b></div>
      <div class="kv"><span class="k">ROUND OFF</span><b>${f2(net - taxable - tax)}</b></div>`;
    const pcs = live.reduce((s, r) => s + r.qty + r.free, 0);
    screen.querySelector('.cal')!.textContent = `Cal:9,${live.length + 1},Qt:${live.length}(${live.length}),PCS:${pcs}`;
    screen.querySelector('.inv')!.textContent = f2(net);
    tbody.querySelectorAll('tr').forEach((tr, i) => {
      const r = rows[i];
      const td = tr.lastElementChild as HTMLElement | null;
      if (td && r) td.textContent = r.item_id ? f2(calc(r).amount) : '';
    });
  }
  let curRow = 0;
  const focusCell = (r: number, c: string) => {
    const el = tbody.querySelector(`input[data-r="${r}"][data-c="${c}"]`) as HTMLInputElement | null;
    if (!el) return;
    curRow = r;
    el.focus();
    el.select();
    renderTotals();
  };

  function setParty(l: Ledger) {
    party = l;
    nameI.value = l.name.toUpperCase();
    saleType = (l.state || company.state) === company.state ? 'LOCAL' : 'CENTRAL';
    typeI.value = saleType;
    dirty = true;
  }

  // ---------------------------------------------------------------- header flow
  let busy = false;
  async function partyStep() {
    if (busy) return;
    busy = true;
    try {
      const l = await pickParty();
      if (!l) { dateI.focus(); return; }
      setParty(l);
      if (l.group_name === 'Cash-in-hand') {
        const wk = await partyDetail(company, walkin);
        if (wk) walkin = wk;
      }
      if (!noI.value) noI.value = (await api<{ no: string }>(`/bills/next-no?type=${type}`)).no;
      const m = await pickMR();
      if (m) { mr = m; mrI.value = m.name; }
      renderRows();
      if (refEntry && pnoI) { pnoI.focus(); pnoI.select(); } else focusCell(0, 'name');
    } finally { busy = false; }
  }

  /** SALE RETURN: Party No. → Dt → BILL DETAILS → the returned bill's items. */
  async function returnDetailsStep() {
    if (busy || !party) return;
    busy = true;
    try {
      const r = await billDetails(party.id, retInfo);
      if (!r) { pdtI?.focus(); return; }
      retInfo = r;
      dirty = true;
      if (r.bill) {
        const lines = await pickBillItems(r.bill);
        if (lines?.length) {
          const loaded: Row[] = lines.map((l: any) => ({
            item_id: l.item_id, name: String(l.item_name).toUpperCase(), pack: (l.pack ?? '').toUpperCase(), batch_id: l.batch_id ?? undefined,
            batch: l.batch ?? '', expiry: l.expiry ?? '', qty: l.qty, free: 0, rate: l.rate, disc: l.disc_pct ?? 0, gst: l.gst_rate ?? 0, mrp: l.mrp, unit: l.unit,
          }));
          const first = rows.filter((x) => x.item_id).length;
          rows = [...rows.filter((x) => x.item_id), ...loaded, blank()];
          renderRows();
          focusCell(first, 'qty');
          return;
        }
      }
      renderRows();
      focusCell(Math.max(0, rows.findIndex((x) => !x.item_id)), 'name');
    } finally { busy = false; }
  }
  /** "9 All Inclusive": the rate found includes GST, so the bill rate is taken out of it. */
  const netRate = (rate: number, gst: number) => (isRet && retInfo?.calc.startsWith('9') ? r2(rate / (1 + gst / 100)) : rate);

  async function productStep(rowIdx: number, typed: string) {
    if (busy) return;
    busy = true;
    try {
      if (isRet && party && retInfo?.batchSel === 'Select From Sold') {
        const s = await pickSold(party.id, typed);
        if (!s) { focusCell(rowIdx, 'name'); return; }
        rows[rowIdx] = {
          item_id: s.item_id, name: s.name.toUpperCase(), pack: (s.pack ?? '').toUpperCase(), batch_id: s.batch_id ?? undefined, batch: s.batch,
          expiry: s.expiry, qty: 1, free: 0, rate: s.rate, disc: 0, gst: s.gst_rate, mrp: s.mrp, unit: s.unit,
        };
        dirty = true; renderRows(); focusCell(rowIdx, 'qty');
        return;
      }
      const it = await pickProduct(typed);
      if (!it) { focusCell(rowIdx, 'name'); return; }
      // Purchase / purchase challan / sale return bring stock in: a new batch can be typed here.
      const inward = isPurchase(type) && type !== 'PURCHASE_RETURN' || refEntry;
      // Working Style (company): "Normal W/o Secondary" keeps no batches; otherwise Self / Fifo / Manual.
      const style = String(company.working_style || 'Self-Secondary');
      if (style.startsWith('Normal')) {
        rows[rowIdx] = {
          item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(), batch: '', expiry: '',
          qty: 1, free: 0, rate: isPurchase(type) ? (it.purchase_rate ?? 0) : netRate(it.sale_rate, it.gst_rate), disc: 0, gst: it.gst_rate,
          mrp: it.mrp, cost: it.purchase_rate, stock: it.stock, unit: it.unit,
        };
        dirty = true; renderRows(); focusCell(rowIdx, 'qty');
        return;
      }
      const b = inward ? await pickBatch(it, true) : await chooseBatch(it, style);
      if (b === NEW_BATCH) {
        // New batch (as in MARG): Batch, Expiry (MM/YY), then M.R.P.
        const batch = await margAsk('Batch', '');
        if (batch == null || !batch) { focusCell(rowIdx, 'name'); return; }
        let expiry = '';
        for (;;) {
          const e = await margAsk('Expiry (MM/YY)', '');
          if (e == null) { focusCell(rowIdx, 'name'); return; }
          if (!e) break;
          const m = e.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
          const mm = m ? Number(m[1]) : 0;
          if (m && mm >= 1 && mm <= 12) {
            const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
            expiry = `${yy}-${String(mm).padStart(2, '0')}-${String(new Date(yy, mm, 0).getDate()).padStart(2, '0')}`;
            break;
          }
          toast('Enter the expiry as MM/YY, e.g. 03/27', true);
        }
        const mrpS = await margAsk(isPurchase(type) ? 'M.R.P.' : 'MRP for Search', f2(it.mrp));
        if (mrpS == null) { focusCell(rowIdx, 'name'); return; }
        rows[rowIdx] = {
          item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(), batch: batch.toUpperCase(), expiry,
          qty: 1, free: 0, rate: isPurchase(type) ? (it.purchase_rate ?? 0) : netRate(it.sale_rate, it.gst_rate), disc: 0, gst: it.gst_rate, mrp: Number(mrpS) || it.mrp, unit: it.unit,
        };
        dirty = true; renderRows(); focusCell(rowIdx, 'qty');
        return;
      }
      if (!b) { focusCell(rowIdx, 'name'); return; }
      rows[rowIdx] = {
        item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(), batch_id: b.id, batch: b.batch,
        expiry: b.expiry, qty: 1, free: 0, rate: isPurchase(type) ? (b.purchase_rate ?? 0) : netRate(b.rate ?? 0, it.gst_rate), disc: 0, gst: it.gst_rate,
        mrp: b.mrp, cost: b.purchase_rate, stock: b.stock, unit: it.unit,
      };
      dirty = true;
      renderRows();
      focusCell(rowIdx, 'qty');
    } finally { busy = false; }
  }

  // ---------------------------------------------------------------- save
  function collect() {
    const t = totals();
    return {
      type, no: noI.value, date: iso(dateI.value), party_id: party?.id, mode: payments.length ? 'CASH' : 'CREDIT',
      mr_id: mr?.id, sale_type: saleType, walkin_name: walkin.name, walkin_gstin: walkin.gstin,
      walkin_mobile: walkin.mobile, walkin_address: walkin.address,
      ref_no: pnoI?.value.trim() ?? '', ref_date: pdtI?.value ? iso(pdtI.value) : '', reason: retInfo?.reason ?? '',
      against_bill_id: retInfo?.bill?.id ?? null, calc_type: retInfo?.calc ?? '',
      payments: payments.map((p) => ({ ledger_id: p.ledger_id, amount: p.amount, remark: p.remark, detail: p.detail })),
      lines: t.live.map((r) => ({
        item_id: r.item_id, batch_id: r.batch_id, batch: r.batch, expiry: r.expiry,
        qty: r.qty, free: r.free, rate: r.rate, disc_pct: r.disc, gst_rate: r.gst, mrp: r.mrp,
      })),
    };
  }
  async function save() {
    if (!party) { toast('Select party first', true); partyStep(); return; }
    if (!totals().live.length) { toast('Enter at least one product', true); focusCell(0, 'name'); return; }
    try {
      const body = collect();
      const res = editing ? await api<any>(`/bills/${editing}`, { method: 'PUT', body }) : await api<any>('/bills', { method: 'POST', body });
      toast(`${FOOT_LABEL[type]} ${res.no} saved — Invoice Value ${money(res.net)}`);
      dirty = false;
      // As in MARG: after saving, ask how many copies and print them (Esc = don't print).
      const copies = await margNumber('No. of Copies', 1);
      if (copies) await import('./billing.ts').then((m) => m.printCopies(res.id, copies)).catch((e) => toast((e as Error).message, true));
      if (billId) { w.close(); return; }
      await reset();
    } catch (e) { toast((e as Error).message, true); }
  }

  /** MODE OF PAYMENT window. */
  function paymentWindow(): Promise<'saved' | 'back'> {
    return new Promise((resolve) => {
      const net = totals().net;
      const p = margPop('MODE OF PAYMENT',
        '<span><b>F2</b>-New</span><span><b>Enter</b>-Modify</span><span><b>End/F10</b>-Save</span><span><b>Del</b>-Delete</span><span><b>?</b>-Search</span><span><b>Tab</b>-Multiple Select</span>',
        '1000px');
      const box = h('div', { class: 'marg-pay', style: 'height:420px' });
      p.body.append(box);
      let sel = 0;
      let editingAmt = false;
      const amountOf = (id: number) => payments.find((x) => x.ledger_id === id)?.amount ?? 0;
      const draw = () => {
        const cur = modes[sel];
        const received = r2(payments.reduce((s, x) => s + x.amount, 0));
        box.innerHTML = `
          <div class="modes">${modes.map((m, i) => `<div class="${i === sel ? 'sel' : ''}" data-i="${i}">${esc(m.name.toUpperCase())}
            <span style="float:right">${amountOf(m.id) ? f2(amountOf(m.id)) : ''}</span></div>`).join('')}</div>
          <div class="right"><div class="entry">
            <div style="color:var(--marg-lbl);font-weight:bold">${esc(cur.name.toUpperCase())}</div>
            <div style="margin-top:8px">Amount &nbsp;: <input class="amt-in marg-amt" value="${f2(amountOf(cur.id))}" style="width:140px;text-align:right"> [${f2(net)}]</div>
            <div>Remark &nbsp;:</div><div>Detail &nbsp;&nbsp;:</div>
          </div>
          <div class="totals">
            <div class="kv">Bill Amount &nbsp;&nbsp;&nbsp;: <b>${f2(net)}</b></div>
            <div class="kv">Payment Received: <b>${f2(received)}</b></div>
            <div class="kv">Service Charges : <b>0.00</b></div>
            <div class="pend">Pending &nbsp; ${f2(r2(net - received))}</div>
          </div></div>`;
        box.querySelectorAll('.modes div').forEach((d) => d.addEventListener('click', () => { sel = Number((d as HTMLElement).dataset.i); draw(); }));
        if (editingAmt) { const el = box.querySelector('.amt-in') as HTMLInputElement; el.focus(); el.select(); }
      };
      draw();
      const commit = () => {
        const el = box.querySelector('.amt-in') as HTMLInputElement;
        const amt = r2(Number(el.value || 0));
        const m = modes[sel];
        payments = payments.filter((x) => x.ledger_id !== m.id);
        if (amt) payments.push({ ledger_id: m.id, ledger: m.name, amount: amt, remark: '', detail: '' });
        editingAmt = false;
        draw();
      };
      let done = false;
      const finish = (v: 'saved' | 'back') => { if (done) return; done = true; p.close(); resolve(v); };
      p.onKey = (_e, k) => {
        if (editingAmt) {
          if (k === 'Enter') { commit(); return true; }
          if (k === 'Escape') { editingAmt = false; draw(); return true; }
          return false;
        }
        if (k === 'ArrowDown') { sel = (sel + 1) % modes.length; draw(); return true; }
        if (k === 'ArrowUp') { sel = (sel - 1 + modes.length) % modes.length; draw(); return true; }
        if (k === 'Enter') { editingAmt = true; draw(); return true; }
        if (k === 'Delete') { payments = payments.filter((x) => x.ledger_id !== modes[sel].id); draw(); return true; }
        if (k === 'End' || k === 'F10' || k === 'Ctrl+W') { finish('saved'); return true; }
        if (k === 'Escape') { finish('back'); return true; }
        return false;
      };
    });
  }

  async function finishBill() {
    if (!totals().live.length) { toast('Enter at least one product', true); return; }
    if (type === 'PURCHASE_CHALLAN') {
      // A challan moves goods only — no MODE OF PAYMENT, just "Save Changes ?".
      if (await margConfirm('Save Changes')) await save();
      return;
    }
    if (isRet) {
      // MARG: Ctrl+W → "Save In" → "Save Changes ?". A return needs BILL DETAILS (the reason) first.
      if (!retInfo) { toast('Fill BILL DETAILS (reason) first', true); await returnDetailsStep(); if (!retInfo) return; }
      const where = await saveInBox();
      if (!where) { focusCell(Math.max(0, rows.length - 1), 'name'); return; }
      if (where === 'challan') { notExist('"Save in Challan"'); return; }
      if (await margConfirm('Save Changes')) await save();
      return;
    }
    const r = await paymentWindow();
    if (r === 'saved') await save();
    else focusCell(Math.max(0, rows.length - 1), 'name');
  }

  async function reset() {
    rows = [blank()];
    party = null;
    mr = null;
    payments = [];
    walkin = { name: '', gstin: '', mobile: '', address: '' };
    retInfo = null;
    if (pnoI) pnoI.value = '';
    if (pdtI) pdtI.value = '';
    editing = undefined;
    dirty = false;
    nameI.value = '';
    mrI.value = '';
    typeI.value = '';
    dateI.value = dmy(today());
    noI.value = (await api<{ no: string }>(`/bills/next-no?type=${type}`)).no;
    renderRows();
    dateI.focus();
    dateI.select();
  }

  async function switchType(t: string) {
    if (t === type) return;
    if (!allowed(`bill.new:${t}`, ENTRY_TITLE[t] ?? t)) return;
    if (dirty && !(await margConfirm('Exit W/o Save'))) return;
    w.close();
    saleEntry(t);
  }

  // ---------------------------------------------------------------- keys
  tbody.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    const c = t.dataset.c;
    if (c === 'name') { // typing a product name opens the item window
      const i = Number(t.dataset.r);
      if (!rows[i].item_id && t.value) productStep(i, t.value);
      return;
    }
    if (!c) return;
    const r = rows[Number(t.dataset.r)];
    if (!r) return;
    (r as any)[c] = Number(t.value || 0);
    dirty = true;
    renderTotals();
  });
  tbody.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement;
    if (t.dataset.r) { curRow = Number(t.dataset.r); renderTotals(); }
  });
  screen.querySelector('.marg-tools')!.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).dataset.t;
    if (!t) return;
    if (TOOL_TYPE[t]) switchType(TOOL_TYPE[t]);
    else if (t === 'SAVE') finishBill();
    else if (t === 'CASH') finishBill();
    else if (t === 'O/S' && party) { if (allowed('report.ledger', 'Ledger statement')) import('./reports.ts').then((m) => m.ledgerStatement(party!)).catch((e) => toast((e as Error).message, true)); }
    else if (t === 'VOU') { if (allowed('voucher.menu', 'Vouchers')) import('./vouchers.ts').then((m) => m.voucherMenu()); }
    else notExist(`"${t}"`);
  });

  w.onKey = (e, k) => {
    const t = e.target as HTMLInputElement;
    // End from the product grid too: "all items done → End → MODE OF PAYMENT".
    if (k === 'Ctrl+W' || (k === 'F10' && !(refEntry && t === pnoI)) || k === 'End') { finishBill(); return true; }
    if (k === 'F2') { saleEntry(type); return true; }
    if (k === 'Alt+F10' && !seeCost()) { toast(`Access denied — role ${session()?.role ?? ''} cannot see profit`, true); return true; }
    if (k === 'Alt+F10') {
      const p = totals().live.reduce((s, r) => s + calc(r).taxable - r.qty * (r.cost ?? 0), 0);
      toast(`Profit on this bill: ${money(p)}`);
      return true;
    }
    if (k === 'F11') {
      const v = prompt(`Bill Amount: ${f2(totals().net)}\nCash Received:`);
      if (v) toast(`Return Cash: ${f2(Number(v) - totals().net)}`);
      return true;
    }
    if (k === 'Ctrl+A') { switchType('COUNTER_SALE'); return true; }
    if (k === 'Ctrl+Y') { switchType('PURCHASE_CHALLAN'); return true; }
    if (k === '*') { switchType('SALE_RETURN'); return true; }

    // header fields
    if (t === dateI && k === 'Enter') { dirty = true; party ? noI.focus() : partyStep(); return true; }
    if (t === nameI && (k === 'Enter' || k.length === 1)) { partyStep(); return true; }
    if (t === noI && k === 'Enter') { renderRows(); focusCell(0, 'name'); return true; }
    if (refEntry && t === pnoI) {
      if (k === 'Enter') { if (pdtI && !pdtI.value) pdtI.value = dmy(today()); pdtI?.focus(); pdtI?.select(); return true; }
      if (k === 'F10' || k === 'F11') { notExist(k === 'F10' ? '"Import Online"' : '"Scan QRCode"'); return true; }
    }
    if (refEntry && t === pdtI && k === 'Enter') { if (isRet) returnDetailsStep(); else { renderRows(); focusCell(0, 'name'); } return true; }
    if (t === mrI && k === 'Enter') { pickMR().then((m) => { if (m) { mr = m; mrI.value = m.name; } focusCell(0, 'name'); }); return true; }

    // grid
    const ri = Number(t.dataset?.r ?? -1);
    const c = t.dataset?.c;
    if (c) {
      const ci = GRID_COLS.findIndex((x) => x.key === c);
      if (c === 'name') {
        if (k === 'ArrowLeft') { noI.focus(); noI.select(); return true; }   // ← key to change Bill No.
        if (k === 'Enter' && !rows[ri].item_id) {
          if (rows.filter((r) => r.item_id).length) finishBill(); else productStep(ri, '');
          return true;
        }
        if (k === 'Enter' && rows[ri].item_id) { focusCell(ri, 'qty'); return true; }
        if (k.length === 1 && !e.ctrlKey && !e.altKey) { productStep(ri, k); return true; }
      }
      if (k === 'Enter' || k === 'Tab') {
        if (ci < GRID_COLS.length - 1) focusCell(ri, GRID_COLS[ci + 1].key as string);
        else {
          if (ri === rows.length - 1) { rows.push(blank()); renderRows(); }
          focusCell(ri + 1, 'name');
        }
        return true;
      }
      if (k === 'ArrowDown') { if (ri < rows.length - 1) focusCell(ri + 1, c); return true; }
      if (k === 'ArrowUp') { if (ri > 0) focusCell(ri - 1, c); else nameI.focus(); return true; }
      if (k === 'Ctrl+Delete' || k === 'Shift+Delete') {
        rows.splice(ri, 1);
        if (!rows.length) rows.push(blank());
        dirty = true;
        renderRows();
        focusCell(Math.min(ri, rows.length - 1), 'name');
        return true;
      }
    }
    return false;
  };
  w.beforeEsc = async () => {
    if (!dirty) return true;
    return margConfirm('Exit W/o Save');
  };
  w.setFoot('<span><b>Enter</b>-Next</span><span><b>←</b>-Bill No.</span><span><b>Ctrl+W/End/F10</b>-Save</span><span><b>Ctrl+Del</b>-Delete Row</span>' +
    '<span><b>F2</b>-New Bill</span><span><b>F11</b>-Return Cash</span><span><b>Alt+F10</b>-Profit</span><span><b>Esc</b>-Exit</span>');
  setBar(ENTRY_TITLE[type]);

  if (billId) {
    const b = await api<any>(`/bills/${billId}`);
    dateI.value = dmy(b.date);
    noI.value = b.no;
    saleType = b.sale_type ?? 'LOCAL';
    typeI.value = saleType;
    setParty(await api<Ledger>(`/ledgers/${b.party_id}`));
    walkin = { name: b.walkin_name ?? '', gstin: b.walkin_gstin ?? '', mobile: b.walkin_mobile ?? '', address: b.walkin_address ?? '' };
    if (pnoI) pnoI.value = b.ref_no ?? '';
    if (pdtI) pdtI.value = b.ref_date ? dmy(b.ref_date) : '';
    if (isRet) {
      const against = b.against_bill_id ? await api<any>(`/bills/${b.against_bill_id}`).catch(() => null) : null;
      retInfo = {
        batchSel: 'Manual', mode: 'Multiple', reason: b.reason ?? '', calc: b.calc_type || '9 All Inclusive',
        bill: against ? { id: against.id, no: against.no, date: against.date, net: against.net, type: against.type } : null,
      };
    }
    if (b.mr_id) {
      const m = (await api<Salesman[]>('/salesmen')).find((x) => x.id === b.mr_id);
      if (m) { mr = m; mrI.value = m.name; }
    }
    payments = (b.payments ?? []).map((p: any) => ({ ledger_id: p.ledger_id, ledger: p.ledger, amount: p.amount, remark: p.remark, detail: p.detail }));
    rows = b.lines.map((l: any) => ({
      item_id: l.item_id, name: String(l.item_name).toUpperCase(), pack: (l.pack ?? '').toUpperCase(), batch_id: l.batch_id,
      batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free, rate: l.rate, disc: l.disc_pct, gst: l.gst_rate, mrp: l.mrp, unit: l.unit,
    }));
    rows.push(blank());
    dirty = false;
    renderRows();
    focusCell(0, 'name');
  } else {
    dateI.value = dmy(today());
    noI.value = (await api<{ no: string }>(`/bills/next-no?type=${type}`)).no;
    renderRows();
    dateI.focus();
    dateI.select();
  }
}
