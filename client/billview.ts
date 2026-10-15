// SALE ALTERATION — what MARG shows when Enter is pressed on a bill in the Day Book or
// Sale Book: the saved bill on the SALE ENTRY screen (read only), the button bar
// Next · Modify · Print · Delete · Cancel · View · Amend · Detail · Email · Exit · Previous ·
// Courier, the BILL LEVIES box (bill total / adjustment / balance) and CUSTOMER STATUS.
import { api, esc, toast, h, money, openWin } from './ui.ts';
import { margBar, margPop, margConfirm, margNumber, notExist } from './margui.ts';
import { FOOT_LABEL } from './sale.ts';
import { statusHtml, type Status } from './receipt.ts';
import { canAction, can, session } from './session.ts';
import { type Ledger } from './masters.ts';

export interface BillRef { id: number; type: string }

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const r2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const expShort = (e: string) => (e ? `${e.slice(5, 7)}/${e.slice(2, 4)}` : '');
const daysSince = (d: string) => Math.max(0, Math.round((Date.parse(new Date().toISOString().slice(0, 10)) - Date.parse(d)) / 864e5));

/** [label, hot letter index, action]. The underlined letters are the hotkeys, as in MARG. */
const BUTTONS: [string, number, string][] = [
  ['Next', 0, 'next'], ['Modify', 0, 'modify'], ['Print', 0, 'print'], ['Delete', 0, 'delete'],
  ['View', 0, 'view'], ['Detail', 2, 'detail'], ['Exit', 1, 'exit'], ['Previous', 1, 'previous'],
];

/**
 * Shows bill `list[index]`. Next / Previous walk the list (the bills of the book it was
 * opened from). `onChange` runs after a delete so the book can reload.
 */
export async function billAlteration(list: BillRef[], index: number, onChange?: () => void) {
  let i = index;
  const w = openWin('SALE ALTERATION', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('');
  const screen = h('div', { class: 'bv-screen' });
  w.body.append(screen);
  let btn = 0;
  let row = 0;
  let b: any = null;
  let party: Ledger | null = null;
  let statusPanel = '';     // CUSTOMER STATUS and "Last Bills" arrive after the bill; kept across redraws
  let lastBills = 'Last Bills :';

  async function load() {
    const ref = list[i];
    b = await api<any>(`/bills/${ref.id}`);
    party = await api<Ledger>(`/ledgers/${b.party_id}`);
    row = 0;
    statusPanel = '';
    lastBills = 'Last Bills :';
    draw();
    // Right panel and "Last Bills" need extra calls; fill them in when they arrive.
    const shown = b.id;
    api<Status>(`/ledgers/${b.party_id}/status`).then((s) => {
      if (b?.id !== shown) return;
      statusPanel = statusHtml(s);
      (screen.querySelector('.rv-status') as HTMLElement).innerHTML = statusPanel;
    }).catch(() => {});
    api<any[]>(`/bills?party=${b.party_id}&type=SALE,COUNTER_SALE`).then((all) => {
      if (b?.id !== shown) return;
      lastBills = `Last Bills :  ${all.slice(0, 3).map((x) => `${x.party.toUpperCase()}-:${x.no}:${f2(x.net)}`).join(' | ')} |`;
      (screen.querySelector('.last') as HTMLElement).textContent = lastBills;
    }).catch(() => {});
  }

  /** Cash sales are received in full; credit sales by what was paid on the bill plus receipts adjusted to it. */
  function levies() {
    const cash = b.mode === 'CASH' || b.type === 'COUNTER_SALE' || party?.group_name === 'Cash-in-hand';
    const adj = cash ? b.net : Math.min(b.net, b.received ?? 0);
    return { total: b.net, adj: r2(adj), bal: r2(b.net - adj) };
  }

  function draw() {
    const title = `${FOOT_LABEL[b.type] ?? b.type} ALTERATION`;
    const lines: any[] = b.lines;
    const cur = lines[row];
    const mrpValue = r2(lines.reduce((s, l) => s + l.qty * (l.mrp ?? 0), 0));
    const qty = lines.reduce((s, l) => s + l.qty + (l.free ?? 0), 0);
    const L = levies();
    const filler = Math.max(0, 9 - lines.length);
    screen.innerHTML = `
      <div class="bv-main">
        <div class="marg-head">
          <label>Name</label><div class="v">${esc((b.walkin_name || b.party).toUpperCase())}</div>
          <label>Date</label><div class="v">${dmy(b.date)}</div>
          <label>Bill No.</label><div class="v">${esc(b.no)} <span class="mr">M.R.: </span></div>
          <label>Type</label><div class="v">${esc(b.sale_type ?? 'LOCAL')}</div>
        </div>
        <div class="marg-rows"><table class="marg-grid"><thead><tr>
          <th style="width:34%">PRODUCT</th><th style="width:9%">PACK</th><th style="width:11%">BATCH</th><th class="n" style="width:10%">QTY</th>
          <th class="n" style="width:11%">RATE</th><th class="n" style="width:8%">DIS1%</th><th class="n">AMOUNT</th></tr></thead><tbody>
          ${lines.map((l, k) => `<tr class="${k === row ? 'cur' : ''}"><td><b>${esc(String(l.item_name).toUpperCase())}</b></td><td><b>${esc((l.pack ?? '').toUpperCase())}</b></td>
            <td>${esc(l.batch ?? '')}</td><td class="n">${l.qty}</td><td class="n">${f2(l.rate)}</td><td class="n">${f2(l.disc_pct)}</td><td class="n">${f2(l.amount)}</td></tr>`).join('')}
          ${Array.from({ length: filler }, () => '<tr><td></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>').join('')}
        </tbody></table></div>
        <div class="bv-btns">${BUTTONS.map(([t, hi], k) => `<button data-k="${k}" class="${k === btn ? 'on' : ''}">${esc(t.slice(0, hi))}<u>${esc(t[hi])}</u>${esc(t.slice(hi + 1))}</button>`).join('')}</div>
        <div class="marg-foot">
          <div class="info1">
            <div><span class="k">Item</span>: <b>${esc(cur ? `${cur.item_name} ${cur.pack ?? ''}` : '')}</b></div>
            <div><span class="k">Batch</span>: <b>${esc(cur?.batch ?? '')}</b></div>
            <div><span class="k">Expiry</span>: <b>${esc(expShort(cur?.expiry ?? ''))}</b></div>
            <div class="levies"><div class="bar">BILL LEVIES</div>
              <div class="kv"><span>BILL TOTAL</span><span>:</span><b>${f2(L.total)}</b></div>
              <div class="kv adj"><span>ADJUSTMENT</span><span>:</span><b>${f2(L.adj)}</b></div>
              <div class="kv"><span>BALANCE</span><span>:</span><b>${f2(L.bal)}</b></div></div>
          </div>
          <div class="info2">
            <div class="kv"><span class="k">MRP Value :</span><b>${f2(mrpValue)}</b></div>
            <div class="kv"><span class="k">Amount :</span><b>${f2(b.gross)}</b></div>
            <div class="kv"><span class="k">Balance :</span><b>${party ? Math.round(Math.abs(party.balance)) : ''}</b></div>
          </div>
          <div class="info3">
            <div class="kv"><span class="k">VALUE OF GOODS</span><b>${f2(b.taxable)}</b></div>
            <div class="kv"><span class="k">DISCOUNT</span><b>${f2(b.discount)}</b></div>
            <div class="kv"><span class="k">GST%</span><b>${f2(b.tax)}</b></div>
            <div class="kv"><span class="k">CASH DISCOUNT</span><b>0.00</b></div>
            <div class="kv"><span class="k">ROUND OFF</span><b>${f2(b.round_off)}</b></div>
          </div>
        </div>
        <div class="marg-invoice">
          <div><div class="st">MAIN STORE/QT-${qty}(${lines.length})/DY-${daysSince(b.date)}/LR-/CS-0</div><div class="sale">${esc(FOOT_LABEL[b.type] ?? b.type)}</div>
            <div class="last">${esc(lastBills)}</div></div>
          <div class="amt">Invoice Value<b>${f2(b.net)}</b></div>
        </div>
      </div>
      <div class="rv-status">${statusPanel}</div>`;
    screen.prepend(margBar(title));
    screen.querySelectorAll<HTMLButtonElement>('.bv-btns button').forEach((el) => el.addEventListener('click', () => { btn = Number(el.dataset.k); run(BUTTONS[btn][2]); }));
  }

  const denied = (what: string) => toast(`Access denied — role ${session()?.role ?? ''} cannot ${what}. Ask SuperAdmin.`, true);

  async function run(act: string) {
    switch (act) {
      case 'next': if (i < list.length - 1) { i++; await load(); } else toast('This is the last bill'); return;
      case 'previous': if (i > 0) { i--; await load(); } else toast('This is the first bill'); return;
      case 'exit': w.close(); return;
      case 'modify':
        if (!canAction(`bill.list:${b.type}`)) { denied('modify bills'); return; }
        w.close();
        (await import('./sale.ts')).saleEntry(b.type, b.id);
        return;
      case 'print': {
        const n = await margNumber('No. of Copies', 1);
        if (n) (await import('./billing.ts')).printCopies(b.id, n);
        return;
      }
      case 'view': (await import('./billing.ts')).printBill(b.id); return;
      case 'delete': {
        if (!canAction(`bill.list:${b.type}`) || !can('feature.delete')) { denied('delete bills'); return; }
        if (!(await margConfirm(`Delete Bill ${b.no} ?`, false))) return;
        try {
          await api(`/bills/${b.id}`, { method: 'DELETE' });
          toast(`Bill ${b.no} deleted`);
          list.splice(i, 1);
          onChange?.();
          if (!list.length) { w.close(); return; }
          i = Math.min(i, list.length - 1);
          await load();
        } catch (e) { toast((e as Error).message, true); }
        return;
      }
      case 'detail': detailBox(); return;
      default: notExist(`"${BUTTONS.find((x) => x[2] === act)?.[0] ?? act}"`);
    }
  }

  /** Detail: GST split, payments and receipts against the bill. */
  function detailBox() {
    const p = margPop(`BILL DETAIL : ${b.no}`, '<span><b>Esc</b>-Close</span>', '640px');
    const byRate = new Map<number, { taxable: number; tax: number }>();
    for (const l of b.lines) { const g = byRate.get(l.gst_rate) ?? { taxable: 0, tax: 0 }; g.taxable += l.taxable; g.tax += l.tax; byRate.set(l.gst_rate, g); }
    const L = levies();
    p.body.append(h('div', { class: 'bv-detail' }, `
      <table class="grid"><tr><th>GST%</th><th class="n">Taxable</th><th class="n">CGST</th><th class="n">SGST</th><th class="n">Total</th></tr>
      ${[...byRate.entries()].map(([r, g]) => `<tr><td>${f2(r)}</td><td class="n">${money(g.taxable)}</td><td class="n">${money(g.tax / 2)}</td><td class="n">${money(g.tax / 2)}</td><td class="n">${money(g.taxable + g.tax)}</td></tr>`).join('')}</table>
      <div class="kv"><span>Mode</span><b>${esc(b.mode)}</b></div>
      ${(b.payments ?? []).map((x: any) => `<div class="kv"><span>Paid on bill — ${esc(x.ledger)}</span><b>${money(x.amount)}</b></div>`).join('')}
      <div class="kv"><span>Received so far</span><b>${money(L.adj)}</b></div><div class="kv"><span>Balance</span><b>${money(L.bal)}</b></div>`));
  }

  w.onKey = (_e, k) => {
    if (k === 'ArrowRight' || k === 'Tab') { btn = (btn + 1) % BUTTONS.length; draw(); return true; }
    if (k === 'ArrowLeft' || k === 'Shift+Tab') { btn = (btn - 1 + BUTTONS.length) % BUTTONS.length; draw(); return true; }
    if (k === 'ArrowDown') { if (row < b.lines.length - 1) { row++; draw(); } return true; }
    if (k === 'ArrowUp') { if (row > 0) { row--; draw(); } return true; }
    if (k === 'PageDown') { run('next'); return true; }
    if (k === 'PageUp') { run('previous'); return true; }
    if (k === 'Enter') { run(BUTTONS[btn][2]); return true; }
    const hit = BUTTONS.findIndex(([t, hi]) => t[hi].toUpperCase() === k);
    if (k.length === 1 && hit >= 0) { btn = hit; draw(); run(BUTTONS[hit][2]); return true; }
    return false;
  };
  await load();
}
