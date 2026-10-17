// VOUCHER ENTRY (Receipt, Payment, Contra, Debit Note, Credit Note, Journal) — modelled on the
// MARG ERP 9+ screen. All six share it; Contra has cash / bank on both lines and no bill
// adjustment, Journal takes any number of Dr / Cr lines. Receipt: Date → LEDGERS (Cr party) →
// amount → BILL ADJUSTMENT (Adj Ref / New Ref / Done / Clear / Save, with the PENDING
// INVOICE list) → Dr CASH → narration → Save / Save & Print / No / Exit → PRINT VOUCHER.
// The CUSTOMER STATUS panel on the right follows the chosen party.
import { api, esc, toast, h, today, money, openWin } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { pickParty } from './sale.ts';
import { canAction, canBackdate, session } from './session.ts';
import { type Ledger } from './masters.ts';

interface Pending { id: number; no: string; ref: string; date: string; net: number; balance: number; days: number }
/** One BILL ADJUSTMENT row. bill = null for a New Ref (on account). */
interface Adj { bill: Pending | null; amount: number; remark: string }
export interface Status {
  name: string; phone: string; balance: number; bills: number; days: number;
  last_sale: { net: number; date: string; days: number } | null;
  last_receipt: { amount: number; date: string; days: number } | null;
  receipts: { date: string; amount: number; mode: string; days: number }[];
  os_bills: Pending[];
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const dmy2 = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : d; };
const drcr = (n: number) => `${f2(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;
type Side = 'Dr' | 'Cr';
const flip = (s: Side): Side => (s === 'Dr' ? 'Cr' : 'Dr');
/** An amount still to adjust, shown on the voucher's side (on the bills' side once over-adjusted). */
const sided = (n: number, side: Side) => `${f2(Math.abs(n))} ${n >= 0 ? side : flip(side)}`;
const dayName = (iso: string) => { const t = Date.parse(iso); return Number.isNaN(t) ? '' : new Date(t).toLocaleString('en', { weekday: 'long' }); };

// ------------------------------------------------------------------ amount in words (Indian system)
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
function upto99(n: number) { return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? ' ' + ONES[n % 10] : ''}`; }
function upto999(n: number) { return `${n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' : '') : ''}${n % 100 ? upto99(n % 100) : ''}`; }
export function inWords(amount: number): string {
  let n = Math.floor(amount);
  const paise = Math.round((amount - n) * 100);
  if (!n && !paise) return 'Zero Only';
  const parts: string[] = [];
  for (const [div, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']] as [number, string][]) {
    const q = Math.floor(n / div);
    if (q) { parts.push(`${upto999(q)} ${name}`); n %= div; }
  }
  if (n) parts.push(upto999(n));
  return `${parts.join(' ')}${paise ? ` and ${upto99(paise)} Paise` : ''} Only`.trim();
}

// ------------------------------------------------------------------ PENDING INVOICE
/**
 * The party's unpaid bills. Space / + selects (filling what is still pending), - unselects,
 * * edits the amount, Enter takes the selection (the highlighted bill when nothing is
 * selected), Esc goes back for a New Ref adjustment. Resolves with the chosen bills.
 */
function pendingInvoice(partyName: string, bills: Pending[], chosen: Map<number, number>, total: number, other: number, side: Side): Promise<Map<number, number> | null> {
  const bs = flip(side);   // bills stand on the other side: sale bills Dr, purchase bills Cr
  return new Promise((resolve) => {
    const p = margPop('PENDING INVOICE',
      '<span><b>SpaceBar-+-</b>Un/Select</span><span><b>*</b>-Edit</span><span><b>F2</b>-Date_Select_Value</span><span><b>F4</b>-Same_Remark</span><span><b>F5</b>-Index</span><span><b>F10</b>-Filter</span>',
      '1030px');
    const sel = new Map(chosen);
    let cur = 0;
    let editing = false;
    const box = h('div', { class: 'marg-list rv-pend' });
    p.body.append(box);
    const pendingAmt = () => r2(total - other - [...sel.values()].reduce((s, a) => s + a, 0));
    const draw = () => {
      const adjusted = r2(total - pendingAmt());
      box.innerHTML = `
        <div class="rows"><table>
          <thead><tr><th style="width:15%">INVOICE NO.</th><th class="n" style="width:15%">INV_AMOUNT</th><th class="n" style="width:12%">BILL DATE</th>
            <th class="n" style="width:12%">DUE DATE</th><th class="n" style="width:8%">DAYS</th><th class="n" style="width:17%">BALANCE</th><th class="n">AMOUNT</th></tr></thead>
          <tbody>${bills.map((b, i) => `<tr data-i="${i}" class="${i === cur ? 'sel' : ''}">
            <td>${esc(b.ref)}</td><td class="n">${f2(b.net)} ${bs}</td><td class="n">${dmy2(b.date)}</td><td class="n">${dmy2(b.date)}</td>
            <td class="n">${b.days}</td><td class="n">${f2(b.balance)} ${bs}</td>
            <td class="n">${i === cur && editing ? `<input class="marg-amt pi-amt" value="${f2(sel.get(b.id) ?? b.balance)}" style="width:110px;text-align:right">` : sel.has(b.id) ? f2(sel.get(b.id)) : ''}</td></tr>`).join('')}
          </tbody></table></div>
        <div class="rv-pend-foot">
          <div><span class="k">INVOICE? :</span> <input class="pi-find" autocomplete="off"></div><div><span class="k">ADJUSTED :</span> <b>${f2(adjusted)} ${adjusted > 0 ? side : bs}</b></div>
          <div><span class="k">DISCOUNT :</span> <b>0.00</b></div><div class="pend"><span>PENDING &nbsp;:</span> <b>${sided(pendingAmt(), side)}</b></div>
          <div class="hint">${esc(partyName)} Ph.:</div><div><span class="esc-hint">ESC-New Refrence Adjustment</span></div>
        </div>`;
      box.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
      const amt = box.querySelector('.pi-amt') as HTMLInputElement | null;
      if (amt) { amt.focus(); amt.select(); } else (box.querySelector('.pi-find') as HTMLInputElement).focus();
    };
    const pick = (b: Pending) => {
      const room = pendingAmt();
      if (room <= 0) { toast('Nothing pending to adjust', true); return; }
      sel.set(b.id, r2(Math.min(b.balance, room)));
    };
    let done = false;
    const finish = (v: Map<number, number> | null) => { if (done) return; done = true; p.close(); resolve(v); };
    box.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr[data-i]') as HTMLElement | null;
      if (tr && !editing) { cur = Number(tr.dataset.i); draw(); }
    });
    p.onKey = (e, k) => {
      const b = bills[cur];
      if (editing) {
        if (k === 'Enter') {
          const v = r2(Number((box.querySelector('.pi-amt') as HTMLInputElement).value || 0));
          if (v > 0) sel.set(b.id, Math.min(v, b.balance)); else sel.delete(b.id);
          editing = false; draw(); return true;
        }
        if (k === 'Escape') { editing = false; draw(); return true; }
        return false;
      }
      const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 10, PageUp: -10 };
      if (k in step) { cur = Math.min(bills.length - 1, Math.max(0, cur + step[k])); draw(); return true; }
      if (k === 'Space' || k === '+') { if (sel.has(b.id)) sel.delete(b.id); else pick(b); draw(); return true; }
      if (k === '-') { sel.delete(b.id); draw(); return true; }
      if (k === '*') { editing = true; draw(); return true; }
      if (k === 'Enter') { if (!sel.size) pick(b); finish(sel); return true; }
      if (k === 'Escape') { finish(null); return true; }
      // INVOICE? : typing jumps to the first bill whose number contains the text.
      if (k.length === 1 && (e.target as HTMLElement).classList?.contains('pi-find')) {
        setTimeout(() => {
          const q = (box.querySelector('.pi-find') as HTMLInputElement).value.toUpperCase();
          const i = bills.findIndex((x) => x.ref.toUpperCase().includes(q));
          if (q && i >= 0) { cur = i; draw(); (box.querySelector('.pi-find') as HTMLInputElement).value = q; }
        }, 0);
      }
      return false;
    };
    draw();
  });
}

// ------------------------------------------------------------------ BILL ADJUSTMENT
const TYPES = ['Adj Ref', 'New Ref', 'Done', 'Clear', 'Save'] as const;

function billAdjustment(party: Ledger, amount: number, bills: Pending[], start: Adj[], side: Side): Promise<Adj[]> {
  const bs = flip(side);
  return new Promise((resolve) => {
    const p = margPop('BILL ADJUSTMENT', '', '990px');
    p.setFoot('');
    const box = h('div', { class: 'rv-adj' });
    p.body.append(box);
    let rows: Adj[] = start.map((a) => ({ ...a }));
    let opt = 0;              // highlighted TYPE option
    let listOpen = false;     // TYPE dropdown open
    let editRow = -1;         // row whose AMOUNT is being typed
    const adjusted = () => r2(rows.reduce((s, a) => s + a.amount, 0));
    const pending = () => r2(amount - adjusted());
    const draw = () => {
      const info = rows[editRow >= 0 ? editRow : rows.length - 1]?.bill;
      box.innerHTML = `
        <div class="top"><span>${esc(party.name.toUpperCase())}</span><span>Amount &nbsp;: &nbsp; ${f2(amount)} ${side}</span></div>
        <div class="cols"><span>TYPE</span><span>PARTICULARS</span><span class="n">DUE DAYS</span><span class="n">AMOUNT</span><span>REMARK</span><span class="n">BALANCE</span></div>
        <div class="rows">
          ${rows.map((a, i) => `<div class="row">
            <span>${a.bill ? 'Adj Ref.' : 'New Ref.'}</span><span>${esc(a.bill?.ref ?? 'On Account')}</span><span class="n">0</span>
            <span class="n">${i === editRow ? `<input class="marg-amt ba-amt" value="${f2(a.amount)}"> ${side}` : `${f2(a.amount)} ${side}`}</span>
            <span>${esc(a.remark)}</span><span class="n">${a.bill ? `${f2(a.bill.balance)} ${bs}` : ''}</span></div>`).join('')}
          ${editRow < 0 ? `<div class="row"><span class="type-cell"><span class="type-val">${TYPES[opt]}</span><span class="dd">&#8964;</span>
            ${listOpen ? `<span class="type-list">${TYPES.map((t, i) => `<span class="${i === opt ? 'sel' : ''}">${t}</span>`).join('')}</span>` : ''}</span></div>` : ''}
        </div>
        <div class="foot">
          <div>${info ? `Bill:${esc(info.ref)} - ${dmy2(info.date)} Amt:${f2(info.net)} ${bs}<br>DuDt:${dmy2(info.date)} Dys:${info.days}` : ''}</div>
          <div class="tot"><div>ADJUSTED: <b>${f2(adjusted())} ${adjusted() > 0 ? side : bs}</b></div><div>PENDING : <b>${sided(pending(), side)}</b></div></div>
        </div>`;
      const inp = box.querySelector('.ba-amt') as HTMLInputElement | null;
      if (inp) { inp.focus(); inp.select(); }
    };
    const nextOpt = () => { opt = pending() > 0.004 ? 0 : 2; listOpen = false; };
    let done = false;
    const finish = () => { if (done) return; done = true; p.close(); resolve(rows.filter((a) => a.amount > 0)); };
    let busy = false;
    async function choose() {
      const t = TYPES[opt];
      listOpen = false;
      if (t === 'Done' || t === 'Save') { finish(); return; }
      if (t === 'Clear') { rows = []; nextOpt(); draw(); return; }
      if (t === 'New Ref') {
        if (pending() <= 0) { toast('Nothing pending to adjust', true); draw(); return; }
        rows.push({ bill: null, amount: pending(), remark: '' });
        editRow = rows.length - 1; draw(); return;
      }
      // Adj Ref → PENDING INVOICE
      if (!bills.length) { toast('No pending invoice for this party — use New Ref', true); draw(); return; }
      busy = true;
      const chosen = new Map(rows.filter((a) => a.bill).map((a) => [a.bill!.id, a.amount]));
      const other = r2(rows.filter((a) => !a.bill).reduce((s, a) => s + a.amount, 0));
      const sel = await pendingInvoice(party.name, bills, chosen, amount, other, side).finally(() => (busy = false));
      if (!sel) { draw(); return; }
      const before = new Set(chosen.keys());
      rows = [...rows.filter((a) => !a.bill), ...bills.filter((b) => sel.has(b.id)).map((b) => ({ bill: b, amount: sel.get(b.id)!, remark: '' }))];
      // Like MARG, the cursor lands on the amount of the bill just picked.
      const fresh = rows.findIndex((a) => a.bill && !before.has(a.bill.id));
      if (fresh >= 0) editRow = fresh; else nextOpt();
      draw();
    }
    p.onKey = (_e, k) => {
      if (busy) return true;
      if (editRow >= 0) {
        if (k === 'Enter') {
          const a = rows[editRow];
          let v = r2(Number((box.querySelector('.ba-amt') as HTMLInputElement).value || 0));
          if (a.bill) v = Math.min(v, a.bill.balance);
          a.amount = Math.max(0, v);
          if (!a.amount) rows.splice(editRow, 1);
          editRow = -1; nextOpt(); draw(); return true;
        }
        if (k === 'Escape') { editRow = -1; nextOpt(); draw(); return true; }
        return false;
      }
      if (k === 'ArrowDown') { if (!listOpen) listOpen = true; else opt = (opt + 1) % TYPES.length; draw(); return true; }
      if (k === 'ArrowUp') { if (!listOpen) listOpen = true; else opt = (opt - 1 + TYPES.length) % TYPES.length; draw(); return true; }
      if (k === 'Enter') { choose(); return true; }
      const hit = TYPES.findIndex((t) => t[0] === k);
      if (k.length === 1 && hit >= 0) { opt = hit; choose(); return true; }
      if ((k === 'Delete' || k === 'Ctrl+Delete') && rows.length) { rows.pop(); nextOpt(); draw(); return true; }
      if (k === 'Escape') { if (listOpen) { listOpen = false; draw(); } else finish(); return true; }
      return false;
    };
    nextOpt();
    draw();
  });
}

/** The CUSTOMER STATUS panel (receipt entry, sale alteration) — SUPPLIER STATUS for payment / debit note. */
export function statusHtml(s: Status, supplier = false) {
  return `<div class="bar">&#10004; ${supplier ? 'SUPPLIER' : 'CUSTOMER'} STATUS</div>
      <div class="nm">${esc(s.name.toUpperCase())}</div>
      <div>Phone &nbsp;: ${esc(s.phone)}</div>
      <div class="kv"><span>Balance :</span><b>${drcr(s.balance)}</b></div>
      <div class="kv"><span>O/S Bills :</span><b>${s.bills}</b></div>
      <div class="kv"><span>Days &nbsp;&nbsp;&nbsp;:</span><b>${s.days}</b></div>
      <div>${supplier ? 'Last Purc.' : 'Last Sale'} &nbsp;&nbsp;: ${s.last_sale ? `${f2(s.last_sale.net)} Dt:${dmy(s.last_sale.date)} Days:${s.last_sale.days}` : ''}</div>
      <div>${supplier ? 'Last Paymnt' : 'Last Receipt'}: ${s.last_receipt ? `${f2(s.last_receipt.amount)} Dt:${dmy(s.last_receipt.date)} Days:${s.last_receipt.days}` : ''}</div>
      <div class="bar sub"><span>CHQ/CASH</span><span>DATE</span><span>AMOUNT</span><span>DAYS</span></div>
      ${s.receipts.map((r) => `<div class="g"><span>${esc((r.mode ?? '').toUpperCase())}</span><span>${dmy(r.date)}</span><span>${f2(r.amount)}</span><span>${r.days}</span></div>`).join('')}
      <div class="bar sub"><span>O/S BILL</span><span>DATE</span><span>AMOUNT</span><span>DAYS</span></div>
      ${s.os_bills.map((b) => `<div class="g ${b.days > 30 ? 'old' : ''}"><span>${esc(b.ref)}</span><span>${dmy(b.date)}</span><span>${f2(b.balance)}</span><span>${b.days}</span></div>`).join('')}`;
}

// ------------------------------------------------------------------ small boxes
/** Save / Save & Print / No / Exit. */
function saveBox(): Promise<'save' | 'print' | 'no' | 'exit'> {
  return new Promise((resolve) => {
    const w = openWin('Save', 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    Object.assign(w.el.style, { border: 'none', background: 'transparent', boxShadow: 'none' });
    w.setFoot('');
    w.body.style.background = 'transparent';
    const opts: [string, 'save' | 'print' | 'no' | 'exit', string][] = [['<u>S</u>ave', 'save', 'S'], ['Save &amp; <u>P</u>rint', 'print', 'P'], ['<u>N</u>o', 'no', 'N'], ['E<u>x</u>it', 'exit', 'X']];
    w.body.innerHTML = `<div class="rv-savebox">${opts.map(([l, v]) => `<button data-v="${v}">${l}</button>`).join('')}</div>`;
    const btns = [...w.body.querySelectorAll('button')] as HTMLButtonElement[];
    let done = false;
    const finish = (v: 'save' | 'print' | 'no' | 'exit') => { if (done) return; done = true; w.close(); resolve(v); };
    btns.forEach((b) => b.addEventListener('click', () => finish(b.dataset.v as any)));
    btns[0].focus();
    w.onKey = (_e, k) => {
      const i = btns.indexOf(document.activeElement as HTMLButtonElement);
      if (k === 'ArrowRight' || k === 'Tab') { btns[(i + 1) % btns.length].focus(); return true; }
      if (k === 'ArrowLeft' || k === 'Shift+Tab') { btns[(i - 1 + btns.length) % btns.length].focus(); return true; }
      if (k === 'Enter') { finish((btns[i] ?? btns[0]).dataset.v as any); return true; }
      if (k === 'Escape') { finish('no'); return true; }
      const hit = opts.find((o) => o[2] === k || (k === 'E' && o[1] === 'exit'));
      if (hit) { finish(hit[1]); return true; }
      return true;
    };
  });
}

interface PrintOpts { heads: boolean; bills: boolean; copies: number }
/** PRINT VOUCHER: Print / Ledger Heads / Bill Details / Copies, then View · Print · Exit. */
function printVoucherBox(init: PrintOpts, kind: string): Promise<{ act: 'view' | 'print' | 'exit'; opts: PrintOpts }> {
  return new Promise((resolve) => {
    const p = margPop('PRINT VOUCHER', '<span><b>Enter</b>-Next</span><span><b>Space/Y/N</b>-Change</span><span><b>V</b>-View <b>P</b>-Print <b>Esc</b>-Exit</span>', '470px');
    const box = h('div', { class: 'rv-printbox' });
    p.body.append(box);
    const o: PrintOpts = { ...init };
    const yn = (b: boolean) => (b ? 'Yes' : 'No');
    box.innerHTML = `
      <label>Print</label><span class="pick" data-f="kind">${esc(kind)}</span>
      <label>Print Ledger Heads</label><span class="pick" data-f="heads">${yn(o.heads)}</span>
      <label>Print Bill Details</label><span class="pick" data-f="bills">${yn(o.bills)}</span>
      <label>Print Copies</label><input data-f="copies" value="${o.copies}">
      <div class="btns"><button data-v="view"><u>V</u>iew</button><button data-v="print"><u>P</u>rint</button><button data-v="exit"><u>E</u>xit</button></div>`;
    const fields = [...box.querySelectorAll('[data-f], button')] as HTMLElement[];
    fields.forEach((f) => { if (!(f instanceof HTMLInputElement) && !(f instanceof HTMLButtonElement)) f.tabIndex = 0; });
    let done = false;
    const finish = (act: 'view' | 'print' | 'exit') => {
      o.copies = Math.max(1, Math.floor(Number((box.querySelector('[data-f=copies]') as HTMLInputElement).value) || 1));
      if (done) return; done = true; p.close(); resolve({ act, opts: { ...o } });
    };
    box.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) finish(b.dataset.v as any); });
    const flip = (el: HTMLElement, v?: boolean) => {
      const f = el.dataset.f as 'heads' | 'bills';
      if (f !== 'heads' && f !== 'bills') return;
      o[f] = v ?? !o[f];
      el.textContent = o[f] ? 'Yes' : 'No';
    };
    fields[0].focus();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el instanceof HTMLButtonElement) {
        if (k === 'ArrowRight' || k === 'Tab') { fields[Math.min(fields.length - 1, i + 1)].focus(); return true; }
        if (k === 'ArrowLeft') { fields[Math.max(0, i - 1)].focus(); return true; }
        if (k === 'Enter') { finish(el.dataset.v as any); return true; }
      } else {
        if (k === 'Enter' || k === 'ArrowDown' || k === 'Tab') { fields[i + 1]?.focus(); return true; }
        if (k === 'ArrowUp') { fields[Math.max(0, i - 1)]?.focus(); return true; }
        if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight') { flip(el); return true; }
        if (k === 'Y' || k === 'N') { if (el.dataset.f === 'heads' || el.dataset.f === 'bills') { flip(el, k === 'Y'); return true; } }
      }
      if (!(el instanceof HTMLInputElement)) {
        if (k === 'V') { finish('view'); return true; }
        if (k === 'P') { finish('print'); return true; }
        if (k === 'E') { finish('exit'); return true; }
      }
      if (k === 'Escape') { finish('exit'); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ voucher types
export type VType = 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL' | 'DEBIT_NOTE' | 'CREDIT_NOTE';
const CASH_BANK = 'Cash-in-hand,Bank Accounts';
/**
 * first: the side of the party line. other: the second line's default ledger ('cash' = the
 * last used cash / bank mode) — null for a journal, where every line is entered by hand.
 */
interface Cfg { label: string; title: string; print: string; first: Side; group?: string; other: string | null }
const CFG: Record<VType, Cfg> = {
  RECEIPT: { label: 'Receipt', title: 'RECEIPT VOUCHER', print: 'R Receipt', first: 'Cr', other: 'cash' },
  PAYMENT: { label: 'Payment', title: 'PAYMENT VOUCHER', print: 'P Payment', first: 'Dr', other: 'cash' },
  CONTRA: { label: 'Contra', title: 'CONTRA VOUCHER', print: 'C Contra', first: 'Cr', group: CASH_BANK, other: 'cash' },
  CREDIT_NOTE: { label: 'Credit Note', title: 'CREDIT NOTE', print: 'C Credit Note', first: 'Cr', other: 'Sales Return A/c' },
  DEBIT_NOTE: { label: 'Debit Note', title: 'DEBIT NOTE', print: 'D Debit Note', first: 'Dr', other: 'Purchase Return A/c' },
  JOURNAL: { label: 'Journal', title: 'JOURNAL VOUCHER', print: 'J Journal', first: 'Dr', other: null },
};
// As in MARG, F2..F7 on the date / voucher no. switch the voucher type.
const SWITCH: Record<string, VType> = { F2: 'PAYMENT', F3: 'RECEIPT', F4: 'JOURNAL', F5: 'DEBIT_NOTE', F6: 'CREDIT_NOTE', F7: 'CONTRA' };
/** A Cr party line settles sale bills (receipt, credit note); a Dr one purchase bills (payment, debit note). */
const kindOf = (side: Side) => (side === 'Cr' ? 'SALE' : 'PURCHASE');

/** One voucher line: Dr/Cr, ledger, amount and — for a party — its BILL ADJUSTMENT. */
interface Line { side: Side; ledger: Ledger | null; amount: number; adj: Adj[]; pending: Pending[] }

// ------------------------------------------------------------------ printed voucher
interface Saved { type: VType; no: string; date: string; lines: Line[]; amount: number; narration: string }
function voucherHtml(c: any, v: Saved, o: PrintOpts) {
  const party = v.lines[0].ledger!, other = v.lines[1]?.ledger;
  const P = `<b>${esc(party.name.toUpperCase())}</b>${party.city ? `, ${esc(party.city)}` : ''}`;
  const words = `<b>${esc(inWords(v.amount))}</b>`;
  const O = `<b>${esc((other?.name ?? '').toUpperCase())}</b>`;
  const body = {
    RECEIPT: `Received with thanks from ${P} the sum of Rupees ${words} by ${O}.`,
    PAYMENT: `Paid to ${P} the sum of Rupees ${words} by ${O}.`,
    CONTRA: `Transferred the sum of Rupees ${words} from <b>${esc(party.name.toUpperCase())}</b> to ${O}.`,
    CREDIT_NOTE: `We have credited your account ${P} with Rupees ${words}.`,
    DEBIT_NOTE: `We have debited your account ${P} with Rupees ${words}.`,
    JOURNAL: `Journal entry for Rupees ${words}.`,
  }[v.type];
  const billRows = v.lines.flatMap((l) => l.adj.filter((a) => a.amount > 0));
  return `<h2>${esc(c.name)}</h2><div style="text-align:center">${esc(c.address1 ?? '')} ${esc(c.address2 ?? '')}<br>GSTIN: ${esc(c.gstin ?? '')}</div>
    <hr><h3 style="text-align:center;margin:4px 0;letter-spacing:3px">${CFG[v.type].title.replace(' VOUCHER', '')}</h3>
    <div style="display:flex;justify-content:space-between"><div>No. : <b>${esc(v.no)}</b></div><div>Date : <b>${dmy(v.date)}</b></div></div>
    <p style="line-height:1.8">${body}</p>
    ${o.heads || v.type === 'JOURNAL' ? `<table class="grid"><tr><th></th><th>Account</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      ${v.lines.map((l) => `<tr><td>${l.side}</td><td>${esc(l.ledger!.name)}</td><td class="n">${l.side === 'Dr' ? money(l.amount) : ''}</td>
        <td class="n">${l.side === 'Cr' ? money(l.amount) : ''}</td></tr>`).join('')}</table>` : ''}
    ${o.bills && billRows.length ? `<div style="margin-top:8px"><b>Bill Details</b></div><table class="grid">
      <tr><th>Type</th><th>Bill No.</th><th>Bill Date</th><th class="n">Bill Amount</th><th class="n">Adjusted</th></tr>
      ${billRows.map((a) => `<tr><td>${a.bill ? 'Adj Ref.' : 'New Ref.'}</td><td>${esc(a.bill?.ref ?? 'On Account')}</td><td>${a.bill ? dmy(a.bill.date) : ''}</td>
        <td class="n">${a.bill ? money(a.bill.net) : ''}</td><td class="n">${money(a.amount)}</td></tr>`).join('')}</table>` : ''}
    <div style="font-size:20px;margin-top:10px">₹ <b>${money(v.amount)}</b></div>
    ${v.narration ? `<div>Narration : ${esc(v.narration)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:40px"><span>${v.type === 'RECEIPT' || v.type === 'PAYMENT' ? "Receiver's Signature" : 'Checked By'}</span>
      <span>For ${esc(c.name)}<br><br>Authorised Signatory</span></div>`;
}

// ------------------------------------------------------------------ the screen
/**
 * VOUCHER ENTRY for every accounts voucher. Receipt / Payment / Contra / Credit Note / Debit Note:
 * party line → amount → BILL ADJUSTMENT → the other ledger (cash / bank, Sales Return,
 * Purchase Return) → narration. Journal: any number of Dr / Cr lines until they balance.
 */
export async function receiptEntry(type: VType = 'RECEIPT') {
  const cfg = CFG[type];
  const journal = type === 'JOURNAL';
  const contra = type === 'CONTRA';
  const named = cfg.other && cfg.other !== 'cash';
  const [company, modes, all] = await Promise.all([api<any>('/company'), api<Ledger[]>('/payment-modes'),
    named ? api<Ledger[]>('/ledgers') : Promise.resolve([] as Ledger[])]);
  const defOther = () => (cfg.other === 'cash' ? modes[0] ?? null
    : all.find((l) => l.name.toLowerCase() === cfg.other!.toLowerCase()) ?? null);
  const w = openWin('VOUCHER ENTRY', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F8</b>-Multi Narration Voucher</span><span><b>F9</b>-Single Narration Voucher</span><span>Current-Single</span>');
  const screen = h('div', { class: 'rv-screen' });
  screen.innerHTML = `
    <div class="rv-main">
      <div class="rv-co"><div class="n1">${esc(company.name)}</div><div class="n2">${esc(`${company.address1 ?? ''} ${company.address2 ?? ''}`.trim())}</div>
        <div class="n3">Period : ${dmy(company.fy_start)} - ${dmy(company.fy_end)}</div></div>
      <div class="rv-head">
        <label>Voucher Type</label><span class="vt">${cfg.label}</span><label>Date</label><input class="date" data-f="date">
        <label>Voucher No.</label><input data-f="no" placeholder="(auto)"><label>Day</label><span class="day"></span>
      </div>
      <div class="rv-cols"><span></span><span>Balance</span><span>Debit</span><span>Credit</span></div>
      <div class="rv-lines"></div>
      <div class="rv-narr">
        <div><span class="k">Narration :</span><input data-f="narr" autocomplete="off"></div>
        <div class="tot"><span class="dr"></span><span class="cr"></span></div>
      </div>
      <div class="rv-ph"></div>
      <div class="rv-title">${cfg.title}</div>
    </div>
    <div class="rv-status"></div>`;
  screen.prepend(margBar('VOUCHER ENTRY'));
  w.body.append(screen);
  const $ = (s: string) => screen.querySelector(s) as HTMLInputElement;
  const dateI = $('[data-f=date]'), noI = $('[data-f=no]'), narrI = $('[data-f=narr]');
  if (!canBackdate()) { dateI.readOnly = true; dateI.title = 'Back-dated entry is not allowed for your role'; }

  const blank = (side: Side, amount = 0): Line => ({ side, ledger: null, amount, adj: [], pending: [] });
  let lines: Line[] = [];
  let dirty = false;
  let busy = false;

  const real = () => lines.filter((l) => l.ledger && l.amount);
  const total = (s: Side) => r2(real().filter((l) => l.side === s).reduce((t, l) => t + l.amount, 0));
  const showDay = () => { ($('.day') as HTMLElement).textContent = dayName(isoOf(dateI.value)); };
  const refs = () => lines.flatMap((l) => l.adj.filter((a) => a.bill).map((a) => a.bill!.ref));
  /** The line whose party the STATUS panel and phone line follow. */
  const statusLine = () => (journal
    ? [...lines].reverse().find((l) => l.ledger && /^Sundry (Debtors|Creditors)$/.test(l.ledger.group_name))
    : lines[0].ledger ? lines[0] : undefined);

  function renderLines() {
    if (!journal) lines[1].amount = lines[0].amount;   // the other side always carries the party's amount
    const box = screen.querySelector('.rv-lines')!;
    box.innerHTML = lines.map((l, i) => {
      // Single-entry vouchers show the second line only once the amount is in, as in MARG.
      if (!journal && (i === 0 ? !l.ledger : !lines[0].amount)) return '';
      const amtIn = journal || i === 0;
      const amt = amtIn ? (l.ledger ? `<span><input class="amt" data-l="a${i}" value="${l.amount ? f2(l.amount) : ''}" autocomplete="off"></span>` : '<span></span>')
        : `<span class="n">${l.amount ? f2(l.amount) : ''}</span>`;
      const nm = !journal && i === 0 ? esc(l.ledger!.name.toUpperCase())
        : `<input data-l="n${i}" value="${esc(l.ledger?.name.toUpperCase() ?? '')}" readonly>`;
      const side = journal ? `<input class="side" data-l="s${i}" value="${l.side}" readonly>` : l.side;
      return `<div class="ln"><span>${side}</span><span class="nm">${nm}</span><span class="bal">${l.ledger ? drcr(l.ledger.balance) : ''}</span>
        ${l.side === 'Dr' ? `${amt}<span></span>` : `<span></span>${amt}`}</div>`;
    }).join('');
    const dr = total('Dr'), cr = total('Cr');
    (screen.querySelector('.tot .dr') as HTMLElement).textContent = dr ? f2(dr) : '';
    (screen.querySelector('.tot .cr') as HTMLElement).textContent = cr ? f2(cr) : '';
    const p = statusLine()?.ledger;
    (screen.querySelector('.rv-ph') as HTMLElement).textContent = p ? `${p.name.toUpperCase()} Ph.: ${p.phone ?? ''}` : '';
  }
  const focusL = (l: string) => { const el = screen.querySelector(`[data-l=${l}]`) as HTMLInputElement | null; el?.focus(); el?.select(); };

  async function renderStatus() {
    const box = screen.querySelector('.rv-status') as HTMLElement;
    const l = statusLine();
    if (!l || contra) { box.innerHTML = ''; return; }
    box.innerHTML = statusHtml(await api<Status>(`/ledgers/${l.ledger!.id}/status?kind=${kindOf(l.side)}`), l.side === 'Dr');
  }
  const loadPending = async (l: Line) => {
    l.pending = !contra && l.ledger && (journal || l === lines[0])
      ? await api<Pending[]>(`/ledgers/${l.ledger.id}/pending-bills?kind=${kindOf(l.side)}`) : [];
  };
  function autoNarr() {
    if (narrI.value && narrI.dataset.auto !== '1') return;
    narrI.value = refs().length ? `Ag. ${refs().join(', ')}` : '';
    narrI.dataset.auto = '1';
  }

  /** LEDGERS list for line i. */
  async function ledgerStep(i: number, initial = '') {
    if (busy) return;
    busy = true;
    try {
      const l = await pickParty(initial, cfg.group);
      const ln = lines[i];
      if (!l) {
        if (!journal && i === 0) { dateI.focus(); dateI.select(); } else focusL(journal && !ln.ledger ? `s${i}` : `n${i}`);
        return;
      }
      ln.ledger = l;
      ln.adj = [];
      if (!journal && i === 0) ln.amount = 0;
      dirty = true;
      await loadPending(ln);
      // Contra: the other side defaults to the first other cash / bank account.
      if (contra && i === 0 && lines[1].ledger?.id === l.id) lines[1].ledger = modes.find((m) => m.id !== l.id) ?? lines[1].ledger;
      renderLines();
      renderStatus().catch(() => {});
      focusL(journal || i === 0 ? `a${i}` : `n${i}`);
    } finally { busy = false; }
  }

  async function amountStep(i: number) {
    const ln = lines[i];
    const v = r2(Number($(`[data-l=a${i}]`).value || 0));
    if (v <= 0) { toast('Enter the amount', true); focusL(`a${i}`); return; }
    if (v !== ln.amount) ln.adj = [];          // a new amount starts the adjustment again
    ln.amount = v;
    if (busy) return;
    busy = true;
    try {
      // Parties with unsettled bills get BILL ADJUSTMENT, as in MARG.
      if (ln.pending.length || ln.adj.length) ln.adj = await billAdjustment(ln.ledger!, v, ln.pending, ln.adj, ln.side);
    } finally { busy = false; }
    autoNarr();
    if (!journal) { renderLines(); focusL('n1'); return; }
    // Journal: the next line takes the opposite side and the difference.
    const d = r2(total('Dr') - total('Cr'));
    const last = lines[lines.length - 1];
    if (!d) { if (!last.ledger && lines.length > 1) lines.pop(); renderLines(); narrI.focus(); return; }
    const side: Side = d > 0 ? 'Cr' : 'Dr';
    if (!last.ledger) Object.assign(last, blank(side, Math.abs(d)));
    else if (i === lines.length - 1) lines.push(blank(side, Math.abs(d)));
    renderLines();
    focusL(`s${i + 1}`);
  }

  /** Journal Dr/Cr: changing the side of a party line starts its adjustment again. */
  async function setSide(i: number, side: Side) {
    const ln = lines[i];
    if (ln.side === side) return;
    ln.side = side; ln.adj = []; dirty = true;
    await loadPending(ln);
    renderLines(); renderStatus().catch(() => {});
    focusL(`s${i}`);
  }

  let finishing = false;
  async function finishStep() {
    if (finishing) return;               // a second Enter while saving must not open another box
    if (journal) {
      const dr = total('Dr'), cr = total('Cr');
      if (real().length < 2 || !dr) { toast('Enter at least one debit and one credit', true); return; }
      if (dr !== cr) { toast(`Debit (${f2(dr)}) and Credit (${f2(cr)}) do not match`, true); return; }
    } else {
      if (!lines[0].ledger || !lines[0].amount || !lines[1].ledger) { toast('Select the party and amount first', true); return; }
      if (lines[0].ledger.id === lines[1].ledger.id) { toast('Debit and credit ledgers are the same', true); focusL('n1'); return; }
    }
    finishing = true;
    try { await finishFlow(); } finally { finishing = false; }
  }
  async function finishFlow() {
    const act = await saveBox();
    if (act === 'no') { narrI.focus(); return; }
    if (act === 'exit') { dirty = false; w.close(); return; }
    const saved = await save();
    if (!saved) return;
    if (act === 'print') {
      let opts: PrintOpts = { heads: true, bills: true, copies: 1 };
      for (;;) {
        // View shows the voucher, then PRINT VOUCHER comes back with the same choices.
        const r = await printVoucherBox(opts, cfg.print);
        opts = r.opts;
        if (r.act === 'view') {
          const pv = openWin(`View - ${saved.no}`, 'wide', '<span><b>Esc</b> Close</span>');
          pv.body.append(h('div', { class: 'print-area' }, voucherHtml(company, saved, r.opts)));
          await new Promise<void>((res) => { pv.onClose = res; });
          continue;
        }
        if (r.act === 'print') (await import('./billing.ts')).printHtml(voucherHtml(company, saved, r.opts), r.opts.copies);
        break;
      }
    }
    await reset();
  }

  async function save(): Promise<Saved | null> {
    try {
      const ls = real();
      const body = {
        type, no: noI.value.trim(), date: isoOf(dateI.value), narration: narrI.value,
        lines: ls.map((l) => ({ ledger_id: l.ledger!.id, debit: l.side === 'Dr' ? l.amount : 0, credit: l.side === 'Cr' ? l.amount : 0 })),
        adjustments: ls.flatMap((l) => l.adj.map((a) => ({ bill_id: a.bill?.id ?? null, amount: a.amount, remark: a.remark }))),
      };
      const amount = total('Dr');
      const res = await api<{ id: number; no: string }>('/vouchers', { method: 'POST', body });
      toast(`${cfg.label} ${res.no} saved — ${money(amount)}`);
      dirty = false;
      return { type, no: res.no, date: body.date, lines: ls, amount, narration: body.narration };
    } catch (e) { toast((e as Error).message, true); return null; }
  }

  async function reset() {
    modes.splice(0, modes.length, ...(await api<Ledger[]>('/payment-modes')));
    lines = journal ? [blank('Dr')] : [blank(cfg.first), { ...blank(flip(cfg.first)), ledger: defOther() }];
    noI.value = '';
    narrI.value = ''; narrI.dataset.auto = '1';
    dateI.value = dmy(today());
    showDay();
    renderLines();
    renderStatus();
    dirty = false;
    dateI.focus(); dateI.select();
  }

  dateI.addEventListener('input', showDay);
  narrI.addEventListener('input', () => { narrI.dataset.auto = '0'; });
  const firstStep = () => (journal ? focusL('s0') : lines[0].ledger ? focusL('a0') : ledgerStep(0));

  w.onKey = (e, k) => {
    const t = e.target as HTMLElement;
    if ((k === 'Ctrl+W' || k === 'End') && real().length >= 2) { finishStep(); return true; }
    if ((t === dateI || t === noI) && SWITCH[k]) {
      const to = SWITCH[k];
      if (to === type) return true;
      if (!canAction(`voucher.new:${to}`)) { toast(`Access denied — role ${session()?.role ?? ''} cannot enter ${CFG[to].label}`, true); return true; }
      if (dirty) { toast('Save or clear this voucher first', true); return true; }
      w.close();
      receiptEntry(to);
      return true;
    }
    // As in MARG, Enter on the date goes straight to the LEDGERS list (the number is given on save).
    if (t === dateI && k === 'Enter') { showDay(); firstStep(); return true; }
    if (t === dateI && k === 'ArrowDown') { noI.focus(); return true; }
    if (t === noI && k === 'Enter') { firstStep(); return true; }
    if (t === noI && k === 'ArrowUp') { dateI.focus(); return true; }
    const l = (t as HTMLInputElement).dataset?.l;
    if (l) {
      const i = Number(l.slice(1)), f = l[0];
      const ln = lines[i];
      if (f === 's') {
        if (k === 'D' || k === 'C') { setSide(i, k === 'D' ? 'Dr' : 'Cr'); return true; }
        if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight') { setSide(i, flip(ln.side)); return true; }
        if (k === 'Enter') {
          // An empty last line on a balanced journal ends the entry.
          if (!ln.ledger && i > 0 && i === lines.length - 1 && total('Dr') === total('Cr')) { lines.pop(); renderLines(); narrI.focus(); return true; }
          if (ln.ledger) focusL(`a${i}`); else ledgerStep(i);
          return true;
        }
        if (k === 'ArrowUp' && i > 0) { focusL(`a${i - 1}`); return true; }
        if (k === 'ArrowDown' && i < lines.length - 1) { focusL(`s${i + 1}`); return true; }
      }
      if (f === 'n') {
        if (k === 'Enter') { if (!ln.ledger) ledgerStep(i); else if (journal) focusL(`a${i}`); else narrI.focus(); return true; }
        if (k === 'ArrowUp') { focusL(journal ? `s${i}` : 'a0'); return true; }
        if (k === 'F3' || k === 'Space') { ledgerStep(i); return true; }
        if (k.length === 1 && !e.ctrlKey && !e.altKey) { ledgerStep(i, k); return true; }
      }
      if (f === 'a') {
        if (k === 'Enter') { amountStep(i); return true; }
        if (k === 'ArrowUp' || k === 'Shift+Tab') { if (journal) focusL(`n${i}`); else ledgerStep(0); return true; }   // back up: choose another party
      }
      if (journal && (k === 'Ctrl+Delete' || k === 'Shift+Delete') && lines.length > 1) {
        lines.splice(i, 1); dirty = true; renderLines(); renderStatus().catch(() => {});
        focusL(`s${Math.min(i, lines.length - 1)}`); return true;
      }
    }
    if (t === narrI) {
      if (k === 'Enter') { finishStep(); return true; }
      if (k === 'ArrowUp') { focusL(journal ? `a${lines.length - 1}` : 'n1'); return true; }
    }
    return false;
  };
  w.beforeEsc = async () => {
    if (!dirty) return true;
    const { margConfirm } = await import('./margui.ts');
    return margConfirm('Exit W/o Save');
  };
  await reset();
}
