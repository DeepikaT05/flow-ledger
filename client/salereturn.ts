// SALE RETURN windows, as in MARG ERP 9+: BILL DETAILS (Batch Selection, Return of Bills,
// Return of Bill ↓, Date, Amount, Reason, Last Bill, Calculation Type) with the party's
// BILL'S list, the returned bill's items (Space / + to pick), "Select From Sold" and Save In.
import { api, esc, toast, h } from './ui.ts';
import { margPop, popList } from './margui.ts';

export interface PartyBill { id: number; no: string; date: string; net: number; type: string }
export interface ReturnInfo { batchSel: string; mode: string; bill: PartyBill | null; reason: string; calc: string }
export interface SoldItem { item_id: number; name: string; pack: string; unit: string; gst_rate: number; batch_id: number | null; batch: string; expiry: string; mrp: number; rate: number; qty: number; last_date: string; last_no: string }

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');

export const BATCH_SEL = ['Manual', 'Select From Sold'];
export const RETURN_OF = ['Multiple', 'Separate', 'Bill by Bill'];
export const CALC_TYPES = ['1 Exclusive (Rate + GST)', '9 All Inclusive'];

/** BILL DETAILS. ↓ in RETURN OF BILL takes the last bill; Reason is required. Esc goes back. */
export function billDetails(partyId: number, init: ReturnInfo | null): Promise<ReturnInfo | null> {
  return new Promise(async (resolve) => {
    const bills = await api<PartyBill[]>(`/bills?party=${partyId}&type=SALE,COUNTER_SALE`).catch(() => [] as PartyBill[]);
    const last = bills[0] ?? null;
    const p = margPop('BILL DETAILS', '<span><b>Enter</b>-Next</span><span><b>Space/←→</b>-Change</span><span><b>↓</b>-Last Bill</span><span><b>Esc</b>-Back</span>', '1080px');
    const v: ReturnInfo = init ? { ...init } : { batchSel: BATCH_SEL[0], mode: RETURN_OF[0], bill: null, reason: '', calc: CALC_TYPES[1] };
    const box = h('div', { class: 'sr-details' });
    box.innerHTML = `
      <div class="form">
        <label>BATCH SELECTION</label><span class="pick wide" tabindex="0" data-f="batchSel"></span>
        <label>RETURN OF BILLS</label><span class="pick" tabindex="0" data-f="mode"></span>
        <label>RETURN OF BILL &#8595;</label><input data-f="bill" autocomplete="off">
        <label>DATE</label><span class="val" data-v="date"></span>
        <label>AMOUNT</label><span class="val n" data-v="amt"></span>
        <label>REASON</label><input data-f="reason" autocomplete="off">
        <label>LAST BILL NO.</label><span class="val">${esc(last?.no ?? '')}</span>
        <label class="in">BILL DATE</label><span class="val">${last ? dmy(last.date) : ''}</span>
        <label class="in">BILL AMOUNT</label><span class="val">${last ? f2(last.net) : ''}</span>
        <label>CALCULATION TYPE</label><span class="pick wide" tabindex="0" data-f="calc"></span>
      </div>
      <div class="bills"><div class="cap">BILL'S</div>${bills.map((b) => `<div class="g" data-id="${b.id}"><span>${esc(b.no)}</span><span>${dmy(b.date)}</span><span>${f2(b.net)}</span></div>`).join('') || '<div class="g">No bills</div>'}</div>`;
    p.body.append(box);
    const q = (s: string) => box.querySelector(s) as HTMLElement;
    const billI = q('[data-f=bill]') as HTMLInputElement, reasonI = q('[data-f=reason]') as HTMLInputElement;
    billI.value = v.bill?.no ?? '';
    reasonI.value = v.reason;
    const draw = () => {
      q('[data-f=batchSel]').textContent = v.batchSel;
      q('[data-f=mode]').textContent = v.mode;
      q('[data-f=calc]').textContent = v.calc;
      q('[data-v=date]').textContent = v.bill ? dmy(v.bill.date) : '';
      q('[data-v=amt]').textContent = f2(v.bill?.net ?? 0);
      box.querySelectorAll('.bills .g').forEach((g) => g.classList.toggle('sel', Number((g as HTMLElement).dataset.id) === v.bill?.id));
      box.querySelector('.bills .g.sel')?.scrollIntoView({ block: 'nearest' });
    };
    const setBill = (b: PartyBill | null) => { v.bill = b; billI.value = b?.no ?? ''; draw(); };
    const fields = [...box.querySelectorAll('[data-f]')] as HTMLElement[];
    const cycle = (list: string[], cur: string, dir: number) => list[(list.indexOf(cur) + dir + list.length) % list.length];
    box.querySelectorAll('.bills .g[data-id]').forEach((g) => g.addEventListener('click', () => { setBill(bills.find((b) => b.id === Number((g as HTMLElement).dataset.id)) ?? null); billI.focus(); }));
    let done = false;
    const finish = (r: ReturnInfo | null) => { if (done) return; done = true; p.close(); resolve(r); };
    fields[0].focus();
    draw();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const f = el?.dataset?.f;
      const i = fields.indexOf(el);
      if (f === 'batchSel' || f === 'mode' || f === 'calc') {
        const list = f === 'batchSel' ? BATCH_SEL : f === 'mode' ? RETURN_OF : CALC_TYPES;
        if (k === 'Space' || k === 'ArrowRight') { (v as any)[f] = cycle(list, (v as any)[f], 1); draw(); return true; }
        if (k === 'ArrowLeft') { (v as any)[f] = cycle(list, (v as any)[f], -1); draw(); return true; }
      }
      if (f === 'bill') {
        // ↓ takes the last bill (MARG); further ↓ / ↑ walk the BILL'S list.
        if (k === 'ArrowDown' || k === 'ArrowUp') {
          const at = v.bill ? bills.findIndex((b) => b.id === v.bill!.id) : -1;
          const n = at < 0 ? 0 : Math.min(bills.length - 1, Math.max(0, at + (k === 'ArrowDown' ? 1 : -1)));
          if (bills[n]) setBill(bills[n]);
          return true;
        }
      }
      if (k === 'Enter') {
        if (f === 'bill') {
          const typed = billI.value.trim().toUpperCase();
          if (!typed) setBill(null);
          else if (typed !== v.bill?.no) {
            const b = bills.find((x) => x.no.toUpperCase() === typed) ?? bills.find((x) => x.no.toUpperCase().endsWith(typed));
            if (!b) { toast(`Bill ${typed} not found for this party`, true); billI.select(); return true; }
            setBill(b);
          }
        }
        if (f === 'reason') v.reason = reasonI.value.trim();
        if (f === 'reason' && !v.reason) { toast('Reason is required for a sale return', true); return true; }
        if (i < fields.length - 1) { fields[i + 1].focus(); (fields[i + 1] as HTMLInputElement).select?.(); return true; }
        v.reason = reasonI.value.trim();
        if (!v.reason) { toast('Reason is required for a sale return', true); reasonI.focus(); return true; }
        finish(v);
        return true;
      }
      if (k === 'ArrowUp' && i > 0 && f !== 'bill') { fields[i - 1].focus(); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}

/** The returned bill's items: Space / + picks, * all, - unpicks, Enter loads (the highlighted one if none picked). */
export function pickBillItems(bill: PartyBill): Promise<any[] | null> {
  return new Promise(async (resolve) => {
    const b = await api<any>(`/bills/${bill.id}`);
    const lines: any[] = b.lines;
    const picked = new Set<number>();
    let sel = 0;
    const p = margPop(`ITEMS OF ${bill.no} (${dmy(bill.date)})`, '<span><b>Space/+</b>-Select</span><span><b>-</b>-Unselect</span><span><b>*</b>-All</span><span><b>Enter</b>-Load</span><span><b>Esc</b>-Skip</span>', '900px');
    const box = h('div', { class: 'marg-list' });
    p.body.append(box);
    const draw = () => {
      box.innerHTML = `<div class="rows" style="height:320px"><table><thead><tr><th style="width:5%"></th><th>PRODUCT</th><th style="width:12%">PACK</th><th style="width:14%">BATCH</th>
        <th class="n" style="width:9%">QTY</th><th class="n" style="width:13%">RATE</th><th class="n" style="width:14%">AMOUNT</th></tr></thead><tbody>
        ${lines.map((l, i) => `<tr class="${i === sel ? 'sel' : ''}"><td>${picked.has(i) ? '&#10004;' : ''}</td><td>${esc(String(l.item_name).toUpperCase())}</td><td>${esc(l.pack ?? '')}</td>
          <td>${esc(l.batch ?? '')}</td><td class="n">${l.qty}</td><td class="n">${f2(l.rate)}</td><td class="n">${f2(l.amount)}</td></tr>`).join('')}</tbody></table></div>`;
      box.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
    };
    let done = false;
    const finish = (v: any[] | null) => { if (done) return; done = true; p.close(); resolve(v); };
    p.onKey = (_e, k) => {
      if (k === 'ArrowDown') { sel = Math.min(lines.length - 1, sel + 1); draw(); return true; }
      if (k === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); return true; }
      if (k === 'Space') { if (picked.has(sel)) picked.delete(sel); else picked.add(sel); draw(); return true; }
      if (k === '+') { picked.add(sel); draw(); return true; }
      if (k === '-') { picked.delete(sel); draw(); return true; }
      if (k === '*') { lines.forEach((_, i) => picked.add(i)); draw(); return true; }
      if (k === 'Enter') { finish((picked.size ? [...picked].sort((a, c) => a - c) : [sel]).map((i) => lines[i]).filter(Boolean)); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return true;
    };
    draw();
  });
}

/** Batch Selection "Select From Sold": only the items / batches sold to this party. */
export async function pickSold(partyId: number, initial: string): Promise<SoldItem | null> {
  const rows = await api<SoldItem[]>(`/ledgers/${partyId}/sold-items`);
  if (!rows.length) { toast('Nothing has been sold to this party yet', true); return null; }
  return popList<SoldItem>({
    title: 'SOLD ITEMS', rows, search: (r) => r.name, width: '1020px', findLabel: 'Find Name ? >>', initial,
    cols: [
      { title: 'DESCRIPTION', get: (r) => r.name.toUpperCase(), width: '36%' },
      { title: 'PACKING', get: (r) => (r.pack ?? '').toUpperCase(), width: '12%' },
      { title: 'BATCH', get: (r) => r.batch, width: '12%' },
      { title: 'SOLD', get: (r) => r.qty, num: true, width: '9%' },
      { title: 'RATE', get: (r) => f2(r.rate), num: true, width: '11%' },
      { title: 'LAST BILL', get: (r) => `${r.last_no} ${dmy(r.last_date)}` },
    ],
    foot: '<span><b>Enter</b>-Select</span><span><b>Esc</b>-Back</span>',
  });
}

/** Ctrl+W / End on a sale return: "Save In" — Bill/CR/DR Note, Separate or Challan. */
export function saveInBox(): Promise<'note' | 'separate' | 'challan' | null> {
  return new Promise((resolve) => {
    const opts: [string, 'note' | 'separate' | 'challan'][] = [['Save In Bill/CR/DR Note', 'note'], ['Save Separate', 'separate'], ['Save in Challan', 'challan']];
    const p = margPop('SAVE IN', '<span><b>↑↓</b>-Move</span><span><b>Enter</b>-Select</span><span><b>Esc</b>-Back</span>', '420px');
    const box = h('div', { class: 'sr-savein' });
    p.body.append(box);
    let sel = 0;
    const draw = () => { box.innerHTML = opts.map(([t], i) => `<div class="${i === sel ? 'sel' : ''}">${esc(t)}</div>`).join(''); };
    let done = false;
    const finish = (v: 'note' | 'separate' | 'challan' | null) => { if (done) return; done = true; p.close(); resolve(v); };
    p.onKey = (_e, k) => {
      if (k === 'ArrowDown') { sel = (sel + 1) % opts.length; draw(); return true; }
      if (k === 'ArrowUp') { sel = (sel - 1 + opts.length) % opts.length; draw(); return true; }
      if (k === 'Enter') { finish(opts[sel][1]); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return true;
    };
    draw();
  });
}
