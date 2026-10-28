// CURRENT STOCK (Stocks → Current Stock) — modelled on MARG ERP 9+: SELECT STORE with its
// CONTROL BOX, then "<STORE> : CLOSING STOCK" (DESCRIPTION / PACKING / STOCK / UNIT with the
// rate & cost panel and Batch Detail), and Enter → the item's register (BILL NO. / DATE /
// PARTICULARS / RECEIVE / ISSUE / BALANCE). Enter on a bill there opens SALE ALTERATION.
import { api, esc, toast, h, today, money, openWin, fyStart, confirmBox } from './ui.ts';
import { margBar, margPop, popList, margAsk } from './margui.ts';
import { canAction, seeCost, canDelete, NO_DELETE } from './session.ts';
import { itemForm, type Item } from './masters.ts';
import { downloadCsv, addExportToMargBar } from './export.ts';

/** This edition keeps all stock in one store; MARG lists every store maintained. */
const STORES = ['MAIN STORE'];

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const c2 = (n: unknown) => (n == null || !seeCost() ? '****' : f2(n));
const qty = (n: number) => (Math.abs(n) < 0.0005 ? '-' : String(Math.round(n * 1000) / 1000));
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const expShort = (e?: string) => (e && e.length >= 7 ? `${e.slice(5, 7)}/${e.slice(2, 4)}` : (e || ''));
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

export interface StockOptions {
  inStockOnly?: boolean;
  stockStatus?: 'available' | 'all' | 'zero' | 'negative';
  company?: string;
  title?: string;
}

export function filteredStockDialog(): Promise<{
  stores: string[];
  stockStatus: 'available' | 'all' | 'zero' | 'negative';
  company: string;
} | null> {
  return new Promise(async (resolve) => {
    let companies: string[] = [];
    try {
      const coList = await api<any[]>('/companies');
      if (Array.isArray(coList)) {
        companies = coList.map((c) => (typeof c === 'string' ? c : c.name || '')).filter(Boolean);
      }
    } catch {}

    const p = margPop('FILTERED STOCK', '<span><b>Enter</b> View Stock</span><span><b>Space/↑↓</b> Change</span><span><b>Esc</b> Cancel</span>', '520px');
    const box = h('div', { class: 'lf-box' });
    box.innerHTML = `
      <div style="background:var(--marg-bar,#000080);color:#ffff00;padding:5px 8px;font-weight:bold;margin-bottom:12px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #fff;">
        <span>SELECT FILTER OPTIONS</span>
        <span style="font-size:11px;color:#fff;">Marg ERP 9+</span>
      </div>
      <div class="f-row" style="margin-bottom:10px;display:flex;align-items:center;">
        <label style="min-width:140px;font-weight:bold;color:var(--marg-lbl,#000080);">Stock Status :</label>
        <select data-f="status" style="flex:1;background:#fff;border:1px solid #777;padding:4px;font-weight:bold;">
          <option value="available" selected>AVAILABLE STOCK ONLY (Stock &gt; 0)</option>
          <option value="all">WHOLE STOCK (All Items)</option>
          <option value="zero">ZERO STOCK ITEMS (Stock = 0)</option>
          <option value="negative">NEGATIVE STOCK (Stock &lt; 0)</option>
        </select>
      </div>
      <div class="f-row" style="margin-bottom:10px;display:flex;align-items:center;">
        <label style="min-width:140px;font-weight:bold;color:var(--marg-lbl,#000080);">Store :</label>
        <select data-f="store" style="flex:1;background:#fff;border:1px solid #777;padding:4px;font-weight:bold;">
          ${STORES.map((s) => `<option value="${esc(s)}"${s === 'MAIN STORE' ? ' selected' : ''}>${esc(s)}</option>`).join('')}
          <option value="ALL">ALL STORES</option>
        </select>
      </div>
      ${companies.length ? `
      <div class="f-row" style="margin-bottom:10px;display:flex;align-items:center;">
        <label style="min-width:140px;font-weight:bold;color:var(--marg-lbl,#000080);">Company :</label>
        <select data-f="company" style="flex:1;background:#fff;border:1px solid #777;padding:4px;">
          <option value="ALL">-- ALL COMPANIES --</option>
          ${companies.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}
        </select>
      </div>` : ''}
      <div style="margin-top:10px;padding:6px 8px;background:rgba(0,0,128,0.06);border:1px dashed #000080;color:#000080;font-size:12px;line-height:1.4;">
        ℹ <b>Marg Filtered Stock:</b> Defaults to Available Stock Only (Stock &gt; 0). Zero stock items are excluded.
      </div>
      <div class="f-btns" style="margin-top:14px;display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" class="btn-apply" style="padding:5px 14px;background:#006600;color:#fff;font-weight:bold;border:1px solid #004400;cursor:pointer;">✓ View Stock (Enter)</button>
        <button type="button" class="btn-cancel" style="padding:5px 14px;background:#888;color:#fff;border:1px solid #666;cursor:pointer;">Esc Cancel</button>
      </div>
    `;
    p.body.append(box);

    const selStatus = box.querySelector('[data-f="status"]') as HTMLSelectElement;
    const selStore = box.querySelector('[data-f="store"]') as HTMLSelectElement;
    const selCompany = box.querySelector('[data-f="company"]') as HTMLSelectElement | null;
    const btnApply = box.querySelector('.btn-apply') as HTMLButtonElement;
    const btnCancel = box.querySelector('.btn-cancel') as HTMLButtonElement;

    let done = false;
    const finish = (val: { stores: string[]; stockStatus: 'available' | 'all' | 'zero' | 'negative'; company: string } | null) => {
      if (done) return;
      done = true;
      p.close();
      resolve(val);
    };

    const submit = () => {
      const status = (selStatus.value || 'available') as 'available' | 'all' | 'zero' | 'negative';
      const storeVal = selStore.value;
      const stores = storeVal === 'ALL' ? [...STORES] : [storeVal];
      const company = selCompany ? selCompany.value : 'ALL';
      finish({ stores, stockStatus: status, company });
    };

    btnApply.addEventListener('click', submit);
    btnCancel.addEventListener('click', () => finish(null));

    selStatus.focus();

    p.onKey = (_e, k) => {
      if (k === 'Escape') { finish(null); return true; }
      if (k === 'Enter') { submit(); return true; }
      return false;
    };
  });
}

export async function filteredStock() {
  const res = await filteredStockDialog();
  if (!res) return;
  await closingStock(res.stores, {
    inStockOnly: res.stockStatus === 'available',
    stockStatus: res.stockStatus,
    company: res.company,
    title: 'FILTERED STOCK',
  });
}

export async function closingStock(initialStores: string[] = ['MAIN STORE'], options: StockOptions = {}) {
  let stores = initialStores;
  let stockStatus: 'available' | 'all' | 'zero' | 'negative' = options.stockStatus || (options.inStockOnly ? 'available' : 'all');
  let inStock = stockStatus === 'available' || !!options.inStockOnly;
  let shortage = false;
  let companyFilter = (options.company || 'ALL').toUpperCase();
  const isFiltered = !!options.title || options.inStockOnly || stockStatus !== 'all' || (companyFilter !== 'ALL' && !!companyFilter);
  const winTitle = options.title || (isFiltered ? 'FILTERED STOCK' : 'CLOSING STOCK');

  const w = openWin(winTitle, 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>F2</b>-New</span><span><b>F3</b>-Edit</span><span><b>F4</b>-Options</span><span><b>Enter</b>-Register</span><span><b>F6</b>-Total</span>' +
    '<span><b>F9</b>-Store</span><span><b>F10</b>-Filter</span><span><b>*</b>-Shortage</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span>');
  const screen = h('div', { class: 'cs-screen' });
  screen.innerHTML = `
    <div class="cs-main">
      <div class="cs-cols"><span>DESCRIPTION</span><span>PACKING</span><span class="n">M.R.P.</span><span class="n">STOCK</span><span>UNIT</span></div>
      <div class="cs-rows"></div>
      <div class="cs-detail"></div>
    </div>
    <div class="cs-side"><div class="cap">Batch Detail</div><div class="body"></div></div>`;
  const bar = margBar('');
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printList() });
  screen.prepend(bar);
  w.body.append(screen);
  const rowsBox = screen.querySelector('.cs-rows') as HTMLElement;
  let all: Item[] = [];
  let view: Item[] = [];
  let sel = 0;
  let typed = '';
  let typedAt = 0;

  /** Stock in the chosen stores — everything is held in MAIN STORE in this edition. */
  const stockOf = (it: Item) => (stores.includes('MAIN STORE') ? it.stock : 0);
  const setTitle = () => {
    let statusLabel = '';
    if (inStock || stockStatus === 'available') statusLabel = ' : [Available Stock Only]';
    else if (stockStatus === 'zero') statusLabel = ' : [Zero Stock Only]';
    else if (stockStatus === 'negative') statusLabel = ' : [Negative Stock Only]';
    if (shortage) statusLabel += ' : [Shortage Only]';
    if (companyFilter && companyFilter !== 'ALL') statusLabel += ` : [${companyFilter}]`;

    (bar.firstElementChild as HTMLElement).textContent = `${stores.join(', ')} : ${winTitle} : ${dmy(today())}${statusLabel}`;
  };

  async function load() {
    all = await api<Item[]>('/items');
    applyFilter();
  }
  function applyFilter() {
    view = all.filter((it) => {
      const q = stockOf(it);
      if (inStock || stockStatus === 'available') {
        if (q <= 0) return false;
      } else if (stockStatus === 'zero') {
        if (q !== 0) return false;
      } else if (stockStatus === 'negative') {
        if (q >= 0) return false;
      }
      if (shortage && q > (it.min_stock ?? 0)) return false;
      if (companyFilter && companyFilter !== 'ALL') {
        if ((it.company || 'OTHERS').toUpperCase() !== companyFilter) return false;
      }
      return true;
    });
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
    let filterStatusBadge = '';
    if (inStock || stockStatus === 'available') filterStatusBadge = ' &nbsp;[Available Stock Only]';
    else if (stockStatus === 'zero') filterStatusBadge = ' &nbsp;[Zero Stock Only]';
    else if (stockStatus === 'negative') filterStatusBadge = ' &nbsp;[Negative Stock Only]';
    if (shortage) filterStatusBadge += ' &nbsp;[Shortage]';
    if (companyFilter && companyFilter !== 'ALL') filterStatusBadge += ` &nbsp;[Co: ${esc(companyFilter)}]`;

    (screen.querySelector('.cs-detail') as HTMLElement).innerHTML = !it ? '' : `
      <div><span>PurRate:</span><b>${c2(it.purchase_rate)}</b></div><div><span>M.R.P. :</span><b>${f2(it.mrp)}</b></div><div><span>Company:</span><b>${esc((it.company || 'OTHERS').toUpperCase())}</b></div>
      <div><span>Cost &nbsp;&nbsp;:</span><b>${c2(it.purchase_rate)}</b></div><div><span>Rate &nbsp;&nbsp;:</span><b>${f2(it.sale_rate)}</b></div><div><span>Salt &nbsp;&nbsp;:</span><b></b></div>
      <div><span>Margin%:</span><b>${margin(it.sale_rate, it.purchase_rate)}</b></div><div><span>Tax-T-I:</span><b>${it.gst_rate ? f2(it.gst_rate) : ''}</b></div><div><span>HSN/SAC:</span><b>${esc(it.hsn ?? '')}</b></div>
      <div><span>W/oDeal:</span><b>${c2(it.purchase_rate)}</b></div><div><span>CESS &nbsp;&nbsp;:</span><b></b></div><div><span>Mfr. &nbsp;&nbsp;:</span><b></b></div>
      <div><span>Margin%:</span><b>${margin(it.sale_rate, it.purchase_rate)}</b></div><div><span>F.Rate :</span><b>${f2(it.sale_rate)}</b></div><div><span>Barcode:</span><b></b></div>
      <div><span>Expiry &nbsp;:</span><b>${it.expiry ? (it.expiry.length >= 7 ? `${it.expiry.slice(5, 7)}/${it.expiry.slice(2, 4)}` : it.expiry) : ''}</b></div><div><span>Deal[F]:</span><b></b></div><div><span>Rack No:</span><b></b></div>
      <div><span>PurDisc:</span><b></b></div><div><span>Excise :</span><b></b></div><div><b>${view.length} Items</b>${typed ? ` &nbsp; <span class="typed">Find: ${esc(typed)}</span>` : ''}${filterStatusBadge}</div>`;
    const side = screen.querySelector('.cs-side .body') as HTMLElement;
    const seq = ++batchSeq;
    if (!it) { side.innerHTML = ''; return; }
    setTimeout(() => {
      if (seq !== batchSeq) return;
      api<any[]>(`/items/${it.id}/batches`).then((bs) => {
        if (seq !== batchSeq) return;
        const filteredBs = (inStock || stockStatus === 'available') ? bs.filter((b) => (b.stock ?? 0) > 0) : bs;
        side.innerHTML = filteredBs.length ? `<div class="g h"><span>BATCH</span><span>STOCK</span><span>MRP</span><span>EXP.</span></div>
          ${filteredBs.map((b) => `<div class="g"><span>${esc(b.batch || '-')}</span><span>${qty(b.stock)}</span><span>${f2(b.mrp)}</span><span>${b.expiry ? `${b.expiry.slice(5, 7)}/${b.expiry.slice(2, 4)}` : ''}</span></div>`).join('')}` : '<div style="padding:10px;color:var(--marg-dim,#888);font-size:12px;">No active batches</div>';
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

  function exportExcel() {
    const headers = ['Description', 'Packing', 'Unit', 'M.R.P.', 'Stock', 'Sale Rate', 'Purchase Rate', 'Cost Value', 'MRP Value', 'Company', 'HSN Code', 'Expiry'];
    const rows = view.map((it) => {
      const q = stockOf(it);
      const pr = it.purchase_rate ?? 0;
      const mrp = it.mrp ?? 0;
      return [
        it.name,
        it.pack ?? '',
        it.unit ?? '',
        f2(mrp),
        qty(q),
        f2(it.sale_rate),
        seeCost() ? f2(pr) : '****',
        seeCost() ? f2(q * pr) : '****',
        f2(q * mrp),
        it.company ?? '',
        it.hsn ?? '',
        it.expiry ?? '',
      ];
    });
    const totQty = view.reduce((s, it) => s + stockOf(it), 0);
    const totCost = view.reduce((s, it) => s + stockOf(it) * (it.purchase_rate ?? 0), 0);
    const totMrp = view.reduce((s, it) => s + stockOf(it) * (it.mrp ?? 0), 0);
    rows.push([
      `Total (${view.length} items)`,
      '',
      '',
      '',
      qty(totQty),
      '',
      '',
      seeCost() ? f2(totCost) : '****',
      f2(totMrp),
      '',
      '',
      '',
    ]);
    const filename = `${winTitle.replace(/\s+/g, '_')}_${stores.join('_')}_${today()}.csv`;
    downloadCsv(filename, headers, rows);
  }

  async function printList() {
    let coName = '';
    try { const co = await api<any>('/company'); coName = co.name; } catch {}
    const statusTag = inStock || stockStatus === 'available' ? ' [Available Stock Only]' : '';
    const html = `<h2>${esc(coName)}</h2><h3 style="text-align:center">${esc(stores.join(', '))} : ${esc(winTitle)} : ${dmy(today())}${statusTag}</h3>
      <table class="grid"><tr><th>Description</th><th>Packing</th><th class="n">M.R.P.</th><th class="n">Stock</th><th>Unit</th></tr>
      ${view.map((it) => `<tr><td>${esc(it.name)}</td><td>${esc(it.pack ?? '')}</td><td class="n">${f2(it.mrp)}</td><td class="n">${qty(stockOf(it))}</td><td>${esc(it.unit ?? '')}</td></tr>`).join('')}
      <tr class="total"><td colspan="3"><b>Total (${view.length} items)</b></td><td class="n"><b>${qty(view.reduce((s, it) => s + stockOf(it), 0))}</b></td><td></td></tr></table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); } });
  rowsBox.addEventListener('dblclick', () => view[sel] && itemDisplay(view[sel], stores));
  w.onKey = (e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 24) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); typed = ''; draw(); return true; }
    if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'End' || k === 'Ctrl+End') { sel = Math.max(0, view.length - 1); draw(); return true; }
    if (k === 'Enter' && view[sel]) { itemDisplay(view[sel], stores); return true; }
    if (k === 'F2') {
      itemForm().then((r) => { if (r) load(); });
      return true;
    }
    if (k === 'F3' && view[sel]) {
      if (!canAction('item.list')) { toast('Access denied — your role cannot edit items', true); return true; }
      itemForm(view[sel]).then((r) => { if (r) load(); });
      return true;
    }
    if (k === 'F4' && view[sel]) {
      itemOptionsPopup(view[sel], stores, (query) => {
        if (query) {
          const q = query.toLowerCase();
          const idx = view.findIndex((it) => it.name.toLowerCase().includes(q) || (it.pack && it.pack.toLowerCase().includes(q)) || (it.batch && it.batch.toLowerCase().includes(q)));
          if (idx >= 0) { sel = idx; draw(); }
          else toast(`No item matching "${query}"`, true);
        }
      });
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
    if (k === 'F10') {
      if (inStock || stockStatus === 'available') {
        stockStatus = 'all';
        inStock = false;
        toast('Filter: WHOLE STOCK (All items including zero stock)');
      } else {
        stockStatus = 'available';
        inStock = true;
        toast('Filter: AVAILABLE STOCK ONLY (Stock > 0)');
      }
      applyFilter();
      return true;
    }
    if (k === '*') { shortage = !shortage; applyFilter(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { printList(); return true; }
    if (k === 'Backspace') { typed = typed.slice(0, -1); typedAt = Date.now(); draw(); return true; }
    if (k.length === 1 && !e.ctrlKey && !e.altKey) { jump(k); return true; }
    if (k === 'Space') { jump(' '); return true; }
    return false;
  };
  await load();
}


/** F4 Options Popup for items: 1 BATCH DETAIL, 2 REGISTER, 3 SEARCH */
function itemOptionsPopup(it: Item, stores: string[], onSearch: (query: string) => void) {
  const options = [
    { key: '1', hot: 'B', label: '1  BATCH DETAIL' },
    { key: '2', hot: 'R', label: '2  REGISTER' },
    { key: '3', hot: 'S', label: '3  SEARCH' },
  ];
  let selIdx = 0;

  const w = openWin(`${it.name.toUpperCase()} ${(it.pack ?? '').toUpperCase()}`, 'mid', '');
  w.el.classList.add('marg', 'marg-ledger-opts');
  w.el.style.width = '420px';
  w.setFoot('<span class="help-badge">HELP</span><span><b>Enter</b> Select</span><span><b>Esc</b> Close</span>');

  const draw = () => {
    w.body.innerHTML = `
      ${margBar(`${esc(it.name.toUpperCase())} ${esc((it.pack ?? '').toUpperCase())}`).outerHTML}
      <div class="lo-list" style="padding: 10px 14px;">
        ${options.map((o, i) => `
          <div class="lo-item${i === selIdx ? ' sel' : ''}" data-idx="${i}" data-k="${o.key}" style="font-size:16px;padding:6px 12px;cursor:pointer;">
            ${esc(o.label)}
          </div>
        `).join('')}
      </div>
    `;

    w.body.querySelectorAll<HTMLElement>('.lo-item').forEach((el) => {
      el.addEventListener('click', () => {
        selIdx = Number(el.dataset.idx);
        draw();
      });
      el.addEventListener('dblclick', () => {
        selIdx = Number(el.dataset.idx);
        execute();
      });
    });
  };

  const execute = async () => {
    const opt = options[selIdx];
    if (!opt) return;

    if (opt.key === '1') {
      w.close();
      openBatchDetail(it, stores);
      return;
    }

    if (opt.key === '2') {
      w.close();
      itemDisplay(it, stores);
      return;
    }

    if (opt.key === '3') {
      w.close();
      const q = await margAsk('Search Item / Batch', '');
      if (q != null && q.trim()) {
        onSearch(q.trim());
      }
      return;
    }
  };

  w.onKey = (_e, k) => {
    if (k === 'Escape') {
      w.close();
      return true;
    }
    if (k === 'Enter') {
      execute();
      return true;
    }
    if (k === 'ArrowDown') {
      selIdx = (selIdx + 1) % options.length;
      draw();
      return true;
    }
    if (k === 'ArrowUp') {
      selIdx = (selIdx - 1 + options.length) % options.length;
      draw();
      return true;
    }
    const hit = options.findIndex((o) => o.key === k || o.hot.toLowerCase() === k.toLowerCase());
    if (hit >= 0) {
      selIdx = hit;
      draw();
      execute();
      return true;
    }
    return false;
  };

  draw();
}

/** Full-featured MARG Batch Detail window with F2 New, F3 Edit, and Expiry view */
async function openBatchDetail(it: Item, stores: string[]) {
  const rows = await api<any[]>(`/items/${it.id}/batches`);
  const total = rows.reduce((s, b) => s + (Number(b.stock) || 0), 0);

  const addBatchModal = async (existingBatch?: any) => {
    const isEdit = !!existingBatch?.id;
    const bName = await margAsk(isEdit ? 'Modify Batch No.' : 'Batch No.', existingBatch?.batch || '');
    if (bName == null || !bName.trim()) return;
    const expVal = await margAsk('Expiry (MM/YY)', expShort(existingBatch?.expiry) || '');
    if (expVal == null) return;
    let isoExp = '';
    if (expVal.trim()) {
      const m = expVal.trim().match(/^(\d{1,2})[/-]?(\d{2}|\d{4})$/);
      if (m) {
        const mm = Number(m[1]);
        const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
        if (mm >= 1 && mm <= 12) {
          const lastDay = new Date(yy, mm, 0).getDate();
          isoExp = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
        }
      }
    }
    const mrpVal = await margAsk('M.R.P.', String(existingBatch?.mrp ?? it.mrp ?? 0));
    if (mrpVal == null) return;
    const rateVal = await margAsk('Rate-A', String(existingBatch?.rate ?? it.sale_rate ?? 0));
    if (rateVal == null) return;
    const qtyVal = await margAsk(isEdit ? 'Opening Qty' : 'Stock Qty', String(existingBatch?.opening_qty ?? (isEdit ? 0 : 10)));
    if (qtyVal == null) return;

    const payload = {
      batch: bName.trim().toUpperCase(),
      expiry: isoExp || expVal.trim(),
      mrp: Number(mrpVal) || 0,
      rate: Number(rateVal) || 0,
      f_rate: Number(rateVal) || 0,
      purchase_rate: existingBatch?.purchase_rate ?? it.purchase_rate ?? 0,
      opening_qty: Number(qtyVal) || 0,
      supplier: existingBatch?.supplier || 'MANUAL ENTRY',
    };

    if (isEdit) {
      await api(`/batches/${existingBatch.id}`, { method: 'PUT', body: payload });
      toast('Batch updated');
    } else {
      await api(`/items/${it.id}/batches`, { method: 'POST', body: payload });
      toast('Batch added');
    }
  };

  popList<any>({
    title: `${it.name.toUpperCase()} ${(it.pack ?? '').toUpperCase()} - BATCH DETAIL`,
    rows,
    search: (r) => r.batch || '',
    width: '1000px',
    findLabel: 'Find Batch >>',
    extra: `Total Stock : ${total}`,
    detailCols: 3,
    cols: [
      { title: 'BATCH', get: (r) => r.batch || '-', width: '22%' },
      { title: 'STOCK', get: (r) => r.stock, num: true, width: '10%' },
      { title: 'UNIT', get: (r) => r.unit || it.unit || 'PCS', width: '10%' },
      { title: 'RATE-A', get: (r) => f2(r.rate), num: true, width: '14%' },
      { title: 'F.RATE', get: (r) => f2(r.f_rate || r.rate), num: true, width: '14%' },
      { title: 'M.R.P.', get: (r) => f2(r.mrp), num: true, width: '14%' },
      { title: 'EXP.', get: (r) => expShort(r.expiry), width: '10%' },
    ],
    detail: (r) => !r ? '' : `
      <div>PurRate: <b>${c2(r.purchase_rate)}</b></div><div>M.R.P. &nbsp;: <b>${f2(r.mrp)}</b></div><div>Supp. &nbsp;: <b>${esc(r.supplier ?? '')}</b></div>
      <div>Cost &nbsp;&nbsp;: <b>${c2(r.purchase_rate)}</b></div><div>Rate &nbsp;&nbsp;: <b>${f2(r.rate)}</b></div>
      <div>Invoice: <b>${esc(r.invoice_no ?? '')}</b> &nbsp; Hold: 0</div>
      <div>Margin%: <b></b></div>
      <div>Tax-T-I: <b>${f2(r.gst_rate ?? it.gst_rate)}</b></div>
      <div>Date &nbsp;&nbsp;: <b>${dmy(r.invoice_date ?? '')}</b></div>
      <div>W/oDeal: <b>${c2(r.purchase_rate)}</b></div><div>F.Rate&nbsp;: <b>${f2(r.f_rate || r.rate)}</b></div><div>Packin&nbsp;: <b>${esc(r.pack ?? it.pack ?? '')}</b></div>`,
    foot: '<span><b>F2/Ins</b>-New Batch</span><span><b>F3</b>-Edit Batch</span><span><b>F5</b>-Register</span><span><b>Esc</b>-Back</span>',
    onKey: (k, cur, popApi) => {
      if (k === 'F2' || k === 'Insert') {
        addBatchModal().then(async () => {
          const fresh = await api<any[]>(`/items/${it.id}/batches`);
          popApi.setRows(fresh);
        });
        return true;
      }
      if (k === 'F3' && cur) {
        addBatchModal(cur).then(async () => {
          const fresh = await api<any[]>(`/items/${it.id}/batches`);
          popApi.setRows(fresh);
        });
        return true;
      }
      if (k === 'F5') {
        popApi.close(null);
        itemDisplay(it, stores);
        return true;
      }
      return false;
    },
  });
}

// ------------------------------------------------------------------ ITEM REGISTER & MULTI-VIEW (Daily, Monthly, Weekly, Summary)
const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type ItemViewMode = 'register' | 'monthly' | 'weekly' | 'daily' | 'summary';

interface RegRow {
  bill_id: number; type: string; no: string; date: string; party: string; walkin: string; batch: string; expiry: string;
  qty: number; free: number; rate: number; disc_pct: number; mrp: number; amount: number; receive: number; issue: number; balance: number;
}
interface Register {
  item: Item; rows: RegRow[];
  summary: { opening: { qty: number; value: number | null }; sales: { qty: number; amount: number }; purchase: { qty: number; amount: number }; other: { qty: number }; balance: { qty: number; value: number | null } };
}

interface ItemViewLine {
  key: string;
  cells: string[];
  receive: number;
  issue: number;
  bal: number;
  entries?: number;
  amount?: number;
  salesAmt?: number;
  purAmt?: number;
  regRow?: RegRow;
  from?: string;
  to?: string;
  bold?: boolean;
}

function getWeekInfo(dateStr: string) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  const diffToMon = (day === 0 ? -6 : 1) - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diffToMon);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const monStr = mon.toISOString().slice(0, 10);
  const sunStr = sun.toISOString().slice(0, 10);
  const firstJan = new Date(mon.getFullYear(), 0, 1);
  const days = Math.floor((mon.getTime() - firstJan.getTime()) / (24 * 3600 * 1000));
  const weekNum = Math.ceil((days + firstJan.getDay() + 1) / 7);
  return {
    key: monStr,
    weekNum,
    from: monStr,
    to: sunStr,
    label: `Wk ${weekNum} (${dmy(monStr).slice(0, 5)} - ${dmy(sunStr).slice(0, 5)})`,
  };
}

const monthEnd = (ym: string) => {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

export async function itemRegister(it: Item, stores: string[] = ['MAIN STORE'], from = fyStart(), to = today()) {
  return itemView(it, stores, 'register', from, to);
}

export function itemDisplay(it: Item, stores: string[] = ['MAIN STORE'], to = today()): Promise<void> {
  return new Promise((resolve) => {
    const p = margPop('ITEM DISPLAY', '<span><b>Enter</b>-Next</span><span><b>R/M/W/D/S</b>-View</span><span><b>Esc</b>-Cancel</span>', '540px');
    const box = h('div', { class: 'id-box' });
    box.innerHTML = `
      <div class="item-name">${esc(`${it.name} ${it.pack ?? ''}`.toUpperCase())}</div>
      <div class="dates"><span>FROM</span><input data-f="from" value="${dmy(fyStart())}"><span>TO</span><input data-f="to" value="${dmy(to)}"></div>
      <div class="btns">
        <button type="button" data-v="register"><u>R</u>egister</button>
        <button type="button" data-v="monthly"><u>M</u>onthly</button>
        <button type="button" data-v="weekly"><u>W</u>eekly</button>
        <button type="button" data-v="daily"><u>D</u>aily</button>
        <button type="button" data-v="summary"><u>S</u>ummary</button>
        <button type="button" data-v="cancel"><u>C</u>ancel</button>
      </div>`;
    p.body.append(box);
    const fields = [...box.querySelectorAll('input, button')] as HTMLElement[];
    const go = (v: ItemViewMode | 'cancel') => {
      if (v === 'cancel') { p.close(); resolve(); return; }
      const from = isoOf((fields[0] as HTMLInputElement).value), till = isoOf((fields[1] as HTMLInputElement).value);
      if (!from || !till) { toast('Enter dates as DD-MM-YYYY', true); fields[0].focus(); return; }
      if (from > till) { toast('FROM date is after TO date', true); fields[0].focus(); return; }
      p.close();
      itemView(it, stores, v, from, till).finally(resolve);
    };
    box.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button');
      if (b && b.dataset.v) go(b.dataset.v as ItemViewMode | 'cancel');
    });
    fields[0].focus();
    (fields[0] as HTMLInputElement).select?.();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el instanceof HTMLButtonElement) {
        if (k === 'ArrowRight' || k === 'Tab') { fields[Math.min(fields.length - 1, i + 1)].focus(); return true; }
        if (k === 'ArrowLeft') { fields[Math.max(2, i - 1)].focus(); return true; }
        if (k === 'Enter') { go(el.dataset.v as ItemViewMode | 'cancel'); return true; }
      } else if (k === 'Enter' || k === 'Tab') {
        fields[i + 1].focus();
        (fields[i + 1] as HTMLInputElement).select?.();
        return true;
      }
      const hit = ({
        R: 'register', r: 'register', '1': 'register',
        M: 'monthly', m: 'monthly', '2': 'monthly',
        W: 'weekly', w: 'weekly', '3': 'weekly',
        D: 'daily', d: 'daily', '4': 'daily',
        S: 'summary', s: 'summary', '5': 'summary',
        C: 'cancel', c: 'cancel',
      } as Record<string, ItemViewMode | 'cancel'>)[k];
      if (hit && !(el instanceof HTMLInputElement)) { go(hit); return true; }
      if (k === 'Escape') { go('cancel'); return true; }
      return false;
    };
  });
}

export async function itemView(
  it: Item,
  stores: string[] = ['MAIN STORE'],
  initialView: ItemViewMode = 'register',
  initFrom = fyStart(),
  initTo = today()
): Promise<void> {
  let curView: ItemViewMode = initialView;
  let from = initFrom;
  let to = initTo;
  let sel = 0;
  let lines: ItemViewLine[] = [];
  let d: Register | null = null;
  const main = stores.includes('MAIN STORE');
  const u = (it.unit ?? '').toUpperCase();
  const v2 = (n: number | null) => (n == null ? '****' : f2(n));

  const loadData = async () => {
    d = await api<Register>(`/items/${it.id}/stock-register?from=${from}&to=${to}`);
    buildLines();
  };

  const getHeaders = (v: ItemViewMode) => {
    switch (v) {
      case 'register':
        return ['BILL NO.', 'DATE', 'PARTICULARS', 'RECEIVE', 'ISSUE', 'BALANCE'];
      case 'monthly':
        return ['MONTH', 'RECEIVE', 'ISSUE', 'BALANCE', 'ENTRIES', 'SALES AMT', 'PUR. AMT'];
      case 'weekly':
        return ['WEEK', 'PERIOD', 'RECEIVE', 'ISSUE', 'BALANCE', 'ENTRIES', 'AMOUNT'];
      case 'daily':
        return ['DATE', 'DAY', 'RECEIVE', 'ISSUE', 'BALANCE', 'ENTRIES', 'AMOUNT'];
      case 'summary':
        return ['TRANSACTION TYPE', 'BILLS', 'RECEIVE', 'ISSUE', 'NET QTY', 'TOTAL AMOUNT'];
    }
  };

  function buildLines() {
    lines = [];
    const rows = main && d ? d.rows : [];
    const s = d ? d.summary : { opening: { qty: 0, value: 0 }, sales: { qty: 0, amount: 0 }, purchase: { qty: 0, amount: 0 }, other: { qty: 0 }, balance: { qty: 0, value: 0 } };
    const openQty = main ? s.opening.qty : 0;

    if (curView === 'register') {
      lines = rows.map((r) => ({
        key: `${r.bill_id}_${r.no}`,
        cells: [r.no, dmy(r.date).slice(0, 5), (r.walkin ? `${r.party} (${r.walkin})` : r.party).toUpperCase(), qty(r.receive), qty(r.issue), qty(r.balance)],
        receive: r.receive,
        issue: r.issue,
        bal: r.balance,
        regRow: r,
      }));
    } else if (curView === 'monthly') {
      lines.push({
        key: 'open',
        cells: ['OPENING BALANCE', '', '', qty(openQty), '', '', ''],
        receive: 0,
        issue: 0,
        bal: openQty,
        bold: true,
      });
      const monthMap = new Map<string, RegRow[]>();
      for (const r of rows) {
        const k = r.date.slice(0, 7);
        const cur = monthMap.get(k) || [];
        cur.push(r);
        monthMap.set(k, cur);
      }
      const sortedKeys = [...monthMap.keys()].sort();
      let bal = openQty;
      for (const k of sortedKeys) {
        const list = monthMap.get(k)!;
        const rec = r2(list.reduce((sum, r) => sum + r.receive, 0));
        const iss = r2(list.reduce((sum, r) => sum + r.issue, 0));
        bal = r2(bal + rec - iss);
        const mDate = new Date(`${k}-01T00:00:00`);
        const mLabel = mDate.toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase();
        const mStart = `${k}-01`;
        const mEnd = monthEnd(k);
        const sales = r2(list.filter((r) => ['SALE', 'COUNTER_SALE', 'SALE_RETURN'].includes(r.type)).reduce((sum, r) => sum + (r.type.endsWith('RETURN') ? -r.amount : r.amount), 0));
        const pur = r2(list.filter((r) => ['PURCHASE', 'PURCHASE_RETURN'].includes(r.type)).reduce((sum, r) => sum + (r.type.endsWith('RETURN') ? -r.amount : r.amount), 0));
        lines.push({
          key: k,
          cells: [mLabel, qty(rec), qty(iss), qty(bal), String(list.length), f2(sales), f2(pur)],
          receive: rec,
          issue: iss,
          bal,
          entries: list.length,
          salesAmt: sales,
          purAmt: pur,
          from: mStart < from ? from : mStart,
          to: mEnd > to ? to : mEnd,
        });
      }
    } else if (curView === 'weekly') {
      lines.push({
        key: 'open',
        cells: ['OPENING BALANCE', '', '', '', qty(openQty), '', ''],
        receive: 0,
        issue: 0,
        bal: openQty,
        bold: true,
      });
      const weekMap = new Map<string, RegRow[]>();
      for (const r of rows) {
        const wInfo = getWeekInfo(r.date);
        const cur = weekMap.get(wInfo.key) || [];
        cur.push(r);
        weekMap.set(wInfo.key, cur);
      }
      const sortedKeys = [...weekMap.keys()].sort();
      let bal = openQty;
      for (const k of sortedKeys) {
        const list = weekMap.get(k)!;
        const wInfo = getWeekInfo(list[0].date);
        const rec = r2(list.reduce((sum, r) => sum + r.receive, 0));
        const iss = r2(list.reduce((sum, r) => sum + r.issue, 0));
        bal = r2(bal + rec - iss);
        const amt = r2(list.reduce((sum, r) => sum + (r.type.endsWith('RETURN') ? -r.amount : r.amount), 0));
        lines.push({
          key: k,
          cells: [`WEEK ${wInfo.weekNum}`, `${dmy(wInfo.from).slice(0, 5)} - ${dmy(wInfo.to).slice(0, 5)}`, qty(rec), qty(iss), qty(bal), String(list.length), f2(amt)],
          receive: rec,
          issue: iss,
          bal,
          entries: list.length,
          amount: amt,
          from: wInfo.from < from ? from : wInfo.from,
          to: wInfo.to > to ? to : wInfo.to,
        });
      }
    } else if (curView === 'daily') {
      lines.push({
        key: 'open',
        cells: ['OPENING BALANCE', '', '', '', qty(openQty), '', ''],
        receive: 0,
        issue: 0,
        bal: openQty,
        bold: true,
      });
      const dayMap = new Map<string, RegRow[]>();
      for (const r of rows) {
        const cur = dayMap.get(r.date) || [];
        cur.push(r);
        dayMap.set(r.date, cur);
      }
      const sortedKeys = [...dayMap.keys()].sort();
      let bal = openQty;
      for (const k of sortedKeys) {
        const list = dayMap.get(k)!;
        const rec = r2(list.reduce((sum, r) => sum + r.receive, 0));
        const iss = r2(list.reduce((sum, r) => sum + r.issue, 0));
        bal = r2(bal + rec - iss);
        const amt = r2(list.reduce((sum, r) => sum + (r.type.endsWith('RETURN') ? -r.amount : r.amount), 0));
        const dayName = new Date(`${k}T00:00:00`).toLocaleString('en', { weekday: 'long' }).toUpperCase();
        lines.push({
          key: k,
          cells: [dmy(k), dayName, qty(rec), qty(iss), qty(bal), String(list.length), f2(amt)],
          receive: rec,
          issue: iss,
          bal,
          entries: list.length,
          amount: amt,
          from: k,
          to: k,
        });
      }
    } else if (curView === 'summary') {
      const groups = [
        { name: 'SALES', types: ['SALE', 'COUNTER_SALE'] },
        { name: 'SALE RETURN', types: ['SALE_RETURN'] },
        { name: 'PURCHASE', types: ['PURCHASE'] },
        { name: 'PURCHASE RETURN', types: ['PURCHASE_RETURN'] },
        { name: 'CHALLAN / OTHER', types: ['SALE_CHALLAN', 'PURCHASE_CHALLAN'] },
      ];
      for (const g of groups) {
        const list = rows.filter((r) => g.types.includes(r.type));
        const rec = r2(list.reduce((sum, r) => sum + r.receive, 0));
        const iss = r2(list.reduce((sum, r) => sum + r.issue, 0));
        const netQty = r2(rec - iss);
        const amt = r2(list.reduce((sum, r) => sum + r.amount, 0));
        lines.push({
          key: g.name,
          cells: [g.name, String(list.length), qty(rec), qty(iss), qty(netQty), f2(amt)],
          receive: rec,
          issue: iss,
          bal: netQty,
          entries: list.length,
          amount: amt,
        });
      }
    }
  }

  await loadData();

  const getTitle = () => ({
    register: 'ITEM REGISTER',
    monthly: 'MONTHLY ITEM REGISTER',
    weekly: 'WEEKLY ITEM REGISTER',
    daily: 'DAILY ITEM REGISTER',
    summary: 'ITEM SUMMARY',
  }[curView]);

  const w = openWin(getTitle(), 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>Enter</b>-Open</span><span><b>F2</b>-Date</span><span><b>1-5</b>-View Mode</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Exit</span>');

  const screen = h('div', { class: 'ir-screen' });
  screen.setAttribute('data-view', curView);
  screen.innerHTML = `
    <div class="ir-main">
      <div class="ir-head">
        <span class="nm">${esc(`${it.name} ${it.pack ?? ''}`.toUpperCase())}</span>
        <span class="st">${esc(stores.join(', '))}</span>
      </div>
      <div class="ir-cols"></div>
      <div class="ir-rows"></div>
      <div class="ir-foot"></div>
    </div>
    <div class="cs-side"><div class="cap">Note's &lt;Ctrl+F12&gt;</div><div class="body"></div></div>`;

  const bar = margBar(`[ ${dmy(from)} - ${dmy(to)} ]`);
  const modesBox = h('div', { class: 'ir-modes' });
  modesBox.innerHTML = `
    <button type="button" class="ir-btn-mode ${curView === 'register' ? 'active' : ''}" data-v="register">[1] Register</button>
    <button type="button" class="ir-btn-mode ${curView === 'monthly' ? 'active' : ''}" data-v="monthly">[2] Monthly</button>
    <button type="button" class="ir-btn-mode ${curView === 'weekly' ? 'active' : ''}" data-v="weekly">[3] Weekly</button>
    <button type="button" class="ir-btn-mode ${curView === 'daily' ? 'active' : ''}" data-v="daily">[4] Daily</button>
    <button type="button" class="ir-btn-mode ${curView === 'summary' ? 'active' : ''}" data-v="summary">[5] Summary</button>`;
  modesBox.addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('.ir-btn-mode') as HTMLElement | null;
    if (b && b.dataset.v) switchView(b.dataset.v as ItemViewMode);
  });
  bar.querySelector('.marg-bar-title')?.after(modesBox);

  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => print() });
  screen.prepend(bar);
  w.body.append(screen);

  const colsBox = screen.querySelector('.ir-cols') as HTMLElement;
  const rowsBox = screen.querySelector('.ir-rows') as HTMLElement;
  const footBox = screen.querySelector('.ir-foot') as HTMLElement;

  const updateWinTitle = (t: string) => { const sp = w.el.querySelector('.win-title span'); if (sp) sp.textContent = t; };

  function switchView(v: ItemViewMode) {
    if (curView === v) return;
    curView = v;
    sel = 0;
    screen.setAttribute('data-view', curView);
    buildLines();
    modesBox.querySelectorAll('.ir-btn-mode').forEach((b) => {
      b.classList.toggle('active', (b as HTMLElement).dataset.v === curView);
    });
    updateWinTitle(getTitle());
    draw();
  }

  function draw() {
    const heads = getHeaders(curView);
    colsBox.innerHTML = heads.map((h, i) => `<span class="${i >= (curView === 'summary' ? 1 : 3) ? 'n' : ''}">${h}</span>`).join('');
    rowsBox.innerHTML = lines.map((l, i) => `<div class="r${i === sel ? ' sel' : ''}${l.bold ? ' b' : ''}" data-i="${i}">
      ${l.cells.map((c, j) => `<span class="${j >= (curView === 'summary' ? 1 : 3) ? 'n' : ''}">${esc(c)}</span>`).join('')}
    </div>`).join('') || '<div class="empty">No data available for this period</div>';
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });

    const s = d ? d.summary : { opening: { qty: 0, value: 0 }, sales: { qty: 0, amount: 0 }, purchase: { qty: 0, amount: 0 }, other: { qty: 0 }, balance: { qty: 0, value: 0 } };
    if (curView === 'register') {
      const curLine = lines[sel];
      const r = curLine?.regRow;
      footBox.innerHTML = `
        <div class="l">
          <div><span>Batch :</span><b>${esc(r?.batch ?? '')}</b></div><div></div>
          <div><span>Chall.:</span><b>${r && r.type.includes('CHALLAN') ? esc(r.no) : ''}</b></div><div><span>Date &nbsp;&nbsp;:</span><b>${r && r.type.includes('CHALLAN') ? dmy(r.date) : ''}</b></div>
          <div><span>Rate &nbsp;:</span><b>${r ? f2(r.rate) : ''}</b></div><div><span>NetRate:</span><b>${r ? f2(r.rate * (1 - (r.disc_pct ?? 0) / 100)) : ''}</b></div>
          <div><span>M.R.P.:</span><b>${r ? f2(r.mrp || it.mrp) : ''}</b></div><div><span>Cost &nbsp;&nbsp;:</span><b>${c2(it.purchase_rate)}</b> &nbsp;Conv.:</div>
        </div>
        <div class="r">
          <div><span>Opening &nbsp;${esc(u)}</span><b>${qty(main ? s.opening.qty : 0)}</b><b>${main ? v2(s.opening.value) : '0.00'}</b></div>
          <div><span>Sales-S/R</span><b>${qty(main ? s.sales.qty : 0)}</b><b>${f2(main ? s.sales.amount : 0)}</b></div>
          <div><span>Purchase-P/R</span><b>${qty(main ? s.purchase.qty : 0)}</b><b>${f2(main ? s.purchase.amount : 0)}</b></div>
          <div><span>Other</span><b>${qty(main ? s.other.qty : 0)}</b><b></b></div>
          <div><span>Balance &nbsp;${esc(u)}</span><b>${qty(main ? s.balance.qty : 0)}</b><b>${main ? v2(s.balance.value) : '0.00'}</b></div>
        </div>`;
    } else {
      const totRec = r2(lines.reduce((sum, l) => sum + (l.bold ? 0 : l.receive), 0));
      const totIss = r2(lines.reduce((sum, l) => sum + (l.bold ? 0 : l.issue), 0));
      const totAmt = r2(lines.reduce((sum, l) => sum + (l.bold ? 0 : (l.amount ?? (l.salesAmt ?? 0) - (l.purAmt ?? 0))), 0));
      const finalBal = main ? s.balance.qty : 0;
      footBox.innerHTML = `
        <div class="summary-tot">
          <span>Total In: <b>${qty(totRec)}</b> &nbsp;|&nbsp; Total Out: <b>${qty(totIss)}</b> &nbsp;|&nbsp; Net Bal: <b>${qty(finalBal)} ${esc(u)}</b> (${main ? v2(s.balance.value) : '0.00'})</span>
          <span>Net Amount: <b>${f2(totAmt)}</b></span>
        </div>`;
    }
  }

  function exportExcel() {
    const heads = getHeaders(curView);
    const rws = lines.map((l) => l.cells);
    const suffix = curView.toUpperCase();
    downloadCsv(`Item_${suffix}_${it.name.replace(/[^a-zA-Z0-9_-]/g, '_')}_${from}_${to}.csv`, heads, rws);
  }

  function print() {
    const heads = getHeaders(curView);
    const html = `<h3 style="text-align:center">${esc(it.name)} ${esc(it.pack ?? '')} — [ ${esc(curView.toUpperCase())} ] &nbsp; ${dmy(from)} to ${dmy(to)}</h3>
      <table class="grid">
        <tr>${heads.map((h, i) => `<th class="${i >= (curView === 'summary' ? 1 : 3) ? 'n' : ''}">${esc(h)}</th>`).join('')}</tr>
        ${lines.map((l) => `<tr>${l.cells.map((c, j) => `<td class="${j >= (curView === 'summary' ? 1 : 3) ? 'n' : ''}">${esc(c)}</td>`).join('')}</tr>`).join('')}
      </table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  rowsBox.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
    if (el) { sel = Number(el.dataset.i); draw(); }
  });

  rowsBox.addEventListener('dblclick', () => {
    const curLine = lines[sel];
    if (curView === 'register' && curLine?.regRow) {
      const rows = main && d ? d.rows : [];
      const bills = rows.map((r) => ({ id: r.bill_id, type: r.type })).filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);
      import('./billview.ts').then((m) => m.billAlteration(bills, bills.findIndex((b) => b.id === curLine.regRow!.bill_id)));
    } else if ((curView === 'monthly' || curView === 'weekly' || curView === 'daily') && curLine?.from && curLine?.to) {
      from = curLine.from;
      to = curLine.to;
      curView = 'register';
      loadData().then(() => {
        sel = 0;
        screen.setAttribute('data-view', curView);
        modesBox.querySelectorAll('.ir-btn-mode').forEach((b) => {
          b.classList.toggle('active', (b as HTMLElement).dataset.v === curView);
        });
        updateWinTitle(getTitle());
        draw();
        toast(`Opened ${curLine.cells[0]} Register`);
      });
    }
  });

  w.onKey = (_e, k) => {
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 15, PageUp: -15 };
    if (k in step && lines.length) { sel = Math.min(lines.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'End' || k === 'Ctrl+End') { sel = Math.max(0, lines.length - 1); draw(); return true; }
    if (k === 'Enter') {
      const curLine = lines[sel];
      if (curView === 'register' && curLine?.regRow) {
        const rows = main && d ? d.rows : [];
        const bills = rows.map((r) => ({ id: r.bill_id, type: r.type })).filter((b, i, a) => a.findIndex((x) => x.id === b.id) === i);
        import('./billview.ts').then((m) => m.billAlteration(bills, bills.findIndex((b) => b.id === curLine.regRow!.bill_id)));
        return true;
      }
      if ((curView === 'monthly' || curView === 'weekly' || curView === 'daily') && curLine?.from && curLine?.to) {
        from = curLine.from;
        to = curLine.to;
        curView = 'register';
        loadData().then(() => {
          sel = 0;
          screen.setAttribute('data-view', curView);
          modesBox.querySelectorAll('.ir-btn-mode').forEach((b) => {
            b.classList.toggle('active', (b as HTMLElement).dataset.v === curView);
          });
          updateWinTitle(getTitle());
          draw();
          toast(`Opened ${curLine.cells[0]} Register`);
        });
        return true;
      }
    }
    if (k === '1' || k === 'R' || k === 'r') { switchView('register'); return true; }
    if (k === '2' || k === 'M' || k === 'm') { switchView('monthly'); return true; }
    if (k === '3' || k === 'W' || k === 'w') { switchView('weekly'); return true; }
    if (k === '4' || k === 'D' || k === 'd') { switchView('daily'); return true; }
    if (k === '5' || k === 'S' || k === 's') { switchView('summary'); return true; }
    if (k === 'F2') {
      periodBox(from, to).then(async (p) => {
        if (p) {
          from = p.from;
          to = p.to;
          await loadData();
          sel = 0;
          const barTitle = bar.querySelector('.marg-bar-title');
          if (barTitle) barTitle.textContent = `[ ${dmy(from)} - ${dmy(to)} ]`;
          draw();
          toast(`Date updated: ${dmy(from)} to ${dmy(to)}`);
        }
      });
      return true;
    }
    if (k === 'Alt+X') { exportExcel(); return true; }
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
