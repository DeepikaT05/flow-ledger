// CURRENT STOCK (Stocks → Current Stock) — modelled on MARG ERP 9+: SELECT STORE with its
// CONTROL BOX, then "<STORE> : CLOSING STOCK" (DESCRIPTION / PACKING / STOCK / UNIT with the
// rate & cost panel and Batch Detail), and Enter → the item's register (BILL NO. / DATE /
// PARTICULARS / RECEIVE / ISSUE / BALANCE). Enter on a bill there opens SALE ALTERATION.
import { api, esc, toast, h, today, money, openWin, fyStart, confirmBox } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { canAction, seeCost, canDelete, NO_DELETE } from './session.ts';
import { itemForm, type Item } from './masters.ts';

/** This edition keeps all stock in one store; MARG lists every store maintained. */
const STORES = ['MAIN STORE'];

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const c2 = (n: unknown) => (n == null || !seeCost() ? '****' : f2(n));
const qty = (n: number) => (Math.abs(n) < 0.0005 ? '-' : String(Math.round(n * 1000) / 1000));
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const margin = (rate: number, cost: number | null) => (cost == null || !seeCost() ? '****' : cost ? (((rate - cost) / cost) * 100).toFixed(2) : '0.00');

// ------------------------------------------------------------------ SELECT STORE
/**
 * SELECT STORE + CONTROL BOX: + select one, - unselect one, * select all, / unselect all,
 * Space select/unselect, Enter select & execute (the highlighted store if none is ticked),
 * Esc exit. Typing goes into Find ?.
 */
export function selectStore(): Promise<string[] | null> {
  return new Promise((resolve) => {
    const w = openWin('SELECT STORE', 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    Object.assign(w.el.style, { border: 'none', background: 'transparent', boxShadow: 'none', width: '760px' });
    w.setFoot('');
    w.body.style.background = 'transparent';
    w.body.innerHTML = `<div class="ss-wrap">
      <div class="ss-ctrl"><div class="bar">CONTROL BOX</div>
        <div>+ &nbsp; - Select One</div><div>- &nbsp; - Unselect One</div><div>* &nbsp; - Select All</div><div>/ &nbsp; - Unselect All</div>
        <div>S_Bar- Select/Unselect</div><div>&#8629; &nbsp; - Select&amp; Execute</div><div>Esc - Exit</div></div>
      <div class="ss-list"><div class="bar" style="display:flex;justify-content:space-between;align-items:center"><span>SELECT STORE</span><button type="button" class="marg-close-btn" title="Close / Back (Esc)" aria-label="Close" tabindex="-1">&#10006; Esc</button></div><div class="rows"></div>
        <div class="find">Find ? &nbsp;<span>[</span><input autocomplete="off"><span>]</span></div></div></div>`;
    const rowsBox = w.body.querySelector('.rows') as HTMLElement;
    const find = w.body.querySelector('.find input') as HTMLInputElement;
    const picked = new Set<string>();
    let sel = 0;
    const draw = () => {
      rowsBox.innerHTML = STORES.map((s, i) => `<div class="${i === sel ? 'sel' : ''}">${picked.has(s) ? '&#10004; ' : ''}${esc(s)}</div>`).join('');
    };
    let done = false;
    const finish = (v: string[] | null) => { if (done) return; done = true; w.close(); resolve(v); };
    find.addEventListener('input', () => {
      const q = find.value.trim().toUpperCase();
      const i = STORES.findIndex((s) => s.startsWith(q));
      if (q && i >= 0) { sel = i; draw(); }
    });
    find.focus();
    w.onKey = (_e, k) => {
      const cur = STORES[sel];
      if (k === 'ArrowDown') { sel = Math.min(STORES.length - 1, sel + 1); draw(); return true; }
      if (k === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); return true; }
      if (k === '+') { picked.add(cur); draw(); return true; }
      if (k === '-') { picked.delete(cur); draw(); return true; }
      if (k === '*') { STORES.forEach((s) => picked.add(s)); draw(); return true; }
      if (k === '/') { picked.clear(); draw(); return true; }
      if (k === 'Space') { if (picked.has(cur)) picked.delete(cur); else picked.add(cur); draw(); return true; }
      if (k === 'Enter') { finish(picked.size ? STORES.filter((s) => picked.has(s)) : [cur]); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
    draw();
  });
}

// ------------------------------------------------------------------ CLOSING STOCK
export async function currentStock() {
  const stores = await selectStore();
  if (stores) await closingStock(stores);
}

export async function closingStock(initialStores: string[] = ['MAIN STORE']) {
  let stores = initialStores;
  const w = openWin('CLOSING STOCK', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-New</span><span><b>F3</b>-Edit</span><span><b>Enter</b>-Register</span><span><b>F6</b>-Total</span>' +
    '<span><b>F9</b>-Store</span><span><b>F10</b>-Filter</span><span><b>*</b>-Shortage</span><span><b>Del</b>-Delete</span><span><b>Alt+P</b>-Print</span>');
  const screen = h('div', { class: 'cs-screen' });
  screen.innerHTML = `
    <div class="cs-main">
      <div class="cs-cols"><span>DESCRIPTION</span><span>PACKING</span><span class="n">M.R.P.</span><span class="n">STOCK</span><span>UNIT</span></div>
      <div class="cs-rows"></div>
      <div class="cs-detail"></div>
    </div>
    <div class="cs-side"><div class="cap">Batch Detail</div><div class="body"></div></div>`;
  const bar = margBar('');
  screen.prepend(bar);
  w.body.append(screen);
  const rowsBox = screen.querySelector('.cs-rows') as HTMLElement;
  let all: Item[] = [];
  let view: Item[] = [];
  let sel = 0;
  let inStock = false, shortage = false;
  let typed = '';
  let typedAt = 0;

  /** Stock in the chosen stores — everything is held in MAIN STORE in this edition. */
  const stockOf = (it: Item) => (stores.includes('MAIN STORE') ? it.stock : 0);
  const setTitle = () => { (bar.firstElementChild as HTMLElement).textContent = `${stores.join(', ')} : CLOSING STOCK : ${dmy(today())}`; };

  async function load() {
    all = await api<Item[]>('/items');
    applyFilter();
  }
  function applyFilter() {
    view = all.filter((it) => (!inStock || stockOf(it) > 0) && (!shortage || stockOf(it) <= (it.min_stock ?? 0)));
    sel = Math.min(sel, Math.max(0, view.length - 1));
    draw();
  }
  let batchSeq = 0;
  function draw() {
    setTitle();
    rowsBox.innerHTML = view.map((it, i) => `<div class="r${i === sel ? ' sel' : ''}" data-i="${i}"><span>${esc(it.name.toUpperCase())}</span>
      <span>${esc((it.pack ?? '').toUpperCase())}</span><span class="n">${f2(it.mrp)}</span><span class="n">${qty(stockOf(it))}</span><span>${esc(it.unit ?? '')}</span></div>`).join('')
      || '<div class="empty">No items</div>';
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const it = view[sel];
    (screen.querySelector('.cs-detail') as HTMLElement).innerHTML = !it ? '' : `
      <div><span>PurRate:</span><b>${c2(it.purchase_rate)}</b></div><div><span>M.R.P. :</span><b>${f2(it.mrp)}</b></div><div><span>Company:</span><b>${esc((it.company || 'OTHERS').toUpperCase())}</b></div>
      <div><span>Cost &nbsp;&nbsp;:</span><b>${c2(it.purchase_rate)}</b></div><div><span>Rate &nbsp;&nbsp;:</span><b>${f2(it.sale_rate)}</b></div><div><span>Salt &nbsp;&nbsp;:</span><b></b></div>
      <div><span>Margin%:</span><b>${margin(it.sale_rate, it.purchase_rate)}</b></div><div><span>Tax-T-I:</span><b>${it.gst_rate ? f2(it.gst_rate) : ''}</b></div><div><span>HSN/SAC:</span><b>${esc(it.hsn ?? '')}</b></div>
      <div><span>W/oDeal:</span><b>${c2(it.purchase_rate)}</b></div><div><span>CESS &nbsp;&nbsp;:</span><b></b></div><div><span>Mfr. &nbsp;&nbsp;:</span><b></b></div>
      <div><span>Margin%:</span><b>${margin(it.sale_rate, it.purchase_rate)}</b></div><div><span>F.Rate :</span><b>${f2(it.sale_rate)}</b></div><div><span>Barcode:</span><b></b></div>
      <div><span>PurDeal:</span><b></b></div><div><span>Deal[F]:</span><b></b></div><div><span>Rack No:</span><b></b></div>
      <div><span>PurDisc:</span><b></b></div><div><span>Excise :</span><b></b></div><div><b>${view.length} Items</b>${typed ? ` &nbsp; <span class="typed">Find: ${esc(typed)}</span>` : ''}${inStock ? ' &nbsp;[In Stock]' : ''}${shortage ? ' &nbsp;[Shortage]' : ''}</div>`;
    const side = screen.querySelector('.cs-side .body') as HTMLElement;
    const seq = ++batchSeq;
    if (!it) { side.innerHTML = ''; return; }
    setTimeout(() => {
      if (seq !== batchSeq) return;
      api<any[]>(`/items/${it.id}/batches`).then((bs) => {
        if (seq !== batchSeq) return;
        side.innerHTML = bs.length ? `<div class="g h"><span>BATCH</span><span>STOCK</span><span>MRP</span><span>EXP.</span></div>
          ${bs.map((b) => `<div class="g"><span>${esc(b.batch || '-')}</span><span>${qty(b.stock)}</span><span>${f2(b.mrp)}</span><span>${b.expiry ? `${b.expiry.slice(5, 7)}/${b.expiry.slice(2, 4)}` : ''}</span></div>`).join('')}` : '';
      }).catch(() => {});
    }, 150);
  }

  /** Typing jumps to the first item starting with what was typed (as in MARG lists). */
  function jump(ch: string) {
    typed = Date.now() - typedAt > 1500 ? ch : typed + ch;
    typedAt = Date.now();
    const q = typed.toLowerCase();
    const i = view.findIndex((it) => it.name.toLowerCase().startsWith(q));
    const j = i >= 0 ? i : view.findIndex((it) => it.name.toLowerCase().includes(q));
    if (j >= 0) sel = j;
    draw();
  }

  function totals() {
    const inS = view.filter((it) => stockOf(it) > 0);
    const q = inS.reduce((s, it) => s + stockOf(it), 0);
    const value = inS.reduce((s, it) => s + stockOf(it) * (it.purchase_rate ?? 0), 0);
    const p = margPop('CALCULATE TOTAL', '<span><b>Esc</b>-Close</span>', '420px');
    p.body.append(h('div', { class: 'cs-total' }, `<div><span>Items listed</span><b>${view.length}</b></div><div><span>Items in stock</span><b>${inS.length}</b></div>
      <div><span>Total quantity</span><b>${qty(q)}</b></div><div><span>Stock value (cost)</span><b>${seeCost() ? money(value) : '****'}</b></div>
      <div><span>Stock value (MRP)</span><b>${money(inS.reduce((s, it) => s + stockOf(it) * (it.mrp ?? 0), 0))}</b></div>`));
  }

  function printList() {
    const html = `<h3 style="text-align:center">${esc(stores.join(', '))} : CLOSING STOCK : ${dmy(today())}</h3>
      <table class="grid"><tr><th>Description</th><th>Packing</th><th class="n">M.R.P.</th><th class="n">Stock</th><th>Unit</th></tr>
      ${view.map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.pack ?? '')}</td><td class="n">${f2(it.mrp)}</td><td class="n">${qty(stockOf(it))}</td><td>${esc(it.unit ?? '')}</td></tr>`).join('')}</table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); } });
  rowsBox.addEventListener('dblclick', () => view[sel] && itemRegister(view[sel], stores));
  w.onKey = (e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 24) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); typed = ''; draw(); return true; }
    if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'End' || k === 'Ctrl+End') { sel = Math.max(0, view.length - 1); draw(); return true; }
    if (k === 'Enter' && view[sel]) { itemRegister(view[sel], stores); return true; }
    if (k === 'F2') {
      itemForm().then((r) => { if (r) load(); });
      return true;
    }
    if (k === 'F3' && view[sel]) {
      if (!canAction('item.list')) { toast('Access denied — your role cannot edit items', true); return true; }
      itemForm(view[sel]).then((r) => { if (r) load(); });
      return true;
    }
    if (k === 'Delete' && view[sel]) {
      const cur = view[sel];
      if (!canDelete()) { toast(NO_DELETE, true); return true; }
      confirmBox(`Delete item "${cur.name}" ?`, false).then(async (y) => {
        if (!y) return;
        try {
          await api(`/items/${cur.id}`, { method: 'DELETE' });
          toast('Deleted');
          load();
        } catch (e) {
          toast((e as Error).message, true);
        }
      });
      return true;
    }
    if (k === 'F6') { totals(); return true; }
    if (k === 'F9') { selectStore().then((s) => { if (s) { stores = s; applyFilter(); } }); return true; }
    if (k === 'F10') { inStock = !inStock; applyFilter(); return true; }
    if (k === '*') { shortage = !shortage; applyFilter(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { printList(); return true; }
    if (k === 'Backspace') { typed = typed.slice(0, -1); typedAt = Date.now(); draw(); return true; }
    if (k.length === 1 && !e.ctrlKey && !e.altKey) { jump(k); return true; }
    if (k === 'Space') { jump(' '); return true; }
    return false;
  };
  await load();
}

// ------------------------------------------------------------------ ITEM REGISTER
interface RegRow {
  bill_id: number; type: string; no: string; date: string; party: string; walkin: string; batch: string; expiry: string;
  qty: number; free: number; rate: number; disc_pct: number; mrp: number; amount: number; receive: number; issue: number; balance: number;
}
interface Register {
  item: Item; rows: RegRow[];
  summary: { opening: { qty: number; value: number | null }; sales: { qty: number; amount: number }; purchase: { qty: number; amount: number }; other: { qty: number }; balance: { qty: number; value: number | null } };
}

async function itemRegister(it: Item, stores: string[], from = fyStart(), to = today()) {
  const d = await api<Register>(`/items/${it.id}/stock-register?from=${from}&to=${to}`);
  const main = stores.includes('MAIN STORE');
  const rows = main ? d.rows : [];
  const w = openWin('ITEM REGISTER', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-Filter</span><span><b>Enter</b>-Bill</span><span><b>Alt+P</b>-Print</span>');
  const screen = h('div', { class: 'ir-screen' });
  const u = (it.unit ?? '').toUpperCase();
  const s = d.summary;
  const v2 = (n: number | null) => (n == null ? '****' : f2(n));
  screen.innerHTML = `
    <div class="ir-main">
      <div class="ir-head"><span class="nm">${esc(`${it.name} ${it.pack ?? ''}`.toUpperCase())}</span><span class="st">${esc(stores.join(', '))}</span></div>
      <div class="ir-cols"><span>BILL NO.</span><span>DATE</span><span>PARTICULARS</span><span class="n">RECEIVE</span><span class="n">ISSUE</span><span class="n">BALANCE</span></div>
      <div class="ir-rows"></div>
      <div class="ir-foot"><div class="l"></div>
        <div class="r">
          <div><span>Opening &nbsp;${esc(u)}</span><b>${qty(main ? s.opening.qty : 0)}</b><b>${main ? v2(s.opening.value) : '0.00'}</b></div>
          <div><span>Sales-S/R</span><b>${qty(main ? s.sales.qty : 0)}</b><b>${f2(main ? s.sales.amount : 0)}</b></div>
          <div><span>Purchase-P/R</span><b>${qty(main ? s.purchase.qty : 0)}</b><b>${f2(main ? s.purchase.amount : 0)}</b></div>
          <div><span>Other</span><b>${qty(main ? s.other.qty : 0)}</b><b></b></div>
          <div><span>Balance &nbsp;${esc(u)}</span><b>${qty(main ? s.balance.qty : 0)}</b><b>${main ? v2(s.balance.value) : '0.00'}</b></div>
        </div></div>
    </div>
    <div class="cs-side"><div class="cap">Note's &lt;Ctrl+F12&gt;</div><div class="body"></div></div>`;
  screen.prepend(margBar(`[ ${dmy(from)} - ${dmy(to)} ]`));
  w.body.append(screen);
  const rowsBox = screen.querySelector('.ir-rows') as HTMLElement;
  let sel = 0;
  const draw = () => {
    rowsBox.innerHTML = rows.map((r, i) => `<div class="r${i === sel ? ' sel' : ''}" data-i="${i}"><span>${esc(r.no)}</span><span>${dmy(r.date).slice(0, 5)}</span>
      <span>${esc((r.walkin ? `${r.party} (${r.walkin})` : r.party).toUpperCase())}</span><span class="n">${qty(r.receive)}</span><span class="n">${qty(r.issue)}</span><span class="n">${qty(r.balance)}</span></div>`).join('')
      || '<div class="empty">No transactions in this period</div>';
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const r = rows[sel];
    (screen.querySelector('.ir-foot .l') as HTMLElement).innerHTML = `
      <div><span>Batch :</span><b>${esc(r?.batch ?? '')}</b></div><div></div>
      <div><span>Chall.:</span><b>${r && r.type.includes('CHALLAN') ? esc(r.no) : ''}</b></div><div><span>Date &nbsp;&nbsp;:</span><b>${r && r.type.includes('CHALLAN') ? dmy(r.date) : ''}</b></div>
      <div><span>Rate &nbsp;:</span><b>${r ? f2(r.rate) : ''}</b></div><div><span>NetRate:</span><b>${r ? f2(r.rate * (1 - (r.disc_pct ?? 0) / 100)) : ''}</b></div>
      <div><span>M.R.P.:</span><b>${r ? f2(r.mrp || it.mrp) : ''}</b></div><div><span>Cost &nbsp;&nbsp;:</span><b>${c2(it.purchase_rate)}</b> &nbsp;Conv.:</div>`;
  };
  const print = () => {
    const html = `<h3 style="text-align:center">${esc(it.name)} ${esc(it.pack ?? '')} — ${esc(stores.join(', '))} &nbsp; ${dmy(from)} to ${dmy(to)}</h3>
      <table class="grid"><tr><th>Bill No.</th><th>Date</th><th>Particulars</th><th class="n">Receive</th><th class="n">Issue</th><th class="n">Balance</th></tr>
      <tr><td></td><td></td><td><b>Opening</b></td><td></td><td></td><td class="n">${qty(main ? s.opening.qty : 0)}</td></tr>
      ${rows.map((r) => `<tr><td>${esc(r.no)}</td><td>${dmy(r.date)}</td><td>${esc(r.party)}</td><td class="n">${qty(r.receive)}</td><td class="n">${qty(r.issue)}</td><td class="n">${qty(r.balance)}</td></tr>`).join('')}</table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  };
  rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); } });
  w.onKey = (_e, k) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15 };
    if (k in step && rows.length) { sel = Math.min(rows.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Enter' && rows[sel]) {
      // SALE ALTERATION, with Next / Previous walking this item's bills.
      const bills = rows.map((r) => ({ id: r.bill_id, type: r.type })).filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);
      import('./billview.ts').then((m) => m.billAlteration(bills, bills.findIndex((b) => b.id === rows[sel].bill_id)));
      return true;
    }
    if (k === 'F2') { periodBox(from, to).then((p) => { if (p) { w.close(); itemRegister(it, stores, p.from, p.to); } }); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { print(); return true; }
    return false;
  };
  draw();
}

/** F2 in the item register: FROM / TO dates. */
function periodBox(from: string, to: string): Promise<{ from: string; to: string } | null> {
  return new Promise((resolve) => {
    const p = margPop('PERIOD', '<span><b>Enter</b>-Next</span><span><b>Esc</b>-Cancel</span>', '440px');
    p.body.append(h('div', { class: 'db-period' }, `<div><span>FROM</span><input data-f="from" value="${dmy(from)}"><span>TO</span><input data-f="to" value="${dmy(to)}"></div>`));
    const [a, b] = [...p.body.querySelectorAll('input')] as HTMLInputElement[];
    a.focus(); a.select();
    p.onKey = (_e, k) => {
      if (k === 'Enter') {
        if (document.activeElement === a) { b.focus(); b.select(); return true; }
        const f = isoOf(a.value), t = isoOf(b.value);
        if (!f || !t || f > t) { toast('Enter a valid FROM / TO (DD-MM-YYYY)', true); return true; }
        p.close(); resolve({ from: f, to: t }); return true;
      }
      if (k === 'Escape') { p.close(); resolve(null); return true; }
      return false;
    };
  });
}
