// RECEIPT / CONTRA VOUCHER — modelled on the MARG ERP 9+ screen. Contra uses the same
// screen with cash / bank ledgers on both lines and no bill adjustment. Receipt: Date → LEDGERS (Cr party) →
// amount → BILL ADJUSTMENT (Adj Ref / New Ref / Done / Clear / Save, with the PENDING
// INVOICE list) → Dr CASH → narration → Save / Save & Print / No / Exit → PRINT VOUCHER.
// The CUSTOMER STATUS panel on the right follows the chosen party.
import { api, esc, toast, h, today, money, openWin } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { pickParty } from './sale.ts';
import { canBackdate } from './session.ts';
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
function pendingInvoice(partyName: string, bills: Pending[], chosen: Map<number, number>, total: number, other: number): Promise<Map<number, number> | null> {
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
            <td>${esc(b.ref)}</td><td class="n">${f2(b.net)} Dr</td><td class="n">${dmy2(b.date)}</td><td class="n">${dmy2(b.date)}</td>
            <td class="n">${b.days}</td><td class="n">${f2(b.balance)} Dr</td>
            <td class="n">${i === cur && editing ? `<input class="marg-amt pi-amt" value="${f2(sel.get(b.id) ?? b.balance)}" style="width:110px;text-align:right">` : sel.has(b.id) ? f2(sel.get(b.id)) : ''}</td></tr>`).join('')}
          </tbody></table></div>
        <div class="rv-pend-foot">
          <div><span class="k">INVOICE? :</span> <input class="pi-find" autocomplete="off"></div><div><span class="k">ADJUSTED :</span> <b>${f2(adjusted)} ${adjusted > 0 ? 'Cr' : 'Dr'}</b></div>
          <div><span class="k">DISCOUNT :</span> <b>0.00</b></div><div class="pend"><span>PENDING &nbsp;:</span> <b>${drcr(-pendingAmt())}</b></div>
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

function billAdjustment(party: Ledger, amount: number, bills: Pending[], start: Adj[]): Promise<Adj[]> {
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
        <div class="top"><span>${esc(party.name.toUpperCase())}</span><span>Amount &nbsp;: &nbsp; ${f2(amount)} Cr</span></div>
        <div class="cols"><span>TYPE</span><span>PARTICULARS</span><span class="n">DUE DAYS</span><span class="n">AMOUNT</span><span>REMARK</span><span class="n">BALANCE</span></div>
        <div class="rows">
          ${rows.map((a, i) => `<div class="row">
            <span>${a.bill ? 'Adj Ref.' : 'New Ref.'}</span><span>${esc(a.bill?.ref ?? 'On Account')}</span><span class="n">0</span>
            <span class="n">${i === editRow ? `<input class="marg-amt ba-amt" value="${f2(a.amount)}"> Cr` : `${f2(a.amount)} Cr`}</span>
            <span>${esc(a.remark)}</span><span class="n">${a.bill ? `${f2(a.bill.balance)} Dr` : ''}</span></div>`).join('')}
          ${editRow < 0 ? `<div class="row"><span class="type-cell"><span class="type-val">${TYPES[opt]}</span><span class="dd">&#8964;</span>
            ${listOpen ? `<span class="type-list">${TYPES.map((t, i) => `<span class="${i === opt ? 'sel' : ''}">${t}</span>`).join('')}</span>` : ''}</span></div>` : ''}
        </div>
        <div class="foot">
          <div>${info ? `Bill:${esc(info.ref)} - ${dmy2(info.date)} Amt:${f2(info.net)} Dr<br>DuDt:${dmy2(info.date)} Dys:${info.days}` : ''}</div>
          <div class="tot"><div>ADJUSTED: <b>${f2(adjusted())} ${adjusted() > 0 ? 'Cr' : 'Dr'}</b></div><div>PENDING : <b>${drcr(-pending())}</b></div></div>
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
      const sel = await pendingInvoice(party.name, bills, chosen, amount, other).finally(() => (busy = false));
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

/** The CUSTOMER STATUS panel (receipt entry, sale alteration). */
export function statusHtml(s: Status) {
  return `<div class="bar">&#10004; CUSTOMER STATUS</div>
      <div class="nm">${esc(s.name.toUpperCase())}</div>
      <div>Phone &nbsp;: ${esc(s.phone)}</div>
      <div class="kv"><span>Balance :</span><b>${drcr(s.balance)}</b></div>
      <div class="kv"><span>O/S Bills :</span><b>${s.bills}</b></div>
      <div class="kv"><span>Days &nbsp;&nbsp;&nbsp;:</span><b>${s.days}</b></div>
      <div>Last Sale &nbsp;&nbsp;: ${s.last_sale ? `${f2(s.last_sale.net)} Dt:${dmy(s.last_sale.date)} Days:${s.last_sale.days}` : ''}</div>
      <div>Last Receipt: ${s.last_receipt ? `${f2(s.last_receipt.amount)} Dt:${dmy(s.last_receipt.date)} Days:${s.last_receipt.days}` : ''}</div>
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

// ------------------------------------------------------------------ printed receipt
interface Saved { contra: boolean; no: string; date: string; party: Ledger; cash: Ledger; amount: number; adj: Adj[]; narration: string }
function receiptHtml(c: any, v: Saved, o: PrintOpts) {
  const billRows = v.adj.filter((a) => a.amount > 0);
  const body = v.contra
    ? `Transferred the sum of Rupees <b>${esc(inWords(v.amount))}</b> from <b>${esc(v.party.name.toUpperCase())}</b> to <b>${esc(v.cash.name.toUpperCase())}</b>.`
    : `Received with thanks from <b>${esc(v.party.name.toUpperCase())}</b>${v.party.city ? `, ${esc(v.party.city)}` : ''}
      the sum of Rupees <b>${esc(inWords(v.amount))}</b> by <b>${esc(v.cash.name.toUpperCase())}</b>.`;
  return `<h2>${esc(c.name)}</h2><div style="text-align:center">${esc(c.address1 ?? '')} ${esc(c.address2 ?? '')}<br>GSTIN: ${esc(c.gstin ?? '')}</div>
    <hr><h3 style="text-align:center;margin:4px 0;letter-spacing:3px">${v.contra ? 'CONTRA' : 'RECEIPT'}</h3>
    <div style="display:flex;justify-content:space-between"><div>No. : <b>${esc(v.no)}</b></div><div>Date : <b>${dmy(v.date)}</b></div></div>
    <p style="line-height:1.8">${body}</p>
    ${o.heads ? `<table class="grid"><tr><th></th><th>Account</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      <tr><td>Cr</td><td>${esc(v.party.name)}</td><td></td><td class="n">${money(v.amount)}</td></tr>
      <tr><td>Dr</td><td>${esc(v.cash.name)}</td><td class="n">${money(v.amount)}</td><td></td></tr></table>` : ''}
    ${o.bills && billRows.length ? `<div style="margin-top:8px"><b>Bill Details</b></div><table class="grid">
      <tr><th>Type</th><th>Bill No.</th><th>Bill Date</th><th class="n">Bill Amount</th><th class="n">Adjusted</th></tr>
      ${billRows.map((a) => `<tr><td>${a.bill ? 'Adj Ref.' : 'New Ref.'}</td><td>${esc(a.bill?.ref ?? 'On Account')}</td><td>${a.bill ? dmy(a.bill.date) : ''}</td>
        <td class="n">${a.bill ? money(a.bill.net) : ''}</td><td class="n">${money(a.amount)}</td></tr>`).join('')}</table>` : ''}
    <div style="font-size:20px;margin-top:10px">₹ <b>${money(v.amount)}</b></div>
    ${v.narration ? `<div>Narration : ${esc(v.narration)}</div>` : ''}
    <div style="display:flex;justify-content:space-between;margin-top:40px"><span>Receiver's Signature</span><span>For ${esc(c.name)}<br><br>Authorised Signatory</span></div>`;
}

// ------------------------------------------------------------------ the screen
const CASH_BANK = 'Cash-in-hand,Bank Accounts';

export async function receiptEntry(type: 'RECEIPT' | 'CONTRA' = 'RECEIPT') {
  const contra = type === 'CONTRA';
  const label = contra ? 'Contra' : 'Receipt';
  const group = contra ? CASH_BANK : undefined;      // contra moves money between cash / bank only
  const [company, modes] = await Promise.all([api<any>('/company'), api<Ledger[]>('/payment-modes')]);
  const w = openWin('VOUCHER ENTRY', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F8</b>-Multi Narration Voucher</span><span><b>F9</b>-Single Narration Voucher</span><span>Current-Single</span>');
  const screen = h('div', { class: 'rv-screen' });
  screen.innerHTML = `
    <div class="rv-main">
      <div class="rv-co"><div class="n1">${esc(company.name)}</div><div class="n2">${esc(`${company.address1 ?? ''} ${company.address2 ?? ''}`.trim())}</div>
        <div class="n3">Period : ${dmy(company.fy_start)} - ${dmy(company.fy_end)}</div></div>
      <div class="rv-head">
        <label>Voucher Type</label><span class="vt">${label}</span><label>Date</label><input class="date" data-f="date">
        <label>Voucher No.</label><input data-f="no" placeholder="(auto)"><label>Day</label><span class="day"></span>
      </div>
      <div class="rv-cols"><span></span><span>Balance</span><span>Debit</span><span>Credit</span></div>
      <div class="rv-lines"></div>
      <div class="rv-narr">
        <div><span class="k">Narration :</span><input data-f="narr" autocomplete="off"></div>
        <div class="tot"><span class="dr"></span><span class="cr"></span></div>
      </div>
      <div class="rv-ph"></div>
      <div class="rv-title">${label.toUpperCase()} VOUCHER</div>
    </div>
    <div class="rv-status"></div>`;
  screen.prepend(margBar('VOUCHER ENTRY'));
  w.body.append(screen);
  const $ = (s: string) => screen.querySelector(s) as HTMLInputElement;
  const dateI = $('[data-f=date]'), noI = $('[data-f=no]'), narrI = $('[data-f=narr]');
  if (!canBackdate()) { dateI.readOnly = true; dateI.title = 'Back-dated entry is not allowed for your role'; }

  let party: Ledger | null = null;
  let cash: Ledger | null = modes[0] ?? null;
  let amount = 0;
  let adj: Adj[] = [];
  let pending: Pending[] = [];
  let dirty = false;
  let busy = false;

  const showDay = () => { ($('.day') as HTMLElement).textContent = dayName(isoOf(dateI.value)); };
  const refs = () => adj.filter((a) => a.bill).map((a) => a.bill!.ref);

  function renderLines() {
    const box = screen.querySelector('.rv-lines')!;
    box.innerHTML = !party ? '' : `
      <div class="ln"><span>Cr</span><span class="nm">${esc(party.name.toUpperCase())}</span><span class="bal">${drcr(party.balance)}</span><span></span>
        <span><input class="amt" data-l="cr" value="${amount ? f2(amount) : ''}" autocomplete="off"></span></div>
      ${amount && cash ? `<div class="ln"><span>Dr</span><span class="nm"><input data-l="cash" value="${esc(cash.name.toUpperCase())}" readonly></span>
        <span class="bal">${drcr(cash.balance)}</span><span class="n">${f2(amount)}</span><span></span></div>` : ''}`;
    (screen.querySelector('.tot .dr') as HTMLElement).textContent = amount && cash ? f2(amount) : '';
    (screen.querySelector('.tot .cr') as HTMLElement).textContent = amount ? f2(amount) : '';
    (screen.querySelector('.rv-ph') as HTMLElement).textContent = party ? `${party.name.toUpperCase()} Ph.: ${party.phone ?? ''}` : '';
  }
  const focusL = (l: string) => { const el = screen.querySelector(`[data-l=${l}]`) as HTMLInputElement | null; el?.focus(); el?.select(); };

  async function renderStatus() {
    const box = screen.querySelector('.rv-status') as HTMLElement;
    if (!party || contra) { box.innerHTML = ''; return; }
    box.innerHTML = statusHtml(await api<Status>(`/ledgers/${party.id}/status`));
  }

  async function partyStep() {
    if (busy) return;
    busy = true;
    try {
      const l = await pickParty('', group);
      if (!l) { dateI.focus(); dateI.select(); return; }
      party = l;
      amount = 0;
      adj = [];
      dirty = true;
      pending = contra ? [] : await api<Pending[]>(`/ledgers/${l.id}/pending-bills`);
      // Contra: the Dr side defaults to the first other cash / bank account.
      if (contra && cash?.id === l.id) cash = modes.find((m) => m.id !== l.id) ?? cash;
      renderLines();
      renderStatus().catch(() => {});
      focusL('cr');
    } finally { busy = false; }
  }

  async function amountStep() {
    const v = r2(Number(($('[data-l=cr]')).value || 0));
    if (v <= 0) { toast('Enter the amount', true); focusL('cr'); return; }
    if (v !== amount) adj = [];          // a new amount starts the adjustment again
    amount = v;
    if (busy) return;
    busy = true;
    try {
      // Debtors with unpaid bills get BILL ADJUSTMENT, as in MARG.
      if (pending.length || adj.length) adj = await billAdjustment(party!, amount, pending, adj);
    } finally { busy = false; }
    renderLines();
    if (!narrI.value || narrI.dataset.auto === '1') {
      narrI.value = refs().length ? `Ag. ${refs().join(', ')}` : '';
      narrI.dataset.auto = '1';
    }
    focusL('cash');
  }

  async function cashStep(initial: string) {
    if (busy) return;
    busy = true;
    try {
      const l = await pickParty(initial, group);
      if (l) { cash = l; renderLines(); }
    } finally { busy = false; }
    focusL('cash');
  }

  let finishing = false;
  async function finishStep() {
    if (finishing) return;               // a second Enter while saving must not open another box
    if (!party || !amount || !cash) { toast('Select the party and amount first', true); return; }
    if (cash.id === party.id) { toast('Debit and credit ledgers are the same', true); focusL('cash'); return; }
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
      const c = company;
      let opts: PrintOpts = { heads: true, bills: true, copies: 1 };
      for (;;) {
        // View shows the receipt, then PRINT VOUCHER comes back with the same choices.
        const r = await printVoucherBox(opts, contra ? 'C Contra' : 'R Receipt');
        opts = r.opts;
        if (r.act === 'view') {
          const pv = openWin(`View - ${saved.no}`, 'wide', '<span><b>Esc</b> Close</span>');
          pv.body.append(h('div', { class: 'print-area' }, receiptHtml(c, saved, r.opts)));
          await new Promise<void>((res) => { pv.onClose = res; });
          continue;
        }
        if (r.act === 'print') (await import('./billing.ts')).printHtml(receiptHtml(c, saved, r.opts), r.opts.copies);
        break;
      }
    }
    await reset();
  }

  async function save(): Promise<Saved | null> {
    try {
      const body = {
        type, no: noI.value.trim(), date: isoOf(dateI.value), narration: narrI.value,
        lines: [{ ledger_id: cash!.id, debit: amount, credit: 0 }, { ledger_id: party!.id, debit: 0, credit: amount }],
        adjustments: adj.map((a) => ({ bill_id: a.bill?.id ?? null, amount: a.amount, remark: a.remark })),
      };
      const res = await api<{ id: number; no: string }>('/vouchers', { method: 'POST', body });
      toast(`${label} ${res.no} saved — ${money(amount)}`);
      dirty = false;
      return { contra, no: res.no, date: body.date, party: party!, cash: cash!, amount, adj, narration: body.narration };
    } catch (e) { toast((e as Error).message, true); return null; }
  }

  async function reset() {
    party = null; amount = 0; adj = []; pending = [];
    modes.splice(0, modes.length, ...(await api<Ledger[]>('/payment-modes')));
    cash = modes[0] ?? cash;
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

  w.onKey = (e, k) => {
    const t = e.target as HTMLElement;
    if ((k === 'Ctrl+W' || k === 'End') && party && amount) { finishStep(); return true; }
    // As in MARG, Enter on the date goes straight to the LEDGERS list (the number is given on save).
    if (t === dateI && k === 'Enter') { showDay(); if (party) focusL('cr'); else partyStep(); return true; }
    if (t === dateI && k === 'ArrowDown') { noI.focus(); return true; }
    if (t === noI && k === 'Enter') { party ? focusL('cr') : partyStep(); return true; }
    if (t === noI && k === 'ArrowUp') { dateI.focus(); return true; }
    const l = (t as HTMLInputElement).dataset?.l;
    if (l === 'cr') {
      if (k === 'Enter') { amountStep(); return true; }
      if (k === 'ArrowUp' || k === 'Shift+Tab') { partyStep(); return true; }   // back up: choose another party
    }
    if (l === 'cash') {
      if (k === 'Enter') { narrI.focus(); return true; }
      if (k === 'ArrowUp') { focusL('cr'); return true; }
      if (k.length === 1 && !e.ctrlKey && !e.altKey) { cashStep(k); return true; }
      if (k === 'F3' || k === 'Space') { cashStep(''); return true; }
    }
    if (t === narrI) {
      if (k === 'Enter') { finishStep(); return true; }
      if (k === 'ArrowUp') { focusL('cash'); return true; }
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

