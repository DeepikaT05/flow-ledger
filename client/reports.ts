import { api, openWin, GridList, money, drcr, esc, today, fmtDate, fyStart, h, formWin, reloadOnClose, toast, type Col } from './ui.ts';
import { pickLedger, itemRegister, type Ledger } from './masters.ts';
import { BILL_TITLE } from './billing.ts';
import { saleEntry as billEntry } from './sale.ts';
import { V_TITLE } from './vouchers.ts';
import { seeCost } from './session.ts';
import { downloadCsv, createExportButtons, addExportToMargBar } from './export.ts';
import { margBar, margPop } from './margui.ts';

const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);

/** Cost / profit cell: masked as **** for roles without the cost power (server sends null). */
const cm = (v: number | null | undefined) => (v == null || !seeCost() ? '****' : money(v));
const cmTotal = (n: number) => (seeCost() ? money(n) : '****');

const vtypeLabel = (t: string) => BILL_TITLE[t] ?? V_TITLE[t] ?? t;

/** Ask for a date range (Marg's F2 period box). */
async function askPeriod(from: string, to: string): Promise<{ from: string; to: string } | null> {
  return formWin('Select Period', [
    { name: 'from', label: 'From', type: 'date' },
    { name: 'to', label: 'To', type: 'date' },
  ], { from, to }, async () => ({}));
}

/** A read-only report window with a keyboard grid, period selection (F2) and print (F10). */
async function reportWin<T extends Record<string, any>>(opts: {
  title: string; cols: Col<T>[]; load: (p: { from: string; to: string }) => Promise<T[]>; search?: (r: T) => string;
  footer?: (rows: T[]) => string; period?: boolean; from?: string; to?: string; header?: (p: { from: string; to: string }) => string;
  onEnter?: (r: T) => void; extraKeys?: Record<string, (r: T | undefined) => void>; extraFoot?: string;
}) {
  const p = { from: opts.from ?? fyStart(), to: opts.to ?? today() };
  const w = openWin(opts.title, 'wide', (opts.period ? '<span><b>F2</b> Change Period</span>' : '') + (opts.onEnter ? '<span><b>Enter</b> Open</span>' : '') +
    (opts.extraFoot ?? '') + '<span><b>Alt+X</b> Excel</span><span><b>F10/Alt+P</b> PDF</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const head = h('div', { class: 'party-info', style: 'font-size:14px;margin-bottom:4px' });
  w.body.append(head);
  const g = new GridList<T>(w.body, opts.cols, opts.search, 'calc(100% - 64px)');
  if (!opts.search) g.wrap.style.height = 'calc(100% - 24px)';
  g.footerRow = opts.footer;

  let currentRows: T[] = [];
  const load = async () => {
    head.innerHTML = (opts.period ? `Period: <b>${fmtDate(p.from)}</b> to <b>${fmtDate(p.to)}</b> &nbsp; ` : '') + (opts.header?.(p) ?? '');
    const data = await opts.load(p);
    currentRows = data;
    g.setRows(data, true);
  };

  const exportExcel = () => {
    const headers = opts.cols.map((c) => c.title);
    const rows = currentRows.map((r) => opts.cols.map((c) => {
      const val = c.get(r);
      return val == null ? '' : String(val);
    }));
    const safeTitle = opts.title.replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(`${safeTitle}_${p.from}_${p.to}.csv`, headers, rows);
  };

  const titleEl = w.el.querySelector('.win-title');
  if (titleEl) {
    const btns = createExportButtons({
      onExcel: exportExcel,
      onPdf: () => window.print(),
    });
    const closeBtn = titleEl.querySelector('.win-close-btn');
    if (closeBtn) titleEl.insertBefore(btns, closeBtn);
    else titleEl.append(btns);
  }

  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    if (k === 'F2' && opts.period) { askPeriod(p.from, p.to).then((r) => { if (r) { p.from = r.from; p.to = r.to; load(); } }); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'F10' || k === 'Alt+P' || k === 'Ctrl+P') { window.print(); return true; }
    if (k === 'Enter' && opts.onEnter && g.current) { opts.onEnter(g.current); reloadOnClose(load); return true; }
    if (opts.extraKeys?.[k]) { opts.extraKeys[k](g.current); return true; }
    return false;
  };
  return { w, load };
}


// ------------------------------------------------------------------ ledger
/** All Ledgers (Alt+L) opens MARG's LEDGER ACCOUNTS; with a ledger, its LEDGER DISPLAY box. */
export async function ledgerStatement(l?: Ledger) {
  const m = await import('./ledgers.ts');
  return l ? m.ledgerDisplay(l) : m.allLedgers();
}

// ------------------------------------------------------------------ books
export function billBook(type: string) {
  const types = type.split(',');
  return reportWin<any>({
    title: `${types.map((t) => BILL_TITLE[t]).join(' + ')} Book`, period: true, search: (r) => `${r.no} ${r.party}`,
    cols: [
      { title: 'Date', get: (r) => fmtDate(r.date) }, { title: 'Bill No.', get: (r) => r.no }, { title: 'Party', get: (r) => r.party },
      { title: 'Gross', get: (r) => r.gross, money: true }, { title: 'Disc', get: (r) => r.discount, money: true },
      { title: 'Taxable', get: (r) => r.taxable, money: true }, { title: 'CGST', get: (r) => r.tax / 2, money: true },
      { title: 'SGST', get: (r) => r.tax / 2, money: true }, { title: 'Net', get: (r) => r.net, money: true },
    ],
    load: (p) => api(`/bills?type=${type}&from=${p.from}&to=${p.to}`),
    footer: (rows) => {
      const s = (k: string) => rows.reduce((a, r) => a + r[k], 0);
      return `<tr class="total"><td colspan="3">Total (${rows.length})</td><td class="n">${money(s('gross'))}</td><td class="n">${money(s('discount'))}</td><td class="n">${money(s('taxable'))}</td>
        <td class="n">${money(s('tax') / 2)}</td><td class="n">${money(s('tax') / 2)}</td><td class="n">${money(s('net'))}</td></tr>`;
    },
    onEnter: (r) => billEntry(r.type, r.id),
  });
}

export async function cashBankBook() {
  const l = await pickLedger('Cash & Bank Book - Select Account', 'Cash-in-hand,Bank Accounts');
  if (l) ledgerStatement(l);
}

// ------------------------------------------------------------------ final reports
const balCols: Col<Ledger>[] = [
  { title: 'Ledger', get: (r) => r.name }, { title: 'Group', get: (r) => r.group_name },
  { title: 'Debit', get: (r) => (r.balance > 0 ? money(r.balance) : ''), num: true },
  { title: 'Credit', get: (r) => (r.balance < 0 ? money(-r.balance) : ''), num: true },
];
export function trialBalance() {
  return reportWin<Ledger>({
    title: 'Trial Balance', cols: balCols, search: (r) => `${r.name} ${r.group_name}`,
    load: () => api('/reports/trial-balance'),
    footer: (rows) => {
      const dr = rows.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
      const cr = rows.filter((r) => r.balance < 0).reduce((s, r) => s - r.balance, 0);
      return `<tr class="total"><td colspan="2">Total ${Math.abs(dr - cr) > 0.01 ? `(Difference ${money(dr - cr)} = opening mismatch)` : ''}</td><td class="n">${money(dr)}</td><td class="n">${money(cr)}</td></tr>`;
    },
    onEnter: (r) => ledgerStatement(r),
  });
}

export async function profitLoss() {
  const [tb, sv] = await Promise.all([api<Ledger[]>('/reports/trial-balance'), api<{ opening: number; closing: number }>('/reports/stock-value')]);
  const opening = sv.opening, stock = sv.closing;
  const exp = tb.filter((r) => r.nature === 'EXPENSE');
  const inc = tb.filter((r) => r.nature === 'INCOME');
  const totExp = exp.reduce((s, r) => s + r.balance, 0) + opening;
  const totInc = inc.reduce((s, r) => s - r.balance, 0) + stock;
  const profit = totInc - totExp;
  const w = openWin('Profit & Loss A/c', 'wide', '<span><b>F10</b> Print</span><span><b>Esc</b> Close</span>');
  const side = (rows: [string, number][]) => rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${money(v)}</td></tr>`).join('');
  const left: [string, number][] = [['Opening Stock', opening], ...exp.map((r) => [r.name, r.balance] as [string, number])];
  const right: [string, number][] = [...inc.map((r) => [r.name, -r.balance] as [string, number]), ['Closing Stock', stock]];
  if (profit >= 0) left.push(['Net Profit', profit]); else right.push(['Net Loss', -profit]);
  const total = Math.max(totExp, totInc);
  w.body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <table class="grid"><tr><th>Expenses / Debit</th><th class="n">Amount</th></tr>${side(left)}<tr class="total"><td>Total</td><td class="n">${money(total)}</td></tr></table>
    <table class="grid"><tr><th>Income / Credit</th><th class="n">Amount</th></tr>${side(right)}<tr class="total"><td>Total</td><td class="n">${money(total)}</td></tr></table></div>`;
  w.onKey = (_e, k) => { if (k === 'F10') { window.print(); return true; } return false; };
}

export async function balanceSheet() {
  const [tb, sv] = await Promise.all([api<Ledger[]>('/reports/trial-balance'), api<{ opening: number; closing: number }>('/reports/stock-value')]);
  const opening = sv.opening, stock = sv.closing;
  const pl = tb.filter((r) => r.nature === 'INCOME' || r.nature === 'EXPENSE').reduce((s, r) => s - r.balance, 0) + stock - opening;
  const bs = tb.filter((r) => r.nature === 'ASSET' || r.nature === 'LIABILITY');
  const liab: [string, number][] = bs.filter((r) => r.balance < 0).map((r) => [r.name, -r.balance]);
  const asset: [string, number][] = bs.filter((r) => r.balance > 0).map((r) => [r.name, r.balance]);
  asset.push(['Closing Stock', stock]);
  // Opening stock is carried in as capital so the sheet balances without an explicit stock journal.
  liab.push(['Opening Stock (Capital)', opening]);
  if (pl >= 0) liab.push(['Profit & Loss A/c', pl]); else asset.push(['Profit & Loss A/c (Loss)', -pl]);
  const tl = liab.reduce((s, x) => s + x[1], 0), ta = asset.reduce((s, x) => s + x[1], 0);
  const w = openWin('Balance Sheet', 'wide', '<span><b>F10</b> Print</span><span><b>Esc</b> Close</span>');
  const side = (rows: [string, number][]) => rows.map(([n, v]) => `<tr><td>${esc(n)}</td><td class="n">${money(v)}</td></tr>`).join('');
  w.body.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
    <table class="grid"><tr><th>Liabilities</th><th class="n">Amount</th></tr>${side(liab)}<tr class="total"><td>Total</td><td class="n">${money(tl)}</td></tr></table>
    <table class="grid"><tr><th>Assets</th><th class="n">Amount</th></tr>${side(asset)}<tr class="total"><td>Total</td><td class="n">${money(ta)}</td></tr></table></div>
    ${Math.abs(tl - ta) > 0.01 ? `<p class="cr">Difference in opening balances: ${money(tl - ta)}</p>` : ''}`;
  w.onKey = (_e, k) => { if (k === 'F10') { window.print(); return true; } return false; };
}

// ------------------------------------------------------------------ outstanding / stock
export function outstanding(kind: string) {
  const payable = kind === 'payable';
  return reportWin<Ledger>({
    title: `Outstanding - ${payable ? 'Payable (Creditors)' : 'Receivable (Debtors)'}`, search: (r) => r.name,
    cols: [
      { title: 'Party', get: (r) => r.name }, { title: 'Station', get: (r) => r.city }, { title: 'Phone', get: (r) => r.phone },
      { title: 'Credit Limit', get: (r) => r.credit_limit, money: true }, { title: 'Balance', get: (r) => drcr(r.balance), num: true },
    ],
    load: () => api(`/reports/outstanding?kind=${kind}`),
    footer: (rows) => `<tr class="total"><td colspan="4">Total</td><td class="n">${drcr(rows.reduce((s, r) => s + r.balance, 0))}</td></tr>`,
    onEnter: (r) => ledgerStatement(r),
  });
}

const stockCols: Col<any>[] = [
  { title: 'Item', get: (r) => r.name }, { title: 'Company', get: (r) => r.company }, { title: 'Pack', get: (r) => r.pack },
  { title: 'Stock', get: (r) => r.stock, num: true }, { title: 'Min', get: (r) => r.min_stock, num: true },
  { title: 'P.Rate', get: (r) => cm(r.purchase_rate), num: true }, { title: 'Value', get: (r) => cm(r.purchase_rate == null ? null : r.stock * r.purchase_rate), num: true },
];
export function reorder() {
  return reportWin<any>({
    title: 'Re-Order / Shortage', search: (r) => r.name, load: () => api('/reports/reorder'),
    cols: [...stockCols.slice(0, 5), { title: 'Order Qty', get: (r) => Math.max(r.reorder_qty, r.min_stock - r.stock), num: true }],
    onEnter: (r) => itemRegister(r),
  });
}

// ------------------------------------------------------------------ daily
export function grossProfit() {
  const d = today();
  return reportWin<any>({
    title: 'Gross Profit (Bill-wise)', period: true, from: d, to: d, search: (r) => `${r.no} ${r.party}`,
    cols: [
      { title: 'Date', get: (r) => fmtDate(r.date) }, { title: 'Bill No.', get: (r) => r.no }, { title: 'Party', get: (r) => r.party },
      { title: 'Sale (Taxable)', get: (r) => r.sale, money: true }, { title: 'Cost', get: (r) => cm(r.cost), num: true },
      { title: 'Profit', get: (r) => cm(r.profit), num: true }, { title: '%', get: (r) => (r.profit == null || !seeCost() ? '****' : r.sale ? ((r.profit / r.sale) * 100).toFixed(2) : '0'), num: true },
    ],
    load: (p) => api(`/reports/gross-profit?from=${p.from}&to=${p.to}`),
    footer: (rows) => {
      const s = rows.reduce((a, r) => a + r.sale, 0), c = rows.reduce((a, r) => a + r.cost, 0);
      return `<tr class="total"><td colspan="3">Total</td><td class="n">${money(s)}</td><td class="n">${cmTotal(c)}</td><td class="n">${cmTotal(s - c)}</td><td class="n">${!seeCost() ? '****' : s ? (((s - c) / s) * 100).toFixed(2) : ''}</td></tr>`;
    },
  });
}

interface MisData {
  from: string;
  to: string;
  sales: { s: number; c: number };
  purchase: { s: number; c: number };
  saleReturn: { s: number; c: number };
  purchaseReturn: { s: number; c: number };
  receipt: { s: number; c: number };
  payment: { s: number; c: number };
  cash: number;
  bank: number;
  receivable: number;
  payable: number;
  profit?: {
    sales: number;
    cost: number;
    gp: number;
    margin: number;
  };
}

function askMisDate(curFrom = today(), curTo = today()): Promise<{ from: string; to: string; action: 'view' | 'print' | 'excel' } | null> {
  return new Promise((resolve) => {
    const p = margPop('DAILY ANALYSIS (MIS)', '<span><b>Enter</b>-Next</span><span><b>V/P/E</b>-Action</span><span><b>Esc</b>-Cancel</span>', '480px');
    const box = h('div', { class: 'mis-date-box' });
    box.innerHTML = `
      <div class="mis-pop-head">DAILY ANALYSIS (MIS) &mdash; PERIOD SELECTION</div>
      <div class="dates">
        <span>FROM</span><input data-f="from" value="${dmy(curFrom)}" autocomplete="off" spellcheck="false">
        <span>TO</span><input data-f="to" value="${dmy(curTo)}" autocomplete="off" spellcheck="false">
      </div>
      <div class="presets">
        <button type="button" class="btn-preset" data-p="today"><u>T</u>oday</button>
        <button type="button" class="btn-preset" data-p="month"><u>M</u>onth</button>
        <button type="button" class="btn-preset" data-p="year"><u>Y</u>ear</button>
      </div>
      <div class="btns">
        <button type="button" data-a="view" class="btn-primary"><u>V</u>iew</button>
        <button type="button" data-a="print"><u>P</u>rint</button>
        <button type="button" data-a="excel"><u>E</u>xcel</button>
        <button type="button" data-a="cancel"><u>C</u>ancel</button>
      </div>`;
    p.body.append(box);

    const fInp = box.querySelector('input[data-f="from"]') as HTMLInputElement;
    const tInp = box.querySelector('input[data-f="to"]') as HTMLInputElement;

    const setPreset = (preset: string) => {
      if (preset === 'today') {
        fInp.value = dmy(today());
        tInp.value = dmy(today());
      } else if (preset === 'month') {
        const ym = today().slice(0, 7);
        fInp.value = dmy(`${ym}-01`);
        tInp.value = dmy(today());
      } else if (preset === 'year') {
        fInp.value = dmy(fyStart());
        tInp.value = dmy(today());
      }
      fInp.focus();
      fInp.select();
    };

    box.querySelectorAll('.btn-preset').forEach((b) => {
      b.addEventListener('click', () => setPreset((b as HTMLElement).dataset.p || 'today'));
    });

    const submit = (act: 'view' | 'print' | 'excel' | 'cancel') => {
      if (act === 'cancel') { p.close(); resolve(null); return; }
      const f = isoOf(fInp.value), t = isoOf(tInp.value);
      if (!f || !t) { toast('Enter dates as DD-MM-YYYY', true); fInp.focus(); return; }
      if (f > t) { toast('FROM date cannot be after TO date', true); fInp.focus(); return; }
      p.close();
      resolve({ from: f, to: t, action: act });
    };

    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-a]');
      if (b) submit((b as HTMLElement).dataset.a as any);
    });

    fInp.focus();
    fInp.select();

    p.onKey = (_e, k) => {
      const active = document.activeElement;
      if (k === 'Enter') {
        if (active === fInp) { tInp.focus(); tInp.select(); return true; }
        if (active === tInp) { submit('view'); return true; }
        if (active instanceof HTMLButtonElement && active.dataset.a) {
          submit(active.dataset.a as any);
          return true;
        }
      }
      if (k === 'Tab') {
        if (active === fInp) { tInp.focus(); tInp.select(); return true; }
      }
      if (k === 'T' || k === 't') { if (active instanceof HTMLInputElement) return false; setPreset('today'); return true; }
      if (k === 'M' || k === 'm') { if (active instanceof HTMLInputElement) return false; setPreset('month'); return true; }
      if (k === 'Y' || k === 'y') { if (active instanceof HTMLInputElement) return false; setPreset('year'); return true; }
      if (k === 'V' || k === 'v') { submit('view'); return true; }
      if (k === 'P' || k === 'p') { submit('print'); return true; }
      if (k === 'E' || k === 'e') { submit('excel'); return true; }
      if (k === 'Escape' || k === 'C' || k === 'c') { submit('cancel'); return true; }
      return false;
    };
  });
}

function exportMisExcel(m: MisData, from: string, to: string) {
  const headers = ['Category', 'Particulars', 'Count / Bills', 'Amount (Rs.)', 'Remarks'];
  const netSales = (m.sales?.s || 0) - (m.saleReturn?.s || 0);
  const netPur = (m.purchase?.s || 0) - (m.purchaseReturn?.s || 0);
  const netCashFlow = (m.receipt?.s || 0) - (m.payment?.s || 0);
  const totalLiquidity = (m.cash || 0) + (m.bank || 0);
  const netOutstandings = (m.receivable || 0) - (m.payable || 0);

  const rows = [
    ['TURNOVER', 'Gross Sales', String(m.sales?.c || 0), f2(m.sales?.s || 0), 'Sale + Counter Sale'],
    ['TURNOVER', 'Sale Return', String(m.saleReturn?.c || 0), f2(m.saleReturn?.s || 0), 'Customer Credit Notes'],
    ['TURNOVER', 'NET SALES', '', f2(netSales), 'Gross Sales - Returns'],
    ['TURNOVER', 'Gross Purchases', String(m.purchase?.c || 0), f2(m.purchase?.s || 0), 'Purchase Invoices'],
    ['TURNOVER', 'Purchase Return', String(m.purchaseReturn?.c || 0), f2(m.purchaseReturn?.s || 0), 'Debit Notes'],
    ['TURNOVER', 'NET PURCHASES', '', f2(netPur), 'Purchases - Returns'],
    ['LIQUIDITY', 'Cash in Hand', '', f2(m.cash || 0), drcr(m.cash || 0)],
    ['LIQUIDITY', 'Bank Accounts', '', f2(m.bank || 0), drcr(m.bank || 0)],
    ['LIQUIDITY', 'TOTAL CASH & BANK', '', f2(totalLiquidity), 'Total Liquid Funds'],
    ['VOUCHERS', 'Receipts (Collection)', String(m.receipt?.c || 0), f2(m.receipt?.s || 0), 'Cash/Bank Receipts'],
    ['VOUCHERS', 'Payments (Disbursed)', String(m.payment?.c || 0), f2(m.payment?.s || 0), 'Cash/Bank Payments'],
    ['VOUCHERS', 'NET CASH FLOW', '', f2(netCashFlow), 'Receipts - Payments'],
    ['OUTSTANDINGS', 'Sundry Debtors (Receivable)', '', f2(m.receivable || 0), 'Customer Outstandings'],
    ['OUTSTANDINGS', 'Sundry Creditors (Payable)', '', f2(m.payable || 0), 'Supplier Outstandings'],
    ['OUTSTANDINGS', 'NET WORKING GAP', '', f2(netOutstandings), 'Receivable - Payable'],
  ];

  if (m.profit) {
    rows.push(
      ['PROFITABILITY', 'Billed Taxable Sales', '', f2(m.profit.sales), 'Taxable Turnover'],
      ['PROFITABILITY', 'Cost of Goods Sold (COGS)', '', f2(m.profit.cost), 'Purchase Valuation'],
      ['PROFITABILITY', 'GROSS PROFIT (GP)', '', f2(m.profit.gp), `Margin: ${m.profit.margin}%`],
    );
  }

  downloadCsv(`Daily_Analysis_MIS_${from}_to_${to}.csv`, headers, rows);
}

function printMis(m: MisData, from: string, to: string) {
  const netSales = (m.sales?.s || 0) - (m.saleReturn?.s || 0);
  const netPur = (m.purchase?.s || 0) - (m.purchaseReturn?.s || 0);
  const netCashFlow = (m.receipt?.s || 0) - (m.payment?.s || 0);
  const totalLiquidity = (m.cash || 0) + (m.bank || 0);
  const netOutstandings = (m.receivable || 0) - (m.payable || 0);

  const html = `
    <div style="font-family:'Courier New', monospace; font-size:14px; padding:10px;">
      <h2 style="text-align:center; margin-bottom:4px;">DAILY ANALYSIS (MIS) REPORT</h2>
      <h4 style="text-align:center; margin-top:0; color:#555;">Period : ${dmy(from)} to ${dmy(to)}</h4>
      
      <table class="grid" style="width:100%; margin-bottom:16px;">
        <tr style="background:#003366; color:#fff;"><th colspan="4" style="text-align:left;">1. OPERATIONAL TURNOVER</th></tr>
        <tr><td>Gross Sales (${m.sales?.c || 0} Bills)</td><td class="n">${money(m.sales?.s || 0)}</td><td>Gross Purchases (${m.purchase?.c || 0} Bills)</td><td class="n">${money(m.purchase?.s || 0)}</td></tr>
        <tr><td>Sale Return (${m.saleReturn?.c || 0})</td><td class="n">${money(m.saleReturn?.s || 0)}</td><td>Purchase Return (${m.purchaseReturn?.c || 0})</td><td class="n">${money(m.purchaseReturn?.s || 0)}</td></tr>
        <tr class="total"><td><b>NET SALES</b></td><td class="n"><b>${money(netSales)}</b></td><td><b>NET PURCHASES</b></td><td class="n"><b>${money(netPur)}</b></td></tr>
      </table>

      <table class="grid" style="width:100%; margin-bottom:16px;">
        <tr style="background:#003366; color:#fff;"><th colspan="4" style="text-align:left;">2. CASH FLOW & BALANCES</th></tr>
        <tr><td>Cash in Hand</td><td class="n">${drcr(m.cash || 0)}</td><td>Customer Receipts (${m.receipt?.c || 0})</td><td class="n">${money(m.receipt?.s || 0)}</td></tr>
        <tr><td>Bank Accounts</td><td class="n">${drcr(m.bank || 0)}</td><td>Supplier Payments (${m.payment?.c || 0})</td><td class="n">${money(m.payment?.s || 0)}</td></tr>
        <tr class="total"><td><b>TOTAL LIQUID FUNDS</b></td><td class="n"><b>${drcr(totalLiquidity)}</b></td><td><b>NET CASH FLOW</b></td><td class="n"><b>${money(netCashFlow)}</b></td></tr>
      </table>

      <table class="grid" style="width:100%; margin-bottom:16px;">
        <tr style="background:#003366; color:#fff;"><th colspan="4" style="text-align:left;">3. OUTSTANDINGS & PROFITABILITY</th></tr>
        <tr><td>Sundry Debtors (Receivable)</td><td class="n">${money(m.receivable || 0)}</td><td>Billed Taxable Sales</td><td class="n">${money(m.profit?.sales || 0)}</td></tr>
        <tr><td>Sundry Creditors (Payable)</td><td class="n">${money(m.payable || 0)}</td><td>Cost of Goods Sold (COGS)</td><td class="n">${money(m.profit?.cost || 0)}</td></tr>
        <tr class="total"><td><b>NET RECEIVABLE GAP</b></td><td class="n"><b>${money(netOutstandings)}</b></td><td><b>GROSS PROFIT (GP)</b></td><td class="n"><b>${money(m.profit?.gp || 0)} (${m.profit?.margin || 0}%)</b></td></tr>
      </table>
    </div>`;

  import('./billing.ts').then((mod) => mod.printHtml(html, 1));
}

async function showMisScreen(from: string, to: string) {
  let curFrom = from;
  let curTo = to;
  let m: MisData = await api<MisData>(`/reports/mis?from=${curFrom}&to=${curTo}`);

  const w = openWin('DAILY ANALYSIS (MIS)', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Date</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'mis-screen' });

  const bar = margBar(`DAILY ANALYSIS (MIS) [ ${dmy(curFrom)} - ${dmy(curTo)} ]`);
  const btnDate = h('button', { type: 'button', class: 'btn-filter', title: 'Change Date [F2]' }, `📅 Date: ${dmy(curFrom)} to ${dmy(curTo)}`);
  btnDate.onclick = async () => {
    const res = await askMisDate(curFrom, curTo);
    if (res && res.action === 'view') {
      curFrom = res.from;
      curTo = res.to;
      await reload();
    } else if (res && res.action === 'excel') {
      exportMisExcel(m, res.from, res.to);
    } else if (res && res.action === 'print') {
      printMis(m, res.from, res.to);
    }
  };
  bar.querySelector('.marg-bar-right')?.prepend(btnDate);
  addExportToMargBar(bar, {
    onExcel: () => exportMisExcel(m, curFrom, curTo),
    onPdf: () => printMis(m, curFrom, curTo),
  });

  screen.append(bar);
  const container = h('div', { class: 'mis-container' });
  screen.append(container);
  w.body.append(screen);

  async function reload() {
    m = await api<MisData>(`/reports/mis?from=${curFrom}&to=${curTo}`);
    const titleEl = bar.querySelector('.marg-bar-title');
    if (titleEl) titleEl.textContent = `DAILY ANALYSIS (MIS) [ ${dmy(curFrom)} - ${dmy(curTo)} ]`;
    btnDate.textContent = `📅 Date: ${dmy(curFrom)} to ${dmy(curTo)}`;
    draw();
  }

  function draw() {
    const netSales = (m.sales?.s || 0) - (m.saleReturn?.s || 0);
    const netPur = (m.purchase?.s || 0) - (m.purchaseReturn?.s || 0);
    const netCashFlow = (m.receipt?.s || 0) - (m.payment?.s || 0);
    const totalLiquidity = (m.cash || 0) + (m.bank || 0);
    const netOutstandings = (m.receivable || 0) - (m.payable || 0);

    container.innerHTML = `
      <div class="mis-card">
        <div class="mis-card-head"><span>1. SALES & TURNOVER</span><span>Bills / Amount</span></div>
        <div class="mis-card-body">
          <div class="mis-row"><span>Gross Sales <span class="sub-text">(${m.sales?.c || 0} Bills)</span></span><b>${money(m.sales?.s || 0)}</b></div>
          <div class="mis-row"><span>Sale Return <span class="sub-text">(${m.saleReturn?.c || 0} Notes)</span></span><b>${money(m.saleReturn?.s || 0)}</b></div>
          <div class="mis-row highlight"><span>NET SALES TURNOVER</span><b>${money(netSales)}</b></div>
        </div>
      </div>

      <div class="mis-card">
        <div class="mis-card-head"><span>2. PURCHASES & INBOUND</span><span>Bills / Amount</span></div>
        <div class="mis-card-body">
          <div class="mis-row"><span>Gross Purchases <span class="sub-text">(${m.purchase?.c || 0} Invoices)</span></span><b>${money(m.purchase?.s || 0)}</b></div>
          <div class="mis-row"><span>Purchase Return <span class="sub-text">(${m.purchaseReturn?.c || 0} Notes)</span></span><b>${money(m.purchaseReturn?.s || 0)}</b></div>
          <div class="mis-row highlight"><span>NET PURCHASES</span><b>${money(netPur)}</b></div>
        </div>
      </div>

      <div class="mis-card">
        <div class="mis-card-head"><span>3. CASH & BANK LIQUIDITY</span><span>As On Date</span></div>
        <div class="mis-card-body">
          <div class="mis-row ${(m.cash || 0) >= 0 ? 'dr' : 'cr'}"><span>Cash in Hand</span><b>${drcr(m.cash || 0)}</b></div>
          <div class="mis-row ${(m.bank || 0) >= 0 ? 'dr' : 'cr'}"><span>Bank Accounts Balance</span><b>${drcr(m.bank || 0)}</b></div>
          <div class="mis-row highlight"><span>TOTAL CASH & BANK</span><b>${drcr(totalLiquidity)}</b></div>
        </div>
      </div>

      <div class="mis-card">
        <div class="mis-card-head"><span>4. VOUCHERS / CASH FLOW</span><span>Period Flow</span></div>
        <div class="mis-card-body">
          <div class="mis-row dr"><span>Customer Receipts <span class="sub-text">(${m.receipt?.c || 0} Vouchers)</span></span><b>${money(m.receipt?.s || 0)}</b></div>
          <div class="mis-row cr"><span>Payments Made <span class="sub-text">(${m.payment?.c || 0} Vouchers)</span></span><b>${money(m.payment?.s || 0)}</b></div>
          <div class="mis-row highlight"><span>NET CASH MOVEMENT</span><b>${money(netCashFlow)}</b></div>
        </div>
      </div>

      <div class="mis-card">
        <div class="mis-card-head"><span>5. OUTSTANDINGS</span><span>Receivable / Payable</span></div>
        <div class="mis-card-body">
          <div class="mis-row dr"><span>Sundry Debtors (Receivable)</span><b>${money(m.receivable || 0)}</b></div>
          <div class="mis-row cr"><span>Sundry Creditors (Payable)</span><b>${money(m.payable || 0)}</b></div>
          <div class="mis-row highlight"><span>NET RECEIVABLE GAP</span><b>${money(netOutstandings)}</b></div>
        </div>
      </div>

      <div class="mis-card">
        <div class="mis-card-head"><span>6. PROFITABILITY ESTIMATE</span><span>Gross Margin</span></div>
        <div class="mis-card-body">
          <div class="mis-row"><span>Billed Sales Taxable</span><b>${money(m.profit?.sales || 0)}</b></div>
          <div class="mis-row"><span>Cost of Goods Sold (COGS)</span><b>${money(m.profit?.cost || 0)}</b></div>
          <div class="mis-row highlight"><span>GROSS PROFIT (GP)</span><b>${money(m.profit?.gp || 0)} <span class="sub-text">(${m.profit?.margin || 0}%)</span></b></div>
        </div>
      </div>
    `;
  }

  draw();

  w.onKey = (_e, k) => {
    if (k === 'F2') {
      askMisDate(curFrom, curTo).then((res) => {
        if (res && res.action === 'view') {
          curFrom = res.from;
          curTo = res.to;
          reload();
        } else if (res && res.action === 'excel') {
          exportMisExcel(m, res.from, res.to);
        } else if (res && res.action === 'print') {
          printMis(m, res.from, res.to);
        }
      });
      return true;
    }
    if (k === 'Alt+X') { exportMisExcel(m, curFrom, curTo); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { printMis(m, curFrom, curTo); return true; }
    if (k === 'Escape') { w.close(); return true; }
    return false;
  };
}

export async function mis() {
  const chosen = await askMisDate(today(), today());
  if (!chosen) return;
  if (chosen.action === 'excel') {
    const m = await api<MisData>(`/reports/mis?from=${chosen.from}&to=${chosen.to}`);
    exportMisExcel(m, chosen.from, chosen.to);
    return;
  }
  if (chosen.action === 'print') {
    const m = await api<MisData>(`/reports/mis?from=${chosen.from}&to=${chosen.to}`);
    printMis(m, chosen.from, chosen.to);
    return;
  }
  return showMisScreen(chosen.from, chosen.to);
}

export function partyTransactions() {
  return pickLedger('Party Transaction - Select Party', 'Sundry Debtors,Sundry Creditors').then((l) => {
    if (!l) return;
    return reportWin<any>({
      title: `Party Transactions : ${l.name}`, period: true, search: (r) => r.no,
      cols: [
        { title: 'Date', get: (r) => fmtDate(r.date) }, { title: 'Type', get: (r) => BILL_TITLE[r.type] }, { title: 'No.', get: (r) => r.no },
        { title: 'Taxable', get: (r) => r.taxable, money: true }, { title: 'Net', get: (r) => r.net, money: true },
      ],
      load: (p) => api(`/bills?party=${l.id}&from=${p.from}&to=${p.to}`),
      onEnter: (r) => billEntry(r.type, r.id),
    });
  });
}

// ------------------------------------------------------------------ stocks (batch / expiry)
interface BatchRow { item_name: string; pack: string; batch: string; expiry: string; stock: number; mrp: number; rate: number; purchase_rate: number; supplier: string }
const expMY = (e: string) => (e ? `${e.slice(5, 7)}/${e.slice(0, 4)}` : '');
const batchCols: Col<BatchRow>[] = [
  { title: 'Item', get: (r) => r.item_name }, { title: 'Pack', get: (r) => r.pack }, { title: 'Batch', get: (r) => r.batch },
  { title: 'Expiry', get: (r) => expMY(r.expiry) }, { title: 'Stock', get: (r) => r.stock, num: true },
  { title: 'MRP', get: (r) => r.mrp, money: true }, { title: 'Rate', get: (r) => r.rate, money: true },
  { title: 'Value', get: (r) => cm(r.purchase_rate == null ? null : r.stock * r.purchase_rate), num: true }, { title: 'Supplier', get: (r) => r.supplier },
];
const valueFooter = (span: number) => (rows: BatchRow[]) =>
  `<tr class="total"><td colspan="${span}">Total (${rows.length} batches)</td><td class="n">${cmTotal(rows.reduce((s, r) => s + r.stock * (r.purchase_rate ?? 0), 0))}</td><td></td></tr>`;

export function batchStock() {
  return reportWin<BatchRow>({
    title: 'Batch wise Stock', cols: batchCols, search: (r) => `${r.item_name} ${r.batch}`,
    load: () => api('/reports/batch-stock'), footer: valueFooter(7),
  });
}

export function expiryStock() {
  const days = 90;
  const limit = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);
  return reportWin<BatchRow>({
    title: `Expiry Stock (expired or expiring within ${days} days)`, cols: batchCols, search: (r) => `${r.item_name} ${r.batch}`,
    load: async () => (await api<BatchRow[]>('/reports/batch-stock')).filter((b) => b.stock > 0 && b.expiry && b.expiry <= limit)
      .sort((a, b) => a.expiry.localeCompare(b.expiry)),
    footer: valueFooter(7),
  });
}

// ------------------------------------------------------------------ daily working
export function modeOfPayment() {
  const d = today();
  return reportWin<{ mode: string; bills: number; amount: number }>({
    title: 'Mode of Payment Report', period: true, from: d, to: d,
    cols: [{ title: 'Mode of Payment', get: (r) => r.mode }, { title: 'Bills', get: (r) => r.bills, num: true }, { title: 'Amount', get: (r) => r.amount, money: true }],
    load: (p) => api(`/reports/mode-of-payment?from=${p.from}&to=${p.to}`),
    footer: (rows) => `<tr class="total"><td>Total</td><td></td><td class="n">${money(rows.reduce((s, r) => s + r.amount, 0))}</td></tr>`,
  });
}

// ------------------------------------------------------------------ final reports / analysis
export function groupSummary() {
  return reportWin<{ group_name: string; nature: string; debit: number; credit: number; count: number }>({
    title: 'Group Summary',
    cols: [
      { title: 'Group', get: (r) => r.group_name }, { title: 'Nature', get: (r) => r.nature }, { title: 'Ledgers', get: (r) => r.count, num: true },
      { title: 'Debit', get: (r) => (r.debit ? money(r.debit) : ''), num: true }, { title: 'Credit', get: (r) => (r.credit ? money(r.credit) : ''), num: true },
    ],
    load: async () => {
      const by = new Map<string, { group_name: string; nature: string; debit: number; credit: number; count: number }>();
      for (const l of await api<Ledger[]>('/reports/trial-balance')) {
        const g = by.get(l.group_name) ?? { group_name: l.group_name, nature: l.nature, debit: 0, credit: 0, count: 0 };
        if (l.balance > 0) g.debit += l.balance; else g.credit -= l.balance;
        g.count++;
        by.set(l.group_name, g);
      }
      return [...by.values()].sort((a, b) => a.group_name.localeCompare(b.group_name));
    },
    footer: (rows) => `<tr class="total"><td colspan="3">Total</td><td class="n">${money(rows.reduce((s, r) => s + r.debit, 0))}</td><td class="n">${money(rows.reduce((s, r) => s + r.credit, 0))}</td></tr>`,
    onEnter: (r) => { import('./masters.ts').then((m) => m.ledgerList(r.group_name)); },
  });
}

export function itemWiseSale() {
  return reportWin<{ name: string; pack: string; company: string; qty: number; taxable: number; tax: number; cost: number }>({
    title: 'Item Wise Sale', period: true, search: (r) => `${r.name} ${r.company}`,
    cols: [
      { title: 'Item', get: (r) => r.name }, { title: 'Pack', get: (r) => r.pack }, { title: 'Company', get: (r) => r.company },
      { title: 'Qty', get: (r) => r.qty, num: true }, { title: 'Sale Value', get: (r) => r.taxable, money: true },
      { title: 'GST', get: (r) => r.tax, money: true }, { title: 'Profit', get: (r) => cm(r.cost == null ? null : r.taxable - r.cost), num: true },
    ],
    load: (p) => api(`/reports/item-sale?from=${p.from}&to=${p.to}`),
    footer: (rows) => `<tr class="total"><td colspan="3">Total</td><td class="n">${rows.reduce((s, r) => s + r.qty, 0)}</td>
      <td class="n">${money(rows.reduce((s, r) => s + r.taxable, 0))}</td><td class="n">${money(rows.reduce((s, r) => s + r.tax, 0))}</td>
      <td class="n">${cmTotal(rows.reduce((s, r) => s + r.taxable - (r.cost ?? 0), 0))}</td></tr>`,
  });
}

// ------------------------------------------------------------------ summaries (Party / Company / M.R. / Day / Month wise)
interface SumRow { name: string; month: string; bills: number; returns: number; qty: number; taxable: number; tax: number; amount: number; cost: number | null }
const SUM_BY: Record<string, string> = { party: 'Party', company: 'Company', item: 'Item', mr: 'M.R.', hsn: 'HSN/SAC', gst: 'GST %', day: 'Date', month: 'Month' };
const monthName = (m: string) => `${new Date(`${m}-01`).toLocaleString('en', { month: 'short' })}-${m.slice(2, 4)}`;
const monthsIn = (from: string, to: string) => {
  const out: string[] = [];
  for (let d = new Date(`${from.slice(0, 7)}-01`); d.toISOString().slice(0, 7) <= to.slice(0, 7); d.setUTCMonth(d.getUTCMonth() + 1)) out.push(d.toISOString().slice(0, 7));
  return out;
};

/**
 * spec = SIDE/by[/month]: SIDE is SALE, PURCHASE or GP (sale with cost & profit), `by` one
 * of SUM_BY. With /month the months of the period become columns (Marg's "…/Month Wise").
 */
export function summary(spec: string) {
  const [side, by, pivot] = spec.split('/');
  if (by === 'item') {
    return productSummary(side === 'PURCHASE' ? 'PURCHASE' : 'SALE');
  }
  const gp = side === 'GP';
  const what = gp ? 'Gross Profit' : side === 'PURCHASE' ? 'Purchase' : 'Sale';
  const title = `${SUM_BY[by]} Wise ${what} ${pivot ? '/ Month Wise' : 'Summary'}`;
  const nameOf = (r: SumRow) => (by === 'day' ? fmtDate(r.name) : by === 'month' ? monthName(r.name) : r.name);
  const val = (r: SumRow) => (gp ? (r.cost == null ? null : r.taxable - r.cost) : r.amount);
  const load = (p: { from: string; to: string }) => api<SumRow[]>(`/reports/summary?side=${gp ? 'SALE' : side}&by=${by}&from=${p.from}&to=${p.to}${pivot ? '&pivot=month' : ''}`);
  const from = by === 'day' ? `${today().slice(0, 8)}01` : undefined;

  if (pivot) {
    type PRow = { name: string; m: Record<string, number | null>; total: number | null };
    const cols: Col<PRow>[] = [];
    let months: string[] = [];
    const cell = (v: number | null | undefined) => (gp ? cm(v ?? 0) : money(v ?? 0));
    return reportWin<PRow>({
      title, period: true, cols, search: (r) => r.name, from,
      load: async (p) => {
        months = monthsIn(p.from, p.to);
        cols.splice(0, cols.length, { title: SUM_BY[by], get: (r) => r.name },
          ...months.map((m) => ({ title: monthName(m), get: (r: PRow) => cell(r.m[m]), num: true })), { title: 'Total', get: (r) => cell(r.total), num: true });
        const by2 = new Map<string, PRow>();
        for (const r of await load(p)) {
          const row = by2.get(r.name) ?? { name: nameOf(r), m: {}, total: 0 };
          const v = val(r);
          row.m[r.month] = v == null ? null : (row.m[r.month] ?? 0)! + v;
          row.total = v == null || row.total == null ? null : row.total + v;
          by2.set(r.name, row);
        }
        return [...by2.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0));
      },
      footer: (rows) => `<tr class="total"><td>Total (${rows.length})</td>${months.map((m) => `<td class="n">${cell(rows.reduce((s, r) => s + (r.m[m] ?? 0), 0))}</td>`).join('')}
        <td class="n">${cell(rows.reduce((s, r) => s + (r.total ?? 0), 0))}</td></tr>`,
    });
  }

  const cols: Col<SumRow>[] = gp
    ? [{ title: SUM_BY[by], get: nameOf }, { title: 'Qty', get: (r) => r.qty, num: true }, { title: 'Sale (Taxable)', get: (r) => r.taxable, money: true },
      { title: 'Cost', get: (r) => cm(r.cost), num: true }, { title: 'Profit', get: (r) => cm(r.cost == null ? null : r.taxable - r.cost), num: true },
      { title: '%', get: (r) => (r.cost == null || !seeCost() ? '****' : r.taxable ? (((r.taxable - r.cost) / r.taxable) * 100).toFixed(2) : '0'), num: true }]
    : [{ title: SUM_BY[by], get: nameOf }, { title: 'Bills', get: (r) => r.bills, num: true }, { title: 'Returns', get: (r) => r.returns, num: true },
      { title: 'Qty', get: (r) => r.qty, num: true }, { title: 'Taxable', get: (r) => r.taxable, money: true },
      { title: 'GST', get: (r) => r.tax, money: true }, { title: 'Amount', get: (r) => r.amount, money: true }];
  const s = (rows: SumRow[], k: 'qty' | 'taxable' | 'tax' | 'amount' | 'bills' | 'returns') => rows.reduce((a, r) => a + r[k], 0);
  return reportWin<SumRow>({
    title, period: true, cols, search: (r) => nameOf(r), load, from,
    footer: (rows) => {
      if (gp) {
        const sale = s(rows, 'taxable'), cost = rows.reduce((a, r) => a + (r.cost ?? 0), 0);
        return `<tr class="total"><td>Total (${rows.length})</td><td class="n">${s(rows, 'qty')}</td><td class="n">${money(sale)}</td><td class="n">${cmTotal(cost)}</td>
          <td class="n">${cmTotal(sale - cost)}</td><td class="n">${!seeCost() ? '****' : sale ? (((sale - cost) / sale) * 100).toFixed(2) : ''}</td></tr>`;
      }
      return `<tr class="total"><td>Total (${rows.length})</td><td class="n">${s(rows, 'bills')}</td><td class="n">${s(rows, 'returns')}</td><td class="n">${s(rows, 'qty')}</td>
        <td class="n">${money(s(rows, 'taxable'))}</td><td class="n">${money(s(rows, 'tax'))}</td><td class="n">${money(s(rows, 'amount'))}</td></tr>`;
    },
  });
}

/** Outstanding Ageing: each debtor's unpaid credit bills by age (0-30, 31-60, 61-90, 91-180, 180+ days). */
export function ageing() {
  type ARow = { id: number; name: string; city: string; bills: number; s0: number; s1: number; s2: number; s3: number; s4: number; total: number };
  const slabs: [keyof ARow, string][] = [['s0', '0-30 Days'], ['s1', '31-60'], ['s2', '61-90'], ['s3', '91-180'], ['s4', 'Above 180']];
  return reportWin<ARow>({
    title: 'Outstanding Ageing (Debtors)', search: (r) => r.name,
    cols: [{ title: 'Party', get: (r) => r.name }, { title: 'Station', get: (r) => r.city }, { title: 'Bills', get: (r) => r.bills, num: true },
      ...slabs.map(([k, t]) => ({ title: t, get: (r: ARow) => r[k], money: true })), { title: 'Total', get: (r) => r.total, money: true }],
    load: () => api('/reports/ageing'),
    footer: (rows) => `<tr class="total"><td colspan="3">Total (${rows.length})</td>${[...slabs.map(([k]) => k), 'total' as const]
      .map((k) => `<td class="n">${money(rows.reduce((s, r) => s + Number(r[k]), 0))}</td>`).join('')}</tr>`,
    onEnter: (r) => { api<Ledger>(`/ledgers/${r.id}`).then((l) => ledgerStatement(l)); },
  });
}

/** Negative Stock Checking: items whose book stock has gone below zero. */
export function negativeStock() {
  return reportWin<any>({
    title: 'Negative Stock', search: (r) => `${r.name} ${r.company}`, cols: stockCols.slice(0, 4),
    load: async () => (await api<any[]>('/reports/stock')).filter((r) => r.stock < 0),
    onEnter: (r) => itemRegister(r),
  });
}

export function gstr3b() {
  type Line = { head: string; taxable: number; cgst: number; sgst: number; total: number };
  let payable = 0;
  return reportWin<Line>({
    title: 'GSTR-3B — Monthly Tax Summary', period: true, from: `${today().slice(0, 8)}01`, to: today(),
    cols: [
      { title: 'Particulars', get: (r) => r.head }, { title: 'Taxable Value', get: (r) => r.taxable, money: true },
      { title: 'CGST', get: (r) => r.cgst, money: true }, { title: 'SGST', get: (r) => r.sgst, money: true },
      { title: 'Total Tax', get: (r) => r.total, money: true },
    ],
    load: async (p) => {
      const g = await api(`/reports/gstr3b?from=${p.from}&to=${p.to}`);
      payable = g.payable;
      const line = (head: string, x: { taxable: number; tax: number }): Line => ({ head, taxable: x.taxable, cgst: x.tax / 2, sgst: x.tax / 2, total: x.tax });
      return [line(`3.1 Outward taxable supplies (${g.outward.bills} bills, ${g.outward.returns} returns)`, g.outward),
        line(`4 Eligible ITC — inward supplies (${g.inward.bills} bills, ${g.inward.returns} returns)`, g.inward)];
    },
    footer: () => `<tr class="total"><td colspan="4">${payable >= 0 ? 'Net GST Payable in cash' : 'Excess ITC carried forward'}</td><td class="n">${money(Math.abs(payable))}</td></tr>`,
  });
}

/**
 * Product Summary with Monthly, Weekly, Daily, and Consolidated views.
 */
export async function productSummary(side: 'SALE' | 'PURCHASE' = 'SALE') {
  let mode: 'month' | 'week' | 'day' | 'summary' = 'month';
  let from = fyStart();
  let to = today();
  let company: any = {};
  try { company = await api('/company'); } catch {}

  const what = side === 'PURCHASE' ? 'PURCHASE' : 'SALE';
  const w = openWin(`PRODUCT ${what} SUMMARY`, 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>1/M</b>-Monthly</span><span><b>2/W</b>-Weekly</span><span><b>3/D</b>-Daily</span><span><b>4/S</b>-Summary</span><span><b>F2</b>-Period</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'ps-screen' });
  screen.innerHTML = `
    <div class="ps-top">
      <div class="ps-modes">
        <span class="ps-label">View Breakdown:</span>
        <button type="button" class="ps-btn-mode" data-m="month">📅 [1] Monthly</button>
        <button type="button" class="ps-btn-mode" data-m="week">📆 [2] Weekly</button>
        <button type="button" class="ps-btn-mode" data-m="day">🗓️ [3] Daily</button>
        <button type="button" class="ps-btn-mode" data-m="summary">📊 [4] Consolidated</button>
      </div>
      <div class="ps-info">
        <span class="ps-period">Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button></span>
        <div class="ps-find"><span>Find Product ? &gt;&gt;</span> [ <input autocomplete="off" spellcheck="false" placeholder="Type name to filter..."> ]</div>
      </div>
    </div>
    <div class="ps-grid-wrap"></div>
  `;

  const bar = margBar(`PRODUCT ${what} SUMMARY`);
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printCurrent() });
  screen.prepend(bar);
  w.body.append(screen);

  const gridWrap = screen.querySelector('.ps-grid-wrap') as HTMLElement;
  const findInput = screen.querySelector('.ps-find input') as HTMLInputElement;
  const modeBtns = screen.querySelectorAll<HTMLButtonElement>('.ps-btn-mode');
  const periodSpan = screen.querySelector('.ps-period') as HTMLElement;

  let loadedRows: any[] = [];

  const updateModeButtons = () => {
    modeBtns.forEach((b) => {
      b.classList.toggle('sel', b.dataset.m === mode);
    });
    const titleText = `PRODUCT ${what} SUMMARY (${mode.toUpperCase()} BREAKDOWN)`;
    const titleEl = bar.querySelector('span');
    if (titleEl) titleEl.textContent = titleText;
  };

  async function load() {
    gridWrap.innerHTML = '<div style="padding:24px;text-align:center;font-size:16px;">Loading product summary...</div>';
    const pivotParam = mode === 'summary' ? '' : `&pivot=${mode}`;
    loadedRows = await api<any[]>(`/reports/summary?side=${side}&by=item&from=${from}&to=${to}${pivotParam}`);
    render();
  }

  function render() {
    updateModeButtons();
    periodSpan.innerHTML = `Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button>`;
    screen.querySelector('.ps-btn-period')?.addEventListener('click', changePeriod);

    const q = findInput.value.trim().toLowerCase();

    if (mode === 'month' || mode === 'week') {
      const periods = Array.from(new Set(loadedRows.map((r) => r.period_key || r.month).filter(Boolean))).sort();
      const byItem = new Map<string, { qty: Record<string, number>; amt: Record<string, number>; totalQty: number; totalAmt: number }>();

      for (const r of loadedRows) {
        const item = r.name || '(Unknown Item)';
        const cur = byItem.get(item) ?? { qty: {}, amt: {}, totalQty: 0, totalAmt: 0 };
        const pKey = r.period_key || r.month;
        cur.qty[pKey] = (cur.qty[pKey] ?? 0) + Number(r.qty || 0);
        cur.amt[pKey] = (cur.amt[pKey] ?? 0) + Number(r.amount || 0);
        cur.totalQty += Number(r.qty || 0);
        cur.totalAmt += Number(r.amount || 0);
        byItem.set(item, cur);
      }

      let items = Array.from(byItem.keys()).sort();
      if (q) items = items.filter((it) => it.toLowerCase().includes(q));

      const pHeader = (p: string) => {
        if (mode === 'month') {
          return `${new Date(`${p}-01T00:00:00`).toLocaleString('en', { month: 'short' })}-${p.slice(2, 4)}`;
        }
        return p.replace('2026-', '').replace('2025-', '').replace('2024-', '');
      };

      const periodTotals = periods.map((p) => {
        let totQty = 0, totAmt = 0;
        for (const it of items) {
          const d = byItem.get(it);
          if (d) { totQty += d.qty[p] ?? 0; totAmt += d.amt[p] ?? 0; }
        }
        return { qty: totQty, amt: totAmt };
      });

      const grandQty = items.reduce((s, it) => s + (byItem.get(it)?.totalQty ?? 0), 0);
      const grandAmt = items.reduce((s, it) => s + (byItem.get(it)?.totalAmt ?? 0), 0);

      gridWrap.innerHTML = `
        <table class="grid ps-table">
          <thead>
            <tr>
              <th style="min-width:240px;text-align:left;">PRODUCT NAME</th>
              ${periods.map((p) => `<th class="n" style="min-width:110px;">${esc(pHeader(p))}<br><small style="font-weight:normal">Qty &nbsp; Amt</small></th>`).join('')}
              <th class="n" style="min-width:110px;">TOTAL QTY</th>
              <th class="n" style="min-width:110px;">TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${items.length ? items.map((it) => {
              const d = byItem.get(it)!;
              return `<tr>
                <td><b>${esc(it)}</b></td>
                ${periods.map((p) => {
                  const qVal = d.qty[p] ?? 0;
                  const aVal = d.amt[p] ?? 0;
                  return `<td class="n">${qVal ? `${qVal} <span style="color:#555">(${money(aVal)})</span>` : '-'}</td>`;
                }).join('')}
                <td class="n"><b>${d.totalQty}</b></td>
                <td class="n"><b>${money(d.totalAmt)}</b></td>
              </tr>`;
            }).join('') : '<tr><td colspan="100" style="text-align:center;padding:24px;">No product sales found matching filter</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total">
              <td><b>TOTAL (${items.length} Products)</b></td>
              ${periodTotals.map((t) => `<td class="n"><b>${t.qty} (${money(t.amt)})</b></td>`).join('')}
              <td class="n"><b>${grandQty}</b></td>
              <td class="n"><b>${money(grandAmt)}</b></td>
            </tr>
          </tfoot>
        </table>
      `;
    } else if (mode === 'day') {
      let rows = loadedRows;
      if (q) rows = rows.filter((r) => String(r.name).toLowerCase().includes(q));

      const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totTaxable = rows.reduce((s, r) => s + Number(r.taxable || 0), 0);
      const totTax = rows.reduce((s, r) => s + Number(r.tax || 0), 0);
      const totAmt = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

      gridWrap.innerHTML = `
        <table class="grid ps-table">
          <thead>
            <tr>
              <th style="width:110px;">DATE</th>
              <th style="width:100px;">DAY</th>
              <th style="text-align:left;">PRODUCT NAME</th>
              <th class="n" style="width:80px;">BILLS</th>
              <th class="n" style="width:90px;">QTY</th>
              <th class="n" style="width:110px;">TAXABLE</th>
              <th class="n" style="width:100px;">GST</th>
              <th class="n" style="width:120px;">TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((r) => {
              const dt = r.period_key || r.month || '';
              const dayName = dt ? new Date(`${dt}T00:00:00`).toLocaleString('en', { weekday: 'short' }) : '';
              return `<tr>
                <td>${fmtDate(dt)}</td>
                <td>${esc(dayName)}</td>
                <td><b>${esc(r.name)}</b></td>
                <td class="n">${r.bills ?? '-'}</td>
                <td class="n"><b>${r.qty}</b></td>
                <td class="n">${money(r.taxable)}</td>
                <td class="n">${money(r.tax)}</td>
                <td class="n"><b>${money(r.amount)}</b></td>
              </tr>`;
            }).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;">No product sales found matching filter</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total">
              <td colspan="3"><b>TOTAL (${rows.length} Entries)</b></td>
              <td class="n"></td>
              <td class="n"><b>${totQty}</b></td>
              <td class="n"><b>${money(totTaxable)}</b></td>
              <td class="n"><b>${money(totTax)}</b></td>
              <td class="n"><b>${money(totAmt)}</b></td>
            </tr>
          </tfoot>
        </table>
      `;
    } else {
      let rows = loadedRows;
      if (q) rows = rows.filter((r) => String(r.name).toLowerCase().includes(q));

      const totBills = rows.reduce((s, r) => s + Number(r.bills || 0), 0);
      const totRet = rows.reduce((s, r) => s + Number(r.returns || 0), 0);
      const totQty = rows.reduce((s, r) => s + Number(r.qty || 0), 0);
      const totTaxable = rows.reduce((s, r) => s + Number(r.taxable || 0), 0);
      const totTax = rows.reduce((s, r) => s + Number(r.tax || 0), 0);
      const totAmt = rows.reduce((s, r) => s + Number(r.amount || 0), 0);

      gridWrap.innerHTML = `
        <table class="grid ps-table">
          <thead>
            <tr>
              <th style="text-align:left;">PRODUCT NAME</th>
              <th class="n" style="width:90px;">BILLS</th>
              <th class="n" style="width:90px;">RETURNS</th>
              <th class="n" style="width:100px;">TOTAL QTY</th>
              <th class="n" style="width:120px;">TAXABLE VALUE</th>
              <th class="n" style="width:110px;">GST AMOUNT</th>
              <th class="n" style="width:130px;">TOTAL AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((r) => `<tr>
              <td><b>${esc(r.name)}</b></td>
              <td class="n">${r.bills ?? '-'}</td>
              <td class="n">${r.returns || '-'}</td>
              <td class="n"><b>${r.qty}</b></td>
              <td class="n">${money(r.taxable)}</td>
              <td class="n">${money(r.tax)}</td>
              <td class="n"><b>${money(r.amount)}</b></td>
            </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:24px;">No product sales found matching filter</td></tr>'}
          </tbody>
          <tfoot>
            <tr class="total">
              <td><b>TOTAL (${rows.length} Products)</b></td>
              <td class="n"><b>${totBills}</b></td>
              <td class="n"><b>${totRet}</b></td>
              <td class="n"><b>${totQty}</b></td>
              <td class="n"><b>${money(totTaxable)}</b></td>
              <td class="n"><b>${money(totTax)}</b></td>
              <td class="n"><b>${money(totAmt)}</b></td>
            </tr>
          </tfoot>
        </table>
      `;
    }
  }

  function exportExcel() {
    const table = gridWrap.querySelector('table');
    if (!table) return;
    const headers: string[] = [];
    table.querySelectorAll('thead th').forEach((th) => headers.push(th.textContent?.replace(/\s+/g, ' ').trim() || ''));
    const rows: (string | number)[][] = [];
    table.querySelectorAll('tbody tr').forEach((tr) => {
      const row: (string | number)[] = [];
      tr.querySelectorAll('td').forEach((td) => row.push(td.textContent?.replace(/\s+/g, ' ').trim() || ''));
      rows.push(row);
    });
    table.querySelectorAll('tfoot tr').forEach((tr) => {
      const row: (string | number)[] = [];
      tr.querySelectorAll('td').forEach((td) => row.push(td.textContent?.replace(/\s+/g, ' ').trim() || ''));
      rows.push(row);
    });
    downloadCsv(`Product_${what}_Summary_${mode.toUpperCase()}_${from}_${to}.csv`, headers, rows);
  }

  function printCurrent() {
    const table = gridWrap.querySelector('table');
    if (!table) return;
    const html = `<h2>${esc(company.name || '')}</h2>
      <h3 style="text-align:center">PRODUCT ${what} SUMMARY (${mode.toUpperCase()}) &nbsp; ${fmtDate(from)} to ${fmtDate(to)}</h3>
      ${table.outerHTML}`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  async function changePeriod() {
    const res = await askPeriod(from, to);
    if (res) {
      from = res.from;
      to = res.to;
      load();
    }
  }

  modeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      mode = b.dataset.m as any;
      load();
    });
  });

  findInput.addEventListener('input', () => render());

  w.onKey = (_e, k) => {
    if (k === '1' || k === 'm' || k === 'M') { mode = 'month'; load(); return true; }
    if (k === '2' || k === 'w' || k === 'W') { mode = 'week'; load(); return true; }
    if (k === '3' || k === 'd' || k === 'D') { mode = 'day'; load(); return true; }
    if (k === '4' || k === 's' || k === 'S') { mode = 'summary'; load(); return true; }
    if (k === 'F2') { changePeriod(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { printCurrent(); return true; }
    return false;
  };

  await load();
  findInput.focus();
}

