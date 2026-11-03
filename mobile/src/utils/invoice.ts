// Bill → PDF (expo-print) → share sheet (WhatsApp, email…). Same content as the web print (client/billing.ts).
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { api } from '../api/client';
import { BillService, LedgerService } from '../api/services';
import { Bill, Ledger } from '../types';
import { BILL } from '../labels';
import { amt, dmy, r2 } from './format';

const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen',
  'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const two = (n: number) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${ONES[n % 10]}`.trim());
const three = (n: number) => `${n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred ` : ''}${two(n % 100)}`.trim();
/** 12345.5 → "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only" (Indian system). */
export function inWords(v: number) {
  let n = Math.floor(Math.abs(v));
  const paise = Math.round((Math.abs(v) - n) * 100);
  const parts: string[] = [];
  for (const [div, name] of [[1e7, 'Crore'], [1e5, 'Lakh'], [1e3, 'Thousand']] as [number, string][]) {
    if (n >= div) { parts.push(`${two(Math.floor(n / div))} ${name}`); n %= div; }
  }
  if (n) parts.push(three(n));
  const rs = parts.join(' ') || 'Zero';
  return `Rupees ${rs}${paise ? ` and ${two(paise)} Paise` : ''} Only`;
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const det = (j?: string) => { try { return JSON.parse(j || '{}') as Record<string, string>; } catch { return {}; } };

export function invoiceHtml(b: Bill, company: any, party: Partial<Ledger>) {
  const k = BILL[b.type];
  const cDet = det(company.details);
  const pDet = det(party.details);
  const lines = b.lines ?? [];
  const isCredit = b.mode !== 'CASH';
  const pBal = Number(party.balance) || 0;
  const oldBal = Math.max(0, r2(isCredit ? pBal - b.net : pBal));

  // GST summary by rate, as on the web print.
  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const l of lines) {
    const g = byRate.get(Number(l.gst_rate)) ?? { taxable: 0, tax: 0 };
    g.taxable += Number(l.taxable) || 0;
    g.tax += Number(l.tax) || 0;
    byRate.set(Number(l.gst_rate), g);
  }

  const rows = lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td><b>${esc(l.item_name)}</b>${l.pack ? `<br/><small>${esc(l.pack)}</small>` : ''}</td>
      <td class="c">${esc(l.batch)}${l.expiry ? `<br/><small>${esc(l.expiry)}</small>` : ''}</td>
      <td class="r">${l.qty}${l.free ? `+${l.free}` : ''}</td>
      <td class="r">${amt(l.mrp)}</td>
      <td class="r">${amt(l.rate)}</td>
      <td class="r">${l.disc_pct ? `${l.disc_pct}%` : ''}</td>
      <td class="r">${l.gst_rate}%</td>
      <td class="r">${amt(l.amount)}</td>
    </tr>`).join('');

  const gstRows = [...byRate.entries()].sort((a, c) => a[0] - c[0]).map(([rate, g]) => `
    <tr><td>GST ${rate}%</td><td class="r">${amt(g.taxable)}</td><td class="r">${amt(g.tax / 2)}</td><td class="r">${amt(g.tax / 2)}</td><td class="r">${amt(g.tax)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #111; margin: 18px; }
  .head { text-align: center; border: 1.5px solid #222; padding: 8px; }
  .head h1 { margin: 0; font-size: 20px; letter-spacing: 1px; }
  .head p { margin: 2px 0; }
  .title { text-align: center; font-weight: bold; font-size: 13px; background: #eee; border: 1.5px solid #222; border-top: 0; padding: 4px; }
  .meta { display: flex; border: 1.5px solid #222; border-top: 0; }
  .meta > div { flex: 1; padding: 6px 8px; }
  .meta > div + div { border-left: 1px solid #222; }
  table { width: 100%; border-collapse: collapse; }
  .items th, .items td { border: 1px solid #444; padding: 4px; vertical-align: top; }
  .items th { background: #eee; font-size: 10.5px; }
  .c { text-align: center; } .r { text-align: right; }
  .bottom { display: flex; gap: 10px; margin-top: 8px; }
  .gst td, .gst th { border: 1px solid #888; padding: 3px 5px; font-size: 10.5px; }
  .tot td { padding: 3px 6px; } .tot .net td { font-size: 14px; font-weight: bold; border-top: 1.5px solid #222; }
  .words { margin-top: 8px; font-weight: bold; }
  .foot { display: flex; justify-content: space-between; margin-top: 30px; }
  small { color: #555; }
</style></head><body>
  <div class="head">
    <h1>${esc(String(company.name ?? '').toUpperCase())}</h1>
    <p>${esc([company.address1, company.address2, company.station].filter(Boolean).join(', '))}</p>
    <p>${company.gstin ? `GSTIN: <b>${esc(company.gstin)}</b>` : ''}${cDet.phone || company.phone ? ` &nbsp; Ph: ${esc(cDet.phone || company.phone)}` : ''}${company.state ? ` &nbsp; State: ${esc(company.state)}` : ''}</p>
  </div>
  <div class="title">${b.type === 'SALE' || b.type === 'COUNTER_SALE' ? 'TAX INVOICE' : esc(k.title.toUpperCase())} — ${isCredit ? 'CREDIT' : 'CASH'}</div>
  <div class="meta">
    <div>
      <small>${esc(k.partyLabel)}</small><br/>
      <b style="font-size:13px">${esc((b.walkin_name || party.name || b.party || '').toUpperCase())}</b><br/>
      ${esc([party.address, party.city].filter(Boolean).join(', '))}<br/>
      ${b.walkin_mobile || party.phone || pDet.mobile ? `Ph: ${esc(b.walkin_mobile || party.phone || pDet.mobile)}<br/>` : ''}
      ${party.gstin ? `GSTIN: ${esc(party.gstin)}` : ''}
    </div>
    <div>
      Invoice No: <b>${esc(b.no)}</b><br/>
      Date: <b>${dmy(b.date)}</b><br/>
      ${b.ref_no ? `Party Inv: ${esc(b.ref_no)} ${b.ref_date ? dmy(b.ref_date) : ''}<br/>` : ''}
      ${b.mr_name ? `M.R.: <b>${esc(b.mr_name)}</b>` : ''}
    </div>
  </div>
  <table class="items">
    <tr><th>#</th><th>Item</th><th>Batch / Exp</th><th>Qty</th><th>MRP</th><th>Rate</th><th>Disc</th><th>GST</th><th>Amount</th></tr>
    ${rows}
  </table>
  <div class="bottom">
    <div style="flex:1.3">
      <table class="gst"><tr><th>Class</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total GST</th></tr>${gstRows}</table>
      ${isCredit && k.module === 'sale' ? `<p style="margin-top:8px">Old Balance: <b>₹${amt(oldBal)}</b> &nbsp; This Bill: <b>₹${amt(b.net)}</b> &nbsp; Total: <b>₹${amt(oldBal + b.net)}</b></p>` : ''}
    </div>
    <table class="tot" style="flex:1">
      <tr><td>Gross</td><td class="r">${amt(b.gross)}</td></tr>
      ${b.discount ? `<tr><td>Discount</td><td class="r">-${amt(b.discount)}</td></tr>` : ''}
      <tr><td>Taxable</td><td class="r">${amt(b.taxable)}</td></tr>
      <tr><td>CGST</td><td class="r">${amt(b.tax / 2)}</td></tr>
      <tr><td>SGST</td><td class="r">${amt(b.tax / 2)}</td></tr>
      ${b.cd_amt ? `<tr><td>Cash Disc.</td><td class="r">-${amt(b.cd_amt)}</td></tr>` : ''}
      ${b.freight ? `<tr><td>Freight</td><td class="r">${amt(b.freight)}</td></tr>` : ''}
      ${b.other_charges ? `<tr><td>Other</td><td class="r">${amt(b.other_charges)}</td></tr>` : ''}
      <tr><td>Round Off</td><td class="r">${amt(b.round_off)}</td></tr>
      <tr class="net"><td>NET AMOUNT</td><td class="r">₹${amt(b.net)}</td></tr>
    </table>
  </div>
  <div class="words">${inWords(b.net)}</div>
  ${b.narration ? `<p>Remark: ${esc(b.narration)}</p>` : ''}
  <div class="foot">
    <div><small>Goods once sold will not be taken back. Subject to local jurisdiction.</small></div>
    <div class="c">For ${esc(String(company.name ?? '').toUpperCase())}<br/><br/><br/>Authorised Signatory</div>
  </div>
</body></html>`;
}

/** Builds the bill's PDF and opens the share sheet (pick WhatsApp). */
export async function shareInvoice(billId: number) {
  const b = await BillService.get(billId);
  const [company, party] = await Promise.all([
    api.get<any>('/company').catch(() => ({})),
    LedgerService.get(b.party_id).catch(() => ({} as Partial<Ledger>)),
  ]);
  const { uri } = await Print.printToFileAsync({ html: invoiceHtml(b, company, party) });
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device');
  await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: `${BILL[b.type].title} ${b.no}`, UTI: 'com.adobe.pdf' });
}
