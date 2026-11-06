// SALE ENTRY — modelled on the MARG ERP 9+ screen: header (Name / Bill No. / M.R. /
// Date / Type), the PRODUCT grid, the item + batch pickers, MODE OF PAYMENT and
// the "Exit W/o Save" box. Everything is driven from the keyboard.
import { api, esc, toast, h, today, money, openWin, type Win } from './ui.ts';
import { margBar, margPop, popList, margConfirm, margNumber, margAsk } from './margui.ts';
import { billDetails, pickBillItems, pickSold, saveInBox, type ReturnInfo } from './salereturn.ts';
import { ledgerForm, itemForm, type Ledger, type Item } from './masters.ts';
import { canAction, seeCost, canBackdate, session, NO_DATE } from './session.ts';
import { isJewellery, pickJewelItem, jewelDetail, askPurchaseRef, pickSaleRef, jwFromRef, partyHistory, partyMetal, type JwLine, type JwRef } from './jewellery.ts';

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
  /** JEWELLERY company: the line's DESCRIPTION window. */
  jw?: JwLine;
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
const expShort = (e: string) => {
  if (!e) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(e)) return `${e.slice(5, 7)}/${e.slice(2, 4)}`;
  const m = e.match(/^(\d{1,2})[/-]?(\d{2})$/);
  if (m) return `${m[1].padStart(2, '0')}/${m[2]}`;
  return e;
};
function parseExpiry(e: string): string | null {
  if (!e) return '';
  const s = e.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  let m = s.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
  if (!m) m = s.match(/^(\d{2})(\d{2})$/);
  if (!m) m = s.match(/^(\d{1})(\d{2})$/);
  if (m) {
    const mm = Number(m[1]);
    if (mm >= 1 && mm <= 12) {
      const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
      const lastDay = new Date(yy, mm, 0).getDate();
      return `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    }
  }
  return null;
}
function calc(r: Row) {
  const gross = r.jw ? r2(r.jw.amount) : r2(r.qty * r.rate);
  const taxable = r2(gross * (1 - r.disc / 100));
  const tax = r2(taxable * r.gst / 100);
  return { gross, taxable, tax, amount: r2(taxable + tax) };
}

const GRID_COLS: { key: keyof Row; label: string; w: string; num?: boolean; edit?: boolean; center?: boolean }[] = [
  { key: 'name', label: 'PRODUCT', w: '30%' },
  { key: 'pack', label: 'PACK', w: '8%' },
  { key: 'batch', label: 'BATCH', w: '11%', edit: true },
  { key: 'expiry', label: 'EXP.', w: '8%', edit: true, center: true },
  { key: 'qty', label: 'QTY', w: '9%', num: true, edit: true },
  { key: 'rate', label: 'RATE', w: '10%', num: true, edit: true },
  { key: 'disc', label: 'DIS1%', w: '8%', num: true, edit: true },
];
/** JEWELLERY business type: the grid of a MARG jewellery company's sale / purchase. */
const JW_COLS: { label: string; w: string; get: (j: JwLine) => string; num?: boolean }[] = [
  { label: 'DESCRIPTION', w: '25%', get: () => '' },
  { label: 'SET', w: '6%', get: (j) => (j.sets ? String(j.sets) : ''), num: true },
  { label: 'DMND', w: '8%', get: (j) => (j.diamondWt ? j.diamondWt.toFixed(3) : ''), num: true },
  { label: 'STONE', w: '8%', get: (j) => (j.stone ? j.stone.toFixed(3) : ''), num: true },
  { label: 'GROSS', w: '9%', get: (j) => j.gross.toFixed(3), num: true },
  { label: 'PURE%', w: '8%', get: (j) => (j.purityUnit === 'K' ? `${j.purity}K` : j.purity.toFixed(2)), num: true },
  { label: 'PURE', w: '9%', get: (j) => j.pure.toFixed(3), num: true },
  { label: 'RATE', w: '9%', get: (j) => f2(j.rate), num: true },
];
const TOOLS = ['SALE', 'PURC', 'SC', 'PC', 'SR', 'PR', 'O/S', 'CASH', 'CHG', 'VOU', 'SAVE'];
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
      <div>Cr.Limit&nbsp;: <b>${r.credit_limit ? money(r.credit_limit) : '0.00'}</b></div><div>[${r.gstin ? esc(r.gstin) : 'UNREGISTERED'}]</div>
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
      { title: 'DESCRIPTION', get: (r) => `${r.name.toUpperCase()} <button type="button" class="btn-pop-qr" data-id="${r.id}" style="float:right;margin-top:2px;padding:1px 6px;font-size:10px;font-weight:bold;background:#0284c7;color:#fff;border:none;border-radius:3px;cursor:pointer;">🖨️ QR</button>`, width: '42%' },
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
    foot: '<span><b>F2</b>-New</span><span><b>F3</b>-Modify</span><span><b>Alt+P</b>-Print QR</span><span><b>F4</b>-Reg.</span>',
    onKey: (k, cur, pop) => {
      if (k === 'F2') { if (!allowed('item.add', 'New Item')) return true; itemForm({ name: initial.toUpperCase() }).then(async (i) => { if (i) pop.setRows(await api('/items')); }); return true; }
      if (k === 'F3' && cur) { if (!allowed('item.list', 'Edit Item')) return true; itemForm(cur).then(async (i) => { if (i) pop.setRows(await api('/items')); }); return true; }
      if ((k === 'Alt+P' || k === 'Alt+p') && cur) { import('./jeweltag.ts').then((m) => m.printItemTag(cur)); return true; }
      if (k === 'F4' && cur) { if (allowed('item.register', 'Item Register')) import('./masters.ts').then((m) => m.itemRegister(cur)).catch((e) => toast((e as Error).message, true)); return true; }
      return false;
    },
  });
}

/** Returned by pickBatch when the user asks for a new batch (F2), or the item has none yet on a purchase. */
const NEW_BATCH = { id: -1, batch: '< NEW BATCH >' } as Batch;

async function promptNewBatch(it: Item, defaultBatch = '', isPur = true): Promise<{ batch: string; expiry: string; mrp: number; rate: number } | null> {
  const cleanDefault = defaultBatch.includes('< NEW BATCH >') ? '' : defaultBatch;
  const batch = await margAsk('Batch', cleanDefault);
  if (batch == null || !batch.trim()) return null;
  let expiry = '';
  for (;;) {
    const e = await margAsk('Expiry (MM/YY)', '');
    if (e == null) return null;
    if (!e) break;
    const parsed = parseExpiry(e);
    if (parsed) { expiry = parsed; break; }
    toast('Enter the expiry as MM/YY or MMYY, e.g. 03/27 or 0327', true);
  }
  const mrpS = await margAsk(isPur ? 'M.R.P.' : 'MRP for Search', f2(it.mrp));
  if (mrpS == null) return null;
  const pRateS = isPur ? await margAsk('Purchase Rate', f2(it.purchase_rate ?? 0)) : null;
  const pRate = pRateS != null ? (Number(pRateS) || it.purchase_rate || 0) : (it.purchase_rate ?? 0);
  return {
    batch: batch.trim().toUpperCase(),
    expiry,
    mrp: Number(mrpS) || it.mrp,
    rate: pRate,
  };
}

/** BATCH window for the chosen item. `allowNew`: purchase-side entries, where new batches come in (F2-New Batch). */
async function pickBatch(item: Item, allowNew = false): Promise<Batch | null> {
  const rows = await api<Batch[]>(`/items/${item.id}/batches`);
  const total = rows.reduce((s, b) => s + b.stock, 0);
  if (!rows.length && !allowNew) {
    toast('No batch found — purchase this item first (Purchase → Batch)', true);
    return null;
  }
  if (!rows.length && allowNew) {
    return NEW_BATCH;
  }
  const newRow: Batch = {
    id: -1,
    item_id: item.id,
    item_name: item.name,
    batch: '< NEW BATCH >',
    stock: 0,
    unit: item.unit ?? '',
    rate: item.sale_rate ?? 0,
    f_rate: item.sale_rate ?? 0,
    mrp: item.mrp ?? 0,
    expiry: '',
    purchase_rate: item.purchase_rate ?? 0,
    supplier: '',
    invoice_no: '',
    invoice_date: '',
    pack: item.pack ?? '',
    gst_rate: item.gst_rate ?? 0,
    company: item.company ?? '',
    hsn: item.hsn ?? '',
  };
  const listRows: Batch[] = allowNew ? [newRow, ...rows] : rows;
  return popList<Batch>({
    onKey: (k, _cur, pop) => {
      if (allowNew && (k === 'F2' || k === 'Insert')) {
        pop.close(NEW_BATCH);
        return true;
      }
    },
    onEnterNotFound: (typed, pop) => {
      if (allowNew && typed) {
        pop.close({ id: -1, batch: typed.toUpperCase() } as Batch);
        return true;
      }
    },
    title: `${item.name.toUpperCase()} ${item.pack ?? ''}`,
    rows: listRows,
    search: (r) => (r.id === -1 ? '' : r.batch),
    width: '1020px',
    findLabel: allowNew ? 'Batch ? >>' : 'Find ? >>',
    extra: `Total : ${total}`,
    extraHtml: allowNew
      ? `Total : ${total} &nbsp; <button type="button" data-pop-action="new" style="background:#006633;color:#fff;border:1px solid #fff;padding:2px 10px;font-weight:bold;cursor:pointer;border-radius:2px;font-size:11px;">+ NEW BATCH (F2)</button>`
      : undefined,
    detailCols: 3,
    rowCls: (r) => (r.id === -1 ? 'row-new-batch' : ''),
    cols: [
      {
        title: 'BATCH',
        get: (r) => (r.id === -1 ? '✦ < NEW BATCH >' : r.batch),
        cls: (r) => (r.id === -1 ? 'batch-new-cell' : ''),
        width: '22%',
      },
      { title: 'STOCK', get: (r) => (r.id === -1 ? '-' : r.stock), num: true, width: '10%' },
      { title: 'UNIT', get: (r) => r.unit, width: '10%' },
      { title: 'RATE-A', get: (r) => (r.id === -1 ? '-' : f2(r.rate)), num: true, width: '14%' },
      { title: 'F.RATE', get: (r) => (r.id === -1 ? '-' : f2(r.f_rate)), num: true, width: '14%' },
      { title: 'M.R.P.', get: (r) => (r.id === -1 ? '-' : f2(r.mrp)), num: true, width: '14%' },
      { title: 'EXP.', get: (r) => (r.id === -1 ? '-' : expShort(r.expiry)), width: '10%' },
    ],
    detail: (r) => {
      if (!r) return '';
      if (r.id === -1) {
        return `<div style="grid-column:1/-1;padding:8px 12px;color:#007a3d;font-size:13px;font-weight:bold;background:#eefbf2;border:1px dashed #007a3d;">
          ✦ Press Enter or F2 to create a brand new batch for ${esc(item.name.toUpperCase())}. You will be prompted for Batch No., Expiry (MM/YY), M.R.P., and Purchase Rate.
        </div>`;
      }
      return `
        <div>PurRate: <b>${c2(r.purchase_rate)}</b></div><div>M.R.P. &nbsp;: <b>${f2(r.mrp)}</b></div><div>Supp. &nbsp;: <b>${esc(r.supplier ?? '')}</b></div>
        <div>Cost &nbsp;&nbsp;: <b>${c2(r.purchase_rate)}</b></div><div>Rate &nbsp;&nbsp;: <b>${f2(r.rate)}</b></div>
        <div>Invoice: <b>${esc(r.invoice_no ?? '')}</b> &nbsp; Hold: 0</div>
        <div>Margin%: <b>${margin(r.rate, r.purchase_rate)}</b></div>
        <div>Tax-T-I: <b>${f2(r.gst_rate)}</b></div>
        <div>Date &nbsp;&nbsp;: <b>${dmy(r.invoice_date ?? '')}</b> &nbsp; Days: ${r.invoice_date ? Math.max(0, Math.round((Date.now() - new Date(r.invoice_date).getTime()) / 864e5)) : 0}</div>
        <div>W/oDeal: <b>${c2(r.purchase_rate)}</b></div><div>F.Rate&nbsp;: <b>${f2(r.f_rate)}</b></div><div>Packin&nbsp;: <b>${esc(r.pack ?? '')}</b></div>
        <div>PurDeal:</div><div>Deal[F]:</div><div>Conv. &nbsp;: 0</div>
        <div>PurDisc:</div><div>Scheme&nbsp;: 0</div><div>Barcode:</div>`;
    },
    foot: (allowNew ? '<span data-pop-action="new" style="background:#006633;color:#fff;padding:1px 6px;cursor:pointer;border-radius:2px;"><b>F2</b>-New Batch</span>' : '') +
      '<span><b>F3</b>-Edit</span><span><b>F5</b>-Register</span><span><b>Ins</b>-Balance</span><span><b>F10</b>-All</span><span><b>Alt+~</b>-Rates</span>',
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
  // JEWELLERY business: weight-based grid + DESCRIPTION window instead of batch / expiry / qty.
  const jewel = isJewellery(company.business_type);
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
  // A jewellery PURCHASE is headed like MARG's: Entry No / Party No / Dt (the supplier's bill).
  const refEntry = isRet || type === 'PURCHASE_CHALLAN' || (jewel && type === 'PURCHASE');
  /** JEWELLERY: the party's metal account from PARTY HISTORY (pure weight; + = with the party). */
  let metalBal = { gold: 0, silver: 0 };
  let retInfo: ReturnInfo | null = null;
  let cdPct = 0;
  let cdAmt = 0;
  let freight = 0;
  let otherCharges = 0;
  let manualRoundOff: number | null = null;

  const w = openWin(ENTRY_TITLE[type], 'full', '');
  w.el.classList.add('marg');
  const screen = h('div', { class: 'marg-screen' });
  const bar = margBar(ENTRY_TITLE[type]);
  screen.innerHTML = `
    <div class="marg-head">
      <label>Name</label><input class="val" data-f="name" readonly>
      <label>Date</label><input class="val date" data-f="date" size="10" maxlength="10" autocomplete="off">
      ${refEntry
        ? `<label>Entry No.</label><div><input class="val" data-f="no" size="10"> <span style="color:var(--marg-lbl)">Party No:</span> <input class="val" data-f="pno" size="10" autocomplete="off">
            <span style="color:var(--marg-lbl)">Dt:</span> <input class="val" data-f="pdt" size="10"> <span style="color:var(--marg-lbl)">M.R.:</span> <input class="val" data-f="mr" readonly size="8"></div>`
        : '<label>Bill No.</label><div><input class="val" data-f="no" size="10"> <span style="color:var(--marg-lbl)">M.R.:</span> <input class="val" data-f="mr" readonly size="10"></div>'}
      <label>Type</label><input class="val" data-f="type" readonly>
    </div>
    <div class="marg-rows"><table class="marg-grid${jewel ? ' jw-grid-bill' : ''}"><thead><tr>
      ${jewel ? JW_COLS.map((c) => `<th class="${c.num ? 'n' : ''}" style="width:${c.w}">${c.label}</th>`).join('') : GRID_COLS.map((c) => `<th class="${c.num ? 'n' : ''}${c.center ? ' c' : ''}" style="width:${c.w};${c.center ? 'text-align:center;' : ''}">${c.key === 'rate' && isPurchase(type) ? 'P.RATE' : c.label}</th>`).join('')}
      <th class="n">AMOUNT</th></tr></thead><tbody></tbody></table></div>
    <div class="marg-foot">
      <div class="info1"></div><div class="info2"></div><div class="info3"></div>
    </div>
    <div style="font-size:12px;padding:1px 8px" class="cal"></div>
    <div class="marg-tools">${TOOLS.map((t) => `<span data-t="${t}" class="${t === 'SAVE' ? 'save' : ''}">${t}</span>`).join('')}</div>
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
  if (!canBackdate()) { dateI.readOnly = true; dateI.title = NO_DATE; }
  const tbody = screen.querySelector('tbody')!;
  const setBar = (t: string) => { (bar.firstElementChild as HTMLElement).textContent = t; };

  // ---------------------------------------------------------------- painting
  function renderRows() {
    const filler = Math.max(0, 12 - rows.length);
    if (jewel) {
      tbody.innerHTML = rows.map((r, i) => `<tr data-r="${i}"><td><input data-r="${i}" data-c="name" value="${esc(r.name ?? '')}" autocomplete="off"${!r.item_id && i === 0 && party ? ' placeholder="← key to change Bill No."' : ''}></td>
          ${JW_COLS.slice(1).map((c) => `<td class="${c.num ? 'n' : ''}">${r.jw ? esc(c.get(r.jw)) : ''}</td>`).join('')}
          <td class="n">${r.item_id ? f2(calc(r).amount) : ''}</td></tr>`).join('')
        + Array.from({ length: filler }, () => `<tr>${JW_COLS.map(() => '<td></td>').join('')}<td></td></tr>`).join('');
      renderTotals();
      return;
    }
    const cell = (r: Row, i: number, c: typeof GRID_COLS[number]) => {
      const v = r[c.key];
      if (c.key === 'name') {
        const hint = !r.item_id && i === 0 && party ? ' placeholder="← key to change Bill No."' : '';
        return `<td><input data-r="${i}" data-c="name" value="${esc(v ?? '')}" autocomplete="off"${hint}></td>`;
      }
      if (c.key === 'expiry') {
        const expStr = expShort(String(r.expiry || ''));
        if (r.item_id) {
          return `<td class="c"><input data-r="${i}" data-c="expiry" class="exp-inp" value="${esc(expStr)}" placeholder="MM/YY" maxlength="7" autocomplete="off" style="text-align:center;text-transform:uppercase"></td>`;
        }
        return `<td class="c"></td>`;
      }
      if (c.key === 'batch') {
        if (r.item_id && isPurchase(type)) {
          return `<td><input data-r="${i}" data-c="batch" class="batch-inp" value="${esc(v ?? '')}" placeholder="BATCH" autocomplete="off" style="text-transform:uppercase"></td>`;
        }
        return `<td>${esc(v ?? '')}</td>`;
      }
      if (c.edit) return `<td class="n"><input data-r="${i}" data-c="${c.key}" class="num" value="${r.item_id ? (v ?? 0) : ''}"></td>`;
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
    const effectiveCd = cdPct > 0 ? r2(taxable * (cdPct / 100)) : r2(cdAmt);
    const subtotal = r2(taxable + tax - effectiveCd + freight + otherCharges);
    const roundOff = manualRoundOff != null ? manualRoundOff : r2(Math.round(subtotal) - subtotal);
    const net = r2(subtotal + roundOff);
    const mrpValue = r2(live.reduce((s, r) => s + (r.jw ? r.jw.mrp * (r.jw.sets || 1) : r.qty * (r.mrp ?? 0)), 0));
    return { live, gross, taxable, tax, cdPct, cdAmt: effectiveCd, freight, otherCharges, roundOff, net, mrpValue };
  }
  function renderTotals() {
    const { live, gross, taxable, tax, net, mrpValue, cdPct: cdp, cdAmt: cda, freight: fr, otherCharges: ot, roundOff: ro } = totals();
    const cur = rows[curRow];
    if (jewel) {
      const sum = (f: (j: JwLine) => number) => r2(live.reduce((s, r) => s + (r.jw ? f(r.jw) : 0), 0));
      const w3 = (f: (j: JwLine) => number) => live.reduce((s, r) => s + (r.jw ? f(r.jw) : 0), 0).toFixed(3);
      screen.querySelector('.info1')!.innerHTML = `
        <div><span class="k">Store</span>: <b>MAIN STORE</b></div>
        <div><span class="k">Ref.</span>: <b class="jw-ref-cur">${esc(cur?.jw?.ref ?? '')}</b> &nbsp; &nbsp; <span class="k">BOX</span>: <b>${esc(cur?.jw?.tray ?? '')}</b></div>
        <div><span class="k">Chall.</span>: &nbsp; &nbsp; &nbsp; &nbsp; <span class="k">Date</span> :</div>
        <div><span class="k">Gr/Net</span>: <b>${w3((j) => j.gross)}</b> / <b>${w3((j) => j.net)}</b></div>`;
      // Party's metal after this bill: a sale puts pure weight with the party, a purchase takes it in.
      const sign = PARTY_DR.has(type) ? 1 : -1;
      const metalOf = (m: string) => live.reduce((t, r) => t + (r.jw && (r.jw.metal || 'GOLD') === m ? r.jw.pure : 0), 0);
      screen.querySelector('.info2')!.innerHTML = `
        <div class="kv"><span class="k">MRP Value :</span><b>${f2(mrpValue)}</b></div>
        <div class="kv"><span class="k">Amount :</span><b>${f2(sum((j) => j.amount))}</b></div>
        <div class="kv"><span class="k">Making :</span><b>${f2(sum((j) => j.makingAmt))}</b></div>
        <div class="kv"><span class="k">Extra Good :</span><b>${f2(sum((j) => j.extra))}</b></div>
        <div class="kv"><span class="k">Balance :</span><b>${party ? f2(Math.abs(party.balance + (PARTY_DR.has(type) ? net : -net))) : '0.00'}</b></div>
        <div class="kv"><span class="k">Gold :</span><b>${(metalBal.gold + sign * metalOf('GOLD')).toFixed(3)}</b></div>
        <div class="kv"><span class="k">Silver :</span><b>${(metalBal.silver + sign * metalOf('SILVER')).toFixed(3)}</b></div>`;
      screen.querySelector('.info3')!.innerHTML = `
        <div class="kv"><span class="k">VALUE OF GOODS</span><b>${f2(taxable)}</b></div>
        <div class="kv"><span class="k">DISCOUNT</span><b>${f2(gross - taxable)}</b></div>
        <div class="kv"><span class="k">GST%</span><b>${f2(tax)}</b></div>
        ${isPurchase(type) ? '<div class="kv"><span class="k">CASH PURCHASE</span><b>0.00</b></div>'
          : '<div class="kv"><span class="k">PURCHASE TAX CAR:</span><b>0.00</b></div><div class="kv"><span class="k">TAX PAID ON PURC:</span><b>0.00</b></div>'}
        <div class="kv clickable" data-fld="cd" title="Click or Press F8 to edit Cash Discount"><span class="k">CASH DISCOUNT ${cdp ? `(${cdp}%)` : ''}</span><b>${f2(cda)}</b></div>`;
      void ro;   // round-off is applied in BILL ADJUSTMENT; MARG's jewellery footer does not list it
      void fr; void ot;
      screen.querySelectorAll('.info3 .clickable').forEach((el) => el.addEventListener('click', () => billAdjustmentsWindow((el as HTMLElement).dataset.fld as any)));
      // As MARG: Cal:2,<line>,Qt:<gross weight>(<lines>)
      screen.querySelector('.cal')!.textContent = `Cal:2,${live.length + 1},Qt:${Number(w3((j) => j.gross))}(${live.length})`;
      screen.querySelector('.inv')!.textContent = f2(net);
      tbody.querySelectorAll('tr').forEach((tr, i) => {
        const r = rows[i];
        const td = tr.lastElementChild as HTMLElement | null;
        if (td && r) td.textContent = r.item_id ? f2(calc(r).amount) : '';
      });
      return;
    }
    screen.querySelector('.info1')!.innerHTML = `
      <div><span class="k">Item</span>: <b>${esc(cur?.name ?? '')}</b></div>
      <div><span class="k">Batch</span>: <b>${esc(cur?.batch ?? '')}</b></div>
      <div><span class="k">Expiry</span>: <b>${esc(expShort(cur?.expiry ?? ''))}</b> &nbsp; Stock: <b>${cur?.stock ?? ''}</b></div>
      ${refEntry ? `<div><span class="k">M.R.P.</span>: <b>${cur?.mrp ? f2(cur.mrp) : ''}</b> &nbsp; SRate: <b>${cur?.item_id ? f2(cur.rate) : ''}</b></div>` : ''}
      <div><span class="k">Chall.</span>: &nbsp; Date :</div>`;
    screen.querySelector('.info2')!.innerHTML = `
      <div class="kv"><span class="k">MRP Value :</span><b>${f2(mrpValue)}</b></div>
      <div class="kv"><span class="k">Amount :</span><b>${f2(gross)}</b></div>
      <div class="kv"><span class="k">Balance :</span><b>${party ? f2(Math.abs(party.balance + (PARTY_DR.has(type) ? net : -net))) : '0.00'}</b></div>
      <div class="kv"><span class="k">Cr.Limit :</span><b>${party?.credit_limit ? f2(party.credit_limit) : '0.00'}</b></div>`;
    screen.querySelector('.info3')!.innerHTML = `
      <div class="kv"><span class="k">VALUE OF GOODS</span><b>${f2(taxable)}</b></div>
      <div class="kv"><span class="k">DISCOUNT</span><b>${f2(gross - taxable)}</b></div>
      <div class="kv"><span class="k">GST%</span><b>${f2(tax)}</b></div>
      <div class="kv clickable" data-fld="cd" title="Click or Press F8 to edit Cash Discount"><span class="k">CASH DISCOUNT ${cdp ? `(${cdp}%)` : ''}</span><b>${f2(cda)}</b></div>
      <div class="kv clickable" data-fld="freight" title="Click or Press F9 to edit Freight"><span class="k">FREIGHT</span><b>${f2(fr)}</b></div>
      ${ot ? `<div class="kv clickable" data-fld="other" title="Click to edit Other Charges"><span class="k">OTHER CHARGES</span><b>${f2(ot)}</b></div>` : ''}
      <div class="kv clickable" data-fld="round" title="Click to edit Round Off"><span class="k">ROUND OFF</span><b>${f2(ro)}</b></div>`;
    screen.querySelectorAll('.info3 .clickable').forEach((el) => {
      el.addEventListener('click', () => {
        const fld = (el as HTMLElement).dataset.fld as any;
        billAdjustmentsWindow(fld);
      });
    });
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
      if (jewel) {
        // MARG jewellery: a purchase shows PARTY HISTORY; a sale goes straight to the items.
        // Neither asks for an M.R.; the party's Gold / Silver show in the footer either way.
        if (isPurchase(type)) {
          const mb = await partyHistory(l.id, true);
          if (mb) metalBal = mb;
        } else {
          metalBal = await partyMetal(l.id).catch(() => metalBal);
        }
        renderRows();
        if (refEntry && pnoI) { pnoI.focus(); pnoI.select(); } else focusCell(0, 'name');
        return;
      }
      let partyMR: Salesman | null = null;
      if (l.details) {
        try {
          const pDet = JSON.parse(l.details);
          if (pDet.mr_id || pDet.mr_name) {
            const salesmen = await api<Salesman[]>('/salesmen');
            partyMR = salesmen.find((s) => String(s.id) === String(pDet.mr_id)) || (pDet.mr_name ? { id: Number(pDet.mr_id) || 0, name: pDet.mr_name, area: '' } : null);
          }
        } catch { /* ignore */ }
      }
      const m = partyMR || (await pickMR());
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
            ...(l.jw ? { jw: typeof l.jw === 'string' ? JSON.parse(l.jw) : l.jw } : {}),
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
      if (jewel) {
        // DESCRIPTION: an item from the list — or a Ref. (tag no.) typed / scanned, which brings its item.
        const it = await pickJewelItem(typed);
        if (!it) { focusCell(rowIdx, 'name'); return; }
        const inward = type === 'PURCHASE' || type === 'PURCHASE_CHALLAN';
        let init: Partial<JwLine> | undefined;
        if (inward) {
          // Every piece / lot bought gets a Ref. (AVAILABLE STOCKS, next number ready; blank not allowed).
          const used = rows.filter((x, i) => i !== rowIdx && x.jw?.ref).map((x) => x.jw!.ref.toUpperCase());
          let ref: string | null = null;
          for (;;) {
            ref = await askPurchaseRef(it, '', used);
            if (!ref || !used.includes(ref)) break;
            toast(`Ref. ${ref} is already on this bill`, true);
          }
          if (!ref) { focusCell(rowIdx, 'name'); return; }
          init = { ref };
        } else if (type !== 'SALE_RETURN') {
          // Sale: the Ref. being sold (scanned tag, or chosen from AVAILABLE STOCKS) fills the weights.
          const pick: JwRef | null | undefined = it.ref ?? await pickSaleRef(it);
          if (pick) {
            if (rows.some((x, i) => i !== rowIdx && x.jw?.ref && x.jw.ref.toUpperCase() === pick.ref.toUpperCase())) {
              toast(`Ref. ${pick.ref} is already on this bill`, true); focusCell(rowIdx, 'name'); return;
            }
            init = jwFromRef(it, pick);
          }
        }
        const jw = await jewelDetail(it, isPurchase(type) && type !== 'PURCHASE_RETURN', init as JwLine | undefined);
        if (!jw) { focusCell(rowIdx, 'name'); return; }
        rows[rowIdx] = {
          item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(), qty: jw.sets, free: 0,
          rate: jw.rate, disc: 0, gst: it.gst_rate, mrp: jw.mrp, cost: it.purchase_rate, unit: it.unit, jw, batch: jw.ref || '',
        };
        if (rowIdx === rows.length - 1) rows.push(blank());
        dirty = true; renderRows(); focusCell(rowIdx + 1, 'name');
        return;
      }
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
          item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(),
          batch: (it.batch || '').toUpperCase(), expiry: it.expiry || '',
          qty: 1, free: 0, rate: isPurchase(type) ? (it.purchase_rate ?? 0) : netRate(it.sale_rate, it.gst_rate), disc: 0, gst: it.gst_rate,
          mrp: it.mrp, cost: it.purchase_rate, stock: it.stock, unit: it.unit,
        };
        dirty = true; renderRows();
        if (isPurchase(type)) {
          if (!rows[rowIdx].batch) focusCell(rowIdx, 'batch');
          else if (!rows[rowIdx].expiry) focusCell(rowIdx, 'expiry');
          else focusCell(rowIdx, 'qty');
        } else {
          focusCell(rowIdx, 'qty');
        }
        return;
      }
      const b = inward ? await pickBatch(it, true) : await chooseBatch(it, style);
      if (b === NEW_BATCH || b?.id === -1) {
        const nb = await promptNewBatch(it, b?.batch || '', isPurchase(type));
        if (!nb) { focusCell(rowIdx, 'name'); return; }
        rows[rowIdx] = {
          item_id: it.id, name: it.name.toUpperCase(), pack: (it.pack ?? '').toUpperCase(), batch: nb.batch, expiry: nb.expiry,
          qty: 1, free: 0, rate: isPurchase(type) ? nb.rate : netRate(it.sale_rate, it.gst_rate), disc: 0, gst: it.gst_rate, mrp: nb.mrp, unit: it.unit,
          cost: nb.rate,
        };
        delete rows[rowIdx].batch_id;
        dirty = true; renderRows();
        if (isPurchase(type) && !nb.expiry) focusCell(rowIdx, 'expiry');
        else focusCell(rowIdx, 'qty');
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
      if (isPurchase(type)) {
        if (!b.batch) focusCell(rowIdx, 'batch');
        else if (!b.expiry) focusCell(rowIdx, 'expiry');
        else focusCell(rowIdx, 'qty');
      } else {
        focusCell(rowIdx, 'qty');
      }
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
      cd_pct: t.cdPct,
      cd_amt: t.cdAmt,
      freight: t.freight,
      other_charges: t.otherCharges,
      round_off: t.roundOff,
      lines: t.live.map((r) => ({
        item_id: r.item_id, batch_id: r.batch_id, batch: r.batch, expiry: r.expiry,
        qty: r.qty, free: r.free, rate: r.rate, disc_pct: r.disc, gst_rate: r.gst, mrp: r.mrp,
        ...(r.jw ? { jw: r.jw } : {}),
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
      const liveItems = totals().live;
      const copies = await margNumber('No. of Copies', 1);
      if (copies) await import('./billing.ts').then((m) => m.printCopies(res.id, copies)).catch((e) => toast((e as Error).message, true));

      // Option to print QR Tags for items in this bill
      if (liveItems.length > 0) {
        const askQr = await margConfirm('Print Jewellery / Item QR Tags for this Bill ?');
        if (askQr) {
          const jm = await import('./jeweltag.ts');
          const allItems = await api<Item[]>('/items').catch(() => []);
          const tags = liveItems.map((r) => {
            const rawIt = allItems.find((it) => it.id === r.item_id);
            let d: any = {};
            try { d = JSON.parse(rawIt?.details || '{}'); } catch {}
            return jm.tagOfItem({ ...rawIt, name: r.name, details: JSON.stringify({ ...d, ...(r.jw || {}) }) });
          });
          jm.printMultipleJewelTags(tags);
        }
      }
      if (billId) { w.close(); return; }
      await reset();
    } catch (e) { toast((e as Error).message, true); }
  }

  /** BILL ADJUSTMENT / BILL SUNDRY window (Cash Discount, Freight, Other charges, Round Off). */
  function billAdjustmentsWindow(initialFocus: 'cd' | 'freight' | 'round' | 'other' = 'cd'): Promise<boolean> {
    return new Promise((resolve) => {
      const curTotals = totals();
      const p = margPop('BILL ADJUSTMENT / BILL SUNDRY',
        '<span><b>Enter</b>-Next</span><span><b>F10/End</b>-Save</span><span><b>Esc</b>-Close</span>',
        '540px');
      const box = h('div', { class: 'marg-bill-sundry' });

      let tempCdPct = cdPct;
      let tempCdAmt = curTotals.cdAmt;
      let tempFreight = freight;
      let tempOther = otherCharges;
      let tempRound = curTotals.roundOff;
      let autoRound = manualRoundOff == null;

      const calcPreviewNet = () => {
        const effCd = tempCdPct > 0 ? r2(curTotals.taxable * (tempCdPct / 100)) : r2(tempCdAmt);
        const sub = r2(curTotals.taxable + curTotals.tax - effCd + tempFreight + tempOther);
        if (autoRound) tempRound = r2(Math.round(sub) - sub);
        const n = r2(sub + tempRound);
        return { effCd, sub, n };
      };

      box.innerHTML = `
        <div class="sundry-head">BILL SUNDRY / CHARGES &amp; ADJUSTMENTS</div>
        <table class="sundry-table">
          <tr>
            <td class="lbl">Goods Value (Taxable)</td>
            <td class="val">₹ ${f2(curTotals.taxable)}</td>
          </tr>
          <tr>
            <td class="lbl">Total GST</td>
            <td class="val">₹ ${f2(curTotals.tax)}</td>
          </tr>
          <tr>
            <td class="lbl">Cash Discount (CD %)</td>
            <td><input type="number" step="0.01" class="sundry-inp" data-f="cd_pct" value="${tempCdPct ? f2(tempCdPct) : ''}" placeholder="0.00"> %</td>
          </tr>
          <tr>
            <td class="lbl">Cash Discount Amt</td>
            <td>₹ <input type="number" step="0.01" class="sundry-inp" data-f="cd_amt" value="${tempCdAmt ? f2(tempCdAmt) : ''}" placeholder="0.00"></td>
          </tr>
          <tr>
            <td class="lbl">Freight Charges (FREIGHT)</td>
            <td>₹ <input type="number" step="0.01" class="sundry-inp" data-f="freight" value="${tempFreight ? f2(tempFreight) : ''}" placeholder="0.00"></td>
          </tr>
          <tr>
            <td class="lbl">Other / Misc Charges</td>
            <td>₹ <input type="number" step="0.01" class="sundry-inp" data-f="other" value="${tempOther ? f2(tempOther) : ''}" placeholder="0.00"></td>
          </tr>
          <tr>
            <td class="lbl">Round Off (+/-)</td>
            <td>₹ <input type="number" step="0.01" class="sundry-inp" data-f="round" value="${f2(tempRound)}" placeholder="0.00">
              <button type="button" class="btn-sundry-auto" title="Auto calculate round-off">Auto</button>
            </td>
          </tr>
          <tr class="sundry-net-tr">
            <td class="lbl">NET INVOICE VALUE</td>
            <td class="val net-val" id="sundry-net-display">₹ ${f2(curTotals.net)}</td>
          </tr>
        </table>
        <div class="sundry-btns">
          <button type="button" class="btn-primary" data-a="ok"><u>O</u>K (Enter)</button>
          <button type="button" data-a="cancel"><u>C</u>ancel (Esc)</button>
        </div>
      `;
      p.body.append(box);

      const cdPctInp = box.querySelector('input[data-f="cd_pct"]') as HTMLInputElement;
      const cdAmtInp = box.querySelector('input[data-f="cd_amt"]') as HTMLInputElement;
      const frInp = box.querySelector('input[data-f="freight"]') as HTMLInputElement;
      const otInp = box.querySelector('input[data-f="other"]') as HTMLInputElement;
      const rdInp = box.querySelector('input[data-f="round"]') as HTMLInputElement;
      const netDisp = box.querySelector('#sundry-net-display') as HTMLElement;
      const autoBtn = box.querySelector('.btn-sundry-auto') as HTMLButtonElement;

      const refreshNet = () => {
        const { effCd, n } = calcPreviewNet();
        if (document.activeElement !== cdAmtInp && tempCdPct > 0) {
          cdAmtInp.value = f2(effCd);
        }
        if (autoRound) {
          rdInp.value = f2(tempRound);
        }
        netDisp.textContent = `₹ ${f2(n)}`;
      };

      cdPctInp.addEventListener('input', () => {
        tempCdPct = Math.max(0, Number(cdPctInp.value) || 0);
        tempCdAmt = tempCdPct > 0 ? r2(curTotals.taxable * (tempCdPct / 100)) : 0;
        refreshNet();
      });

      cdAmtInp.addEventListener('input', () => {
        tempCdAmt = Math.max(0, Number(cdAmtInp.value) || 0);
        tempCdPct = curTotals.taxable ? r2((tempCdAmt / curTotals.taxable) * 100) : 0;
        cdPctInp.value = tempCdPct ? f2(tempCdPct) : '';
        refreshNet();
      });

      frInp.addEventListener('input', () => {
        tempFreight = Math.max(0, Number(frInp.value) || 0);
        refreshNet();
      });

      otInp.addEventListener('input', () => {
        tempOther = Math.max(0, Number(otInp.value) || 0);
        refreshNet();
      });

      rdInp.addEventListener('input', () => {
        autoRound = false;
        tempRound = Number(rdInp.value) || 0;
        refreshNet();
      });

      autoBtn.addEventListener('click', () => {
        autoRound = true;
        refreshNet();
      });

      const applyAndClose = () => {
        cdPct = tempCdPct;
        cdAmt = tempCdPct > 0 ? r2(curTotals.taxable * (tempCdPct / 100)) : tempCdAmt;
        freight = tempFreight;
        otherCharges = tempOther;
        manualRoundOff = autoRound ? null : tempRound;
        dirty = true;
        renderTotals();
        p.close();
        resolve(true);
      };

      box.querySelector('button[data-a="ok"]')?.addEventListener('click', applyAndClose);
      box.querySelector('button[data-a="cancel"]')?.addEventListener('click', () => { p.close(); resolve(false); });

      const inputs = [cdPctInp, cdAmtInp, frInp, otInp, rdInp];
      let focusEl = cdPctInp;
      if (initialFocus === 'freight') focusEl = frInp;
      else if (initialFocus === 'round') focusEl = rdInp;
      else if (initialFocus === 'other') focusEl = otInp;

      focusEl.focus();
      focusEl.select();

      p.onKey = (_e, k) => {
        const active = document.activeElement as HTMLInputElement;
        if (k === 'Enter') {
          const idx = inputs.indexOf(active);
          if (idx >= 0 && idx < inputs.length - 1) {
            inputs[idx + 1].focus();
            inputs[idx + 1].select();
            return true;
          }
          applyAndClose();
          return true;
        }
        if (k === 'End' || k === 'F10' || k === 'Ctrl+W') {
          applyAndClose();
          return true;
        }
        if (k === 'Escape') {
          p.close();
          resolve(false);
          return true;
        }
        return false;
      };
    });
  }

  /** MODE OF PAYMENT window. */
  function paymentWindow(): Promise<'saved' | 'back'> {
    return new Promise((resolve) => {
      const net = totals().net;
      const p = margPop('MODE OF PAYMENT',
        '<span><b>Enter / End / F10</b> - Save Bill</span><span><b>Del</b> - Delete</span><span><b>Esc</b> - Back</span>',
        '1000px');
      const box = h('div', { class: 'marg-pay', style: 'height:420px' });
      p.body.append(box);
      let sel = 0;
      let editingAmt = false;
      const amountOf = (id: number) => payments.find((x) => x.ledger_id === id)?.amount ?? 0;

      let done = false;
      const finish = (v: 'saved' | 'back') => { if (done) return; done = true; p.close(); resolve(v); };

      const commit = () => {
        const el = box.querySelector('.amt-in') as HTMLInputElement | null;
        if (!el) return;
        const amt = r2(Number(el.value || 0));
        const m = modes[sel];
        payments = payments.filter((x) => x.ledger_id !== m.id);
        if (amt) payments.push({ ledger_id: m.id, ledger: m.name, amount: amt, remark: '', detail: '' });
        editingAmt = false;
      };

      const draw = () => {
        const cur = modes[sel];
        const received = r2(payments.reduce((s, x) => s + x.amount, 0));
        const pending = r2(net - received);
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
            <div class="pend">Pending &nbsp; ${f2(pending)}</div>
            <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
              <button type="button" class="btn-pay-save" style="background:#15803d;color:#fff;border:none;padding:8px 22px;font-size:14px;font-weight:700;border-radius:4px;cursor:pointer;box-shadow:0 1px 3px rgba(0,0,0,0.25)">
                💾 Save Bill (Enter / End / F10)
              </button>
            </div>
          </div></div>`;

        box.querySelectorAll('.modes div').forEach((d) => d.addEventListener('click', () => { sel = Number((d as HTMLElement).dataset.i); draw(); }));

        const saveBtn = box.querySelector('.btn-pay-save') as HTMLButtonElement | null;
        if (saveBtn) {
          saveBtn.onclick = () => {
            commit();
            finish('saved');
          };
        }

        const el = box.querySelector('.amt-in') as HTMLInputElement | null;
        if (el) {
          el.onkeydown = (e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              e.stopPropagation();
              commit();
              const rec = r2(payments.reduce((s, x) => s + x.amount, 0));
              if (rec >= net || r2(net - rec) <= 0.001) {
                finish('saved');
              } else {
                draw();
              }
            } else if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              editingAmt = false;
              draw();
            } else if (e.key === 'End' || e.key === 'F10') {
              e.preventDefault();
              e.stopPropagation();
              commit();
              finish('saved');
            }
          };
          if (editingAmt) {
            el.focus();
            el.select();
          }
        }
      };
      draw();

      p.el.querySelector('.win-foot, .marg-foot')?.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.textContent?.includes('Save')) {
          if (editingAmt) commit();
          finish('saved');
        }
      });

      p.onKey = (_e, k) => {
        if (k === 'End' || k === 'F10' || k === 'Ctrl+W') {
          if (editingAmt) commit();
          finish('saved');
          return true;
        }
        if (editingAmt) {
          if (k === 'Enter') {
            commit();
            const rec = r2(payments.reduce((s, x) => s + x.amount, 0));
            if (rec >= net || r2(net - rec) <= 0.001) {
              finish('saved');
            } else {
              draw();
            }
            return true;
          }
          if (k === 'Escape') { editingAmt = false; draw(); return true; }
          return false;
        }
        if (k === 'ArrowDown') { sel = (sel + 1) % modes.length; draw(); return true; }
        if (k === 'ArrowUp') { sel = (sel - 1 + modes.length) % modes.length; draw(); return true; }
        if (k === 'Enter') {
          const rec = r2(payments.reduce((s, x) => s + x.amount, 0));
          if (rec >= net || r2(net - rec) <= 0.001) {
            finish('saved');
            return true;
          }
          editingAmt = true;
          draw();
          return true;
        }
        if (k === 'Delete') { payments = payments.filter((x) => x.ledger_id !== modes[sel].id); draw(); return true; }
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
      if (await margConfirm('Save Changes')) await save();
      return;
    }

    const adjOk = await billAdjustmentsWindow();
    if (!adjOk) { focusCell(Math.max(0, rows.length - 1), 'name'); return; }

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
    cdPct = 0;
    cdAmt = 0;
    freight = 0;
    otherCharges = 0;
    manualRoundOff = null;
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
    if (c === 'expiry') {
      const parsed = parseExpiry(t.value);
      if (parsed) r.expiry = parsed;
      else if (!t.value.trim()) r.expiry = '';
      dirty = true;
      return;
    }
    if (c === 'batch') {
      const val = t.value.trim().toUpperCase();
      if (r.batch !== val) {
        r.batch = val;
        delete r.batch_id;
        dirty = true;
      }
      return;
    }
    (r as any)[c] = Number(t.value || 0);
    dirty = true;
    renderTotals();
  });
  tbody.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    const c = t.dataset.c;
    if (c === 'expiry') {
      const r = rows[Number(t.dataset.r)];
      if (r) {
        const parsed = parseExpiry(t.value);
        if (parsed) {
          r.expiry = parsed;
          t.value = expShort(parsed);
        } else if (t.value.trim()) {
          toast('Invalid expiry! Enter as MM/YY or MMYY (e.g. 03/27 or 0327)', true);
          t.value = expShort(r.expiry || '');
        } else {
          r.expiry = '';
          t.value = '';
        }
        dirty = true;
      }
    }
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
    else if (t === 'CHG') billAdjustmentsWindow();
    else if (t === 'O/S' && party) { if (allowed('report.ledger', 'Ledger statement')) import('./reports.ts').then((m) => m.ledgerStatement(party!)).catch((e) => toast((e as Error).message, true)); }
    else if (t === 'VOU') { if (allowed('voucher.menu', 'Vouchers')) import('./vouchers.ts').then((m) => m.voucherMenu()); }
  });

  w.onKey = (e, k) => {
    const t = e.target as HTMLInputElement;
    const ri = Number(t.dataset?.r ?? -1);
    const c = t.dataset?.c;

    if (k === 'F8') { billAdjustmentsWindow('cd'); return true; }
    if (k === 'F9') { billAdjustmentsWindow('freight'); return true; }
    if (k === 'Ctrl+D' || k === 'Alt+D') { billAdjustmentsWindow('cd'); return true; }
    if (k === 'Ctrl+R') { billAdjustmentsWindow('round'); return true; }
    // End from the product grid too: "all items done → End → MODE OF PAYMENT".
    if (k === 'Ctrl+W' || (k === 'F10' && !(refEntry && t === pnoI)) || k === 'End') { finishBill(); return true; }

    // F2 or Insert: in purchase grid on a product row -> Create / Enter New Batch!
    if (k === 'F2' || k === 'Insert') {
      if (isPurchase(type) && ri >= 0 && rows[ri]?.item_id) {
        api<Item>(`/items/${rows[ri].item_id}`).then(async (it) => {
          if (!it) return;
          const nb = await promptNewBatch(it, rows[ri].batch || '', true);
          if (nb) {
            rows[ri].batch = nb.batch;
            rows[ri].expiry = nb.expiry;
            rows[ri].mrp = nb.mrp;
            rows[ri].rate = nb.rate;
            rows[ri].cost = nb.rate;
            delete rows[ri].batch_id;
            dirty = true;
            renderRows();
            focusCell(ri, 'qty');
          }
        });
        return true;
      }
      if (ri < 0 || !rows[ri]?.item_id) {
        saleEntry(type);
        return true;
      }
    }

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
      // MARG jewellery purchase: the supplier's bill no. (Party No) is required.
      if (k === 'Enter' && jewel && type === 'PURCHASE' && !pnoI.value.trim()) { toast('Party No: Blank Not Allowed', true); return true; }
      if (k === 'Enter') { if (pdtI && !pdtI.value) pdtI.value = dmy(today()); pdtI?.focus(); pdtI?.select(); return true; }
    }
    if (refEntry && t === pdtI && k === 'Enter') { if (isRet) returnDetailsStep(); else { renderRows(); focusCell(0, 'name'); } return true; }
    if (t === mrI && k === 'Enter') { pickMR().then((m) => { if (m) { mr = m; mrI.value = m.name; } focusCell(0, 'name'); }); return true; }

    // grid
    if (c) {
      const ci = GRID_COLS.findIndex((x) => x.key === c);
      if (c === 'name') {
        if (k === 'ArrowLeft') { noI.focus(); noI.select(); return true; }   // ← key to change Bill No.
        if (k === 'Enter' && !rows[ri].item_id) {
          if (rows.filter((r) => r.item_id).length) finishBill(); else productStep(ri, '');
          return true;
        }
        if (k === 'Enter' && rows[ri].item_id && jewel) {
          const r = rows[ri];
          api<Item>(`/items/${r.item_id}`).then(async (it) => {
            const jw = await jewelDetail(it, isPurchase(type) && type !== 'PURCHASE_RETURN', r.jw);
            if (jw) {
              r.jw = jw; r.qty = jw.sets; r.rate = jw.rate; r.mrp = jw.mrp; r.batch = jw.ref || '';
              if (ri === rows.length - 1) rows.push(blank());
              dirty = true; renderRows();
            }
            focusCell(jw ? Math.min(ri + 1, rows.length - 1) : ri, 'name');
          }).catch((err) => toast((err as Error).message, true));
          return true;
        }
        if (k === 'Enter' && rows[ri].item_id) {
          if (isPurchase(type)) {
            if (!rows[ri].batch) focusCell(ri, 'batch');
            else if (!rows[ri].expiry) focusCell(ri, 'expiry');
            else focusCell(ri, 'qty');
          } else {
            focusCell(ri, 'qty');
          }
          return true;
        }
        if (k.length === 1 && !e.ctrlKey && !e.altKey) { productStep(ri, k); return true; }
      }
      if (k === 'Enter' || k === 'Tab') {
        if (c === 'batch') {
          const val = t.value.trim().toUpperCase();
          if (rows[ri].batch !== val) {
            rows[ri].batch = val;
            delete rows[ri].batch_id;
            dirty = true;
          }
          if (!rows[ri].expiry) {
            focusCell(ri, 'expiry');
            return true;
          }
        }
        if (c === 'expiry') {
          const parsed = parseExpiry(t.value);
          if (parsed) {
            rows[ri].expiry = parsed;
            t.value = expShort(parsed);
          }
        }
        if (ci < GRID_COLS.length - 1) {
          let nextKey = GRID_COLS[ci + 1].key as string;
          let nextEl = tbody.querySelector(`input[data-r="${ri}"][data-c="${nextKey}"]`);
          if (!nextEl) {
            for (let j = ci + 1; j < GRID_COLS.length; j++) {
              if (tbody.querySelector(`input[data-r="${ri}"][data-c="${GRID_COLS[j].key}"]`)) {
                nextKey = GRID_COLS[j].key as string;
                break;
              }
            }
          }
          focusCell(ri, nextKey);
        } else {
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
    const hasItems = rows.some((r) => r.item_id);
    if (!dirty && !hasItems && !party) return true;
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
    cdPct = Number(b.cd_pct || 0);
    cdAmt = Number(b.cd_amt || 0);
    freight = Number(b.freight || 0);
    otherCharges = Number(b.other_charges || 0);
    manualRoundOff = b.round_off != null ? Number(b.round_off) : null;
    payments = (b.payments ?? []).map((p: any) => ({ ledger_id: p.ledger_id, ledger: p.ledger, amount: p.amount, remark: p.remark, detail: p.detail }));
    const parseJw = (v: unknown): JwLine | undefined => {
      if (!v) return undefined;
      try { return (typeof v === 'string' ? JSON.parse(v) : v) as JwLine; } catch { return undefined; }
    };
    rows = b.lines.map((l: any) => {
      const jw = parseJw(l.jw);
      return {
        item_id: l.item_id, name: String(l.item_name).toUpperCase(), pack: (l.pack ?? '').toUpperCase(), batch_id: l.batch_id,
        batch: l.batch, expiry: l.expiry, qty: l.qty, free: l.free, rate: l.rate, disc: l.disc_pct, gst: l.gst_rate, mrp: l.mrp, unit: l.unit,
        ...(jw ? { jw } : {}),
      };
    });
    rows.push(blank());
    if (jewel && b.party_id) {
      metalBal = await partyMetal(b.party_id).catch(() => ({ gold: 0, silver: 0 }));
    }
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
