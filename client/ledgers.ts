// LEDGER ACCOUNTS (Books → All Ledgers, Alt+L) — modelled on MARG ERP 9+: the ledger list
// with DEBIT / CREDIT balances "Upto" a date, the Address and Current Status panels, the
// CUSTOMER STATUS panel, and Enter → LEDGER DISPLAY (FROM / TO, then Ledger · Monthly ·
// Daily · Summary · Cancel). As in MARG, Enter on a transaction opens it.
import { api, esc, toast, h, today, money, openWin, fyStart } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { statusHtml, type Status } from './receipt.ts';
import { canAction } from './session.ts';
import { ledgerForm, type Ledger } from './masters.ts';

interface Acc {
  id: number; name: string; city: string; address: string; phone: string; gstin: string; state: string; group_name: string;
  opening: number; debit: number; credit: number; balance: number; has_due: boolean;
}
interface Entry { source: 'BILL' | 'VOUCHER'; source_id: number; date: string; vtype: string; vno: string; debit: number; credit: number; narration: string; against: string }

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const r2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const drcr = (n: number) => (Math.abs(n) < 0.005 ? '' : `${f2(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`);
const CASH_BANK = ['Cash-in-hand', 'Bank Accounts'];
const VT: Record<string, string> = {
  SALE: 'Sale', COUNTER_SALE: 'Cntr', SALE_CHALLAN: 'S.Ch', PURCHASE: 'Purc', PURCHASE_CHALLAN: 'P.Ch', SALE_RETURN: 'S.Rt',
  PURCHASE_RETURN: 'P.Rt', RECEIPT: 'Rcpt', PAYMENT: 'Pymt', CONTRA: 'Ctra', JOURNAL: 'Jrnl', DEBIT_NOTE: 'D.N.', CREDIT_NOTE: 'C.N.',
};

// ------------------------------------------------------------------ LEDGER ACCOUNTS
export async function allLedgers() {
  let upto = today();
  const company = await api<any>('/company');
  const w = openWin('LEDGER ACCOUNTS', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Date</span><span><b>F3</b>-Edit</span><span><b>Tab</b>-Search</span><span><b>F10</b>-Filter</span><span><b>Alt+P</b>-Print</span>');
  const screen = h('div', { class: 'la-screen' });
  screen.innerHTML = `
    <div class="la-main">
      <div class="la-top"><span>${esc(company.name)}</span><span class="upto"></span></div>
      <div class="la-cols"><span></span><span>DEBIT</span><span>CREDIT</span></div>
      <div class="la-rows"></div>
      <div class="la-panels">
        <div class="addr"><div class="cap">Address</div><div class="body"></div></div>
        <div class="cur"><div class="cap">Current Status</div><div class="body"></div>
          <div class="find"><span>Name ? &gt;&gt;</span><span>[</span><input autocomplete="off"><span>]</span></div></div>
      </div>
    </div>
    <div class="rv-status"></div>`;
  screen.prepend(margBar('LEDGER ACCOUNTS'));
  w.body.append(screen);
  const rowsBox = screen.querySelector('.la-rows') as HTMLElement;
  const find = screen.querySelector('.find input') as HTMLInputElement;
  let all: Acc[] = [];
  let view: Acc[] = [];
  let sel = 0;
  let balanceOnly = false;

  const load = async () => {
    all = await api<Acc[]>(`/reports/ledger-accounts?upto=${upto}`);
    filter();
  };
  function filter() {
    const q = find.value.trim().toLowerCase();
    const base = balanceOnly ? all.filter((a) => Math.abs(a.balance) > 0.004) : all;
    view = !q ? base : [...base.filter((a) => a.name.toLowerCase().startsWith(q)), ...base.filter((a) => !a.name.toLowerCase().startsWith(q) && a.name.toLowerCase().includes(q))];
    sel = Math.min(sel, Math.max(0, view.length - 1));
    if (q) sel = 0;
    draw();
  }
  let statusSeq = 0;
  function draw() {
    (screen.querySelector('.upto') as HTMLElement).textContent = `Upto : ${dmy(upto)}`;
    rowsBox.innerHTML = view.map((a, i) => `<div class="r${i === sel ? ' sel' : ''}${a.has_due ? ' due' : ''}${CASH_BANK.includes(a.group_name) ? ' cb' : ''}" data-i="${i}">
      <span class="nm">${esc(a.name.toUpperCase())}</span><span class="st">${esc((a.city ?? '').toUpperCase())}</span>
      <span class="n">${a.balance > 0.004 ? f2(a.balance) : ''}</span><span class="n">${a.balance < -0.004 ? f2(-a.balance) : ''}</span></div>`).join('');
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const a = view[sel];
    (screen.querySelector('.addr .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="ad">${esc((a.address || a.name).toUpperCase())}</div>
      <div class="g"><span>Phone:</span><span>${esc(a.phone ?? '')}</span><span></span><span></span></div>
      <div class="g"><span>DL.No:</span><span></span><span>GSTN :</span><span>${esc(a.gstin ?? '')}</span></div>
      <div class="g"><span>Area :</span><span></span><span>Route:</span><span></span></div>
      <div class="g"><span>M.R. :</span><span></span><span>State:</span><span>${esc((a.state ?? '').toUpperCase())}</span></div>`;
    (screen.querySelector('.cur .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="kv"><span>Opening :</span><b>${drcr(a.opening)}</b></div>
      <div class="kv"><span>Debit &nbsp;&nbsp;:</span><b>${f2(a.debit)} Dr</b></div>
      <div class="kv"><span>Credit &nbsp;:</span><b>${f2(a.credit)} Cr</b></div>
      <div class="kv"><span>Balance :</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>P.D.C. &nbsp;:</span><b></b></div>
      <div class="kv"><span>Net &nbsp;&nbsp;&nbsp;&nbsp;:</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>Type &nbsp;&nbsp;&nbsp;:</span><b>${esc(a.group_name)}</b></div>`;
    const panel = screen.querySelector('.rv-status') as HTMLElement;
    const seq = ++statusSeq;
    if (!a) { panel.innerHTML = ''; return; }
    setTimeout(() => {   // only fetch for the line the cursor stops on
      if (seq !== statusSeq) return;
      api<Status>(`/ledgers/${a.id}/status`).then((s) => { if (seq === statusSeq) panel.innerHTML = statusHtml(s); }).catch(() => {});
    }, 150);
  }

  function printList() {
    const html = `<h2>${esc(company.name)}</h2><h3 style="text-align:center">LEDGER ACCOUNTS &nbsp; Upto ${dmy(upto)}</h3>
      <table class="grid"><tr><th>Ledger</th><th>Station</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      ${view.map((a) => `<tr><td>${esc(a.name)}</td><td>${esc(a.city ?? '')}</td><td class="n">${a.balance > 0.004 ? money(a.balance) : ''}</td><td class="n">${a.balance < -0.004 ? money(-a.balance) : ''}</td></tr>`).join('')}
      <tr class="total"><td colspan="2"><b>Total</b></td><td class="n"><b>${money(view.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0))}</b></td>
        <td class="n"><b>${money(-view.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0))}</b></td></tr></table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  find.addEventListener('input', filter);
  rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); find.focus(); } });
  rowsBox.addEventListener('dblclick', () => view[sel] && ledgerDisplay(view[sel] as unknown as Ledger, upto));
  w.onKey = (_e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'Ctrl+End') { sel = Math.max(0, view.length - 1); draw(); return true; }
    if (k === 'Enter' && view[sel]) { ledgerDisplay(view[sel] as unknown as Ledger, upto); return true; }
    if (k === 'F2') { askUpto(upto).then((d) => { if (d) { upto = d; load(); } }); return true; }
    if (k === 'F3' && view[sel]) {
      if (!canAction('ledger.list')) { toast('Access denied — your role cannot edit ledgers', true); return true; }
      api<Ledger>(`/ledgers/${view[sel].id}`).then((l) => ledgerForm(l)).then((l) => { if (l) load(); });
      return true;
    }
    if (k === 'F10') { balanceOnly = !balanceOnly; toast(balanceOnly ? 'Showing ledgers with a balance only' : 'Showing all ledgers'); filter(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { printList(); return true; }
    if (k === 'Tab') { find.focus(); find.select(); return true; }
    if (k === 'Escape' && find.value) { find.value = ''; filter(); return true; }
    return false;
  };
  await load();
  find.focus();
}

/** F2 on LEDGER ACCOUNTS: the "Upto" date for the balances. */
function askUpto(cur: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = margPop('DATE', '<span><b>Enter</b>-OK</span><span><b>Esc</b>-Cancel</span>', '360px');
    p.body.append(h('div', { class: 'db-period' }, `<div><span>Upto :</span><input value="${dmy(cur)}"></div>`));
    const inp = p.body.querySelector('input') as HTMLInputElement;
    inp.focus(); inp.select();
    p.onKey = (_e, k) => {
      if (k === 'Enter') { const d = isoOf(inp.value); if (!d) { toast('Enter the date as DD-MM-YYYY', true); return true; } p.close(); resolve(d); return true; }
      if (k === 'Escape') { p.close(); resolve(null); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ LEDGER DISPLAY
type View = 'ledger' | 'monthly' | 'daily' | 'summary';
/** LEDGER DISPLAY: FROM / TO, then Ledger · Monthly · Daily · Summary · Cancel. */
export function ledgerDisplay(l: Ledger, to = today()): Promise<void> {
  return new Promise((resolve) => {
    const p = margPop('LEDGER DISPLAY', '<span><b>Enter</b>-Next</span><span><b>L/M/D/S</b>-View</span><span><b>Esc</b>-Cancel</span>', '520px');
    const box = h('div', { class: 'ld-box' });
    box.innerHTML = `<div class="dates"><span>FROM</span><input data-f="from" value="${dmy(fyStart())}"><span>TO</span><input data-f="to" value="${dmy(to)}"></div>
      <div class="btns"><button data-v="ledger"><u>L</u>edger</button><button data-v="monthly"><u>M</u>onthly</button><button data-v="daily"><u>D</u>aily</button>
        <button data-v="summary"><u>S</u>ummary</button><button data-v="cancel"><u>C</u>ancel</button></div>`;
    p.body.append(box);
    const fields = [...box.querySelectorAll('input, button')] as HTMLElement[];
    const go = (v: View | 'cancel') => {
      if (v === 'cancel') { p.close(); resolve(); return; }
      const from = isoOf((fields[0] as HTMLInputElement).value), till = isoOf((fields[1] as HTMLInputElement).value);
      if (!from || !till) { toast('Enter dates as DD-MM-YYYY', true); fields[0].focus(); return; }
      if (from > till) { toast('FROM date is after TO date', true); fields[0].focus(); return; }
      p.close();
      ledgerView(l, v, from, till).finally(resolve);
    };
    box.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) go(b.dataset.v as View | 'cancel'); });
    fields[0].focus(); (fields[0] as HTMLInputElement).select();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el instanceof HTMLButtonElement) {
        if (k === 'ArrowRight' || k === 'Tab') { fields[Math.min(fields.length - 1, i + 1)].focus(); return true; }
        if (k === 'ArrowLeft') { fields[Math.max(2, i - 1)].focus(); return true; }
        if (k === 'Enter') { go(el.dataset.v as View | 'cancel'); return true; }
      } else if (k === 'Enter' || k === 'Tab') { fields[i + 1].focus(); (fields[i + 1] as HTMLInputElement).select?.(); return true; }
      const hit = ({ L: 'ledger', M: 'monthly', D: 'daily', S: 'summary', C: 'cancel' } as Record<string, View | 'cancel'>)[k];
      if (hit && !(el instanceof HTMLInputElement)) { go(hit); return true; }
      if (k === 'Escape') { go('cancel'); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ the four views
interface Line { key: string; cells: string[]; debit: number; credit: number; bal?: number; entry?: Entry; from?: string; to?: string; bold?: boolean }

async function ledgerView(l: Ledger, view: View, from: string, to: string): Promise<void> {
  const d = await api<{ ledger: any; opening: number; rows: Entry[] }>(`/reports/ledger/${l.id}?from=${from}&to=${to}`);
  const company = await api<any>('/company');
  const title = { ledger: 'LEDGER', monthly: 'MONTHLY LEDGER', daily: 'DAILY LEDGER', summary: 'LEDGER SUMMARY' }[view];
  const heads: Record<View, string[]> = {
    ledger: ['DATE', 'PARTICULARS', 'TYPE', 'VCH NO.'],
    monthly: ['MONTH', '', 'ENTRIES', ''],
    daily: ['DATE', 'DAY', 'ENTRIES', ''],
    summary: ['TYPE', '', 'ENTRIES', ''],
  };
  // Build the lines for this view; each keeps the running balance after it.
  let bal = d.opening;
  const lines: Line[] = [{ key: 'open', cells: ['', 'Opening Balance', '', ''], debit: d.opening > 0 ? d.opening : 0, credit: d.opening < 0 ? -d.opening : 0, bal, bold: true }];
  const group = (keyOf: (e: Entry) => string, cells: (k: string, list: Entry[]) => string[], range: (k: string) => [string, string]) => {
    const map = new Map<string, Entry[]>();
    for (const e of d.rows) { const k = keyOf(e); map.set(k, [...(map.get(k) ?? []), e]); }
    for (const [k, list] of map) {
      const dr = r2(list.reduce((s, e) => s + e.debit, 0)), cr = r2(list.reduce((s, e) => s + e.credit, 0));
      bal = r2(bal + dr - cr);
      const [f, t] = range(k);
      lines.push({ key: k, cells: cells(k, list), debit: dr, credit: cr, bal, from: f, to: t });
    }
  };
  const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); const e = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return e > to ? to : e; };
  if (view === 'ledger') {
    for (const e of d.rows) {
      bal = r2(bal + e.debit - e.credit);
      lines.push({ key: `${e.source}${e.source_id}`, cells: [dmy(e.date).slice(0, 5), (e.against || e.narration || '').toUpperCase(), VT[e.vtype] ?? e.vtype, e.vno], debit: e.debit, credit: e.credit, bal, entry: e });
    }
  } else if (view === 'monthly') {
    group((e) => e.date.slice(0, 7), (k, list) => [new Date(`${k}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase(), '', String(list.length), ''],
      (k) => [`${k}-01` < from ? from : `${k}-01`, monthEnd(k)]);
  } else if (view === 'daily') {
    group((e) => e.date, (k, list) => [dmy(k), new Date(`${k}T00:00:00`).toLocaleString('en', { weekday: 'long' }).toUpperCase(), String(list.length), ''], (k) => [k, k]);
  } else {
    // Summary: a condensed ledger — one line per entry type. Its balance column is the closing.
    const map = new Map<string, Entry[]>();
    for (const e of d.rows) map.set(e.vtype, [...(map.get(e.vtype) ?? []), e]);
    for (const [k, list] of map) {
      const dr = r2(list.reduce((s, e) => s + e.debit, 0)), cr = r2(list.reduce((s, e) => s + e.credit, 0));
      lines.push({ key: k, cells: [VT[k] ?? k, '', String(list.length), ''], debit: dr, credit: cr });
    }
    bal = r2(d.opening + d.rows.reduce((s, e) => s + e.debit - e.credit, 0));
  }
  const totDr = r2(d.rows.reduce((s, e) => s + e.debit, 0)), totCr = r2(d.rows.reduce((s, e) => s + e.credit, 0));
  const closing = r2(d.opening + totDr - totCr);

  return new Promise((resolve) => {
    const w = openWin(title, 'full', '');
    w.el.classList.add('marg');
    w.setFoot(`<span><b>Enter</b>-${view === 'ledger' ? 'Open Entry' : view === 'summary' ? '' : 'Open'}</span><span><b>F2</b>-Date</span><span><b>Alt+P</b>-Print</span><span><b>Esc</b>-Exit</span>`);
    const screen = h('div', { class: 'lv-screen' });
    screen.innerHTML = `
      <div class="lv-top"><span class="co">${esc(company.name)}</span><span>Period : ${dmy(from)} - ${dmy(to)}</span></div>
      <div class="lv-name">${esc(l.name.toUpperCase())}${l.city ? ` , ${esc(l.city.toUpperCase())}` : ''}</div>
      <div class="lv-cols">${heads[view].map((x, i) => `<span class="${i === 2 && view !== 'ledger' ? 'n' : ''}">${x}</span>`).join('')}<span class="n">DEBIT</span><span class="n">CREDIT</span><span class="n">${view === 'summary' ? '' : 'BALANCE'}</span></div>
      <div class="lv-rows"></div>
      <div class="lv-foot"><div class="rm"></div><div class="tot"><span>TOTAL :</span><b>${f2(totDr)}</b><b>${f2(totCr)}</b><b></b></div>
        <div class="tot"><span>CLOSING :</span><b>${closing > 0 ? f2(closing) : ''}</b><b>${closing < 0 ? f2(-closing) : ''}</b><b>${drcr(closing)}</b></div></div>`;
    screen.prepend(margBar(title));
    w.body.append(screen);
    const rowsBox = screen.querySelector('.lv-rows') as HTMLElement;
    let sel = Math.min(1, lines.length - 1);
    const draw = () => {
      rowsBox.innerHTML = lines.map((x, i) => `<div class="r${i === sel ? ' sel' : ''}${x.bold ? ' b' : ''}" data-i="${i}">
        ${x.cells.map((c, j) => `<span class="${j === 2 && view !== 'ledger' ? 'n' : ''}">${esc(c)}</span>`).join('')}
        <span class="n">${x.debit ? f2(x.debit) : ''}</span><span class="n">${x.credit ? f2(x.credit) : ''}</span><span class="n">${x.bal != null ? drcr(x.bal) : ''}</span></div>`).join('');
      rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
      const cur = lines[sel];
      (screen.querySelector('.rm') as HTMLElement).textContent = cur?.entry?.narration ? `Narration : ${cur.entry.narration}` : '';
    };
    const open = (x: Line) => {
      if (x.entry) {
        const e = x.entry;
        if (e.source === 'BILL') {
          const bills = lines.filter((y) => y.entry?.source === 'BILL').map((y) => ({ id: y.entry!.source_id, type: y.entry!.vtype }));
          import('./billview.ts').then((m) => m.billAlteration(bills, bills.findIndex((b) => b.id === e.source_id)));
        } else if (canAction(`voucher.list:${e.vtype}`)) import('./vouchers.ts').then((m) => m.voucherEntry(e.vtype, e.source_id));
        else toast('Access denied — your role cannot modify vouchers', true);
      } else if (x.from && x.to) ledgerView(l, 'ledger', x.from, x.to);   // a month / day opens its entries
    };
    const print = () => {
      const html = `<h2>${esc(company.name)}</h2><h3 style="text-align:center">${esc(title)} : ${esc(l.name)} &nbsp; ${dmy(from)} to ${dmy(to)}</h3>
        <table class="grid"><tr>${heads[view].filter(Boolean).map((x) => `<th>${x}</th>`).join('')}<th class="n">Debit</th><th class="n">Credit</th>${view === 'summary' ? '' : '<th class="n">Balance</th>'}</tr>
        ${lines.map((x) => `<tr>${x.cells.filter((_, j) => heads[view][j]).map((c) => `<td>${esc(c)}</td>`).join('')}<td class="n">${x.debit ? money(x.debit) : ''}</td>
          <td class="n">${x.credit ? money(x.credit) : ''}</td>${view === 'summary' ? '' : `<td class="n">${x.bal != null ? drcr(x.bal) : ''}</td>`}</tr>`).join('')}
        <tr class="total"><td colspan="${heads[view].filter(Boolean).length}"><b>Closing Balance</b></td><td class="n"><b>${money(totDr)}</b></td><td class="n"><b>${money(totCr)}</b></td>${view === 'summary' ? '' : `<td class="n"><b>${drcr(closing)}</b></td>`}</tr></table>`;
      import('./billing.ts').then((m) => m.printHtml(html, 1));
    };
    rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); } });
    w.onKey = (_e, k) => {
      const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
      const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
      if (k in step) { sel = Math.min(lines.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
      if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
      if (k === 'End' || k === 'Ctrl+End') { sel = lines.length - 1; draw(); return true; }
      if (k === 'Enter' && lines[sel]) { open(lines[sel]); return true; }
      if (k === 'F2') { w.close(); ledgerDisplay(l, to); return true; }
      if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { print(); return true; }
      return false;
    };
    w.onClose = () => resolve();
    draw();
  });
}
