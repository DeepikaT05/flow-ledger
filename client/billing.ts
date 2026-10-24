import { api, openWin, GridList, confirmBox, toast, money, esc, fmtDate, h, reloadOnClose } from './ui.ts';
import { type Ledger } from './masters.ts';
import { saleEntry } from './sale.ts';
import { canDelete, NO_DELETE } from './session.ts';

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
      if (!canDelete()) { toast(NO_DELETE, true); return true; }
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
import { inWords } from './receipt.ts';

// ------------------------------------------------------------------ print
async function billHtml(id: number) {
  const [b, c] = await Promise.all([api<any>(`/bills/${id}`), api<any>('/company')]);
  const p = await api<Ledger>(`/ledgers/${b.party_id}`).catch(() => ({} as Ledger));
  let salesmen: any[] = [];
  try { salesmen = await api('/salesmen'); } catch { /* ignore */ }
  const pDet = JSON.parse(p.details || '{}') as Record<string, string>;
  const cDet = JSON.parse(c.details || '{}') as Record<string, string>;
  const mrName = b.mr_id ? (salesmen.find((s: any) => s.id === b.mr_id)?.name || '') : (b.mr_name || pDet.mr_name || 'GOLU DAU');

  const companyName = (c.name || 'TAMRAKAR AGRO BORI').toUpperCase();
  const companyAddress = (c.address1 || 'BAZAR CHOWK BORI').toUpperCase();
  const companyPhone = c.phone || cDet.phone || '6267594738';
  const companyGstin = c.gstin || '22ANYPT1907C1ZX';

  const partyName = (b.walkin_name || p.name || 'CASH').toUpperCase();
  const partyPhone = b.walkin_mobile || p.phone || pDet.mobile || '';
  const partyGstin = b.walkin_gstin || p.gstin || '';
  const partyState = p.state ? p.state.split('-')[0].trim() : (pDet.state ? pDet.state.split('-')[0].trim() : '22');

  const isCredit = b.mode !== 'CASH';
  const pBal = Number(p.balance) || 0;
  const oldBal = Math.max(0, Math.round((isCredit ? pBal - b.net : pBal) * 100) / 100);
  const todayBal = Number(b.net) || 0;
  const totalBal = oldBal + (isCredit ? todayBal : 0);

  const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const expShort = (e?: string) => (e && e.length >= 7 ? `${e.slice(5, 7)}/${e.slice(2, 4)}` : (e || ''));

  // Collect all GST rates (standard 5, 12, 18, 28 + any rates from lines)
  const ratesSet = new Set<number>([5, 12, 18]);
  for (const l of b.lines) {
    const r = Number(l.gst_rate) || Number(l.item_gst) || 0;
    if (r > 0) ratesSet.add(r);
  }
  const gstRows = [...ratesSet].sort((a, b) => a - b).map((rate) => ({ label: `GST ${rate} %`, rate }));
  const byGst = new Map<number, { total: number; sch: number; disc: number; sgst: number; cgst: number; totalGst: number }>();
  for (const g of gstRows) byGst.set(g.rate, { total: 0, sch: 0, disc: 0, sgst: 0, cgst: 0, totalGst: 0 });

  for (const l of b.lines) {
    let rate = Number(l.gst_rate) || Number(l.item_gst) || 0;
    let taxable = Number(l.taxable) || (Number(l.qty) * Number(l.rate));
    let tax = Number(l.tax) || 0;
    if (rate > 0 && tax === 0) {
      tax = Math.round(taxable * rate / 100 * 100) / 100;
      l.tax = tax;
    }
    l.gst_rate = rate;
    const amt = Number(l.amount) || (taxable + tax);

    let bucket = byGst.get(rate);
    if (!bucket) {
      bucket = { total: 0, sch: 0, disc: 0, sgst: 0, cgst: 0, totalGst: 0 };
      byGst.set(rate, bucket);
      gstRows.push({ label: `GST ${rate} %`, rate });
    }
    bucket.total += amt;
    bucket.disc += (Number(l.disc_pct) ? Math.round(taxable * Number(l.disc_pct) / 100 * 100) / 100 : 0);
    bucket.sgst += Math.round((tax / 2) * 100) / 100;
    bucket.cgst += Math.round((tax / 2) * 100) / 100;
    bucket.totalGst += tax;
  }

  let totAmt = 0, totSch = 0, totDisc = 0, totSgst = 0, totCgst = 0, totTotalGst = 0;
  for (const g of gstRows) {
    const v = byGst.get(g.rate)!;
    totAmt += v.total;
    totSch += v.sch;
    totDisc += v.disc;
    totSgst += v.sgst;
    totCgst += v.cgst;
    totTotalGst += v.totalGst;
  }

  const qrSvg = `<svg width="56" height="56" viewBox="0 0 33 33" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="33" height="33" fill="#fff"/>
    <rect x="2" y="2" width="7" height="7" fill="#000"/><rect x="3" y="3" width="5" height="5" fill="#fff"/><rect x="4" y="4" width="3" height="3" fill="#000"/>
    <rect x="24" y="2" width="7" height="7" fill="#000"/><rect x="25" y="3" width="5" height="5" fill="#fff"/><rect x="26" y="4" width="3" height="3" fill="#000"/>
    <rect x="2" y="24" width="7" height="7" fill="#000"/><rect x="3" y="25" width="5" height="5" fill="#fff"/><rect x="4" y="26" width="3" height="3" fill="#000"/>
    <rect x="11" y="2" width="2" height="1" fill="#000"/><rect x="15" y="2" width="1" height="2" fill="#000"/><rect x="18" y="2" width="2" height="1" fill="#000"/>
    <rect x="10" y="4" width="2" height="2" fill="#000"/><rect x="14" y="4" width="3" height="1" fill="#000"/><rect x="19" y="4" width="2" height="2" fill="#000"/>
    <rect x="11" y="7" width="1" height="3" fill="#000"/><rect x="13" y="6" width="2" height="2" fill="#000"/><rect x="17" y="6" width="3" height="2" fill="#000"/>
    <rect x="2" y="11" width="3" height="2" fill="#000"/><rect x="6" y="11" width="2" height="1" fill="#000"/><rect x="9" y="11" width="2" height="3" fill="#000"/>
    <rect x="12" y="10" width="3" height="2" fill="#000"/><rect x="16" y="11" width="2" height="2" fill="#000"/><rect x="19" y="10" width="2" height="3" fill="#000"/>
    <rect x="23" y="11" width="2" height="2" fill="#000"/><rect x="27" y="10" width="3" height="2" fill="#000"/>
    <rect x="2" y="15" width="2" height="3" fill="#000"/><rect x="5" y="14" width="2" height="2" fill="#000"/><rect x="8" y="15" width="3" height="2" fill="#000"/>
    <rect x="13" y="14" width="2" height="2" fill="#000"/><rect x="17" y="14" width="3" height="3" fill="#000"/><rect x="22" y="14" width="2" height="2" fill="#000"/>
    <rect x="26" y="14" width="2" height="3" fill="#000"/><rect x="29" y="15" width="2" height="2" fill="#000"/>
    <rect x="3" y="19" width="3" height="2" fill="#000"/><rect x="7" y="19" width="2" height="2" fill="#000"/><rect x="11" y="18" width="2" height="3" fill="#000"/>
    <rect x="15" y="18" width="2" height="2" fill="#000"/><rect x="18" y="19" width="3" height="2" fill="#000"/><rect x="23" y="18" width="2" height="2" fill="#000"/>
    <rect x="27" y="19" width="2" height="2" fill="#000"/>
    <rect x="11" y="23" width="3" height="2" fill="#000"/><rect x="15" y="23" width="2" height="3" fill="#000"/><rect x="19" y="23" width="2" height="2" fill="#000"/>
    <rect x="23" y="22" width="3" height="2" fill="#000"/><rect x="28" y="23" width="3" height="2" fill="#000"/>
    <rect x="11" y="27" width="2" height="2" fill="#000"/><rect x="14" y="27" width="3" height="2" fill="#000"/><rect x="18" y="27" width="2" height="3" fill="#000"/>
    <rect x="22" y="26" width="2" height="2" fill="#000"/><rect x="25" y="27" width="3" height="2" fill="#000"/><rect x="29" y="26" width="2" height="3" fill="#000"/>
  </svg>`;

  const minRows = 8;
  const fillerCount = Math.max(0, minRows - b.lines.length);

  const html = `
    <div class="inv-page">
      <!-- HEADER -->
      <div class="inv-hdr">
        <div class="inv-hdr-left">
          <div class="co-name">${esc(companyName)}</div>
          <div class="co-sub">${esc(companyAddress)}</div>
          <div class="co-sub">Phone : ${esc(companyPhone)}</div>
          <div class="co-line"></div>
          <div class="co-sub">GSTIN : ${esc(companyGstin)}</div>
          <div class="co-sub">SL NO - </div>
        </div>
        <div class="inv-hdr-mid">
          <div class="title">INVOICE</div>
          <div class="mode">${isCredit ? 'CREDIT' : 'CASH'}</div>
        </div>
        <div class="inv-hdr-right">
          <div class="pty-box">
            <div class="pty-name">${esc(partyName)} ${isCredit ? 'CR' : 'DR'}</div>
            <div class="pty-row">State : ${esc(partyState)}</div>
            <div class="pty-row">Ph No.: ${esc(partyPhone)}</div>
            <div class="pty-row">GST : ${esc(partyGstin)}</div>
          </div>
          <div class="inv-meta">
            <div class="meta-row"><span>Invoice No.</span> <span>: ${esc(b.no)}</span></div>
            <div class="meta-row"><span>Date</span> <span>: ${dmy(b.date)}</span></div>
            <div class="mr-name">${esc(mrName)} MR</div>
          </div>
        </div>
      </div>

      <!-- ITEMS GRID -->
      <div class="inv-grid-wrap">
        <table class="inv-tbl">
          <thead>
            <tr>
              <th style="width:20px">SN.</th>
              <th style="width:33%;text-align:left">PRODUCT NAME &amp; PACKING</th>
              <th style="width:9%">BATCH</th>
              <th style="width:7%">EXP.</th>
              <th style="width:8%">HSN.</th>
              <th style="width:6%">QTY</th>
              <th style="width:9%;text-align:right">RATE</th>
              <th style="width:5%;text-align:right">DIS</th>
              <th style="width:6%;text-align:right">SGST</th>
              <th style="width:6%;text-align:right">CGST</th>
              <th style="width:11%;text-align:right">AMOUNT</th>
            </tr>
          </thead>
          <tbody>
            ${b.lines.map((l: any, i: number) => `
              <tr>
                <td style="text-align:center">${i + 1}.</td>
                <td style="text-align:left;font-weight:bold">${esc(String(l.item_name).toUpperCase())} ${esc((l.pack ?? '').toUpperCase())}</td>
                <td style="text-align:center">${esc(l.batch ?? '')}</td>
                <td style="text-align:center">${esc(expShort(l.expiry))}</td>
                <td style="text-align:center">${esc(l.hsn || '-BLAN')}</td>
                <td style="text-align:center;font-weight:bold">${l.qty}</td>
                <td style="text-align:right">${Number(l.rate).toFixed(2)}</td>
                <td style="text-align:right">${Number(l.disc_pct || 0).toFixed(2)}</td>
                <td style="text-align:right">${l.gst_rate ? (l.gst_rate / 2).toFixed(2) : '0.00'}</td>
                <td style="text-align:right">${l.gst_rate ? (l.gst_rate / 2).toFixed(2) : '0.00'}</td>
                <td style="text-align:right;font-weight:bold">${Number(l.amount).toFixed(2)}</td>
              </tr>`).join('')}
            ${Array.from({ length: fillerCount }, () => `
              <tr class="blank-row">
                <td>&nbsp;</td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
              </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr class="inv-tot-row">
              <td colspan="10" class="tot-lbl">TOTAL BALANCE</td>
              <td class="tot-val">${Number(b.net).toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <!-- Healthcare QR Overlay inside blank area if lines <= 3 -->
        ${b.lines.length <= 3 ? `
        <div class="inv-qr-overlay">
          <div class="qr-vert"><span>Body Checkup</span> <span>Health Offers</span></div>
          <div class="qr-card">
            <div class="qr-lbl-top">Scan &amp; Book</div>
            ${qrSvg}
            <div class="qr-lbl-bot">Improve Your Health</div>
          </div>
          <div class="qr-desc">
            <div>One QR Code for All Your Healthcare Needs</div>
            <div style="font-weight:bold;margin-top:2px">Scan with your Mobile</div>
          </div>
        </div>` : ''}
      </div>

      <!-- MID SECTION: GST BREAKDOWN & RIGHT TOTALS -->
      <div class="inv-mid">
        <div class="gst-box">
          <table class="gst-tbl">
            <thead>
              <tr>
                <th style="width:19%">CLASS</th>
                <th style="width:16%">TOTAL</th>
                <th style="width:11%">SCH.</th>
                <th style="width:11%">DISC.</th>
                <th style="width:14%">SGST</th>
                <th style="width:14%">CGST</th>
                <th style="width:15%">TOTAL GST</th>
              </tr>
            </thead>
            <tbody>
              ${gstRows.map((g) => {
                const v = byGst.get(g.rate)!;
                return `<tr>
                  <td>${g.label}</td>
                  <td>${Number(v.total).toFixed(2)}</td>
                  <td>${Number(v.sch).toFixed(2)}</td>
                  <td>${Number(v.disc).toFixed(2)}</td>
                  <td>${Number(v.sgst).toFixed(2)}</td>
                  <td>${Number(v.cgst).toFixed(2)}</td>
                  <td>${Number(v.totalGst).toFixed(2)}</td>
                </tr>`;
              }).join('')}
              <tr class="tot-row">
                <td>TOTAL</td>
                <td>${Number(totAmt).toFixed(2)}</td>
                <td>${Number(totSch).toFixed(2)}</td>
                <td>${Number(totDisc).toFixed(2)}</td>
                <td>${Number(totSgst).toFixed(2)}</td>
                <td>${Number(totCgst).toFixed(2)}</td>
                <td>${Number(totTotalGst).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="totals-box">
          <div class="t-row"><span>Discount</span> <b>${Number(b.discount || totDisc || 0).toFixed(2)}</b></div>
          <div class="t-row"><span>GST</span> <b>${Number(totTotalGst || b.tax || 0).toFixed(2)}</b></div>
          ${b.cd_amt ? `<div class="t-row"><span>Cash Discount</span> <b>${Number(b.cd_amt).toFixed(2)}</b></div>` : ''}
          <div class="t-row"><span>FREIGHT</span> <b>${Number(b.freight || 0).toFixed(2)}</b></div>
          ${b.other_charges ? `<div class="t-row"><span>Other Charges</span> <b>${Number(b.other_charges).toFixed(2)}</b></div>` : ''}
          ${b.round_off ? `<div class="t-row"><span>Round Off</span> <b>${Number(b.round_off).toFixed(2)}</b></div>` : ''}
          <div class="t-row"><span>Paid Balance</span> <b>${Number(b.received || (b.mode === 'CASH' ? b.net : 0)).toFixed(2)}</b></div>
          <div class="t-row pend"><span>Pending Balance</span> <b>${Number(b.net - (b.received || (b.mode === 'CASH' ? b.net : 0))).toFixed(2)}</b></div>
        </div>
      </div>

      <!-- WORDS ROW -->
      <div class="inv-words">Rs. ${inWords(b.net)}</div>

      <!-- BOTTOM 4-BOX SECTION -->
      <div class="inv-btm">
        <div class="b-box box1">
          <div class="tc-title"><u>Terms &amp; Conditions</u></div>
          <div>Goods once sold will not be taken back or exchanged.</div>
          <div>Bills not paid due date will attract 24% interest.</div>
        </div>
        <div class="b-box box2">
          <div class="bal-row"><span>OLD BALANCE</span> <b>${Number(oldBal).toFixed(2)}</b></div>
          <div class="bal-row"><span>TODAY BALANCE</span> <b>${Number(todayBal).toFixed(2)}</b></div>
          <div class="bal-row" style="font-weight:900"><span>TOTAL BALANCE</span> <b>${Number(totalBal).toFixed(2)}</b></div>
        </div>
        <div class="b-box box3">
          <div class="rec-title">Reciver</div>
        </div>
        <div class="b-box box4">
          <div class="auth-co">For ${esc(companyName)}</div>
          <div class="auth-lbl">Authorised Signatory</div>
        </div>
      </div>
    </div>
    <div class="inv-footer-note">Get well soon. Scan the Healthcare QR Code for complete health services, insurance, and government benefits.</div>`;

  return { b, html };
}

export async function printBill(id: number) {
  const { b, html } = await billHtml(id);
  const w = openWin(`Print - ${b.no}`, 'wide', '<span><b>Enter / Ctrl+P</b> Print</span><span><b>Esc</b> Close</span>');
  w.el.classList.add('marg-print-win');
  const area = h('div', { class: 'print-preview-wrap' });
  area.innerHTML = html;
  w.body.append(area);
  w.onKey = (_e, k) => {
    if (k === 'Enter' || k === 'Ctrl+P') {
      printHtml(html, 1);
      return true;
    }
    return false;
  };
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
  root.innerHTML = Array.from({ length: copies }, () => `<div class="print-sheet">${html}</div>`).join('');
  document.body.classList.add('print-bill');
  const cleanup = () => {
    document.body.classList.remove('print-bill');
    if (root) root.innerHTML = '';
  };
  window.addEventListener('afterprint', cleanup, { once: true });
  setTimeout(() => {
    try { window.print(); } catch { cleanup(); }
  }, 50);
}
