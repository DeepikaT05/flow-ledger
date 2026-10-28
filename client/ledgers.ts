// LEDGER ACCOUNTS (Books → All Ledgers, Alt+L) — modelled on MARG ERP 9+: the ledger list
// with DEBIT / CREDIT balances "Upto" a date, the Address and Current Status panels, the
// CUSTOMER STATUS panel, and Enter → LEDGER DISPLAY (FROM / TO, then Ledger · Monthly ·
// Daily · Summary · Cancel). As in MARG, Enter on a transaction opens it.
import { api, esc, toast, h, today, money, openWin, fyStart } from './ui.ts';
import { margBar, margPop } from './margui.ts';
import { statusHtml, type Status } from './receipt.ts';
import { canAction } from './session.ts';
import { ledgerForm, type Ledger } from './masters.ts';
import { downloadCsv, addExportToMargBar } from './export.ts';

interface Acc {
  id: number; name: string; city: string; address: string; phone: string; gstin: string; state: string; group_name: string;
  opening: number; debit: number; credit: number; balance: number; has_due: boolean; details?: string; credit_limit?: number;
}
interface Entry { source: 'BILL' | 'VOUCHER'; source_id: number; date: string; vtype: string; vno: string; debit: number; credit: number; narration: string; against: string }

const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const r2 = (n: number) => Math.round(n * 100) / 100;
const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}` : '');
const isoOf = (d: string) => { const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/); return m ? `${m[3]}-${m[2]}-${m[1]}` : ''; };
const drcr = (n: number) => (Math.abs(n) < 0.005 ? '' : `${f2(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`);
const CASH_BANK = ['Cash-in-hand', 'Bank Accounts'];
const VT: Record<string, string> = {
  SALE: 'Sale', COUNTER_SALE: 'Cntr', SALE_CHALLAN: 'S.Ch', PURCHASE: 'Purc', PURCHASE_CHALLAN: 'P.Ch', SALE_RETURN: 'S.Rt',
  PURCHASE_RETURN: 'P.Rt', RECEIPT: 'Rcpt', PAYMENT: 'Pymt', CONTRA: 'Ctra', JOURNAL: 'Jrnl', DEBIT_NOTE: 'D.N.', CREDIT_NOTE: 'C.N.',
};

export interface LedgerFilter {
  route: string;
  mr: string;
  village: string;
  group: string;
  balance: 'all' | 'balance' | 'dr' | 'cr' | 'zero';
  search: string;
}

export function getAccMeta(a: Acc) {
  let det: Record<string, string> = {};
  if (a.details) {
    try { det = JSON.parse(a.details); } catch {}
  }
  const route = (det.route_name || (det.route_on === 'Yes' ? 'A(BPTDSP)' : '') || '').trim();
  const mr = (det.mr_name || (det.mr_on === 'Yes' ? 'YES' : '') || '').trim();
  const area = (det.area_name || '').trim();
  const village = (a.city || area || '').trim();
  const group = (a.group_name || '').trim();
  const phone = (a.phone || det.mobile || det.phone_off1 || '').trim();
  const gstin = (a.gstin || det.gstin || '').trim();
  return { route, mr, area, village, group, phone, gstin };
}

function openLedgerFilterModal(
  all: Acc[],
  current: LedgerFilter,
  onApply: (f: LedgerFilter) => void,
  onClear: () => void,
) {
  const routes = ['ALL', ...Array.from(new Set(all.map((a) => getAccMeta(a).route).filter(Boolean))).sort()];
  const mrs = ['ALL', ...Array.from(new Set(all.map((a) => getAccMeta(a).mr).filter(Boolean))).sort()];
  const villages = ['ALL', ...Array.from(new Set(all.map((a) => getAccMeta(a).village).filter(Boolean))).sort()];
  const groups = ['ALL', ...Array.from(new Set(all.map((a) => a.group_name).filter(Boolean))).sort()];

  const p = margPop('FILTER LEDGER ACCOUNTS', '<span><b>Enter</b> Apply</span><span><b>Esc</b> Cancel</span>', '540px');
  const box = h('div', { class: 'lf-box' });
  box.innerHTML = `
    <div class="f-row">
      <label>Route Wise :</label>
      <select data-f="route">
        ${routes.map((r) => `<option value="${esc(r)}"${r.toLowerCase() === current.route.toLowerCase() ? ' selected' : ''}>${esc(r === 'ALL' ? '-- ALL ROUTES --' : r)}</option>`).join('')}
      </select>
    </div>
    <div class="f-row">
      <label>M.R. Wise :</label>
      <select data-f="mr">
        ${mrs.map((m) => `<option value="${esc(m)}"${m.toLowerCase() === current.mr.toLowerCase() ? ' selected' : ''}>${esc(m === 'ALL' ? '-- ALL M.R. / SALESMEN --' : m)}</option>`).join('')}
      </select>
    </div>
    <div class="f-row">
      <label>Village / Station :</label>
      <select data-f="village">
        ${villages.map((v) => `<option value="${esc(v)}"${v.toLowerCase() === current.village.toLowerCase() ? ' selected' : ''}>${esc(v === 'ALL' ? '-- ALL VILLAGES / STATIONS --' : v)}</option>`).join('')}
      </select>
    </div>
    <div class="f-row">
      <label>Account Group :</label>
      <select data-f="group">
        ${groups.map((g) => `<option value="${esc(g)}"${g.toLowerCase() === current.group.toLowerCase() ? ' selected' : ''}>${esc(g === 'ALL' ? '-- ALL GROUPS --' : g)}</option>`).join('')}
      </select>
    </div>
    <div class="f-row">
      <label>Balance Filter :</label>
      <select data-f="balance">
        <option value="all"${current.balance === 'all' ? ' selected' : ''}>ALL (Debit + Credit + Zero)</option>
        <option value="balance"${current.balance === 'balance' ? ' selected' : ''}>With Balance Only (Non-Zero)</option>
        <option value="dr"${current.balance === 'dr' ? ' selected' : ''}>Debit Balance Only (Receivable / Dr)</option>
        <option value="cr"${current.balance === 'cr' ? ' selected' : ''}>Credit Balance Only (Payable / Cr)</option>
        <option value="zero"${current.balance === 'zero' ? ' selected' : ''}>Zero Balance Only</option>
      </select>
    </div>
    <div class="f-row">
      <label>Find / Single Ledger :</label>
      <input type="text" data-f="search" value="${esc(current.search)}" placeholder="Search name, village, mobile, route..." autocomplete="off">
    </div>
    <div class="f-btns">
      <button type="button" class="btn-apply">✓ Apply Filter (Enter)</button>
      <button type="button" class="btn-clear">✕ Clear All</button>
      <button type="button" class="btn-cancel">Cancel (Esc)</button>
    </div>
  `;
  p.body.append(box);

  const selRoute = box.querySelector('[data-f="route"]') as HTMLSelectElement;
  const selMr = box.querySelector('[data-f="mr"]') as HTMLSelectElement;
  const selVillage = box.querySelector('[data-f="village"]') as HTMLSelectElement;
  const selGroup = box.querySelector('[data-f="group"]') as HTMLSelectElement;
  const selBalance = box.querySelector('[data-f="balance"]') as HTMLSelectElement;
  const inpSearch = box.querySelector('[data-f="search"]') as HTMLInputElement;

  const btnApply = box.querySelector('.btn-apply') as HTMLButtonElement;
  const btnClear = box.querySelector('.btn-clear') as HTMLButtonElement;
  const btnCancel = box.querySelector('.btn-cancel') as HTMLButtonElement;

  const apply = () => {
    p.close();
    onApply({
      route: selRoute.value,
      mr: selMr.value,
      village: selVillage.value,
      group: selGroup.value,
      balance: selBalance.value as any,
      search: inpSearch.value.trim(),
    });
  };

  btnApply.addEventListener('click', apply);
  btnClear.addEventListener('click', () => { p.close(); onClear(); });
  btnCancel.addEventListener('click', () => p.close());

  selRoute.focus();
  p.onKey = (_e, k) => {
    if (k === 'Enter') { apply(); return true; }
    if (k === 'Escape') { p.close(); return true; }
    return false;
  };
}

// ------------------------------------------------------------------ LEDGER ACCOUNTS
export async function allLedgers() {
  let upto = today();
  const company = await api<any>('/company');
  const w = openWin('LEDGER ACCOUNTS', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span><b>Alt+F1</b>-Others</span><span><b>F2</b>-Date</span><span><b>F3</b>-Edit</span><span><b>+</b>-Envelope</span><span><b>F4</b>-Interest</span><span><b>F6</b>-Adjust</span><span><b>F8</b>-PDC</span><span><b>Tab</b>-Search</span><span><b>F10</b>-Filter</span><span><b>Ctrl+F1</b>-Summary</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span>');
  const screen = h('div', { class: 'la-screen' });
  screen.innerHTML = `
    <div class="la-main">
      <div class="la-top"><span>${esc(company.name)}</span><span class="upto"></span></div>
      <div class="la-filter-bar" style="display:none"></div>
      <div class="la-cols"><span></span><span>DEBIT</span><span>CREDIT</span></div>
      <div class="la-rows"></div>
      <div class="la-panels">
        <div class="addr"><div class="cap">Address</div><div class="body"></div></div>
        <div class="cur"><div class="cap">Current Status</div><div class="body"></div>
          <div class="find"><span>Name ? &gt;&gt;</span><span>[</span><input autocomplete="off"><span>]</span></div></div>
      </div>
    </div>
    <div class="rv-status"></div>`;
  const bar = margBar('LEDGER ACCOUNTS');
  const btnFilter = h('button', { type: 'button', class: 'btn-filter', title: 'Filter Ledgers [F10]' }, '🔍 Filter');
  btnFilter.addEventListener('click', () => openFilter());
  bar.querySelector('.marg-bar-right')?.prepend(btnFilter);
  addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => printList() });
  screen.prepend(bar);
  w.body.append(screen);
  const rowsBox = screen.querySelector('.la-rows') as HTMLElement;
  const find = screen.querySelector('.find input') as HTMLInputElement;
  let all: Acc[] = [];
  let view: Acc[] = [];
  let sel = 0;
  let filterState: LedgerFilter = {
    route: 'ALL',
    mr: 'ALL',
    village: 'ALL',
    group: 'ALL',
    balance: 'all',
    search: '',
  };

  const load = async () => {
    all = await api<Acc[]>(`/reports/ledger-accounts?upto=${upto}`);
    filter();
  };

  function updateFilterBar() {
    const barEl = screen.querySelector('.la-filter-bar') as HTMLElement;
    if (!barEl) return;
    const tags: string[] = [];
    if (filterState.route !== 'ALL') tags.push(`<span class="tag-item">Route: <b>${esc(filterState.route)}</b></span>`);
    if (filterState.mr !== 'ALL') tags.push(`<span class="tag-item">M.R.: <b>${esc(filterState.mr)}</b></span>`);
    if (filterState.village !== 'ALL') tags.push(`<span class="tag-item">Village: <b>${esc(filterState.village)}</b></span>`);
    if (filterState.group !== 'ALL') tags.push(`<span class="tag-item">Group: <b>${esc(filterState.group)}</b></span>`);
    if (filterState.balance !== 'all') tags.push(`<span class="tag-item">Balance: <b>${esc(filterState.balance.toUpperCase())}</b></span>`);
    if (filterState.search) tags.push(`<span class="tag-item">Find: <b>${esc(filterState.search)}</b></span>`);

    if (tags.length) {
      barEl.style.display = 'flex';
      barEl.innerHTML = `<span class="badge">FILTER ACTIVE</span>${tags.join('')}<span style="color:#555;font-size:12px;margin-left:4px;">(${view.length} Ledgers)</span><button type="button" class="clear-btn">✕ Clear</button>`;
      barEl.querySelector('.clear-btn')?.addEventListener('click', () => {
        filterState = { route: 'ALL', mr: 'ALL', village: 'ALL', group: 'ALL', balance: 'all', search: '' };
        find.value = '';
        filter();
      });
    } else {
      barEl.style.display = 'none';
      barEl.innerHTML = '';
    }
  }

  function filter() {
    const q = find.value.trim().toLowerCase();
    view = all.filter((a) => {
      const meta = getAccMeta(a);
      if (filterState.route !== 'ALL' && meta.route.toLowerCase() !== filterState.route.toLowerCase()) return false;
      if (filterState.mr !== 'ALL' && meta.mr.toLowerCase() !== filterState.mr.toLowerCase()) return false;
      if (filterState.village !== 'ALL' && meta.village.toLowerCase() !== filterState.village.toLowerCase()) return false;
      if (filterState.group !== 'ALL' && a.group_name.toLowerCase() !== filterState.group.toLowerCase()) return false;
      if (filterState.balance === 'balance' && Math.abs(a.balance) <= 0.004) return false;
      if (filterState.balance === 'dr' && a.balance <= 0.004) return false;
      if (filterState.balance === 'cr' && a.balance >= -0.004) return false;
      if (filterState.balance === 'zero' && Math.abs(a.balance) > 0.004) return false;

      if (q) {
        const matches = a.name.toLowerCase().includes(q)
          || (a.city && a.city.toLowerCase().includes(q))
          || meta.village.toLowerCase().includes(q)
          || meta.route.toLowerCase().includes(q)
          || meta.mr.toLowerCase().includes(q)
          || meta.phone.toLowerCase().includes(q)
          || meta.gstin.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
    sel = Math.min(sel, Math.max(0, view.length - 1));
    if (q) sel = 0;
    draw();
    updateFilterBar();
  }

  function openFilter() {
    openLedgerFilterModal(
      all,
      filterState,
      (newFilter) => {
        filterState = newFilter;
        if (newFilter.search) find.value = newFilter.search;
        filter();
        toast(`Filter applied (${view.length} ledgers found)`);
      },
      () => {
        filterState = { route: 'ALL', mr: 'ALL', village: 'ALL', group: 'ALL', balance: 'all', search: '' };
        find.value = '';
        filter();
        toast('Filter cleared');
      }
    );
  }

  let statusSeq = 0;
  function draw() {
    (screen.querySelector('.upto') as HTMLElement).textContent = `Upto : ${dmy(upto)}`;
    rowsBox.innerHTML = view.map((a, i) => `<div class="r${i === sel ? ' sel' : ''}${a.has_due ? ' due' : ''}${CASH_BANK.includes(a.group_name) ? ' cb' : ''}" data-i="${i}">
      <span class="nm">${esc(a.name.toUpperCase())}</span><span class="st">${esc((a.city ?? '').toUpperCase())}</span>
      <span class="n">${a.balance > 0.004 ? f2(a.balance) : ''}</span><span class="n">${a.balance < -0.004 ? f2(-a.balance) : ''}</span></div>`).join('');
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const a = view[sel];
    let det: Record<string, string> = {};
    if (a?.details) {
      try { det = JSON.parse(a.details); } catch { /* ignore */ }
    }
    const phone = a?.phone || det.mobile || det.phone_off1 || '';
    const dlNo = det.dl_no || '';
    const gstn = a?.gstin || det.gstin || '';
    const area = det.area_name || (det.area_on === 'Yes' ? 'YES' : '');
    const route = det.route_name || (det.route_on === 'Yes' ? 'A(BPTDSP)' : '');
    const mr = det.mr_name || (det.mr_on === 'Yes' ? 'YES' : '');
    const state = (a?.state || det.state || '').toUpperCase();
    const addrLines = (a?.address || det.address1 || a?.name || '').toUpperCase().split('\n');

    (screen.querySelector('.addr .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="ad">${addrLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="g"><span>Phone:</span><span>${esc(phone)}</span><span></span><span></span></div>
      <div class="g"><span>DL.No:</span><span>${esc(dlNo)}</span><span>GSTN :</span><span>${esc(gstn)}</span></div>
      <div class="g"><span>Area :</span><span>${esc(area)}</span><span>Route:</span><span>${esc(route)}</span></div>
      <div class="g"><span>M.R. :</span><span>${esc(mr)}</span><span>State:</span><span>${esc(state)}</span></div>`;
    (screen.querySelector('.cur .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="kv"><span>Opening :</span><b>${drcr(a.opening)}</b></div>
      <div class="kv"><span>Debit &nbsp;&nbsp;:</span><b>${f2(a.debit)} Dr</b></div>
      <div class="kv"><span>Credit &nbsp;:</span><b>${f2(a.credit)} Cr</b></div>
      <div class="kv"><span>Balance :</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>Cr.Limit:</span><b>${a.credit_limit ? money(a.credit_limit) : '0.00'}</b></div>
      <div class="kv"><span>Net &nbsp;&nbsp;&nbsp;&nbsp;:</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>Type &nbsp;&nbsp;&nbsp;:</span><b>${esc(a.group_name)}</b></div>`;
    const panel = screen.querySelector('.rv-status') as HTMLElement;
    const seq = ++statusSeq;
    if (!a) { panel.innerHTML = ''; return; }
    setTimeout(() => {   // only fetch for the line the cursor stops on
      if (seq !== statusSeq) return;
      api<Status>(`/ledgers/${a.id}/status`).then((s) => { if (seq === statusSeq) panel.innerHTML = statusHtml(s); }).catch(() => {});
    }, 150);
  }

  function exportExcel() {
    const headers = ['Ledger Name', 'Station', 'Group', 'Route', 'M.R.', 'Village', 'Phone', 'GSTIN', 'Debit Balance', 'Credit Balance', 'Net Balance'];
    const rows = view.map((a) => {
      const meta = getAccMeta(a);
      return [
        a.name,
        a.city ?? '',
        a.group_name ?? '',
        meta.route,
        meta.mr,
        meta.village,
        meta.phone,
        meta.gstin,
        a.balance > 0.004 ? f2(a.balance) : '',
        a.balance < -0.004 ? f2(-a.balance) : '',
        drcr(a.balance),
      ];
    });
    const totDr = view.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0);
    const totCr = view.filter((a) => a.balance < 0).reduce((s, a) => s - a.balance, 0);
    rows.push(['Total', '', '', '', '', '', '', f2(totDr), f2(totCr), drcr(totDr - totCr)]);
    const suffix = filterState.route !== 'ALL' ? `_${filterState.route}` : (filterState.village !== 'ALL' ? `_${filterState.village}` : '');
    downloadCsv(`Ledger_Accounts${suffix}_Upto_${upto}.csv`, headers, rows);
  }

  function printList() {
    const html = `<h2>${esc(company.name)}</h2><h3 style="text-align:center">LEDGER ACCOUNTS &nbsp; Upto ${dmy(upto)}</h3>
      <table class="grid"><tr><th>Ledger</th><th>Station</th><th>Route</th><th>M.R.</th><th class="n">Debit</th><th class="n">Credit</th></tr>
      ${view.map((a) => {
        const meta = getAccMeta(a);
        return `<tr><td>${esc(a.name)}</td><td>${esc(a.city ?? '')}</td><td>${esc(meta.route)}</td><td>${esc(meta.mr)}</td><td class="n">${a.balance > 0.004 ? money(a.balance) : ''}</td><td class="n">${a.balance < -0.004 ? money(-a.balance) : ''}</td></tr>`;
      }).join('')}
      <tr class="total"><td colspan="4"><b>Total</b></td><td class="n"><b>${money(view.filter((a) => a.balance > 0).reduce((s, a) => s + a.balance, 0))}</b></td>
        <td class="n"><b>${money(-view.filter((a) => a.balance < 0).reduce((s, a) => s + a.balance, 0))}</b></td></tr></table>`;
    import('./billing.ts').then((m) => m.printHtml(html, 1));
  }

  find.addEventListener('input', filter);
  rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); find.focus(); } });
  rowsBox.addEventListener('dblclick', () => view[sel] && ledgerDisplay(view[sel] as unknown as Ledger, upto));
  w.onKey = (_e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Ctrl+Home') { sel = 0; draw(); return true; }
    if (k === 'Ctrl+End') { sel = Math.max(0, view.length - 1); draw(); return true; }
    if (k === 'Enter' && view[sel]) { ledgerDisplay(view[sel] as unknown as Ledger, upto); return true; }
    if (k === 'F2') { askUpto(upto).then((d) => { if (d) { upto = d; load(); } }); return true; }
    if (k === 'F3' && view[sel]) {
      if (!canAction('ledger.list')) { toast('Access denied — your role cannot edit ledgers', true); return true; }
      api<Ledger>(`/ledgers/${view[sel].id}`).then(async (l) => {
        const { postSaveMenu } = await import('./ledgerform.ts');
        return postSaveMenu(l);
      }).then((l) => { if (l) load(); });
      return true;
    }
    if (k === 'F10') { openFilter(); return true; }
    if (k === 'Alt+X') { exportExcel(); return true; }
    if (k === 'Alt+P' || k === 'Ctrl+P') { printList(); return true; }
    if (k === 'Tab') { find.focus(); find.select(); return true; }
    if (k === 'Escape' && find.value) { find.value = ''; filter(); return true; }
    return false;
  };

  await load();
  find.focus();
}

// ------------------------------------------------------------------ LEDGER ALTRATION (Masters → Ledger Master → Modify / Delete Ledger)
export async function ledgerAlteration(group?: string, mode: 'modify' | 'delete' = 'modify') {
  let upto = today();
  const company = await api<any>('/company');
  const w = openWin('LEDGER ALTRATION', 'full', '');
  w.el.classList.add('marg');
  w.setFoot('<span>Ledgers : <b class="la-foot-cnt">0</b></span><span>Range</span><span><b>F10</b>-Filter</span><span><b>F2</b>-New</span><span><b>F3</b>-Modify</span><span><b>Tab</b>-Search</span><span><b>Ctrl+F1</b>-Summary</span>');
  const screen = h('div', { class: `la-screen alteration${mode === 'delete' ? ' del-mode' : ''}` });
  screen.innerHTML = `
    <div class="la-main">
      <div class="la-top"><span class="co-name">${esc(company.name.toUpperCase())}</span><span class="upto"></span></div>
      <div class="la-filter-bar" style="display:none"></div>
      <div class="la-cols"><span></span><span></span><span>DEBIT</span><span>CREDIT</span></div>
      <div class="la-rows"></div>
      <div class="la-panels">
        <div class="addr"><div class="cap">Address</div><div class="body"></div></div>
        <div class="cur"><div class="cap">Current Status</div><div class="body"></div>
          <div class="find"><span>Name ? &gt;&gt;</span><span>[</span><input autocomplete="off" spellcheck="false"><span>]</span> <span class="search-ico">&#128269;</span></div></div>
      </div>
    </div>
    <div class="rv-status"></div>`;
  const bar = margBar('LEDGER ALTRATION');
  const btnFilter = h('button', { type: 'button', class: 'btn-filter', title: 'Filter Ledgers [F10]' }, '🔍 Filter');
  btnFilter.addEventListener('click', () => openFilter());
  bar.querySelector('.marg-bar-right')?.prepend(btnFilter);
  screen.prepend(bar);
  w.body.append(screen);
  const rowsBox = screen.querySelector('.la-rows') as HTMLElement;
  const find = screen.querySelector('.find input') as HTMLInputElement;
  const footCnt = w.el.querySelector('.la-foot-cnt') as HTMLElement;
  let all: Acc[] = [];
  let view: Acc[] = [];
  let sel = 0;
  let filterState: LedgerFilter = {
    route: 'ALL',
    mr: 'ALL',
    village: 'ALL',
    group: 'ALL',
    balance: 'all',
    search: '',
  };

  const load = async () => {
    const raw = await api<Acc[]>(`/reports/ledger-accounts?upto=${upto}`);
    if (group) {
      const gList = group.split(',').map((s) => s.trim().toLowerCase());
      all = raw.filter((a) => gList.includes((a.group_name || '').toLowerCase()));
    } else {
      all = raw;
    }
    filter();
  };

  function updateFilterBar() {
    const barEl = screen.querySelector('.la-filter-bar') as HTMLElement;
    if (!barEl) return;
    const tags: string[] = [];
    if (filterState.route !== 'ALL') tags.push(`<span class="tag-item">Route: <b>${esc(filterState.route)}</b></span>`);
    if (filterState.mr !== 'ALL') tags.push(`<span class="tag-item">M.R.: <b>${esc(filterState.mr)}</b></span>`);
    if (filterState.village !== 'ALL') tags.push(`<span class="tag-item">Village: <b>${esc(filterState.village)}</b></span>`);
    if (filterState.group !== 'ALL') tags.push(`<span class="tag-item">Group: <b>${esc(filterState.group)}</b></span>`);
    if (filterState.balance !== 'all') tags.push(`<span class="tag-item">Balance: <b>${esc(filterState.balance.toUpperCase())}</b></span>`);
    if (filterState.search) tags.push(`<span class="tag-item">Find: <b>${esc(filterState.search)}</b></span>`);

    if (tags.length) {
      barEl.style.display = 'flex';
      barEl.innerHTML = `<span class="badge">FILTER ACTIVE</span>${tags.join('')}<span style="color:#555;font-size:12px;margin-left:4px;">(${view.length} Ledgers)</span><button type="button" class="clear-btn">✕ Clear</button>`;
      barEl.querySelector('.clear-btn')?.addEventListener('click', () => {
        filterState = { route: 'ALL', mr: 'ALL', village: 'ALL', group: 'ALL', balance: 'all', search: '' };
        find.value = '';
        filter();
      });
    } else {
      barEl.style.display = 'none';
      barEl.innerHTML = '';
    }
  }

  function filter() {
    const q = find.value.trim().toLowerCase();
    view = all.filter((a) => {
      const meta = getAccMeta(a);
      if (filterState.route !== 'ALL' && meta.route.toLowerCase() !== filterState.route.toLowerCase()) return false;
      if (filterState.mr !== 'ALL' && meta.mr.toLowerCase() !== filterState.mr.toLowerCase()) return false;
      if (filterState.village !== 'ALL' && meta.village.toLowerCase() !== filterState.village.toLowerCase()) return false;
      if (filterState.group !== 'ALL' && a.group_name.toLowerCase() !== filterState.group.toLowerCase()) return false;
      if (filterState.balance === 'balance' && Math.abs(a.balance) <= 0.004) return false;
      if (filterState.balance === 'dr' && a.balance <= 0.004) return false;
      if (filterState.balance === 'cr' && a.balance >= -0.004) return false;
      if (filterState.balance === 'zero' && Math.abs(a.balance) > 0.004) return false;

      if (q) {
        const matches = a.name.toLowerCase().includes(q)
          || (a.city && a.city.toLowerCase().includes(q))
          || meta.village.toLowerCase().includes(q)
          || meta.route.toLowerCase().includes(q)
          || meta.mr.toLowerCase().includes(q)
          || meta.phone.toLowerCase().includes(q)
          || meta.gstin.toLowerCase().includes(q);
        if (!matches) return false;
      }
      return true;
    });
    sel = Math.min(sel, Math.max(0, view.length - 1));
    if (q) sel = 0;
    if (footCnt) footCnt.textContent = String(view.length);
    draw();
    updateFilterBar();
  }

  function openFilter() {
    openLedgerFilterModal(
      all,
      filterState,
      (newFilter) => {
        filterState = newFilter;
        if (newFilter.search) find.value = newFilter.search;
        filter();
        toast(`Filter applied (${view.length} ledgers found)`);
      },
      () => {
        filterState = { route: 'ALL', mr: 'ALL', village: 'ALL', group: 'ALL', balance: 'all', search: '' };
        find.value = '';
        filter();
        toast('Filter cleared');
      }
    );
  }
  let statusSeq = 0;
  function draw() {
    (screen.querySelector('.upto') as HTMLElement).textContent = `Upto : ${dmy(upto)}`;
    rowsBox.innerHTML = view.map((a, i) => `<div class="r${i === sel ? ' sel' : ''}${a.has_due ? ' due' : ''}${CASH_BANK.includes(a.group_name) ? ' cb' : ''}" data-i="${i}">
      <span class="nm">${esc(a.name.toUpperCase())}</span><span class="st">${esc((a.city ?? '').toUpperCase())}</span>
      <span class="n">${a.balance > 0.004 ? f2(a.balance) : ''}</span><span class="n">${a.balance < -0.004 ? f2(-a.balance) : ''}</span></div>`).join('');
    rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
    const a = view[sel];
    let det: Record<string, string> = {};
    if (a?.details) {
      try { det = JSON.parse(a.details); } catch { /* ignore */ }
    }
    const phone = a?.phone || det.mobile || det.phone_off1 || '';
    const dlNo = det.dl_no || '';
    const gstn = a?.gstin || det.gstin || '';
    const area = det.area_name || (det.area_on === 'Yes' ? 'YES' : '');
    const route = det.route_name || (det.route_on === 'Yes' ? 'A(BPTDSP)' : '');
    const mr = det.mr_name || (det.mr_on === 'Yes' ? 'YES' : '');
    const state = (a?.state || det.state || '').toUpperCase();
    const addrLines = (a?.address || det.address1 || a?.name || '').toUpperCase().split('\n');

    (screen.querySelector('.addr .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="ad">${addrLines.map((l) => `<div>${esc(l)}</div>`).join('')}</div>
      <div class="g"><span>Phone:</span><span>${esc(phone)}</span><span></span><span></span></div>
      <div class="g"><span>DL.No:</span><span>${esc(dlNo)}</span><span>GSTN :</span><span>${esc(gstn)}</span></div>
      <div class="g"><span>Area :</span><span>${esc(area)}</span><span>Route:</span><span>${esc(route)}</span></div>
      <div class="g"><span>M.R. :</span><span>${esc(mr)}</span><span>State:</span><span>${esc(state)}</span></div>`;
    (screen.querySelector('.cur .body') as HTMLElement).innerHTML = !a ? '' : `
      <div class="kv"><span>Opening :</span><b>${drcr(a.opening)}</b></div>
      <div class="kv"><span>Debit &nbsp;&nbsp;:</span><b>${f2(a.debit)} Dr</b></div>
      <div class="kv"><span>Credit &nbsp;:</span><b>${f2(a.credit)} Cr</b></div>
      <div class="kv"><span>Balance :</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>Cr.Limit:</span><b>${a.credit_limit ? money(a.credit_limit) : '0.00'}</b></div>
      <div class="kv"><span>Net &nbsp;&nbsp;&nbsp;&nbsp;:</span><b>${drcr(a.balance)}</b></div>
      <div class="kv"><span>Type &nbsp;&nbsp;&nbsp;:</span><b>${esc(a.group_name)}</b></div>`;
    const panel = screen.querySelector('.rv-status') as HTMLElement;
    const seq = ++statusSeq;
    if (!a) { panel.innerHTML = ''; return; }
    setTimeout(() => {
      if (seq !== statusSeq) return;
      api<Status>(`/ledgers/${a.id}/status`).then((s) => { if (seq === statusSeq) panel.innerHTML = statusHtml(s); }).catch(() => {});
    }, 150);
  }

  async function openOptions(acc: Acc) {
    if (!acc) return;
    let full: Ledger;
    try {
      full = await api<Ledger>(`/ledgers/${acc.id}`);
    } catch (e) {
      toast((e as Error).message, true);
      return;
    }
    if (mode === 'delete') {
      const { deleteLedgerScreen } = await import('./ledgerform.ts');
      const deleted = await deleteLedgerScreen(full);
      if (deleted) await load();
      return;
    }
    if (!canAction('ledger.list')) {
      toast('Access denied — your role cannot edit ledgers', true);
      return;
    }
    const { postSaveMenu } = await import('./ledgerform.ts');
    const updated = await postSaveMenu(full);
    if (updated) await load();
  }

  find.addEventListener('input', filter);
  rowsBox.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
    if (el) { sel = Number(el.dataset.i); draw(); find.focus(); }
  });
  rowsBox.addEventListener('dblclick', () => view[sel] && openOptions(view[sel]));
  w.onKey = (_e, k) => {
    const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
    const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
    if (k === 'Ctrl+Home' || k === 'Home') { sel = 0; draw(); return true; }
    if (k === 'Ctrl+End' || k === 'End') { sel = Math.max(0, view.length - 1); draw(); return true; }
    if ((k === 'Enter' || k === 'F3' || (mode === 'delete' && k === 'Delete')) && view[sel]) { openOptions(view[sel]); return true; }
    if (k === 'F2') {
      import('./ledgerform.ts').then(async (m) => {
        let groups: any[] = [];
        try { groups = await api<any[]>('/groups'); } catch { /* ignore */ }
        const ug = await m.pickUnderGroup(groups);
        if (!ug) return;
        const created = await m.ledgerScreen(undefined, ug.name);
        if (created) await load();
      });
      return true;
    }
    if (k === 'Delete' && view[sel]) {
      openOptions(view[sel]);
      return true;
    }
    if (k === 'F10') { openFilter(); return true; }
    if (k === 'Tab') { find.focus(); find.select(); return true; }
    if (k === 'Escape') {
      if (find.value) { find.value = ''; filter(); return true; }
      w.close();
      return true;
    }
    return false;
  };
  await load();
  find.focus();
}

/** F2 on LEDGER ACCOUNTS: the "Upto" date for the balances. */
function askUpto(cur: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = margPop('DATE', '<span><b>Enter</b>-OK</span><span><b>Esc</b>-Cancel</span>', '360px');
    p.body.append(h('div', { class: 'db-period' }, `<div><span>Upto :</span><input value="${dmy(cur)}"></div>`));
    const inp = p.body.querySelector('input') as HTMLInputElement;
    inp.focus(); inp.select();
    p.onKey = (_e, k) => {
      if (k === 'Enter') { const d = isoOf(inp.value); if (!d) { toast('Enter the date as DD-MM-YYYY', true); return true; } p.close(); resolve(d); return true; }
      if (k === 'Escape') { p.close(); resolve(null); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ LEDGER DISPLAY
type View = 'ledger' | 'monthly' | 'daily' | 'summary';
/** LEDGER DISPLAY: FROM / TO, then Ledger · Monthly · Daily · Summary · Cancel. */
export function ledgerDisplay(l: Ledger, to = today()): Promise<void> {
  return new Promise((resolve) => {
    const p = margPop('LEDGER DISPLAY', '<span><b>Enter</b>-Next</span><span><b>L/M/D/S</b>-View</span><span><b>Esc</b>-Cancel</span>', '520px');
    const box = h('div', { class: 'ld-box' });
    box.innerHTML = `<div class="dates"><span>FROM</span><input data-f="from" value="${dmy(fyStart())}"><span>TO</span><input data-f="to" value="${dmy(to)}"></div>
      <div class="btns"><button data-v="ledger"><u>L</u>edger</button><button data-v="monthly"><u>M</u>onthly</button><button data-v="daily"><u>D</u>aily</button>
        <button data-v="summary"><u>S</u>ummary</button><button data-v="cancel"><u>C</u>ancel</button></div>`;
    p.body.append(box);
    const fields = [...box.querySelectorAll('input, button')] as HTMLElement[];
    const go = (v: View | 'cancel') => {
      if (v === 'cancel') { p.close(); resolve(); return; }
      const from = isoOf((fields[0] as HTMLInputElement).value), till = isoOf((fields[1] as HTMLInputElement).value);
      if (!from || !till) { toast('Enter dates as DD-MM-YYYY', true); fields[0].focus(); return; }
      if (from > till) { toast('FROM date is after TO date', true); fields[0].focus(); return; }
      p.close();
      ledgerView(l, v, from, till).finally(resolve);
    };
    box.addEventListener('click', (e) => { const b = (e.target as HTMLElement).closest('button'); if (b) go(b.dataset.v as View | 'cancel'); });
    fields[0].focus(); (fields[0] as HTMLInputElement).select();
    p.onKey = (_e, k) => {
      const el = document.activeElement as HTMLElement;
      const i = fields.indexOf(el);
      if (el instanceof HTMLButtonElement) {
        if (k === 'ArrowRight' || k === 'Tab') { fields[Math.min(fields.length - 1, i + 1)].focus(); return true; }
        if (k === 'ArrowLeft') { fields[Math.max(2, i - 1)].focus(); return true; }
        if (k === 'Enter') { go(el.dataset.v as View | 'cancel'); return true; }
      } else if (k === 'Enter' || k === 'Tab') { fields[i + 1].focus(); (fields[i + 1] as HTMLInputElement).select?.(); return true; }
      const hit = ({ L: 'ledger', M: 'monthly', D: 'daily', S: 'summary', C: 'cancel' } as Record<string, View | 'cancel'>)[k];
      if (hit && !(el instanceof HTMLInputElement)) { go(hit); return true; }
      if (k === 'Escape') { go('cancel'); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ the four views
interface Line { key: string; cells: string[]; debit: number; credit: number; bal?: number; entry?: Entry; from?: string; to?: string; bold?: boolean }

async function ledgerView(l: Ledger, view: View, from: string, to: string): Promise<void> {
  const d = await api<{ ledger: any; opening: number; rows: Entry[] }>(`/reports/ledger/${l.id}?from=${from}&to=${to}`);
  const company = await api<any>('/company');
  const title = { ledger: 'LEDGER', monthly: 'MONTHLY LEDGER', daily: 'DAILY LEDGER', summary: 'LEDGER SUMMARY' }[view];
  const heads: Record<View, string[]> = {
    ledger: ['DATE', 'PARTICULARS', 'TYPE', 'VCH NO.'],
    monthly: ['MONTH', '', 'ENTRIES', ''],
    daily: ['DATE', 'DAY', 'ENTRIES', ''],
    summary: ['TYPE', '', 'ENTRIES', ''],
  };
  // Build the lines for this view; each keeps the running balance after it.
  let bal = d.opening;
  const lines: Line[] = [{ key: 'open', cells: ['', 'Opening Balance', '', ''], debit: d.opening > 0 ? d.opening : 0, credit: d.opening < 0 ? -d.opening : 0, bal, bold: true }];
  const group = (keyOf: (e: Entry) => string, cells: (k: string, list: Entry[]) => string[], range: (k: string) => [string, string]) => {
    const map = new Map<string, Entry[]>();
    for (const e of d.rows) { const k = keyOf(e); map.set(k, [...(map.get(k) ?? []), e]); }
    for (const [k, list] of map) {
      const dr = r2(list.reduce((s, e) => s + e.debit, 0)), cr = r2(list.reduce((s, e) => s + e.credit, 0));
      bal = r2(bal + dr - cr);
      const [f, t] = range(k);
      lines.push({ key: k, cells: cells(k, list), debit: dr, credit: cr, bal, from: f, to: t });
    }
  };
  const monthEnd = (ym: string) => { const [y, m] = ym.split('-').map(Number); const e = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); return e > to ? to : e; };
  if (view === 'ledger') {
    for (const e of d.rows) {
      bal = r2(bal + e.debit - e.credit);
      lines.push({ key: `${e.source}${e.source_id}`, cells: [dmy(e.date).slice(0, 5), (e.against || e.narration || '').toUpperCase(), VT[e.vtype] ?? e.vtype, e.vno], debit: e.debit, credit: e.credit, bal, entry: e });
    }
  } else if (view === 'monthly') {
    group((e) => e.date.slice(0, 7), (k, list) => [new Date(`${k}-01T00:00:00`).toLocaleString('en', { month: 'long', year: 'numeric' }).toUpperCase(), '', String(list.length), ''],
      (k) => [`${k}-01` < from ? from : `${k}-01`, monthEnd(k)]);
  } else if (view === 'daily') {
    group((e) => e.date, (k, list) => [dmy(k), new Date(`${k}T00:00:00`).toLocaleString('en', { weekday: 'long' }).toUpperCase(), String(list.length), ''], (k) => [k, k]);
  } else {
    // Summary: a condensed ledger — one line per entry type. Its balance column is the closing.
    const map = new Map<string, Entry[]>();
    for (const e of d.rows) map.set(e.vtype, [...(map.get(e.vtype) ?? []), e]);
    for (const [k, list] of map) {
      const dr = r2(list.reduce((s, e) => s + e.debit, 0)), cr = r2(list.reduce((s, e) => s + e.credit, 0));
      lines.push({ key: k, cells: [VT[k] ?? k, '', String(list.length), ''], debit: dr, credit: cr });
    }
    bal = r2(d.opening + d.rows.reduce((s, e) => s + e.debit - e.credit, 0));
  }
  const totDr = r2(d.rows.reduce((s, e) => s + e.debit, 0)), totCr = r2(d.rows.reduce((s, e) => s + e.credit, 0));
  const closing = r2(d.opening + totDr - totCr);

  return new Promise((resolve) => {
    const w = openWin(title, 'full', '');
    w.el.classList.add('marg');
    w.setFoot(`<span><b>Enter</b>-${view === 'ledger' ? 'Open Entry' : view === 'summary' ? '' : 'Open'}</span><span><b>F2</b>-Date</span><span><b>Alt+X</b>-Excel</span><span><b>Alt+P</b>-PDF</span><span><b>Esc</b>-Exit</span>`);
    const screen = h('div', { class: 'lv-screen' });
    screen.innerHTML = `
      <div class="lv-top"><span class="co">${esc(company.name)}</span><span>Period : ${dmy(from)} - ${dmy(to)}</span></div>
      <div class="lv-name">${esc(l.name.toUpperCase())}${l.city ? ` , ${esc(l.city.toUpperCase())}` : ''}</div>
      <div class="lv-cols">${heads[view].map((x, i) => `<span class="${i === 2 && view !== 'ledger' ? 'n' : ''}">${x}</span>`).join('')}<span class="n">DEBIT</span><span class="n">CREDIT</span><span class="n">${view === 'summary' ? '' : 'BALANCE'}</span></div>
      <div class="lv-rows"></div>
      <div class="lv-foot"><div class="rm"></div><div class="tot"><span>TOTAL :</span><b>${f2(totDr)}</b><b>${f2(totCr)}</b><b></b></div>
        <div class="tot"><span>CLOSING :</span><b>${closing > 0 ? f2(closing) : ''}</b><b>${closing < 0 ? f2(-closing) : ''}</b><b>${drcr(closing)}</b></div></div>`;
    const bar = margBar(title);
    addExportToMargBar(bar, { onExcel: () => exportExcel(), onPdf: () => print() });
    screen.prepend(bar);
    w.body.append(screen);
    const rowsBox = screen.querySelector('.lv-rows') as HTMLElement;
    let sel = Math.min(1, lines.length - 1);
    const draw = () => {
      rowsBox.innerHTML = lines.map((x, i) => `<div class="r${i === sel ? ' sel' : ''}${x.bold ? ' b' : ''}" data-i="${i}">
        ${x.cells.map((c, j) => `<span class="${j === 2 && view !== 'ledger' ? 'n' : ''}">${esc(c)}</span>`).join('')}
        <span class="n">${x.debit ? f2(x.debit) : ''}</span><span class="n">${x.credit ? f2(x.credit) : ''}</span><span class="n">${x.bal != null ? drcr(x.bal) : ''}</span></div>`).join('');
      rowsBox.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
      const cur = lines[sel];
      (screen.querySelector('.rm') as HTMLElement).textContent = cur?.entry?.narration ? `Narration : ${cur.entry.narration}` : '';
    };
    const open = (x: Line) => {
      if (x.entry) {
        const e = x.entry;
        if (e.source === 'BILL') {
          const bills = lines.filter((y) => y.entry?.source === 'BILL').map((y) => ({ id: y.entry!.source_id, type: y.entry!.vtype }));
          import('./billview.ts').then((m) => m.billAlteration(bills, bills.findIndex((b) => b.id === e.source_id)));
        } else if (canAction(`voucher.list:${e.vtype}`)) import('./vouchers.ts').then((m) => m.voucherEntry(e.vtype, e.source_id));
        else toast('Access denied — your role cannot modify vouchers', true);
      } else if (x.from && x.to) ledgerView(l, 'ledger', x.from, x.to);   // a month / day opens its entries
    };
    function exportExcel() {
      const headsList = heads[view].filter(Boolean);
      const headers = [...headsList, 'Debit', 'Credit', ...(view === 'summary' ? [] : ['Balance']), 'Narration'];
      const rows = lines.map((x) => [
        ...x.cells.filter((_, j) => heads[view][j]),
        x.debit ? f2(x.debit) : '',
        x.credit ? f2(x.credit) : '',
        ...(view === 'summary' ? [] : [x.bal != null ? drcr(x.bal) : '']),
        x.entry?.narration ?? '',
      ]);
      rows.push(['Closing Balance', ...headsList.slice(1).map(() => ''), f2(totDr), f2(totCr), ...(view === 'summary' ? [] : [drcr(closing)]), '']);
      const safeName = l.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      downloadCsv(`Ledger_${safeName}_${from}_${to}.csv`, headers, rows);
    }
    const print = () => {
      const html = `<h2>${esc(company.name)}</h2><h3 style="text-align:center">${esc(title)} : ${esc(l.name)} &nbsp; ${dmy(from)} to ${dmy(to)}</h3>
        <table class="grid"><tr>${heads[view].filter(Boolean).map((x) => `<th>${x}</th>`).join('')}<th class="n">Debit</th><th class="n">Credit</th>${view === 'summary' ? '' : '<th class="n">Balance</th>'}</tr>
        ${lines.map((x) => `<tr>${x.cells.filter((_, j) => heads[view][j]).map((c) => `<td>${esc(c)}</td>`).join('')}<td class="n">${x.debit ? money(x.debit) : ''}</td>
          <td class="n">${x.credit ? money(x.credit) : ''}</td>${view === 'summary' ? '' : `<td class="n">${x.bal != null ? drcr(x.bal) : ''}</td>`}</tr>`).join('')}
        <tr class="total"><td colspan="${heads[view].filter(Boolean).length}"><b>Closing Balance</b></td><td class="n"><b>${money(totDr)}</b></td><td class="n"><b>${money(totCr)}</b></td>${view === 'summary' ? '' : `<td class="n"><b>${drcr(closing)}</b></td>`}</tr></table>`;
      import('./billing.ts').then((m) => m.printHtml(html, 1));
    };
    rowsBox.addEventListener('click', (e) => { const el = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null; if (el) { sel = Number(el.dataset.i); draw(); } });
    w.onKey = (_e, k) => {
      const page = Math.max(1, Math.floor(rowsBox.clientHeight / 26) - 1);
      const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
      if (k in step) { sel = Math.min(lines.length - 1, Math.max(0, sel + step[k])); draw(); return true; }
      if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
      if (k === 'End' || k === 'Ctrl+End') { sel = lines.length - 1; draw(); return true; }
      if (k === 'Enter' && lines[sel]) { open(lines[sel]); return true; }
      if (k === 'F2') { w.close(); ledgerDisplay(l, to); return true; }
      if (k === 'Alt+X') { exportExcel(); return true; }
      if (k === 'Alt+P' || k === 'Ctrl+P' || k === 'F10') { print(); return true; }
      return false;
    };

    w.onClose = () => resolve();
    draw();
  });
}
