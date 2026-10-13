import { api, openWin, GridList, confirmBox, toast, money, esc, fmtDate, h, reloadOnClose } from './ui.ts';
import { type Ledger } from './masters.ts';
import { saleEntry } from './sale.ts';

export const BILL_TITLE: Record<string, string> = {
  SALE: 'Sale Bill', PURCHASE: 'Purchase Bill', SALE_CHALLAN: 'Sale Challan', PURCHASE_CHALLAN: 'Purchase Challan',
  SALE_RETURN: 'Sale Return (Brk/Exp Receive)', PURCHASE_RETURN: 'Purchase Return (Brk/Exp Issue)', COUNTER_SALE: 'Counter Sale',
};
// ------------------------------------------------------------------ bill list (Modify)
export async function billList(type: string) {
  const types = type.split(',');
  const w = openWin(`Modify ${BILL_TITLE[types[0]] ?? 'Bill'}`, 'wide',
    '<span><b>Enter / F3</b> Modify</span><span><b>F2</b> New</span><span><b>F10</b> Print</span><span><b>Del</b> Delete</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<any>(w.body, [
    { title: 'Date', get: (r) => fmtDate(r.date) }, { title: 'Bill No.', get: (r) => r.no },
    { title: 'Party', get: (r) => r.party }, { title: 'Mode', get: (r) => r.mode },
    { title: 'Taxable', get: (r) => r.taxable, money: true }, { title: 'GST', get: (r) => r.tax, money: true },
    { title: 'Net Amount', get: (r) => r.net, money: true },
  ], (r) => `${r.no} ${r.party}`);
  g.footerRow = (rows) => `<tr class="total"><td colspan="4">Total (${rows.length} bills)</td><td class="n">${money(rows.reduce((s, r) => s + r.taxable, 0))}</td>
    <td class="n">${money(rows.reduce((s, r) => s + r.tax, 0))}</td><td class="n">${money(rows.reduce((s, r) => s + r.net, 0))}</td></tr>`;
  const load = async () => g.setRows(await api(`/bills?type=${type}`), true);
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if ((k === 'Enter' || k === 'F3') && cur) { saleEntry(cur.type, cur.id); reloadOnClose(load); return true; }
    if (k === 'F2') { saleEntry(types[0]); reloadOnClose(load); return true; }
    if (k === 'F10' && cur) { printBill(cur.id); return true; }
    if (k === 'Delete' && cur) {
      confirmBox(`Delete bill ${cur.no} (${money(cur.net)}) ?`, false).then(async (y) => {
        if (!y) return;
        await api(`/bills/${cur.id}`, { method: 'DELETE' });
        toast('Bill deleted');
        load();
      });
      return true;
    }
    return false;
  };
}
// ------------------------------------------------------------------ print
async function billHtml(id: number) {
  const [b, c] = await Promise.all([api(`/bills/${id}`), api('/company')]);
  const p = await api<Ledger>(`/ledgers/${b.party_id}`);
  const html = `<h2>${esc(c.name)}</h2><div style="text-align:center">${esc(c.address1)} ${esc(c.address2)}<br>GSTIN: ${esc(c.gstin)}</div>
    <hr><div style="display:flex;justify-content:space-between"><div><b>${esc(BILL_TITLE[b.type])}</b><br>Party: <b>${esc(b.walkin_name || p.name)}</b><br>${esc(p.address)} ${esc(p.city)}<br>GSTIN: ${esc(b.walkin_gstin || p.gstin || '-')}</div>
    <div>No: <b>${esc(b.no)}</b><br>Date: ${fmtDate(b.date)}<br>${esc(b.mode)}</div></div><hr>
    <table class="grid"><tr><th>#</th><th>Item</th><th>Batch</th><th class="n">Qty</th><th class="n">Free</th><th class="n">Rate</th><th class="n">Disc%</th><th class="n">GST%</th><th class="n">Amount</th></tr>
    ${b.lines.map((l: any, i: number) => `<tr><td>${i + 1}</td><td>${esc(l.item_name)}</td><td>${esc(l.batch)}</td><td class="n">${l.qty}</td><td class="n">${l.free || ''}</td>
      <td class="n">${money(l.rate)}</td><td class="n">${l.disc_pct || ''}</td><td class="n">${l.gst_rate}</td><td class="n">${money(l.amount)}</td></tr>`).join('')}</table>
    <div style="text-align:right;margin-top:8px;line-height:1.6">Gross: ${money(b.gross)}<br>Discount: ${money(b.discount)}<br>Taxable: ${money(b.taxable)}<br>
    CGST: ${money(b.tax / 2)} &nbsp; SGST: ${money(b.tax / 2)}<br>Round Off: ${money(b.round_off)}<br><b style="font-size:18px">NET AMOUNT: ${money(b.net)}</b></div>
    ${b.narration ? `<div>Narration: ${esc(b.narration)}</div>` : ''}<div style="margin-top:30px;text-align:right">For ${esc(c.name)}<br><br>Authorised Signatory</div>`;
  return { b, html };
}

export async function printBill(id: number) {
  const { b, html } = await billHtml(id);
  const w = openWin(`Print - ${b.no}`, 'wide', '<span><b>Enter / Ctrl+P</b> Print</span><span><b>Esc</b> Close</span>');
  const area = h('div', { class: 'print-area' });
  area.innerHTML = html;
  w.body.append(area);
  w.onKey = (_e, k) => { if (k === 'Enter' || k === 'Ctrl+P') { window.print(); return true; } return false; };
}

/**
 * SALE ENTRY → End → MODE OF PAYMENT → End → "No. of Copies" → Enter: sends that many
 * copies of the saved bill to the printer, one per page.
 */
export async function printCopies(id: number, copies: number) {
  printHtml((await billHtml(id)).html, copies);
}

/** Prints `copies` copies of a page of HTML (bill, receipt …), one per sheet. */
export function printHtml(html: string, copies: number) {
  let root = document.getElementById('print-root');
  if (!root) { root = h('div', { id: 'print-root' }); document.body.append(root); }
  root.innerHTML = Array.from({ length: copies }, () => `<div class="print-area bill-copy">${html}</div>`).join('');
  document.body.classList.add('print-bill');
  try { window.print(); } finally {
    document.body.classList.remove('print-bill');
    root.innerHTML = '';
  }
}
