import { api, openWin, GridList, money, drcr, esc, today, fmtDate, fyStart, h, formWin, reloadOnClose, toast, type Col, pick } from './ui.ts';
import { pickLedger, itemRegister, type Ledger, type Item, pickItem } from './masters.ts';
import { pickParty } from './sale.ts';
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
  const w = openWin(opts.title, 'full', (opts.period ? '<span><b>F2</b> Change Period</span>' : '') + (opts.onEnter ? '<span><b>Enter</b> Open</span>' : '') +
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
  const w = openWin('Profit & Loss A/c', 'full', '<span><b>F10</b> Print</span><span><b>Esc</b> Close</span>');
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
  const w = openWin('Balance Sheet', 'full', '<span><b>F10</b> Print</span><span><b>Esc</b> Close</span>');
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

export { batchStock } from './stock.ts';

export function parseExpiryDate(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  // Format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }

  // Format: YYYY-MM
  if (/^\d{4}-\d{2}$/.test(s)) {
    const [y, m] = s.split('-').map(Number);
    return new Date(y, m, 0, 23, 59, 59);
  }

  // Format: MM/YY or MM/YYYY or MM-YY or MM-YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{2}|\d{4})$/);
  if (m) {
    const mm = Number(m[1]);
    const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
    if (mm >= 1 && mm <= 12) {
      return new Date(yy, mm, 0, 23, 59, 59);
    }
  }

  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function isBatchExpired(rawExp: string | undefined | null, asOf: Date = new Date()): boolean {
  const d = parseExpiryDate(rawExp);
  if (!d) return false;
  const expEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
  return expEnd < asOf.getTime();
}

export function isBatchNearExpiry(rawExp: string | undefined | null, days = 90, asOf: Date = new Date()): boolean {
  const d = parseExpiryDate(rawExp);
  if (!d) return false;
  if (isBatchExpired(rawExp, asOf)) return false; // Already expired batches belong in Expiry Stock
  const expEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime();
  const limit = asOf.getTime() + days * 864e5;
  return expEnd <= limit;
}

/** Stocks → Expiry Stock: ONLY products that are ALREADY EXPIRED (expiry < today). Near expiry products are excluded. */
export function expiryStock() {
  return reportWin<BatchRow>({
    title: 'Expiry Stock (Already Expired Products Only)',
    cols: batchCols,
    search: (r) => `${r.item_name} ${r.batch}`,
    load: async () => {
      const now = new Date();
      const all = await api<BatchRow[]>('/reports/batch-stock');
      return all
        .filter((b) => b.stock > 0 && isBatchExpired(b.expiry, now))
        .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
    },
    footer: valueFooter(7),
  });
}

const nearBatchCols: Col<BatchRow>[] = [
  { title: 'Item', get: (r) => r.item_name },
  { title: 'Pack', get: (r) => r.pack },
  { title: 'Batch', get: (r) => r.batch },
  { title: 'Expiry', get: (r) => expMY(r.expiry) },
  {
    title: 'Days Left',
    get: (r) => {
      const d = parseExpiryDate(r.expiry);
      if (!d) return '';
      const days = Math.ceil((d.getTime() - Date.now()) / 864e5);
      return days > 0 ? `${days} days` : 'Expiring';
    },
  },
  { title: 'Stock', get: (r) => r.stock, num: true },
  { title: 'MRP', get: (r) => r.mrp, money: true },
  { title: 'Rate', get: (r) => r.rate, money: true },
  { title: 'Value', get: (r) => cm(r.purchase_rate == null ? null : r.stock * r.purchase_rate), num: true },
  { title: 'Supplier', get: (r) => r.supplier },
];

/** Stocks → Near Expiry Stock: Products that are NOT YET EXPIRED but expiring within specified days (default 90 days). */
export function nearExpiryStock(initialDays = 90) {
  let days = initialDays;
  return reportWin<BatchRow>({
    title: `Near Expiry Stock (Expiring within next ${days} days)`,
    cols: nearBatchCols,
    search: (r) => `${r.item_name} ${r.batch}`,
    extraFoot: '<span><b>F2</b> Change Days</span>',
    extraKeys: {
      F2: () => {
        import('./margui.ts').then(async (m) => {
          const ans = await m.margAsk('Near Expiry Window (Days)', String(days));
          if (ans && Number(ans) > 0) {
            days = Number(ans);
            nearExpiryStock(days);
          }
        });
      },
    },
    load: async () => {
      const now = new Date();
      const all = await api<BatchRow[]>('/reports/batch-stock');
      return all
        .filter((b) => b.stock > 0 && isBatchNearExpiry(b.expiry, days, now))
        .sort((a, b) => (a.expiry || '').localeCompare(b.expiry || ''));
    },
    footer: (rows) =>
      `<tr class="total"><td colspan="8">Total (${rows.length} near-expiry batches)</td><td class="n">${cmTotal(
        rows.reduce((s, r) => s + r.stock * (r.purchase_rate ?? 0), 0)
      )}</td><td></td></tr>`,
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
interface SumRow { id?: number; name: string; month: string; bills: number; returns: number; qty: number; taxable: number; tax: number; amount: number; cost: number | null; pack?: string; company?: string; city?: string }
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
  const extraKeys: Record<string, () => void> = {};
  let extraFoot: string | undefined = undefined;
  let onEnter: ((r: SumRow) => void) | undefined = undefined;

  if (by === 'company' && side === 'SALE') {
    extraFoot = '<span><b>F3</b> Select Company</span>';
    extraKeys['F3'] = () => singleCompanySale();
    onEnter = (r: SumRow) => singleCompanySale(r.name);
  } else if (by === 'party' && side === 'SALE') {
    extraFoot = '<span><b>F3</b> Select Party</span>';
    extraKeys['F3'] = () => singlePartySale();
    onEnter = (r: SumRow) => singlePartySale((r as any).id || r.name);
  } else if (by === 'mr' && side === 'SALE') {
    extraFoot = '<span><b>F3</b> Select M.R.</span>';
    extraKeys['F3'] = () => mrSaleReport('single');
    onEnter = (r: SumRow) => mrSaleReport('items', (r as any).id);
  }

  return reportWin<SumRow>({
    title, period: true, cols, search: (r) => nameOf(r), load, from,
    onEnter, extraKeys, extraFoot,
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
  type Line = { head: string; taxable: number; igst: number; cgst: number; sgst: number; total: number };
  let payable = 0;
  return reportWin<Line>({
    title: 'GSTR-3B — Monthly Tax Summary', period: true, from: `${today().slice(0, 8)}01`, to: today(),
    cols: [
      { title: 'Particulars', get: (r) => r.head },
      { title: 'Taxable Value', get: (r) => r.taxable, money: true },
      { title: 'IGST', get: (r) => r.igst, money: true },
      { title: 'CGST', get: (r) => r.cgst, money: true },
      { title: 'SGST', get: (r) => r.sgst, money: true },
      { title: 'Total Tax', get: (r) => r.total, money: true },
    ],
    load: async (p) => {
      const g = await api<any>(`/reports/gstr3b?from=${p.from}&to=${p.to}`);
      payable = g.payable;
      const line = (head: string, x: { taxable: number; tax: number; igst: number; cgst: number; sgst: number }): Line => ({
        head, taxable: x.taxable, igst: x.igst, cgst: x.cgst, sgst: x.sgst, total: x.tax
      });
      return [
        line(`3.1 Outward taxable supplies (${g.outward.bills} bills, ${g.outward.returns} returns)`, g.outward),
        line(`4 Eligible ITC — inward supplies (${g.inward.bills} bills, ${g.inward.returns} returns)`, g.inward)
      ];
    },
    footer: () => `<tr class="total"><td colspan="5">${payable >= 0 ? 'Net GST Payable in cash' : 'Excess ITC carried forward'}</td><td class="n">${money(Math.abs(payable))}</td></tr>`,
  });
}

export function gstr1() {
  type Gstr1Row = { no: string; date: string; party: string; gstin: string; type: string; taxable: number; igst: number; cgst: number; sgst: number; total: number };
  return reportWin<Gstr1Row>({
    title: 'GSTR-1 — Outward Supplies (B2B / B2C / HSN)', period: true, from: `${today().slice(0, 8)}01`, to: today(),
    cols: [
      { title: 'Bill No', get: (r) => r.no },
      { title: 'Date', get: (r) => fmtDate(r.date) },
      { title: 'Party / Description', get: (r) => r.party },
      { title: 'GSTIN / Type', get: (r) => r.gstin || r.type },
      { title: 'Taxable', get: (r) => r.taxable, money: true },
      { title: 'IGST', get: (r) => r.igst, money: true },
      { title: 'CGST', get: (r) => r.cgst, money: true },
      { title: 'SGST', get: (r) => r.sgst, money: true },
      { title: 'Invoice Val', get: (r) => r.total, money: true },
    ],
    load: async (p) => {
      const data = await api<any>(`/reports/gstr1?from=${p.from}&to=${p.to}`);
      const rows: Gstr1Row[] = [];
      for (const b of data.b2b || []) {
        rows.push({ no: b.no, date: b.date, party: b.party, gstin: b.gstin || 'B2B', type: b.sale_type, taxable: b.taxable, igst: b.igst, cgst: b.cgst, sgst: b.sgst, total: b.net });
      }
      for (const b of data.b2c || []) {
        rows.push({ no: b.no, date: b.date, party: b.party || 'CASH WALK-IN', gstin: 'B2C', type: b.sale_type, taxable: b.taxable, igst: b.igst, cgst: b.cgst, sgst: b.sgst, total: b.net });
      }
      for (const b of data.cdnr || []) {
        rows.push({ no: b.no, date: b.date, party: `${b.party} (RET)`, gstin: 'CDNR', type: b.sale_type, taxable: -b.taxable, igst: -b.igst, cgst: -b.cgst, sgst: -b.sgst, total: -b.net });
      }
      return rows;
    },
    footer: (rows) => {
      const totTaxable = rows.reduce((s, r) => s + r.taxable, 0);
      const totIgst = rows.reduce((s, r) => s + r.igst, 0);
      const totCgst = rows.reduce((s, r) => s + r.cgst, 0);
      const totSgst = rows.reduce((s, r) => s + r.sgst, 0);
      const totVal = rows.reduce((s, r) => s + r.total, 0);
      return `<tr class="total"><td colspan="4">TOTAL (${rows.length} records)</td><td class="n">${money(totTaxable)}</td><td class="n">${money(totIgst)}</td><td class="n">${money(totCgst)}</td><td class="n">${money(totSgst)}</td><td class="n">${money(totVal)}</td></tr>`;
    },
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
  w.setFoot('<span><b>F3</b>-Select Product</span><span><b>Enter</b>-Product Details</span><span><b>1/M</b>-Monthly</span><span><b>2/W</b>-Weekly</span><span><b>3/D</b>-Daily</span><span><b>4/S</b>-Summary</span><span><b>F2</b>-Period</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

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
        <button type="button" class="ps-btn-pick-product" style="margin-left:8px;margin-right:8px;cursor:pointer;padding:3px 10px;background:#003366;color:#fff;border:1px solid #ffcc00;font-weight:bold;border-radius:3px;">🔍 Select Product (F3)</button>
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
    screen.querySelector('.ps-btn-pick-product')?.addEventListener('click', () => singleProductSale(undefined, from, to));

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

    gridWrap.querySelectorAll<HTMLTableRowElement>('tbody tr').forEach((tr) => {
      tr.style.cursor = 'pointer';
      tr.addEventListener('dblclick', () => {
        const itName = tr.querySelector('td b')?.textContent?.trim();
        if (itName && !itName.toUpperCase().includes('TOTAL')) singleProductSale(itName, from, to);
      });
    });
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
    if (k === 'F3') { singleProductSale(undefined, from, to); return true; }
    if (k === 'F2') { changePeriod(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { printCurrent(); return true; }
    return false;
  };

  await load();
  findInput.focus();
}


// ------------------------------------------------------------------ Single Product / Company / Party Sale Drill-down


export async function pickSalesman(includeAll = false): Promise<{ id: number | string; name: string; area?: string } | null> {
  let list: { id: number; name: string; area?: string }[] = [];
  try {
    list = await api<{ id: number; name: string; area?: string }[]>('/salesmen');
  } catch {
    list = [];
  }
  const rows: { id: number | string; name: string; area?: string }[] = [];
  if (includeAll) {
    rows.push({ id: 'all', name: '<ALL M.R. (ALL SALESMEN)>', area: 'All Salesmen' });
    rows.push({ id: '0', name: '<DIRECT / NO M.R.>', area: 'Direct Sale / No M.R.' });
  }
  rows.push(...list.sort((a, b) => a.name.localeCompare(b.name)));

  return pick<{ id: number | string; name: string; area?: string }>({
    title: 'Select M.R. (Salesman)',
    rows,
    cols: [
      { title: 'M.R. / Salesman Name', get: (r) => r.name },
      { title: 'Area', get: (r) => r.area || '-' },
    ],
    key: (r) => `${r.name} ${r.area || ''}`,
    size: 'mid',
  });
}

export async function pickCompany(initial = ''): Promise<string | null> {
  const rows = await api<{ company: string }[]>('/companies-list');
  const res = await pick<{ company: string }>({
    title: 'Select Company',
    rows,
    cols: [{ title: 'Company Name', get: (r) => r.company }],
    key: (r) => r.company,
    initial,
    size: 'mid',
  });
  return res ? res.company : null;
}

/**
 * Single Product Sale Detail: Shows all sales bills for a single item,
 * with batch, expiry, qty, rate, discount, taxable, tax, and total.
 * Pressing Enter on any bill opens bill alteration.
 */
export async function singleProductSale(itemOrId?: any, initFrom?: string, initTo?: string) {
  let it: any = itemOrId;
  if (!it) {
    it = await pickItem();
    if (!it) return;
  }
  let itemId = typeof it === 'object' ? it.id : (typeof it === 'number' ? it : undefined);
  let itemName = typeof it === 'object' ? it.name : (typeof it === 'string' ? it : undefined);

  let from = initFrom || fyStart();
  let to = initTo || today();

  const w = openWin('SINGLE PRODUCT SALE REPORT', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Period</span><span><b>F3</b>-Change Product</span><span><b>Enter</b>-Open Bill</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'ps-screen' });
  screen.innerHTML = `
    <div class="ps-top">
      <div class="ps-modes" style="align-items:center;">
        <span class="ps-label" style="font-size:15px;color:#ffcc00;font-weight:bold;">📦 PRODUCT SALE DETAIL</span>
        <button type="button" class="ps-btn-change-item" style="margin-left:12px;cursor:pointer;padding:3px 10px;background:#003366;color:#fff;border:1px solid #ffcc00;font-weight:bold;border-radius:3px;">🔍 Change Product (F3)</button>
      </div>
      <div class="ps-info">
        <span class="ps-period">Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button></span>
        <div class="ps-find"><span>Find in Bills &gt;&gt;</span> [ <input autocomplete="off" spellcheck="false" placeholder="Filter by bill no, party, batch..."> ]</div>
      </div>
    </div>
    <div class="ps-item-banner" style="background:#0c2540;color:#e8f4f8;padding:6px 12px;border-bottom:1px solid #204060;display:flex;flex-wrap:wrap;gap:18px;font-size:13px;">
      <div>Item: <b class="item-name" style="font-size:15px;color:#fff;">Loading...</b></div>
      <div>Pack: <b class="item-pack">-</b></div>
      <div>Company: <b class="item-company">-</b></div>
      <div>HSN: <b class="item-hsn">-</b></div>
    </div>
    <div class="ps-item-summary-cards" style="display:flex;gap:18px;padding:6px 12px;background:#13293d;color:#fff;font-size:13px;border-bottom:1px solid #204060;"></div>
    <div class="ps-grid-wrap" style="flex:1;overflow:auto;"></div>
  `;

  const bar = margBar('SINGLE PRODUCT SALE REPORT');
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printCurrent() });
  screen.prepend(bar);
  w.body.append(screen);

  const gridWrap = screen.querySelector('.ps-grid-wrap') as HTMLElement;
  const findInput = screen.querySelector('.ps-find input') as HTMLInputElement;
  const periodSpan = screen.querySelector('.ps-period') as HTMLElement;
  const summaryCards = screen.querySelector('.ps-item-summary-cards') as HTMLElement;
  const itemNameEl = screen.querySelector('.item-name') as HTMLElement;
  const itemPackEl = screen.querySelector('.item-pack') as HTMLElement;
  const itemCompanyEl = screen.querySelector('.item-company') as HTMLElement;
  const itemHsnEl = screen.querySelector('.item-hsn') as HTMLElement;

  let loadedData: { item: any; rows: any[] } = { item: null, rows: [] };
  let filteredRows: any[] = [];
  let sel = 0;

  async function load() {
    gridWrap.innerHTML = '<div style="padding:24px;text-align:center;font-size:16px;">Loading product sale transactions...</div>';
    const params = new URLSearchParams({ from, to });
    if (itemId) params.set('item_id', String(itemId));
    if (itemName) params.set('name', itemName);
    loadedData = await api<{ item: any; rows: any[] }>(`/reports/item-sale-detail?${params.toString()}`);

    const itm = loadedData.item || (typeof it === 'object' ? it : null);
    if (itm) {
      itemNameEl.textContent = itm.name || itemName || '';
      itemPackEl.textContent = itm.pack || '-';
      itemCompanyEl.textContent = itm.company || '-';
      itemHsnEl.textContent = itm.hsn || '-';
      const titleSpan = bar.querySelector('span');
      if (titleSpan) titleSpan.textContent = `PRODUCT SALE REPORT — ${itm.name}`;
    } else if (itemName) {
      itemNameEl.textContent = itemName;
    }
    render();
  }

  function render() {
    periodSpan.innerHTML = `Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button>`;
    screen.querySelector('.ps-btn-period')?.addEventListener('click', changePeriod);
    screen.querySelector('.ps-btn-change-item')?.addEventListener('click', chooseAnotherItem);

    const q = findInput.value.trim().toLowerCase();
    filteredRows = loadedData.rows || [];
    if (q) {
      filteredRows = filteredRows.filter((r) =>
        String(r.no || '').toLowerCase().includes(q) ||
        String(r.party || '').toLowerCase().includes(q) ||
        String(r.batch || '').toLowerCase().includes(q) ||
        String(r.type || '').toLowerCase().includes(q)
      );
    }

    if (sel >= filteredRows.length) sel = Math.max(0, filteredRows.length - 1);

    const totBills = new Set(filteredRows.map((r) => r.bill_id)).size;
    const totQty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totFree = filteredRows.reduce((s, r) => s + Number(r.free || 0), 0);
    const totTaxable = filteredRows.reduce((s, r) => s + Number(r.taxable || 0), 0);
    const totTax = filteredRows.reduce((s, r) => s + Number(r.tax || 0), 0);
    const totAmt = filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0);

    summaryCards.innerHTML = `
      <div>Bills: <b style="color:#ffcc00">${totBills}</b></div>
      <div>Qty Sold: <b style="color:#00e676">${totQty}</b></div>
      <div>Free Qty: <b>${totFree}</b></div>
      <div>Taxable: <b>${money(totTaxable)}</b></div>
      <div>GST: <b>${money(totTax)}</b></div>
      <div>Total Sales: <b style="color:#ffcc00;font-size:14px;">${money(totAmt)}</b></div>
    `;

    gridWrap.innerHTML = `
      <table class="grid ps-table" style="width:100%;">
        <thead>
          <tr>
            <th style="width:90px;">DATE</th>
            <th style="width:110px;">BILL NO</th>
            <th style="width:80px;">TYPE</th>
            <th style="text-align:left;">PARTY NAME</th>
            <th style="width:100px;">BATCH</th>
            <th style="width:80px;">EXPIRY</th>
            <th class="n" style="width:70px;">QTY</th>
            <th class="n" style="width:60px;">FREE</th>
            <th class="n" style="width:90px;">RATE</th>
            <th class="n" style="width:70px;">DISC %</th>
            <th class="n" style="width:100px;">TAXABLE</th>
            <th class="n" style="width:90px;">GST</th>
            <th class="n" style="width:110px;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows.length ? filteredRows.map((r, i) => `
            <tr class="ps-row ${i === sel ? 'sel' : ''}" data-idx="${i}" style="cursor:pointer;">
              <td>${fmtDate(r.date)}</td>
              <td><b>${esc(r.no)}</b></td>
              <td>${esc(BILL_TITLE[r.type] || r.type)}</td>
              <td><b>${esc(r.party)}</b></td>
              <td>${esc(r.batch || '-')}</td>
              <td>${esc(r.expiry || '-')}</td>
              <td class="n"><b>${r.qty}</b></td>
              <td class="n">${r.free || '-'}</td>
              <td class="n">${money(r.rate)}</td>
              <td class="n">${r.disc_pct ? `${r.disc_pct}%` : '-'}</td>
              <td class="n">${money(r.taxable)}</td>
              <td class="n">${money(r.tax)}</td>
              <td class="n"><b>${money(r.amount)}</b></td>
            </tr>
          `).join('') : '<tr><td colspan="13" style="text-align:center;padding:24px;">No sales found for this product in selected period</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="total">
            <td colspan="4"><b>TOTAL (${filteredRows.length} Rows / ${totBills} Bills)</b></td>
            <td colspan="2"></td>
            <td class="n"><b>${totQty}</b></td>
            <td class="n"><b>${totFree}</b></td>
            <td colspan="2"></td>
            <td class="n"><b>${money(totTaxable)}</b></td>
            <td class="n"><b>${money(totTax)}</b></td>
            <td class="n"><b>${money(totAmt)}</b></td>
          </tr>
        </tfoot>
      </table>
    `;

    gridWrap.querySelectorAll<HTMLTableRowElement>('.ps-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        sel = Number(tr.dataset.idx);
        gridWrap.querySelectorAll('.ps-row').forEach((x, idx) => x.classList.toggle('sel', idx === sel));
      });
      tr.addEventListener('dblclick', () => {
        sel = Number(tr.dataset.idx);
        openSelectedBill();
      });
    });
  }

  function openSelectedBill() {
    const cur = filteredRows[sel];
    if (!cur) return;
    const bills = filteredRows.map((r) => ({ id: r.bill_id, type: r.type })).filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);
    const at = bills.findIndex((b) => b.id === cur.bill_id);
    import('./billview.ts').then((m) => m.billAlteration(bills, at >= 0 ? at : 0, () => load()));
  }

  async function chooseAnotherItem() {
    const newIt = await pickItem();
    if (newIt) {
      it = newIt;
      itemId = newIt.id;
      itemName = newIt.name;
      load();
    }
  }

  async function changePeriod() {
    const res = await askPeriod(from, to);
    if (res) {
      from = res.from;
      to = res.to;
      load();
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
    const safeName = (itemNameEl.textContent || 'Item').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(`Product_Sale_${safeName}_${from}_${to}.csv`, headers, rows);
  }

  function printCurrent() {
    const table = gridWrap.querySelector('table');
    if (!table) return;
    let companyInfo: any = {};
    api('/company').then((c) => { companyInfo = c; }).finally(() => {
      const html = `<h2>${esc(companyInfo.name || '')}</h2>
        <h3 style="text-align:center">SINGLE PRODUCT SALE REPORT — ${esc(itemNameEl.textContent || '')}</h3>
        <p style="text-align:center;font-size:12px;">Period: ${fmtDate(from)} to ${fmtDate(to)} | Pack: ${esc(itemPackEl.textContent || '')} | Company: ${esc(itemCompanyEl.textContent || '')} | HSN: ${esc(itemHsnEl.textContent || '')}</p>
        ${table.outerHTML}`;
      import('./billing.ts').then((m) => m.printHtml(html, 1));
    });
  }

  findInput.addEventListener('input', () => { sel = 0; render(); });

  w.onKey = (_e, k) => {
    if (k === 'ArrowDown') {
      if (sel < filteredRows.length - 1) {
        sel++;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'ArrowUp') {
      if (sel > 0) {
        sel--;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'Enter') {
      openSelectedBill();
      return true;
    }
    if (k === 'F2') { changePeriod(); return true; }
    if (k === 'F3') { chooseAnotherItem(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { printCurrent(); return true; }
    return false;
  };

  await load();
  findInput.focus();
}

/**
 * Single Company Sale: Shows product-wise breakdown of sales for a company.
 * Pressing Enter on any product drills down into Single Product Sale.
 */
export async function singleCompanySale(companyName?: string, initFrom?: string, initTo?: string) {
  let comp = companyName;
  if (!comp) {
    comp = (await pickCompany()) || '';
    if (!comp) return;
  }

  let from = initFrom || fyStart();
  let to = initTo || today();

  const w = openWin(`COMPANY SALE: ${comp.toUpperCase()}`, 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Period</span><span><b>F3</b>-Change Company</span><span><b>Enter</b>-Product Sale Detail</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'ps-screen' });
  screen.innerHTML = `
    <div class="ps-top">
      <div class="ps-modes" style="align-items:center;">
        <span class="ps-label" style="font-size:15px;color:#ffcc00;font-weight:bold;">🏢 SINGLE COMPANY SALE</span>
        <button type="button" class="ps-btn-change-comp" style="margin-left:12px;cursor:pointer;padding:3px 10px;background:#003366;color:#fff;border:1px solid #ffcc00;font-weight:bold;border-radius:3px;">🔍 Change Company (F3)</button>
      </div>
      <div class="ps-info">
        <span class="ps-period">Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button></span>
        <div class="ps-find"><span>Find Product &gt;&gt;</span> [ <input autocomplete="off" spellcheck="false" placeholder="Filter products..."> ]</div>
      </div>
    </div>
    <div class="ps-item-banner" style="background:#0c2540;color:#e8f4f8;padding:6px 12px;border-bottom:1px solid #204060;display:flex;flex-wrap:wrap;gap:18px;font-size:13px;">
      <div>Company: <b class="comp-title" style="font-size:15px;color:#fff;">${esc(comp)}</b></div>
    </div>
    <div class="ps-item-summary-cards" style="display:flex;gap:18px;padding:6px 12px;background:#13293d;color:#fff;font-size:13px;border-bottom:1px solid #204060;"></div>
    <div class="ps-grid-wrap" style="flex:1;overflow:auto;"></div>
  `;

  const bar = margBar(`COMPANY SALE — ${comp}`);
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printCurrent() });
  screen.prepend(bar);
  w.body.append(screen);

  const gridWrap = screen.querySelector('.ps-grid-wrap') as HTMLElement;
  const findInput = screen.querySelector('.ps-find input') as HTMLInputElement;
  const periodSpan = screen.querySelector('.ps-period') as HTMLElement;
  const summaryCards = screen.querySelector('.ps-item-summary-cards') as HTMLElement;
  const compTitleEl = screen.querySelector('.comp-title') as HTMLElement;

  let loadedRows: any[] = [];
  let filteredRows: any[] = [];
  let sel = 0;

  async function load() {
    gridWrap.innerHTML = '<div style="padding:24px;text-align:center;font-size:16px;">Loading company products sale...</div>';
    compTitleEl.textContent = comp || '';
    const titleSpan = bar.querySelector('span');
    if (titleSpan) titleSpan.textContent = `COMPANY SALE — ${comp}`;
    loadedRows = await api<any[]>(`/reports/summary?side=SALE&by=item&company=${encodeURIComponent(comp!)}&from=${from}&to=${to}`);
    render();
  }

  function render() {
    periodSpan.innerHTML = `Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button>`;
    screen.querySelector('.ps-btn-period')?.addEventListener('click', changePeriod);
    screen.querySelector('.ps-btn-change-comp')?.addEventListener('click', chooseAnotherComp);

    const q = findInput.value.trim().toLowerCase();
    filteredRows = loadedRows;
    if (q) {
      filteredRows = filteredRows.filter((r) => String(r.name).toLowerCase().includes(q) || String(r.pack || '').toLowerCase().includes(q));
    }

    if (sel >= filteredRows.length) sel = Math.max(0, filteredRows.length - 1);

    const totBills = filteredRows.reduce((s, r) => s + Number(r.bills || 0), 0);
    const totRet = filteredRows.reduce((s, r) => s + Number(r.returns || 0), 0);
    const totQty = filteredRows.reduce((s, r) => s + Number(r.qty || 0), 0);
    const totTaxable = filteredRows.reduce((s, r) => s + Number(r.taxable || 0), 0);
    const totTax = filteredRows.reduce((s, r) => s + Number(r.tax || 0), 0);
    const totAmt = filteredRows.reduce((s, r) => s + Number(r.amount || 0), 0);

    summaryCards.innerHTML = `
      <div>Products: <b style="color:#ffcc00">${filteredRows.length}</b></div>
      <div>Bills: <b>${totBills}</b></div>
      <div>Returns: <b>${totRet}</b></div>
      <div>Qty Sold: <b style="color:#00e676">${totQty}</b></div>
      <div>Taxable: <b>${money(totTaxable)}</b></div>
      <div>GST: <b>${money(totTax)}</b></div>
      <div>Total Sales: <b style="color:#ffcc00;font-size:14px;">${money(totAmt)}</b></div>
    `;

    gridWrap.innerHTML = `
      <table class="grid ps-table" style="width:100%;">
        <thead>
          <tr>
            <th style="text-align:left;">PRODUCT NAME</th>
            <th style="width:90px;">PACK</th>
            <th class="n" style="width:80px;">BILLS</th>
            <th class="n" style="width:80px;">RETURNS</th>
            <th class="n" style="width:90px;">TOTAL QTY</th>
            <th class="n" style="width:110px;">TAXABLE</th>
            <th class="n" style="width:100px;">GST</th>
            <th class="n" style="width:120px;">TOTAL AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${filteredRows.length ? filteredRows.map((r, i) => `
            <tr class="ps-row ${i === sel ? 'sel' : ''}" data-idx="${i}" style="cursor:pointer;">
              <td><b>${esc(r.name)}</b></td>
              <td>${esc(r.pack || '-')}</td>
              <td class="n">${r.bills ?? '-'}</td>
              <td class="n">${r.returns || '-'}</td>
              <td class="n"><b>${r.qty}</b></td>
              <td class="n">${money(r.taxable)}</td>
              <td class="n">${money(r.tax)}</td>
              <td class="n"><b>${money(r.amount)}</b></td>
            </tr>
          `).join('') : '<tr><td colspan="8" style="text-align:center;padding:24px;">No products sold for this company in selected period</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="total">
            <td colspan="2"><b>TOTAL (${filteredRows.length} Products)</b></td>
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

    gridWrap.querySelectorAll<HTMLTableRowElement>('.ps-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        sel = Number(tr.dataset.idx);
        gridWrap.querySelectorAll('.ps-row').forEach((x, idx) => x.classList.toggle('sel', idx === sel));
      });
      tr.addEventListener('dblclick', () => {
        sel = Number(tr.dataset.idx);
        openSelectedProduct();
      });
    });
  }

  function openSelectedProduct() {
    const cur = filteredRows[sel];
    if (!cur) return;
    singleProductSale(cur.id || cur.name, from, to);
  }

  async function chooseAnotherComp() {
    const newComp = await pickCompany();
    if (newComp) {
      comp = newComp;
      load();
    }
  }

  async function changePeriod() {
    const res = await askPeriod(from, to);
    if (res) {
      from = res.from;
      to = res.to;
      load();
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
    const safeName = (comp || 'Company').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(`Company_Sale_${safeName}_${from}_${to}.csv`, headers, rows);
  }

  function printCurrent() {
    const table = gridWrap.querySelector('table');
    if (!table) return;
    let companyInfo: any = {};
    api('/company').then((c) => { companyInfo = c; }).finally(() => {
      const html = `<h2>${esc(companyInfo.name || '')}</h2>
        <h3 style="text-align:center">SINGLE COMPANY SALE REPORT — ${esc(comp || '')}</h3>
        <p style="text-align:center;font-size:12px;">Period: ${fmtDate(from)} to ${fmtDate(to)}</p>
        ${table.outerHTML}`;
      import('./billing.ts').then((m) => m.printHtml(html, 1));
    });
  }

  findInput.addEventListener('input', () => { sel = 0; render(); });

  w.onKey = (_e, k) => {
    if (k === 'ArrowDown') {
      if (sel < filteredRows.length - 1) {
        sel++;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'ArrowUp') {
      if (sel > 0) {
        sel--;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'Enter') {
      openSelectedProduct();
      return true;
    }
    if (k === 'F2') { changePeriod(); return true; }
    if (k === 'F3') { chooseAnotherComp(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { printCurrent(); return true; }
    return false;
  };

  await load();
  findInput.focus();
}

/**
 * Single Party Sale: Shows all sale bills for a party, with date, bill no, mode, items summary, taxable, tax, and net.
 * Pressing Enter on any bill opens bill alteration.
 */
export async function singlePartySale(partyOrId?: any, initFrom?: string, initTo?: string) {
  let party = partyOrId;
  if (!party) {
    party = await pickParty();
    if (!party) return;
  }
  let partyId = typeof party === 'object' ? party.id : (typeof party === 'number' ? party : undefined);
  let partyName = typeof party === 'object' ? party.name : (typeof party === 'string' ? party : undefined);

  let from = initFrom || fyStart();
  let to = initTo || today();

  const w = openWin('SINGLE PARTY SALE REPORT', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Period</span><span><b>F3</b>-Change Party</span><span><b>Enter</b>-Open Bill</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'ps-screen' });
  screen.innerHTML = `
    <div class="ps-top">
      <div class="ps-modes" style="align-items:center;">
        <span class="ps-label" style="font-size:15px;color:#ffcc00;font-weight:bold;">👤 SINGLE PARTY SALE</span>
        <button type="button" class="ps-btn-change-party" style="margin-left:12px;cursor:pointer;padding:3px 10px;background:#003366;color:#fff;border:1px solid #ffcc00;font-weight:bold;border-radius:3px;">🔍 Change Party (F3)</button>
      </div>
      <div class="ps-info">
        <span class="ps-period">Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button></span>
        <div class="ps-find"><span>Find in Bills &gt;&gt;</span> [ <input autocomplete="off" spellcheck="false" placeholder="Filter by bill no, item..."> ]</div>
      </div>
    </div>
    <div class="ps-item-banner" style="background:#0c2540;color:#e8f4f8;padding:6px 12px;border-bottom:1px solid #204060;display:flex;flex-wrap:wrap;gap:18px;font-size:13px;">
      <div>Party: <b class="party-name" style="font-size:15px;color:#fff;">Loading...</b></div>
      <div>Station: <b class="party-city">-</b></div>
      <div>Phone: <b class="party-phone">-</b></div>
      <div>GSTIN: <b class="party-gstin">-</b></div>
      <div>Closing Bal: <b class="party-bal" style="color:#ffcc00">-</b></div>
    </div>
    <div class="ps-item-summary-cards" style="display:flex;gap:18px;padding:6px 12px;background:#13293d;color:#fff;font-size:13px;border-bottom:1px solid #204060;"></div>
    <div class="ps-grid-wrap" style="flex:1;overflow:auto;"></div>
  `;

  const bar = margBar('SINGLE PARTY SALE REPORT');
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printCurrent() });
  screen.prepend(bar);
  w.body.append(screen);

  const gridWrap = screen.querySelector('.ps-grid-wrap') as HTMLElement;
  const findInput = screen.querySelector('.ps-find input') as HTMLInputElement;
  const periodSpan = screen.querySelector('.ps-period') as HTMLElement;
  const summaryCards = screen.querySelector('.ps-item-summary-cards') as HTMLElement;
  const partyNameEl = screen.querySelector('.party-name') as HTMLElement;
  const partyCityEl = screen.querySelector('.party-city') as HTMLElement;
  const partyPhoneEl = screen.querySelector('.party-phone') as HTMLElement;
  const partyGstinEl = screen.querySelector('.party-gstin') as HTMLElement;
  const partyBalEl = screen.querySelector('.party-bal') as HTMLElement;

  let loadedData: { party: any; bills: any[] } = { party: null, bills: [] };
  let filteredBills: any[] = [];
  let sel = 0;

  async function load() {
    gridWrap.innerHTML = '<div style="padding:24px;text-align:center;font-size:16px;">Loading party sale bills...</div>';
    if (!partyId && partyName) {
      const ledgers = await api<any[]>(`/ledgers?group=Sundry Debtors,Sundry Creditors`);
      const matched = ledgers.find((l) => l.name.toUpperCase() === partyName!.toUpperCase());
      if (matched) partyId = matched.id;
    }
    if (!partyId) {
      gridWrap.innerHTML = '<div style="padding:24px;text-align:center;color:#ff6666;">Party not found</div>';
      return;
    }
    loadedData = await api<{ party: any; bills: any[] }>(`/reports/party-sale-detail?party_id=${partyId}&from=${from}&to=${to}`);

    const pty = loadedData.party || (typeof party === 'object' ? party : null);
    if (pty) {
      partyNameEl.textContent = pty.name || partyName || '';
      partyCityEl.textContent = pty.city || '-';
      partyPhoneEl.textContent = pty.phone || pty.mobile || '-';
      partyGstinEl.textContent = pty.gstin || '-';
      partyBalEl.textContent = pty.balance != null ? `${money(Math.abs(pty.balance))} ${pty.balance >= 0 ? 'Dr' : 'Cr'}` : '-';
      const titleSpan = bar.querySelector('span');
      if (titleSpan) titleSpan.textContent = `PARTY SALE REPORT — ${pty.name}`;
    } else if (partyName) {
      partyNameEl.textContent = partyName;
    }
    render();
  }

  function render() {
    periodSpan.innerHTML = `Period: <b>${fmtDate(from)}</b> to <b>${fmtDate(to)}</b> <button type="button" class="ps-btn-period" style="margin-left:6px;cursor:pointer;padding:1px 6px;">Change (F2)</button>`;
    screen.querySelector('.ps-btn-period')?.addEventListener('click', changePeriod);
    screen.querySelector('.ps-btn-change-party')?.addEventListener('click', chooseAnotherParty);

    const q = findInput.value.trim().toLowerCase();
    filteredBills = loadedData.bills || [];
    if (q) {
      filteredBills = filteredBills.filter((b) =>
        String(b.no || '').toLowerCase().includes(q) ||
        String(b.mode || '').toLowerCase().includes(q) ||
        String(b.type || '').toLowerCase().includes(q) ||
        String(b.items_summary || '').toLowerCase().includes(q)
      );
    }

    if (sel >= filteredBills.length) sel = Math.max(0, filteredBills.length - 1);

    const totBills = filteredBills.length;
    const totGross = filteredBills.reduce((s, r) => s + Number(r.gross || 0), 0);
    const totDisc = filteredBills.reduce((s, r) => s + Number(r.discount || 0), 0);
    const totTaxable = filteredBills.reduce((s, r) => s + Number(r.taxable || 0), 0);
    const totTax = filteredBills.reduce((s, r) => s + Number(r.tax || 0), 0);
    const totNet = filteredBills.reduce((s, r) => s + Number(r.net || 0), 0);

    summaryCards.innerHTML = `
      <div>Bills: <b style="color:#ffcc00">${totBills}</b></div>
      <div>Gross: <b>${money(totGross)}</b></div>
      <div>Discount: <b>${money(totDisc)}</b></div>
      <div>Taxable: <b>${money(totTaxable)}</b></div>
      <div>GST: <b>${money(totTax)}</b></div>
      <div>Total Sales: <b style="color:#ffcc00;font-size:14px;">${money(totNet)}</b></div>
    `;

    gridWrap.innerHTML = `
      <table class="grid ps-table" style="width:100%;">
        <thead>
          <tr>
            <th style="width:90px;">DATE</th>
            <th style="width:110px;">BILL NO</th>
            <th style="width:80px;">TYPE</th>
            <th style="width:80px;">MODE</th>
            <th style="text-align:left;">ITEMS SOLD</th>
            <th class="n" style="width:90px;">GROSS</th>
            <th class="n" style="width:80px;">DISC</th>
            <th class="n" style="width:100px;">TAXABLE</th>
            <th class="n" style="width:90px;">GST</th>
            <th class="n" style="width:110px;">NET AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${filteredBills.length ? filteredBills.map((r, i) => `
            <tr class="ps-row ${i === sel ? 'sel' : ''}" data-idx="${i}" style="cursor:pointer;">
              <td>${fmtDate(r.date)}</td>
              <td><b>${esc(r.no)}</b></td>
              <td>${esc(BILL_TITLE[r.type] || r.type)}</td>
              <td>${esc(r.mode)}</td>
              <td style="max-width:320px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(r.items_summary || '')}">${esc(r.items_summary || '-')}</td>
              <td class="n">${money(r.gross)}</td>
              <td class="n">${money(r.discount)}</td>
              <td class="n">${money(r.taxable)}</td>
              <td class="n">${money(r.tax)}</td>
              <td class="n"><b>${money(r.net)}</b></td>
            </tr>
          `).join('') : '<tr><td colspan="10" style="text-align:center;padding:24px;">No sale bills found for this party in selected period</td></tr>'}
        </tbody>
        <tfoot>
          <tr class="total">
            <td colspan="5"><b>TOTAL (${filteredBills.length} Bills)</b></td>
            <td class="n"><b>${money(totGross)}</b></td>
            <td class="n"><b>${money(totDisc)}</b></td>
            <td class="n"><b>${money(totTaxable)}</b></td>
            <td class="n"><b>${money(totTax)}</b></td>
            <td class="n"><b>${money(totNet)}</b></td>
          </tr>
        </tfoot>
      </table>
    `;

    gridWrap.querySelectorAll<HTMLTableRowElement>('.ps-row').forEach((tr) => {
      tr.addEventListener('click', () => {
        sel = Number(tr.dataset.idx);
        gridWrap.querySelectorAll('.ps-row').forEach((x, idx) => x.classList.toggle('sel', idx === sel));
      });
      tr.addEventListener('dblclick', () => {
        sel = Number(tr.dataset.idx);
        openSelectedBill();
      });
    });
  }

  function openSelectedBill() {
    const cur = filteredBills[sel];
    if (!cur) return;
    const bills = filteredBills.map((r) => ({ id: r.bill_id, type: r.type }));
    import('./billview.ts').then((m) => m.billAlteration(bills, sel, () => load()));
  }

  async function chooseAnotherParty() {
    const newP = await pickParty();
    if (newP) {
      party = newP;
      partyId = newP.id;
      partyName = newP.name;
      load();
    }
  }

  async function changePeriod() {
    const res = await askPeriod(from, to);
    if (res) {
      from = res.from;
      to = res.to;
      load();
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
    const safeName = (partyNameEl.textContent || 'Party').replace(/[^a-zA-Z0-9_-]/g, '_');
    downloadCsv(`Party_Sale_${safeName}_${from}_${to}.csv`, headers, rows);
  }

  function printCurrent() {
    const table = gridWrap.querySelector('table');
    if (!table) return;
    let companyInfo: any = {};
    api('/company').then((c) => { companyInfo = c; }).finally(() => {
      const html = `<h2>${esc(companyInfo.name || '')}</h2>
        <h3 style="text-align:center">SINGLE PARTY SALE REPORT — ${esc(partyNameEl.textContent || '')}</h3>
        <p style="text-align:center;font-size:12px;">Period: ${fmtDate(from)} to ${fmtDate(to)} | Station: ${esc(partyCityEl.textContent || '')} | Phone: ${esc(partyPhoneEl.textContent || '')} | GSTIN: ${esc(partyGstinEl.textContent || '')}</p>
        ${table.outerHTML}`;
      import('./billing.ts').then((m) => m.printHtml(html, 1));
    });
  }

  findInput.addEventListener('input', () => { sel = 0; render(); });

  w.onKey = (_e, k) => {
    if (k === 'ArrowDown') {
      if (sel < filteredBills.length - 1) {
        sel++;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'ArrowUp') {
      if (sel > 0) {
        sel--;
        render();
        const curRow = gridWrap.querySelector(`.ps-row[data-idx="${sel}"]`);
        curRow?.scrollIntoView({ block: 'nearest' });
      }
      return true;
    }
    if (k === 'Enter') {
      openSelectedBill();
      return true;
    }
    if (k === 'F2') { changePeriod(); return true; }
    if (k === 'F3') { chooseAnotherParty(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { printCurrent(); return true; }
    return false;
  };

  await load();
  findInput.focus();
}

// ------------------------------------------------------------------ M.R. Wise Sale Report & M.R. + All Items
export interface MrSaleSummaryRow {
  mr_id: number;
  mr_name: string;
  mr_area: string;
  sale_bills: number;
  return_bills: number;
  total_bills: number;
  qty: number;
  free_qty: number;
  gross_amt: number;
  disc_amt: number;
  taxable: number;
  tax: number;
  sale_amt: number;
  return_amt: number;
  net_amt: number;
}

export interface MrSaleItemRow {
  mr_id: number;
  mr_name: string;
  mr_area: string;
  item_id: number;
  item_name: string;
  pack: string;
  company: string;
  batch: string;
  expiry: string;
  bills_count: number;
  qty: number;
  free_qty: number;
  rate: number;
  gross_amt: number;
  disc_amt: number;
  taxable: number;
  tax: number;
  net_amt: number;
}

async function askMrSaleParams(initial: {
  from?: string; to?: string; mr_id?: string; mr_name?: string; mode?: 'summary' | 'items'
}): Promise<{
  from: string; to: string; mr_id: string; mr_name: string; mode: 'summary' | 'items'; action: 'view' | 'print' | 'excel'
} | null> {
  const curFrom = initial.from || `${today().slice(0, 7)}-01`;
  const curTo = initial.to || today();
  const curMrId = initial.mr_id || 'all';
  const curMode: 'summary' | 'items' = initial.mode || 'summary';

  let salesmenList: { id: number; name: string; area?: string }[] = [];
  try {
    salesmenList = await api('/salesmen');
  } catch {}

  return new Promise((resolve) => {
    const titleText = curMode === 'items' ? 'M.R. + ALL ITEM SALE REPORT' : 'M.R. WISE SALE REPORT';
    const p = margPop(titleText, '<span><b>Enter</b>-Next</span><span><b>1/2</b>-Format</span><span><b>V/P/E</b>-Action</span><span><b>Esc</b>-Cancel</span>', '520px');
    const box = h('div', { class: 'mr-date-box' });

    const mrOptions = [
      `<option value="all" ${curMrId === 'all' ? 'selected' : ''}>&lt;ALL M.R. (ALL SALESMEN)&gt;</option>`,
      `<option value="0" ${curMrId === '0' ? 'selected' : ''}>&lt;DIRECT / NO M.R.&gt;</option>`,
      ...salesmenList.map((s) => `<option value="${s.id}" ${String(curMrId) === String(s.id) ? 'selected' : ''}>${esc(s.name)}${s.area ? ` [${esc(s.area)}]` : ''}</option>`),
    ].join('');

    box.innerHTML = `
      <div class="mr-pop-head">${titleText} &mdash; SELECTION</div>
      <div class="field-row">
        <span class="field-label">FROM DATE</span>
        <input type="text" data-f="from" value="${dmy(curFrom)}" autocomplete="off" spellcheck="false">
        <span style="margin:0 4px;">TO</span>
        <input type="text" data-f="to" value="${dmy(curTo)}" autocomplete="off" spellcheck="false">
      </div>
      <div class="presets">
        <button type="button" class="btn-preset" data-p="today"><u>T</u>oday</button>
        <button type="button" class="btn-preset" data-p="month"><u>M</u>onth</button>
        <button type="button" class="btn-preset" data-p="year"><u>Y</u>ear</button>
      </div>
      <div class="field-row">
        <span class="field-label">SELECT M.R.</span>
        <select data-f="mr_id">${mrOptions}</select>
      </div>
      <div class="field-row" style="align-items:flex-start;">
        <span class="field-label">REPORT TYPE</span>
        <div class="format-opts" style="margin-left:0;">
          <label><input type="radio" name="mr_mode" value="summary" ${curMode === 'summary' ? 'checked' : ''}> <u>1</u>. M.R. Wise Summary</label>
          <label><input type="radio" name="mr_mode" value="items" ${curMode === 'items' ? 'checked' : ''}> <u>2</u>. M.R. + All Items</label>
        </div>
      </div>
      <div class="btns">
        <button type="button" data-a="view" class="btn-primary"><u>V</u>iew</button>
        <button type="button" data-a="print"><u>P</u>rint</button>
        <button type="button" data-a="excel"><u>E</u>xcel</button>
        <button type="button" data-a="cancel"><u>C</u>ancel</button>
      </div>
    `;
    p.body.append(box);

    const fInp = box.querySelector('input[data-f="from"]') as HTMLInputElement;
    const tInp = box.querySelector('input[data-f="to"]') as HTMLInputElement;
    const mrSel = box.querySelector('select[data-f="mr_id"]') as HTMLSelectElement;

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
      const modeVal = (box.querySelector('input[name="mr_mode"]:checked') as HTMLInputElement)?.value === 'items' ? 'items' : 'summary';
      const selectedMr = mrSel.value;
      const selectedMrName = mrSel.options[mrSel.selectedIndex]?.text || '';
      p.close();
      resolve({ from: f, to: t, mr_id: selectedMr, mr_name: selectedMrName, mode: modeVal, action: act });
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
        if (active === tInp) { mrSel.focus(); return true; }
        if (active === mrSel) { submit('view'); return true; }
        if (active instanceof HTMLButtonElement && active.dataset.a) {
          submit(active.dataset.a as any);
          return true;
        }
      }
      if (k === '1') {
        const r = box.querySelector('input[name="mr_mode"][value="summary"]') as HTMLInputElement;
        if (r) r.checked = true;
        return true;
      }
      if (k === '2') {
        const r = box.querySelector('input[name="mr_mode"][value="items"]') as HTMLInputElement;
        if (r) r.checked = true;
        return true;
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

function exportMrSaleExcel(rows: any[], mode: 'summary' | 'items', from: string, to: string, mrLabel: string) {
  if (mode === 'items') {
    const headers = ['M.R. Name', 'Area', 'Item Name', 'Packing', 'Company', 'Batch', 'Expiry', 'Bills', 'Qty Sold', 'Free Qty', 'Avg Rate', 'Gross Amount', 'Discount', 'Taxable', 'Tax Amount', 'Net Sale Amount'];
    const data: (string | number)[][] = [];
    let totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totNet = 0;

    for (const r of rows) {
      totQty += Number(r.qty || 0);
      totFree += Number(r.free_qty || 0);
      totGross += Number(r.gross_amt || 0);
      totDisc += Number(r.disc_amt || 0);
      totTaxable += Number(r.taxable || 0);
      totTax += Number(r.tax || 0);
      totNet += Number(r.net_amt || 0);

      data.push([
        r.mr_name || '',
        r.mr_area || '',
        r.item_name || '',
        r.pack || '',
        r.company || '',
        r.batch || '',
        r.expiry || '',
        r.bills_count || 0,
        f2(r.qty),
        f2(r.free_qty),
        f2(r.rate),
        f2(r.gross_amt),
        f2(r.disc_amt),
        f2(r.taxable),
        f2(r.tax),
        f2(r.net_amt),
      ]);
    }
    data.push(['GRAND TOTAL', '', '', '', '', '', '', '', f2(totQty), f2(totFree), '', f2(totGross), f2(totDisc), f2(totTaxable), f2(totTax), f2(totNet)]);
    downloadCsv(`MR_All_Items_Sale_${from}_to_${to}.csv`, headers, data);
  } else {
    const headers = ['M.R. Name', 'Area', 'Sale Bills', 'Return Bills', 'Total Bills', 'Qty Sold', 'Free Qty', 'Gross Amount', 'Discount', 'Taxable Value', 'GST / Tax', 'Sale Amount', 'Return Amount', 'Final Net Amount'];
    const data: (string | number)[][] = [];
    let totSaleB = 0, totRetB = 0, totB = 0, totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totSale = 0, totRet = 0, totNet = 0;

    for (const r of rows) {
      totSaleB += Number(r.sale_bills || 0);
      totRetB += Number(r.return_bills || 0);
      totB += Number(r.total_bills || 0);
      totQty += Number(r.qty || 0);
      totFree += Number(r.free_qty || 0);
      totGross += Number(r.gross_amt || 0);
      totDisc += Number(r.disc_amt || 0);
      totTaxable += Number(r.taxable || 0);
      totTax += Number(r.tax || 0);
      totSale += Number(r.sale_amt || 0);
      totRet += Number(r.return_amt || 0);
      totNet += Number(r.net_amt || 0);

      data.push([
        r.mr_name || '',
        r.mr_area || '',
        r.sale_bills || 0,
        r.return_bills || 0,
        r.total_bills || 0,
        f2(r.qty),
        f2(r.free_qty),
        f2(r.gross_amt),
        f2(r.disc_amt),
        f2(r.taxable),
        f2(r.tax),
        f2(r.sale_amt),
        f2(r.return_amt),
        f2(r.net_amt),
      ]);
    }
    data.push(['GRAND TOTAL', '', totSaleB, totRetB, totB, f2(totQty), f2(totFree), f2(totGross), f2(totDisc), f2(totTaxable), f2(totTax), f2(totSale), f2(totRet), f2(totNet)]);
    downloadCsv(`MR_Wise_Sale_Summary_${from}_to_${to}.csv`, headers, data);
  }
}

async function printMrSaleHtml(rows: any[], mode: 'summary' | 'items', from: string, to: string, mrLabel: string) {
  let company: any = {};
  try { company = await api('/company'); } catch {}

  const title = mode === 'items' ? 'M.R. + ALL ITEM SALE REPORT' : 'M.R. WISE SALE REPORT (SUMMARY)';
  let tableHtml = '';

  if (mode === 'items') {
    // Group by MR
    const groups = new Map<string, any[]>();
    for (const r of rows) {
      const k = r.mr_name || '(No M.R. / Direct)';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(r);
    }

    let totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totNet = 0;

    tableHtml = `<table class="grid" style="width:100%; font-size:12px; font-family:'Courier New', monospace; border-collapse:collapse;" border="1">
      <thead>
        <tr style="background:#003366; color:#fff;">
          <th>Item Name</th><th>Pack</th><th>Company</th><th>Batch</th><th>Exp</th>
          <th style="text-align:right">Qty</th><th style="text-align:right">Free</th><th style="text-align:right">Rate</th>
          <th style="text-align:right">Gross</th><th style="text-align:right">Disc</th><th style="text-align:right">Taxable</th><th style="text-align:right">Tax</th><th style="text-align:right">Net Amount</th>
        </tr>
      </thead>
      <tbody>`;

    for (const [mrName, items] of groups.entries()) {
      let gQty = 0, gFree = 0, gGross = 0, gDisc = 0, gTaxable = 0, gTax = 0, gNet = 0;
      tableHtml += `<tr style="background:#eef3fa; font-weight:bold;"><td colspan="13">M.R.: ${esc(mrName)} &nbsp;|&nbsp; Area: ${esc(items[0]?.mr_area || 'N/A')} &nbsp; (${items.length} Items)</td></tr>`;
      for (const it of items) {
        gQty += Number(it.qty || 0); gFree += Number(it.free_qty || 0); gGross += Number(it.gross_amt || 0);
        gDisc += Number(it.disc_amt || 0); gTaxable += Number(it.taxable || 0); gTax += Number(it.tax || 0); gNet += Number(it.net_amt || 0);

        tableHtml += `<tr>
          <td>${esc(it.item_name)}</td><td>${esc(it.pack)}</td><td>${esc(it.company)}</td><td>${esc(it.batch)}</td><td>${esc(it.expiry)}</td>
          <td style="text-align:right">${f2(it.qty)}</td><td style="text-align:right">${f2(it.free_qty)}</td><td style="text-align:right">${f2(it.rate)}</td>
          <td style="text-align:right">${money(it.gross_amt)}</td><td style="text-align:right">${money(it.disc_amt)}</td>
          <td style="text-align:right">${money(it.taxable)}</td><td style="text-align:right">${money(it.tax)}</td><td style="text-align:right"><b>${money(it.net_amt)}</b></td>
        </tr>`;
      }
      tableHtml += `<tr style="background:#fff9c4; font-weight:bold;">
        <td colspan="5">SUBTOTAL FOR ${esc(mrName)}</td>
        <td style="text-align:right">${f2(gQty)}</td><td style="text-align:right">${f2(gFree)}</td><td></td>
        <td style="text-align:right">${money(gGross)}</td><td style="text-align:right">${money(gDisc)}</td>
        <td style="text-align:right">${money(gTaxable)}</td><td style="text-align:right">${money(gTax)}</td><td style="text-align:right">${money(gNet)}</td>
      </tr>`;

      totQty += gQty; totFree += gFree; totGross += gGross; totDisc += gDisc; totTaxable += gTaxable; totTax += gTax; totNet += gNet;
    }

    tableHtml += `<tr style="background:#e8f5e9; font-weight:bold; font-size:13px;">
      <td colspan="5">GRAND TOTAL (${rows.length} Items)</td>
      <td style="text-align:right">${f2(totQty)}</td><td style="text-align:right">${f2(totFree)}</td><td></td>
      <td style="text-align:right">${money(totGross)}</td><td style="text-align:right">${money(totDisc)}</td>
      <td style="text-align:right">${money(totTaxable)}</td><td style="text-align:right">${money(totTax)}</td><td style="text-align:right">${money(totNet)}</td>
    </tr></tbody></table>`;
  } else {
    let totSaleB = 0, totRetB = 0, totB = 0, totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totSale = 0, totRet = 0, totNet = 0;

    tableHtml = `<table class="grid" style="width:100%; font-size:12px; font-family:'Courier New', monospace; border-collapse:collapse;" border="1">
      <thead>
        <tr style="background:#003366; color:#fff;">
          <th>M.R. / Salesman</th><th>Area</th><th style="text-align:right">Sale Bills</th><th style="text-align:right">Returns</th>
          <th style="text-align:right">Total Bills</th><th style="text-align:right">Qty</th><th style="text-align:right">Free</th>
          <th style="text-align:right">Gross Amt</th><th style="text-align:right">Discount</th><th style="text-align:right">Taxable</th>
          <th style="text-align:right">GST / Tax</th><th style="text-align:right">Sale Amt</th><th style="text-align:right">Return Amt</th><th style="text-align:right">Net Amount</th>
        </tr>
      </thead>
      <tbody>`;

    for (const r of rows) {
      totSaleB += Number(r.sale_bills || 0); totRetB += Number(r.return_bills || 0); totB += Number(r.total_bills || 0);
      totQty += Number(r.qty || 0); totFree += Number(r.free_qty || 0); totGross += Number(r.gross_amt || 0);
      totDisc += Number(r.disc_amt || 0); totTaxable += Number(r.taxable || 0); totTax += Number(r.tax || 0);
      totSale += Number(r.sale_amt || 0); totRet += Number(r.return_amt || 0); totNet += Number(r.net_amt || 0);

      tableHtml += `<tr>
        <td><b>${esc(r.mr_name)}</b></td><td>${esc(r.mr_area)}</td><td style="text-align:right">${r.sale_bills || 0}</td>
        <td style="text-align:right">${r.return_bills || 0}</td><td style="text-align:right">${r.total_bills || 0}</td>
        <td style="text-align:right">${f2(r.qty)}</td><td style="text-align:right">${f2(r.free_qty)}</td>
        <td style="text-align:right">${money(r.gross_amt)}</td><td style="text-align:right">${money(r.disc_amt)}</td>
        <td style="text-align:right">${money(r.taxable)}</td><td style="text-align:right">${money(r.tax)}</td>
        <td style="text-align:right">${money(r.sale_amt)}</td><td style="text-align:right">${money(r.return_amt)}</td>
        <td style="text-align:right"><b>${money(r.net_amt)}</b></td>
      </tr>`;
    }

    tableHtml += `<tr style="background:#e8f5e9; font-weight:bold; font-size:13px;">
      <td colspan="2">GRAND TOTAL (${rows.length} M.R.s)</td>
      <td style="text-align:right">${totSaleB}</td><td style="text-align:right">${totRetB}</td><td style="text-align:right">${totB}</td>
      <td style="text-align:right">${f2(totQty)}</td><td style="text-align:right">${f2(totFree)}</td>
      <td style="text-align:right">${money(totGross)}</td><td style="text-align:right">${money(totDisc)}</td>
      <td style="text-align:right">${money(totTaxable)}</td><td style="text-align:right">${money(totTax)}</td>
      <td style="text-align:right">${money(totSale)}</td><td style="text-align:right">${money(totRet)}</td>
      <td style="text-align:right">${money(totNet)}</td>
    </tr></tbody></table>`;
  }

  const html = `
    <div style="font-family:'Courier New', monospace; padding:10px;">
      <h2 style="text-align:center; margin:0 0 4px 0;">${esc(company.name || '')}</h2>
      <h3 style="text-align:center; margin:0 0 6px 0;">${title}</h3>
      <div style="text-align:center; font-size:13px; color:#555; margin-bottom:12px;">
        Period: <b>${dmy(from)}</b> to <b>${dmy(to)}</b> &nbsp;|&nbsp; Selected M.R.: <b>${esc(mrLabel)}</b>
      </div>
      ${tableHtml}
    </div>
  `;

  import('./billing.ts').then((mod) => mod.printHtml(html, 1));
}

async function showMrSaleScreen(params: {
  from: string; to: string; mr_id: string; mr_name: string; mode: 'summary' | 'items'
}) {
  let curFrom = params.from;
  let curTo = params.to;
  let curMrId = params.mr_id;
  let curMrName = params.mr_name;
  let curMode: 'summary' | 'items' = params.mode;

  const w = openWin(curMode === 'items' ? 'M.R. + ALL ITEMS REPORT' : 'M.R. WISE SALE REPORT', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>1/F5</b>-Summary</span><span><b>2/F6</b>-MR+All Items</span><span><b>Enter</b>-Drilldown</span><span><b>F2</b>-Period</span><span><b>F3</b>-MR Filter</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Close</span>');

  const screen = h('div', { class: 'mr-sale-screen' });

  const bar = margBar(curMode === 'items' ? `M.R. + ALL ITEM SALE REPORT [ ${dmy(curFrom)} - ${dmy(curTo)} ]` : `M.R. WISE SALE REPORT [ ${dmy(curFrom)} - ${dmy(curTo)} ]`);
  addExportToMargBar(bar, {
    onExcel: () => exportExcel(),
    onPdf: () => printReport(),
  });
  screen.append(bar);

  const topControls = h('div', { class: 'mr-sale-top' });
  topControls.innerHTML = `
    <div class="mr-sale-modes">
      <span style="font-weight:bold;margin-right:4px;">Format:</span>
      <button type="button" class="btn-mode ${curMode === 'summary' ? 'sel' : ''}" data-m="summary">📊 [1/F5] M.R. Wise Summary</button>
      <button type="button" class="btn-mode ${curMode === 'items' ? 'sel' : ''}" data-m="items">📦 [2/F6] M.R. + All Items</button>
    </div>
    <div class="mr-sale-info">
      <span>Period: <b>${dmy(curFrom)}</b> to <b>${dmy(curTo)}</b></span>
      <button type="button" class="btn-action" data-a="period">📅 Date (F2)</button>
      <span>M.R.: <b>${esc(curMrName || '<ALL>')}</b></span>
      <button type="button" class="btn-action" data-a="pickmr">👤 Filter M.R. (F3)</button>
      <div class="mr-sale-find"><span>Find &gt;&gt;</span> [ <input autocomplete="off" spellcheck="false" placeholder="Filter text..."> ]</div>
    </div>
  `;
  screen.append(topControls);

  const gridWrap = h('div', { class: 'mr-sale-grid-wrap' });
  screen.append(gridWrap);
  w.body.append(screen);

  const findInp = topControls.querySelector('.mr-sale-find input') as HTMLInputElement;
  const modeBtns = topControls.querySelectorAll<HTMLButtonElement>('.btn-mode');

  let rowsData: any[] = [];
  let selectedRowIndex = 0;

  async function load() {
    gridWrap.innerHTML = '<div style="padding:24px;text-align:center;font-size:16px;">Loading M.R. Sale Data...</div>';
    const mrParam = curMrId ? `&mr_id=${encodeURIComponent(curMrId)}` : '';
    rowsData = await api<any[]>(`/reports/mr-sale?from=${curFrom}&to=${curTo}&mode=${curMode}${mrParam}`);
    selectedRowIndex = 0;
    render();
  }

  function render() {
    const titleText = curMode === 'items' ? `M.R. + ALL ITEM SALE REPORT [ ${dmy(curFrom)} - ${dmy(curTo)} ]` : `M.R. WISE SALE REPORT [ ${dmy(curFrom)} - ${dmy(curTo)} ]`;
    const titleEl = bar.querySelector('.marg-bar-title');
    if (titleEl) titleEl.textContent = titleText;

    modeBtns.forEach((b) => b.classList.toggle('sel', b.dataset.m === curMode));

    const q = findInp.value.trim().toLowerCase();

    if (curMode === 'items') {
      let filtered = rowsData;
      if (q) {
        filtered = filtered.filter((r) =>
          String(r.mr_name || '').toLowerCase().includes(q) ||
          String(r.item_name || '').toLowerCase().includes(q) ||
          String(r.company || '').toLowerCase().includes(q) ||
          String(r.batch || '').toLowerCase().includes(q) ||
          String(r.mr_area || '').toLowerCase().includes(q)
        );
      }

      if (!filtered.length) {
        gridWrap.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">No items found for the selected M.R. and period.</div>';
        return;
      }

      // Group by MR
      const groups = new Map<string, any[]>();
      for (const r of filtered) {
        const k = r.mr_name || '(No M.R. / Direct)';
        if (!groups.has(k)) groups.set(k, []);
        groups.get(k)!.push(r);
      }

      let totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totNet = 0;
      let allItemIndex = 0;

      let html = `<table class="mr-sale-table">
        <thead>
          <tr>
            <th>Item Name</th><th>Pack</th><th>Company</th><th>Batch</th><th>Exp</th>
            <th class="n">Bills</th><th class="n">Qty</th><th class="n">Free</th><th class="n">Avg Rate</th>
            <th class="n">Gross Amt</th><th class="n">Disc Amt</th><th class="n">Taxable</th><th class="n">Tax Amt</th><th class="n">Net Amount</th>
          </tr>
        </thead>
        <tbody>`;

      for (const [mrName, items] of groups.entries()) {
        let gQty = 0, gFree = 0, gGross = 0, gDisc = 0, gTaxable = 0, gTax = 0, gNet = 0;
        html += `<tr class="mr-group-hdr"><td colspan="14">M.R.: ${esc(mrName)} &nbsp;|&nbsp; Area: ${esc(items[0]?.mr_area || 'N/A')} &nbsp;|&nbsp; (${items.length} Items Sold)</td></tr>`;

        for (const it of items) {
          gQty += Number(it.qty || 0); gFree += Number(it.free_qty || 0); gGross += Number(it.gross_amt || 0);
          gDisc += Number(it.disc_amt || 0); gTaxable += Number(it.taxable || 0); gTax += Number(it.tax || 0); gNet += Number(it.net_amt || 0);

          const itemIdx = allItemIndex++;
          html += `<tr class="mr-item-tr ${itemIdx === selectedRowIndex ? 'selected' : ''}" data-idx="${itemIdx}" data-id="${it.item_id}" data-name="${esc(it.item_name)}" style="cursor:pointer;">
            <td><b>${esc(it.item_name)}</b></td><td>${esc(it.pack)}</td><td>${esc(it.company)}</td><td>${esc(it.batch)}</td><td>${esc(it.expiry)}</td>
            <td class="n">${it.bills_count || 0}</td><td class="n">${f2(it.qty)}</td><td class="n">${f2(it.free_qty)}</td><td class="n">${f2(it.rate)}</td>
            <td class="n">${money(it.gross_amt)}</td><td class="n">${money(it.disc_amt)}</td>
            <td class="n">${money(it.taxable)}</td><td class="n">${money(it.tax)}</td><td class="n"><b>${money(it.net_amt)}</b></td>
          </tr>`;
        }

        html += `<tr class="mr-subtotal-tr">
          <td colspan="6">SUBTOTAL FOR ${esc(mrName)}</td>
          <td class="n">${f2(gQty)}</td><td class="n">${f2(gFree)}</td><td></td>
          <td class="n">${money(gGross)}</td><td class="n">${money(gDisc)}</td>
          <td class="n">${money(gTaxable)}</td><td class="n">${money(gTax)}</td><td class="n">${money(gNet)}</td>
        </tr>`;

        totQty += gQty; totFree += gFree; totGross += gGross; totDisc += gDisc; totTaxable += gTaxable; totTax += gTax; totNet += gNet;
      }

      html += `<tr class="mr-grandtotal-tr">
        <td colspan="6">GRAND TOTAL (${filtered.length} Items)</td>
        <td class="n">${f2(totQty)}</td><td class="n">${f2(totFree)}</td><td></td>
        <td class="n">${money(totGross)}</td><td class="n">${money(totDisc)}</td>
        <td class="n">${money(totTaxable)}</td><td class="n">${money(totTax)}</td><td class="n">${money(totNet)}</td>
      </tr></tbody></table>`;

      gridWrap.innerHTML = html;

      gridWrap.querySelectorAll<HTMLTableRowElement>('.mr-item-tr').forEach((tr) => {
        tr.addEventListener('click', () => {
          selectedRowIndex = Number(tr.dataset.idx || 0);
          gridWrap.querySelectorAll('.mr-item-tr').forEach((x, i) => x.classList.toggle('selected', i === selectedRowIndex));
        });
        tr.addEventListener('dblclick', () => {
          const itemId = tr.dataset.id;
          const itemName = tr.dataset.name;
          if (itemId || itemName) singleProductSale(itemId || itemName, curFrom, curTo);
        });
      });
    } else {
      let filtered = rowsData;
      if (q) {
        filtered = filtered.filter((r) =>
          String(r.mr_name || '').toLowerCase().includes(q) ||
          String(r.mr_area || '').toLowerCase().includes(q)
        );
      }

      if (!filtered.length) {
        gridWrap.innerHTML = '<div style="padding:24px;text-align:center;color:#666;">No sales records found for M.R.s in this period.</div>';
        return;
      }

      let totSaleB = 0, totRetB = 0, totB = 0, totQty = 0, totFree = 0, totGross = 0, totDisc = 0, totTaxable = 0, totTax = 0, totSale = 0, totRet = 0, totNet = 0;

      let html = `<table class="mr-sale-table">
        <thead>
          <tr>
            <th>M.R. / Salesman</th><th>Area</th><th class="n">Sale Bills</th><th class="n">Returns</th>
            <th class="n">Total Bills</th><th class="n">Qty</th><th class="n">Free</th>
            <th class="n">Gross Amt</th><th class="n">Discount</th><th class="n">Taxable</th>
            <th class="n">GST / Tax</th><th class="n">Sale Amt</th><th class="n">Return Amt</th><th class="n">Final Net Amt</th>
          </tr>
        </thead>
        <tbody>`;

      filtered.forEach((r, idx) => {
        totSaleB += Number(r.sale_bills || 0); totRetB += Number(r.return_bills || 0); totB += Number(r.total_bills || 0);
        totQty += Number(r.qty || 0); totFree += Number(r.free_qty || 0); totGross += Number(r.gross_amt || 0);
        totDisc += Number(r.disc_amt || 0); totTaxable += Number(r.taxable || 0); totTax += Number(r.tax || 0);
        totSale += Number(r.sale_amt || 0); totRet += Number(r.return_amt || 0); totNet += Number(r.net_amt || 0);

        html += `<tr class="${idx === selectedRowIndex ? 'selected' : ''}" data-idx="${idx}" data-id="${r.mr_id}" data-name="${esc(r.mr_name)}">
          <td><b>${esc(r.mr_name)}</b></td><td>${esc(r.mr_area)}</td><td class="n">${r.sale_bills || 0}</td>
          <td class="n">${r.return_bills || 0}</td><td class="n">${r.total_bills || 0}</td>
          <td class="n">${f2(r.qty)}</td><td class="n">${f2(r.free_qty)}</td>
          <td class="n">${money(r.gross_amt)}</td><td class="n">${money(r.disc_amt)}</td>
          <td class="n">${money(r.taxable)}</td><td class="n">${money(r.tax)}</td>
          <td class="n">${money(r.sale_amt)}</td><td class="n">${money(r.return_amt)}</td>
          <td class="n"><b>${money(r.net_amt)}</b></td>
        </tr>`;
      });

      html += `<tr class="mr-grandtotal-tr">
        <td colspan="2">GRAND TOTAL (${filtered.length} M.R.s)</td>
        <td class="n">${totSaleB}</td><td class="n">${totRetB}</td><td class="n">${totB}</td>
        <td class="n">${f2(totQty)}</td><td class="n">${f2(totFree)}</td>
        <td class="n">${money(totGross)}</td><td class="n">${money(totDisc)}</td>
        <td class="n">${money(totTaxable)}</td><td class="n">${money(totTax)}</td>
        <td class="n">${money(totSale)}</td><td class="n">${money(totRet)}</td>
        <td class="n">${money(totNet)}</td>
      </tr></tbody></table>`;

      gridWrap.innerHTML = html;

      // Handle row selection and double click
      gridWrap.querySelectorAll('tbody tr[data-idx]').forEach((tr) => {
        tr.addEventListener('click', () => {
          selectedRowIndex = Number((tr as HTMLElement).dataset.idx || 0);
          render();
        });
        tr.addEventListener('dblclick', () => {
          const id = (tr as HTMLElement).dataset.id || '';
          const name = (tr as HTMLElement).dataset.name || '';
          drillDownItems(id, name);
        });
      });
    }
  }

  function drillDownItems(mrId: string, mrName: string) {
    curMrId = mrId;
    curMrName = mrName;
    curMode = 'items';
    toast(`Drilling down to items for ${mrName}`);
    load();
  }

  function exportExcel() {
    exportMrSaleExcel(rowsData, curMode, curFrom, curTo, curMrName);
  }

  function printReport() {
    printMrSaleHtml(rowsData, curMode, curFrom, curTo, curMrName);
  }

  async function openPeriodModal() {
    const res = await askMrSaleParams({ from: curFrom, to: curTo, mr_id: curMrId, mr_name: curMrName, mode: curMode });
    if (!res) return;
    curFrom = res.from;
    curTo = res.to;
    curMrId = res.mr_id;
    curMrName = res.mr_name;
    curMode = res.mode;
    if (res.action === 'excel') {
      const data = await api<any[]>(`/reports/mr-sale?from=${curFrom}&to=${curTo}&mode=${curMode}${curMrId ? `&mr_id=${curMrId}` : ''}`);
      exportMrSaleExcel(data, curMode, curFrom, curTo, curMrName);
      return;
    }
    if (res.action === 'print') {
      const data = await api<any[]>(`/reports/mr-sale?from=${curFrom}&to=${curTo}&mode=${curMode}${curMrId ? `&mr_id=${curMrId}` : ''}`);
      printMrSaleHtml(data, curMode, curFrom, curTo, curMrName);
      return;
    }
    load();
  }

  modeBtns.forEach((b) => {
    b.addEventListener('click', () => {
      curMode = (b.dataset.m || 'summary') as any;
      load();
    });
  });

  async function chooseMr() {
    const chosen = await pickSalesman(true);
    if (chosen) {
      curMrId = String(chosen.id);
      curMrName = chosen.name;
      const mrB = topControls.querySelector('.mr-sale-info span:nth-of-type(2) b');
      if (mrB) mrB.textContent = curMrName;
      load();
    }
  }

  async function choosePeriod() {
    const res = await askPeriod(curFrom, curTo);
    if (res) {
      curFrom = res.from;
      curTo = res.to;
      const periodB = topControls.querySelector('.mr-sale-info span:nth-of-type(1) b');
      if (periodB) periodB.textContent = `${dmy(curFrom)} to ${dmy(curTo)}`;
      load();
    }
  }

  topControls.querySelectorAll('button[data-a]').forEach((b) => {
    b.addEventListener('click', () => {
      const act = (b as HTMLElement).dataset.a;
      if (act === 'period') choosePeriod();
      else if (act === 'pickmr') chooseMr();
    });
  });

  findInp.addEventListener('input', () => render());

  w.onKey = (_e, k) => {
    if (k === '1' || k === 'F5') {
      curMode = 'summary';
      load();
      return true;
    }
    if (k === '2' || k === 'F6') {
      curMode = 'items';
      load();
      return true;
    }
    if (k === 'F2') {
      choosePeriod();
      return true;
    }
    if (k === 'F3') {
      chooseMr();
      return true;
    }
    if (k === 'Alt+X') {
      exportExcel();
      return true;
    }
    if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') {
      printReport();
      return true;
    }
    if (k === 'ArrowDown') {
      const max = gridWrap.querySelectorAll('tbody tr[data-idx]').length - 1;
      if (selectedRowIndex < max) { selectedRowIndex++; render(); }
      return true;
    }
    if (k === 'ArrowUp') {
      if (selectedRowIndex > 0) { selectedRowIndex--; render(); }
      return true;
    }
    if (k === 'Enter') {
      if (curMode === 'summary') {
        const tr = gridWrap.querySelector(`tbody tr[data-idx="${selectedRowIndex}"]`) as HTMLElement;
        if (tr) {
          drillDownItems(tr.dataset.id || '', tr.dataset.name || '');
          return true;
        }
      } else if (curMode === 'items') {
        const tr = gridWrap.querySelector(`tbody tr.mr-item-tr[data-idx="${selectedRowIndex}"]`) as HTMLElement;
        if (tr) {
          const itemId = tr.dataset.id;
          const itemName = tr.dataset.name;
          if (itemId || itemName) singleProductSale(itemId || itemName, curFrom, curTo);
          return true;
        }
      }
    }
    if (k === 'Escape') {
      if (curMode === 'items' && curMrId !== 'all') {
        curMrId = 'all';
        curMrName = '<ALL>';
        curMode = 'summary';
        toast('Returning to All M.R. summary');
        load();
        return true;
      }
      w.close();
      return true;
    }
    return false;
  };

  await load();
  findInp.focus();
}

/**
 * Main Entry for Reports -> Sale Analysis -> M.R. Wise Sale and M.R. / All Items
 */
export async function mrSaleReport(modeParam?: string, initialMrId?: string | number) {
  let curMode: 'summary' | 'items' = modeParam === 'items' ? 'items' : 'summary';
  let curFrom = fyStart();
  let curTo = today();
  let curMrId = initialMrId ? String(initialMrId) : 'all';
  let curMrName = '<ALL M.R.>';

  if (modeParam === 'month') {
    return summary('SALE/mr/month');
  }

  if (initialMrId) {
    curMrId = String(initialMrId);
    try {
      const salesmen = await api<any[]>('/salesmen');
      const found = salesmen.find((s) => String(s.id) === String(initialMrId));
      if (found) curMrName = found.name;
    } catch {}
    curMode = 'items';
  } else if (modeParam === 'single') {
    const chosenMr = await pickSalesman(false);
    if (!chosenMr) return;
    curMrId = String(chosenMr.id);
    curMrName = chosenMr.name;
    curMode = 'items';
  } else if (modeParam === 'items') {
    const chosenMr = await pickSalesman(true);
    if (!chosenMr) return;
    curMrId = String(chosenMr.id);
    curMrName = chosenMr.name;
    curMode = 'items';
  }

  showMrSaleScreen({
    from: curFrom,
    to: curTo,
    mr_id: curMrId,
    mr_name: curMrName,
    mode: curMode,
  });
}

export async function creditLimitsManagement() {
  const all = await api<any[]>('/reports/ledger-accounts');
  const debtors = all.filter((l) => l.group_name === 'Sundry Debtors' || l.group_name === 'Sundry Creditors' || Number(l.credit_limit || 0) > 0);
  return reportWin<any>({
    title: "LIVE CREDIT LIMIT'S MANAGEMENT",
    period: false,
    cols: [
      { title: 'Party Name', get: (r) => r.name, width: '35%' },
      { title: 'Station', get: (r) => r.city || '', width: '20%' },
      { title: 'Group', get: (r) => r.group_name, width: '15%' },
      { title: 'Cr. Limit', get: (r) => (Number(r.credit_limit || 0) > 0 ? money(r.credit_limit) : '-'), num: true, width: '15%' },
      { title: 'Balance', get: (r) => drcr(r.balance), num: true, width: '15%' },
    ],
    search: (r) => `${r.name} ${r.city ?? ''}`,
    load: async () => {
      const data = await api<any[]>('/reports/ledger-accounts');
      return data.filter((l) => l.group_name === 'Sundry Debtors' || l.group_name === 'Sundry Creditors' || Number(l.credit_limit || 0) > 0);
    },
    footer: (rows) => {
      const totLim = rows.reduce((s, r) => s + Number(r.credit_limit || 0), 0);
      const totBal = rows.reduce((s, r) => s + Number(r.balance || 0), 0);
      return `<tr class="total"><td colspan="3"><b>Total (${rows.length} Parties)</b></td><td class="n"><b>${money(totLim)}</b></td><td class="n"><b>${drcr(totBal)}</b></td></tr>`;
    },
    onEnter: (r) => {
      import('./ledgerform.ts').then((m) => m.ledgerScreen(r)).then(() => creditLimitsManagement());
    },
    extraFoot: '<span><b>Enter/F3</b> Modify Limit</span>',
  });
}
