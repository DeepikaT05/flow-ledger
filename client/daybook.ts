// DAY BOOK and SALE BOOK — modelled on the MARG ERP 9+ screens: the FROM / TO period box,
// one line per bill or voucher (DATE, PARTY NAME, REMARK, DEBIT, CREDIT, TYPE), the
// REMARK / VOUCHER TOTAL footer, the Voucher Detail panel and the "0994 PRINTING" box.
// Day book shows everything that happened (sales cash or credit, receipts, contra …);
// sale book shows only the sales whose money has been received.
import { api, esc, toast, h, today, money, drcr, openWin, confirmBox } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { pickParty } from './sale.ts';
import { canAction, canDelete, NO_DELETE } from './session.ts';
import { type Ledger } from './masters.ts';

interface Row {
  source: 'BILL' | 'VOUCHER'; source_id: number; vtype: string; type: string; date: string; no: string;
  party: string; remark: string; narration: string; debit: number; credit: number;
}
type Kind = 'DAY' | 'SALE';

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const dm = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const r2 = (n: number) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------ FROM / TO box
/** DAY BOOK: FROM [date] TO [date], Selected Ledger : No / Yes (Yes → LEDGERS list). */
function periodBox(title: string, from: string, to: string, withLedger: boolean): Promise<{ from: string; to: string; ledger: Ledger | null } | null> {
  return new Promise((resolve) => {
    const p = margPop(title, '<span><b>Enter</b>-Next</span><span><b>Space/Y/N</b>-Selected Ledger</span><span><b>Esc</b>-Exit</span>', '460px');
    const box = h('div', { class: 'db-period' });
    box.innerHTML = `<div><span>FROM</span><input data-f="from" value="${dmy(from)}"><span>TO</span><input data-f="to" value="${dmy(to)}"></div>
      ${withLedger ? '<div><span>Selected Ledger :</span><span class="pick" tabindex="0" data-f="led">No</span></div>' : ''}`;
    p.body.append(box);
    const fields = [...box.querySelectorAll('[data-f]')] as HTMLElement[];
    const fromI = box.querySelector('[data-f=from]') as HTMLInputElement, toI = box.querySelector('[data-f=to]') as HTMLInputElement;
    const led = box.querySelector('[data-f=led]') as HTMLElement | null;
    let done = false;
    const finish = (v: { from: string; to: string; ledger: Ledger | null } | null) => { if (done) return; done = true; p.close(); resolve(v); };
    const go = async () => {
      const f = isoOf(fromI.value), t = isoOf(toI.value);
      if (!f || !t) { toast('Enter dates as DD-MM-YYYY', true); fromI.focus(); return; }
      if (f > t) { toast('FROM date is after TO date', true); fromI.focus(); return; }
      let ledger: Ledger | null = null;
      if (led?.textContent === 'Yes') { ledger = await pickParty(); if (!ledger) { led.focus(); return; } }
      finish({ from: f, to: t, ledger });
    };
    fromI.focus(); fromI.select();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el === led && (k === 'Space' || k === 'Y' || k === 'N' || k === 'ArrowLeft' || k === 'ArrowRight')) {
        led.textContent = k === 'Y' ? 'Yes' : k === 'N' ? 'No' : led.textContent === 'Yes' ? 'No' : 'Yes';
        return true;
      }
      if (k === 'Enter') { if (i < fields.length - 1) { fields[i + 1].focus(); (fields[i + 1] as HTMLInputElement).select?.(); } else go(); return true; }
      if (k === 'ArrowUp' && i > 0) { fields[i - 1].focus(); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ 0994 PRINTING
interface PrintOpts { fmt: 'D' | 'S' | 'T'; total: boolean; range: boolean; page: boolean; vno: boolean; narr: boolean }
type PrintAct = 'view' | 'print' | 'excel' | 'cancel';
let lastOpts: PrintOpts = { fmt: 'D', total: true, range: true, page: true, vno: false, narr: true };

function printingBox(): Promise<{ act: PrintAct; opts: PrintOpts }> {
  return new Promise((resolve) => {
    const p = margPop('0994 PRINTING', '<span><b>Enter</b>-Next</span><span><b>Space</b>-Change</span><span><b>D/S/T</b>-Format</span><span><b>Esc</b>-Cancel</span>', '520px');
    const o: PrintOpts = { ...lastOpts };
    const yn = (b: boolean) => (b ? 'Y' : 'N');
    const box = h('div', { class: 'db-print' });
    box.innerHTML = `
      <label>Detail,Simple,T-Format</label><span class="pick" tabindex="0" data-f="fmt">${o.fmt}</span>
      <label class="sub">If Detail/Simple Format</label><span></span>
      <label class="in">Entry Total Y/N</label><span class="pick" tabindex="0" data-f="total">${yn(o.total)}</span>
      <label class="in">Date Range</label><span class="pick" tabindex="0" data-f="range">${yn(o.range)}</span>
      <label class="in">Page No.</label><span class="pick" tabindex="0" data-f="page">${yn(o.page)}</span>
      <label>Voucher No.</label><span class="pick" tabindex="0" data-f="vno">${yn(o.vno)}</span>
      <label>Narration</label><span class="pick" tabindex="0" data-f="narr">${yn(o.narr)}</span>
      <div class="btns"><button data-v="view"><u>V</u>iew</button><button data-v="print"><u>P</u>rint</button><button data-v="excel"><u>E</u>xcel</button><button data-v="cancel"><u>C</u>ancel</button></div>`;
    p.body.append(box);
    const fields = [...box.querySelectorAll('.pick, button')] as HTMLElement[];
    let done = false;
    const finish = (act: PrintAct) => { if (done) return; done = true; lastOpts = { ...o }; p.close(); resolve({ act, opts: { ...o } }); };
    box.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) finish(b.dataset.v as PrintAct); });
    const change = (el: HTMLElement, k: string) => {
      const f = el.dataset.f as keyof PrintOpts;
      if (f === 'fmt') {
        o.fmt = (['D', 'S', 'T'] as const).includes(k as any) ? (k as 'D' | 'S' | 'T') : ({ D: 'S', S: 'T', T: 'D' } as const)[o.fmt];
        el.textContent = o.fmt;
      } else {
        (o as any)[f] = k === 'Y' ? true : k === 'N' ? false : !(o as any)[f];
        el.textContent = yn((o as any)[f]);
      }
    };
    fields[0].focus();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el instanceof HTMLButtonElement) {
        if (k === 'ArrowRight' || k === 'Tab') { fields[Math.min(fields.length - 1, i + 1)].focus(); return true; }
        if (k === 'ArrowLeft') { fields[Math.max(0, i - 1)].focus(); return true; }
        if (k === 'Enter') { finish(el.dataset.v as PrintAct); return true; }
        const hit = ({ V: 'view', P: 'print', E: 'excel', C: 'cancel' } as Record<string, PrintAct>)[k];
        if (hit) { finish(hit); return true; }
      } else if (i >= 0) {
        if (k === 'Enter' || k === 'ArrowDown' || k === 'Tab') { fields[i + 1].focus(); return true; }
        if (k === 'ArrowUp') { fields[Math.max(0, i - 1)].focus(); return true; }
        const fmtKey = el.dataset.f === 'fmt' && ['D', 'S', 'T'].includes(k);
        if (k === 'Space' || k === 'ArrowLeft' || k === 'ArrowRight' || fmtKey || (el.dataset.f !== 'fmt' && (k === 'Y' || k === 'N'))) { change(el, k); return true; }
      }
      if (k === 'Escape') { finish('cancel'); return true; }
      return true;
    };
  });
}

/** The printed / viewed book in the chosen format. */
function bookHtml(title: string, company: any, from: string, to: string, rows: Row[], o: PrintOpts) {
  const dr = r2(rows.reduce((s, r) => s + r.debit, 0)), cr = r2(rows.reduce((s, r) => s + r.credit, 0));
  const head = `<h2>${esc(company.name)}</h2><div style="text-align:center">${esc(`${company.address1 ?? ''} ${company.address2 ?? ''}`)}</div>
    <h3 style="text-align:center;margin:6px 0">${esc(title)}${o.range ? ` &nbsp; ${dmy(from)} to ${dmy(to)}` : ''}</h3>
    ${o.page ? '<style>@page { @bottom-right { content: "Page " counter(page); font: 11px monospace; } }</style>' : ''}`;
  const remark = (r: Row) => esc([o.vno ? r.no : '', o.narr ? (r.narration || (r.source === 'BILL' ? r.remark : '')) : (r.source === 'BILL' ? r.remark : '')].filter(Boolean).join(' '));
  if (o.fmt === 'T') {
    const side = (list: Row[], key: 'debit' | 'credit') => `<table class="grid"><tr><th>Date</th><th>Particulars</th><th>Type</th><th class="n">Amount</th></tr>
      ${list.map((r) => `<tr><td>${dm(r.date)}</td><td>${esc(r.party)}${remark(r) ? `<br><small>${remark(r)}</small>` : ''}</td><td>${esc(r.type)}</td><td class="n">${money(r[key])}</td></tr>`).join('')}
      <tr class="total"><td colspan="3"><b>Total</b></td><td class="n"><b>${money(key === 'debit' ? dr : cr)}</b></td></tr></table>`;
    return `${head}<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div><b>DEBIT</b>${side(rows.filter((r) => r.debit), 'debit')}</div>
      <div><b>CREDIT</b>${side(rows.filter((r) => r.credit), 'credit')}</div></div>
      <div style="margin-top:10px;text-align:right;font-size:14px;padding:6px 12px;background:#f0f4f8;border:1px solid #ccc"><b>Net Closing Balance : ${drcr(dr - cr)}</b></div>`;
  }
  const simple = o.fmt === 'S';
  return `${head}<table class="grid"><tr><th>Date</th><th>Party Name</th>${simple ? '' : '<th>Remark</th>'}<th class="n">Debit</th><th class="n">Credit</th><th>Type</th></tr>
    ${rows.map((r) => `<tr><td>${dm(r.date)}</td><td>${esc(r.party)}</td>${simple ? '' : `<td>${remark(r)}</td>`}
      <td class="n">${r.debit ? money(r.debit) : ''}</td><td class="n">${r.credit ? money(r.credit) : ''}</td><td>${esc(r.type)}</td></tr>`).join('')}
    ${o.total ? `<tr class="total"><td colspan="${simple ? 2 : 3}"><b>Total (${rows.length} entries)</b></td><td class="n"><b>${money(dr)} Dr</b></td><td class="n"><b>${money(cr)} Cr</b></td><td></td></tr>
    <tr class="total" style="background:#f0f4f8"><td colspan="${simple ? 2 : 3}"><b>Net Closing Balance</b></td><td colspan="2" class="n"><b>${drcr(dr - cr)}</b></td><td></td></tr>` : ''}</table>`;
}

function downloadCsv(name: string, rows: Row[]) {
  const dr = r2(rows.reduce((s, r) => s + r.debit, 0)), cr = r2(rows.reduce((s, r) => s + r.credit, 0));
  const q = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [
    ['Date', 'Party Name', 'Remark', 'Voucher No', 'Debit', 'Credit', 'Type'].map(q).join(','),
    ...rows.map((r) => [dmy(r.date), r.party, r.narration || r.remark, r.no, r.debit ? f2(r.debit) : '', r.credit ? f2(r.credit) : '', r.type].map(q).join(',')),
    ['Total', '', '', '', `${f2(dr)} Dr`, `${f2(cr)} Cr`, ''].map(q).join(','),
    ['Net Closing Balance', '', '', '', drcr(dr - cr), '', ''].map(q).join(','),
  ];
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// ------------------------------------------------------------------ the screen
export async function bookScreen(kind: Kind) {
  const title = kind === 'DAY' ? 'DAY BOOK' : 'SALE BOOK';
  const t = today();
  const per = await periodBox(title, t, t, kind === 'DAY');
  if (!per) return;
  let { from, to } = per;
  const ledger = per.ledger;
  const company = await api<any>('/company');

  const w = openWin(title, 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Dt</span><span><b>F4</b>-Nar</span><span><b>Enter</b>-Bill / Voucher</span><span><b>Del</b>-Delete</span><span><b>F10/Ctrl+P</b>-Print</span><span><b>Esc</b>-Exit</span>');
  const screen = h('div', { class: 'db-screen' });
  screen.innerHTML = `
    <div class="db-main">
      <div class="db-top"><span class="co">${esc(company.name)}${ledger ? ` : ${esc(ledger.name.toUpperCase())}` : ''}</span><span class="per"></span></div>
      <div class="db-cols"><span>DATE</span><span>PARTY NAME</span><span>REMARK</span><span class="n">DEBIT</span><span class="n">CREDIT</span><span class="n">TYPE</span></div>
      <div class="db-rows"></div>
      <div class="db-foot">
        <div><span class="k">REMARK :</span><div class="rm"></div></div>
        <div class="tot">
          <div class="tot-row"><span class="k">VOUCHER TOTAL :</span><b class="dr"></b><b class="cr"></b></div>
          <div class="tot-row"><span class="k">NET CLOSING :</span><b class="net"></b></div>
        </div>
      </div>
    </div>
    <div class="db-detail"></div>`;
  screen.prepend(margBar(title));
  w.body.append(screen);
  const rowsBox = screen.querySelector('.db-rows') as HTMLElement;
  let rows: Row[] = [];
  let sel = 0;
  let showNarr = true;

  const remarkOf = (r: Row) => (showNarr && r.source === 'VOUCHER' ? r.remark : r.source === 'BILL' ? r.no : r.no);
  function draw() {
    (screen.querySelector('.per') as HTMLElement).textContent = `Period : ${dmy(from)} - ${dmy(to)}`;
    rowsBox.innerHTML = rows.length ? rows.map((r, i) => `<div class="r${i === sel ? ' sel' : ''}" data-i="${i}"><span>${dm(r.date)}</span><span>${esc(r.party.toUpperCase())}</span>
        <span>${esc(remarkOf(r))}</span><span class="n">${r.debit ? f2(r.debit) : ''}</span><span class="n">${r.credit ? f2(r.credit) : ''}</span><span class="n">${esc(r.type)}</span></div>`).join('')
      : '<div class="empty">No entries in this period</div>';
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const dr = r2(rows.reduce((s, r) => s + r.debit, 0)), cr = r2(rows.reduce((s, r) => s + r.credit, 0));
    (screen.querySelector('.tot .dr') as HTMLElement).textContent = `${f2(dr)} Dr`;
    (screen.querySelector('.tot .cr') as HTMLElement).textContent = `${f2(cr)} Cr`;
    const netEl = screen.querySelector('.tot .net') as HTMLElement | null;
    if (netEl) netEl.textContent = drcr(dr - cr);
    const cur = rows[sel];
    (screen.querySelector('.rm') as HTMLElement).textContent = cur ? (cur.narration || cur.remark) : '';
    detail();
  }

  let detailSeq = 0;
  async function detail() {
    const box = screen.querySelector('.db-detail') as HTMLElement;
    const cur = rows[sel];
    const seq = ++detailSeq;
    if (!cur) { box.innerHTML = '<div class="bar">Voucher Detail</div>'; return; }
    try {
      if (cur.source === 'BILL') {
        const b = await api<any>(`/bills/${cur.source_id}`);
        if (seq !== detailSeq) return;
        const byRate = new Map<number, { hsn: string; taxable: number; tax: number }>();
        for (const l of b.lines) {
          const g = byRate.get(l.gst_rate) ?? { hsn: l.hsn ?? '', taxable: 0, tax: 0 };
          g.taxable += l.taxable; g.tax += l.tax;
          byRate.set(l.gst_rate, g);
        }
        const tot = [...byRate.values()].reduce((s, g) => ({ taxable: s.taxable + g.taxable, tax: s.tax + g.tax }), { taxable: 0, tax: 0 });
        box.innerHTML = `<div class="bar">Voucher Detail</div>
          <div class="g h"><span>HSN/SAC</span><span>SGST%<br>AMT</span><span>CGST%<br>AMT</span><span>CESS%<br>AMT</span><span>AMOUNT<br>TAXABLE</span></div>
          <div>GSTIN No.: ${esc(b.walkin_gstin || '')}</div><div>State : -${esc(b.sale_type ?? '')}</div>
          ${[...byRate.entries()].map(([rate, g]) => `<div class="g"><span>${esc(g.hsn)}</span><span>${f2(rate / 2)}<br>${f2(g.tax / 2)}</span><span>${f2(rate / 2)}<br>${f2(g.tax / 2)}</span><span>0.00<br>0</span><span>${f2(g.taxable)}<br>${f2(g.taxable)}</span></div>`).join('')}
          <div class="g total"><span>TOTAL</span><span>${f2(tot.tax / 2)}</span><span>${f2(tot.tax / 2)}</span><span>0</span><span>${f2(tot.taxable)}</span></div>
          <div class="bar">BILL</div><div>${esc(b.no)} &nbsp; ${dmy(b.date)}</div><div>Net Amount : <b>${f2(b.net)}</b></div><div>Mode : ${esc(b.mode)}</div>`;
      } else {
        const v = await api<any>(`/vouchers/${cur.source_id}`);
        if (seq !== detailSeq) return;
        box.innerHTML = `<div class="bar">Voucher Detail</div><div>${esc(v.no)} &nbsp; ${dmy(v.date)}</div>
          ${v.lines.map((l: any) => `<div class="g2"><span>${l.debit ? 'Dr' : 'Cr'} ${esc(l.ledger)}</span><span>${f2(l.debit || l.credit)}</span></div>`).join('')}
          ${(v.adjustments ?? []).length ? `<div class="bar">BILL ADJUSTMENT</div>${v.adjustments.map((a: any) => `<div class="g2"><span>${esc(a.bill_no ?? 'On Account')}</span><span>${f2(a.amount)}</span></div>`).join('')}` : ''}
          ${v.narration ? `<div class="bar">NARRATION</div><div>${esc(v.narration)}</div>` : ''}`;
      }
    } catch { if (seq === detailSeq) box.innerHTML = '<div class="bar">Voucher Detail</div>'; }
  }

  async function load() {
    rows = kind === 'DAY'
      ? await api<Row[]>(`/reports/day-book?from=${from}&to=${to}${ledger ? `&ledger=${ledger.id}` : ''}`)
      : await api<Row[]>(`/reports/sale-book?from=${from}&to=${to}`);
    sel = Math.min(sel, Math.max(0, rows.length - 1));
    draw();
  }

  async function printFlow() {
    const { act, opts } = await printingBox();
    if (act === 'cancel') return;
    if (act === 'excel') { downloadCsv(`${title.replace(' ', '_')}_${from}_${to}.csv`, rows); toast('Excel (CSV) file downloaded'); return; }
    const html = bookHtml(title, company, from, to, rows, opts);
    if (act === 'view') {
      const pv = openWin(`View - ${title}`, 'wide', '<span><b>Ctrl+P</b> Print</span><span><b>Esc</b> Close</span>');
      pv.body.append(h('div', { class: 'print-area' }, html));
      pv.onKey = (_e, k) => { if (k === 'Ctrl+P') { import('./billing.ts').then((m) => m.printHtml(html, 1)); return true; } return false; };
      return;
    }
    (await import('./billing.ts')).printHtml(html, 1);
  }

  function open(r: Row) {
    if (r.source === 'BILL') {
      // SALE ALTERATION: the saved bill with Next / Previous walking the bills of this book.
      const bills = [...new Map(rows.filter((x) => x.source === 'BILL').map((x) => [x.source_id, { id: x.source_id, type: x.vtype }])).values()];
      const at = bills.findIndex((x) => x.id === r.source_id);
      import('./billview.ts').then((m) => m.billAlteration(bills, at, () => load()));
    } else {
      if (!canAction(`voucher.list:${r.vtype}`)) { toast('Access denied — your role cannot modify vouchers', true); return; }
      import('./vouchers.ts').then((m) => m.voucherEntry(r.vtype, r.source_id));
    }
  }

  rowsBox.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
    if (el) { sel = Number(el.dataset.i); draw(); }
  });
  w.onKey = (_e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && rows.length) { sel = Math.min(rows.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'End' || k === 'Ctrl+End') { sel = Math.max(0, rows.length - 1); draw(); return true; }
    if (k === 'F2') {
      periodBox(title, from, to, false).then((p) => { if (p) { from = p.from; to = p.to; load(); } });
      return true;
    }
    if (k === 'F4') { showNarr = !showNarr; draw(); return true; }
    if (k === 'F10' || k === 'Ctrl+P') { printFlow(); return true; }
    if (k === 'Enter' && rows[sel]) { open(rows[sel]); return true; }
    if (k === 'Delete' && rows[sel]) { remove(rows[sel]); return true; }
    return false;
  };
  w.onClose = () => { detailSeq++; };

  /** Del: delete the highlighted bill or voucher (Receipt, Payment …) after Yes. */
  async function remove(r: Row) {
    const isBill = r.source === 'BILL';
    if (!canDelete()) { toast(NO_DELETE, true); return; }
    if (!isBill && !canAction(`voucher.list:${r.vtype}`)) { toast('Access denied — your role cannot delete vouchers', true); return; }
    const what = `${isBill ? 'Bill' : 'Voucher'} ${r.no ?? ''}${r.party ? ` (${r.party})` : ''}`;
    if (!(await confirmBox(`Delete ${what} ?`, false))) return;
    try {
      await api(`/${isBill ? 'bills' : 'vouchers'}/${r.source_id}`, { method: 'DELETE' });
      toast(`${what} deleted`);
      load();
    } catch (err) { toast((err as Error).message, true); }
  }
  await load();
}
