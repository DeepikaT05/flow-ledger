import { MENU, USER_MENU, QUICK, HOTKEYS, type MenuEntry, type MenuItem } from './menu.ts';
import { api, esc, keyName, toast, openWin, handleWinKey, winCount, confirmBox, alertBox } from './ui.ts';
import { ledgerList, ledgerForm, itemList, itemForm, groupList, groupForm, companyForm, partyGstList, masterStats, exportLedgers, itemRegister, salesmanList, priceList } from './masters.ts';
import { billList } from './billing.ts';
import { saleEntry } from './sale.ts';
import { voucherEntry, voucherList, voucherMenu } from './vouchers.ts';
import { receiptEntry, type VType } from './receipt.ts';
import { bookScreen } from './daybook.ts';
import { currentStock, closingStock } from './stock.ts';
import * as R from './reports.ts';
import { boot, login, changeCompany, isBooting } from './startup.ts';
import { usersWindow, rolesWindow } from './admin.ts';
import { session, canAction, isSuper, menuTickedFor } from './session.ts';
import { menuKeyOf, leavesForAction, leavesForLabel } from '../shared/menuPerms.ts';
import { margNumber } from './margui.ts';

// ------------------------------------------------------------------ actions
const ACTIONS: Record<string, (arg?: string) => unknown> = {
  'ledger.add': () => ledgerForm(),
  'ledger.list': (g) => import('./ledgers.ts').then((m) => m.ledgerAlteration(g, 'modify')),
  'ledger.delete': (g) => import('./ledgers.ts').then((m) => m.ledgerAlteration(g, 'delete')),
  'ledger.gst': () => partyGstList(),
  'ledger.export': () => exportLedgers(),
  'group.list': () => groupList(),
  'group.add': () => groupForm(),
  'item.add': () => itemForm(),
  'item.list': () => closingStock(['MAIN STORE']),
  'item.prices': (by) => priceList(by === 'company'),
  'item.register': () => itemRegister(),
  'company.edit': () => companyForm(),
  'company.change': () => switchCompany(),
  'master.stats': () => masterStats(),
  'bill.new': (t) => saleEntry(t!),
  'bill.list': (t) => billList(t!),
  'voucher.new': (t) => receiptEntry(t as VType),
  'voucher.list': (t) => voucherList(t!),
  'voucher.menu': () => voucherMenu(),
  'party.txn': () => R.partyTransactions(),
  'report.ledger': () => R.ledgerStatement(),
  'report.cashbank': () => R.cashBankBook(),
  'report.daybook': () => bookScreen('DAY'),
  'report.salebook': () => bookScreen('SALE'),
  'report.book': (t) => R.billBook(t!),
  'report.tb': () => R.trialBalance(),
  'report.pl': () => R.profitLoss(),
  'report.bs': () => R.balanceSheet(),
  'report.outstanding': (k) => R.outstanding(k!),
  'report.stock': () => currentStock(),
  'report.reorder': () => R.reorder(),
  'report.gp': () => R.grossProfit(),
  'report.mis': () => R.mis(),
  'report.batch': () => R.batchStock(),
  'report.expiry': () => R.expiryStock(),
  'report.mop': () => R.modeOfPayment(),
  'report.group': () => R.groupSummary(),
  'report.itemsale': () => R.productSummary('SALE'),
  'report.product_summary': (side) => R.productSummary(side as any),
  'report.gstr3b': () => R.gstr3b(),
  'report.summary': (spec) => R.summary(spec!),
  'report.ageing': () => R.ageing(),
  'report.negstock': () => R.negativeStock(),
  'salesman.list': () => salesmanList(),
  // Alt+E / T / B / S / D / R / G / F: drop open that top menu (main screen only).
  'menu.open': (hot) => { if (!winCount()) { const i = topMenuIndex(hot!); if (i >= 0) openTop(i); } },
  'refresh': () => { refreshInfo(); toast('Balances refreshed'); },
  'backup': () => alertBox('Data is stored locally in data/marg.db — copy that file to back up.'),
  'user.change': () => changeUser(),
  'user.manage': () => usersWindow(),
  'role.manage': () => rolesWindow(),
  'user.password': () => changeMyPassword(),
  'calc': () => calculator(),
  'calendar': () => calendar(),
  'print': () => window.print(),
  'shortcuts': () => shortcutsHelp(),
  // Quit: end the server session and start again from the login box.
  'exit': () => confirmBox('Quit Flow Ledger ?', false).then(async (y) => {
    if (!y) return;
    await api('/logout', { method: 'POST' }).catch(() => undefined);
    location.reload();
  }),
};

/** Menu label for an action, so a refused shortcut can say what it would have opened. */
const ACTION_LABELS = new Map<string, string>();
/** Name for the viewed-reports lists: "Purchase Bill" for an item whose label alone is shared. */
const ACTION_NAME = new Map<string, string>();
const LABEL_ACTIONS = new Map<string, Set<string>>();
(function collect(items: MenuEntry[], parent: string) {
  for (const m of items) {
    if (m === '-') continue;
    // "Purchase → Bill" rather than a bare "Bill".
    if (m.action && !ACTION_LABELS.has(m.action)) {
      ACTION_LABELS.set(m.action, parent ? `${parent} → ${m.label}` : m.label);
      ACTION_NAME.set(m.action, parent ? `${parent} ${m.label}` : m.label);
    }
    if (m.action) LABEL_ACTIONS.set(m.label, (LABEL_ACTIONS.get(m.label) ?? new Set()).add(m.action));
    if (m.children) collect(m.children, m.label);
  }
})(MENU, '');
for (const q of QUICK) ACTION_NAME.set(q.action, q.label);   // the quick button's name wins: "Sale", "Receipt"

function run(action: string | undefined, label?: string) {
  closeMenu();
  if (!action) return;
  const [name, arg] = action.split(/:(.*)/s);
  const fn = ACTIONS[name];
  if (!fn) return;
  if (!canAction(action)) {
    const what = label ?? ACTION_LABELS.get(action) ?? 'this';
    toast(`Access denied — role ${session()?.role ?? ''} cannot open "${what}". Ask SuperAdmin.`, true);
    return;
  }
  remember(label, action);
  Promise.resolve(fn(arg)).catch((e) => toast((e as Error).message, true));
}

// ------------------------------------------------------------------ recent / most viewed
type Seen = { label: string; action: string; count: number; at: number };
// Starting lists, as on a fresh MARG screen: `count` gives the Most viewed order,
// `at` the Recently viewed order (listed newest first). Real use builds on top of them.
const STARTER: [label: string, action: string, count: number][] = [
  ['Receive', 'bill.new:SALE_RETURN', 0],
  ['Manual Upload on Server', '', 0],
  ['Party List', 'ledger.list', 6],
  ['New Group', 'group.add', 0],
  ['Party Transaction', 'party.txn', 0],
  ['Cash & Bank', 'voucher.new:RECEIPT', 0],
  ['Bill', 'bill.new:SALE', 4],
  ['Item List', 'item.list', 5],
  ['All Items', 'item.list', 0],
  ['Debit Note', 'voucher.new:DEBIT_NOTE', 2],
  ['All Ledgers', 'report.ledger', 0],
  ['Closure of Eway Bill', '', 0],
  ['Contra', 'voucher.new:CONTRA', 0],
];
// Starter entries never count as real use: they sit below anything actually opened
// (count 0, and `at` far in the past), keeping their own order among themselves.
const starterSeen = (): Seen[] => STARTER.map(([label, action, count], i) => ({ label, action, count: 0, at: STARTER.length * 10 - i * 10 + count }));
/** Not screens: these don't go into Most / Recently viewed. */
const NOT_VIEWED = new Set(['exit', 'user.change', 'company.change', 'user.password', 'menu.open', 'refresh']);
const seenKey = () => `seen:${session()?.name ?? ''}`;
function loadSeen(): Seen[] {
  try {
    const s = JSON.parse(localStorage.getItem(seenKey()) ?? '[]') as Seen[];
    return s.length ? s : starterSeen();
  } catch { return starterSeen(); }
}
/** Count one opening. One entry per screen (by action), named the way it was last opened. */
function remember(label: string | undefined, action: string) {
  const name = action && NOT_VIEWED.has(action.split(':')[0]) ? '' : viewedName(label, action);
  if (!name) return;
  const s = loadSeen();
  const e = s.find((x) => (action ? x.action === action : !x.action && x.label === name));
  if (e) { e.count++; e.at = Date.now(); e.label = name; } else s.push({ label: name, action, count: 1, at: Date.now() });
  s.sort((a, b) => a.at - b.at);  // keep the 50 most recently used
  try { localStorage.setItem(seenKey(), JSON.stringify(s.slice(-50))); } catch { /* storage unavailable */ }
  renderSeen();
}
/** Hotkeys come without a label: use the menu's. A label shared by several items ("Bill") gets its menu's name. */
function viewedName(label: string | undefined, action: string): string {
  if (!action) return label ?? '';
  if (!label || (LABEL_ACTIONS.get(label)?.size ?? 0) > 1) return ACTION_NAME.get(action) ?? label ?? '';
  return label;
}
function renderSeen() {
  const li = (x: Seen) => `<li data-a="${esc(x.action)}">${esc(x.label)}</li>`;
  const mine = loadSeen().filter((x) => works(x.action) && shortcutAllowed(x.label, x.action));
  // Most viewed: most opened first; equal counts go by which was opened last.
  const most = [...mine].sort((a, b) => b.count - a.count || b.at - a.at).slice(0, 6);
  const recent = [...mine].sort((a, b) => b.at - a.at).slice(0, 15);
  document.getElementById('most-viewed')!.innerHTML = most.map(li).join('');
  document.getElementById('recent-viewed')!.innerHTML = recent.map(li).join('');
}
document.getElementById('leftpanel')!.addEventListener('click', (e) => {
  const li = (e.target as HTMLElement).closest('li[data-a]') as HTMLElement | null;
  if (li) run(li.dataset.a, li.textContent ?? '');
});

// ------------------------------------------------------------------ menubar
/**
 * The menu as this user sees it. SuperAdmin gets everything. Other roles see only the
 * menu items ticked for their role in the Admin Panel (built or not), and no submenu
 * left empty by that. Exit / change user / change company are never hidden.
 */
/** A USER-role login gets the short My Menu / Links / Exit bar instead of the full menu. */
const USER_ROLE = 'USER';
const isUserRole = () => session()?.role.toUpperCase() === USER_ROLE;
let simpleMenu = false;
const itemAllowed = (m: MenuItem) => {
  // On the USER bar an item shows whenever the role may open it; Links / Exit always show.
  if (simpleMenu) return !m.action || canAction(m.action);
  const key = menuKeyOf(m);
  if (key && !menuTickedFor(key)) return false;
  return !m.action || canAction(m.action);
};
function filterTree(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const m of items) {
    if (m === '-') { if (out.length && out[out.length - 1] !== '-') out.push('-'); continue; }
    if (m.children) {
      const kids = filterTree(m.children);
      // Greyed-out labels ("(not available yet)", "GST Version …") alone don't keep a menu open.
      if (kids.some((k) => k !== '-' && !k.disabled)) out.push({ ...m, children: kids });
    } else if (itemAllowed(m)) out.push(m);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}
/**
 * May this role see a shortcut (quick button, recently viewed entry) for this action?
 * Only when a menu item it was given opens the same thing; actions no menu item can be
 * ticked for (calculator, exit, change user …) follow the normal rule.
 */
function shortcutAllowed(label: string, action: string): boolean {
  if (!session() || isSuper()) return true;
  const leaves = action ? leavesForAction(action) : leavesForLabel(label);
  if (!leaves.length) return !!action && canAction(action);
  return leaves.some((l) => menuTickedFor(l.key)) && (!action || canAction(action));
}
/** Opens a real screen? Items whose screen isn't built would only show "404 — NOT EXIST", so they are left out. */
const works = (action?: string) => !!action && !!ACTIONS[action.split(':')[0]];
function pruneDead(items: MenuEntry[]): MenuEntry[] {
  const out: MenuEntry[] = [];
  for (const m of items) {
    if (m === '-') { if (out.length && out[out.length - 1] !== '-') out.push('-'); continue; }
    if (m.children) {
      const kids = pruneDead(m.children);
      if (kids.some((k) => k !== '-' && !k.disabled)) out.push({ ...m, children: kids });
    } else if (!m.disabled && works(m.action)) out.push(m);
  }
  while (out[out.length - 1] === '-') out.pop();
  return out;
}
const LIVE_MENU = pruneDead(MENU) as MenuItem[];
const LIVE_USER_MENU = pruneDead(USER_MENU) as MenuItem[];
let TREE: MenuItem[] = LIVE_MENU;
function applyRole() {
  simpleMenu = isUserRole();
  TREE = simpleMenu ? (filterTree(LIVE_USER_MENU) as MenuItem[]) : isSuper() ? LIVE_MENU : (filterTree(LIVE_MENU) as MenuItem[]);
  closeMenu();
  renderQuick();
  renderSeen();
}
document.addEventListener('session-changed', applyRole);

const bar = document.getElementById('menubar')!;
let barFocus = -1;          // highlighted top menu when bar has focus
let path: number[] = [];    // path[0] = open top menu; path[i] = active index at level i
let menuActive = false;

const entriesAt = (level: number): MenuEntry[] => {
  let items: MenuEntry[] = TREE[path[0]].children ?? [];
  for (let l = 1; l < level; l++) items = (items[path[l]] as MenuItem).children ?? [];
  return items;
};
const labelHtml = (m: MenuItem) => {
  if (!m.hot) return esc(m.label);
  const i = m.label.indexOf(m.hot);
  const j = i >= 0 ? i : m.label.toLowerCase().indexOf(m.hot.toLowerCase());
  return j < 0 ? esc(m.label) : `${esc(m.label.slice(0, j))}<u>${esc(m.label[j])}</u>${esc(m.label.slice(j + 1))}`;
};

function renderDropdown(items: MenuEntry[], level: number): string {
  return `<div class="dropdown">${items.map((m, i) => {
    if (m === '-') return '<div class="dd-sep"></div>';
    const active = path[level] === i;
    const open = active && m.children && path.length > level + 1;
    return `<div class="dd-item${m.bold ? ' bold' : ''}${m.disabled ? ' disabled' : ''}${m.children ? ' sub' : ''}${active ? ' active' : ''}" data-l="${level}" data-i="${i}">
      ${m.isNew ? '<span class="new">NEW</span>' : ''}${m.icon ? `<span class="ico">${esc(m.icon)}</span>` : ''}<span class="lbl">${labelHtml(m)}</span>${m.shortcut ? `<span class="sc">${esc(m.shortcut)}</span>` : ''}
      ${open ? renderDropdown(m.children!, level + 1) : ''}</div>`;
  }).join('')}</div>`;
}

function renderMenu() {
  // Start-up screens: Marg shows a bare "Marg" menu until a company is open.
  if (isBooting()) { bar.innerHTML = '<div class="mb-item">Flow Ledger</div>'; return; }
  bar.innerHTML = TREE.map((m, i) => {
    const open = path[0] === i;
    return `<div class="mb-item${open ? ' open' : ''}${!open && menuActive && barFocus === i ? ' focus' : ''}" data-top="${i}">${labelHtml(m)}
      ${open && m.children ? renderDropdown(m.children, 1) : ''}</div>`;
  }).join('');
  keepDropdownsOnScreen();
}

// Like Windows menus: a submenu that would run past the bottom edge slides up, and
// one that would run past the right edge opens to the left of its parent instead.
// querySelectorAll is document order, so each parent is placed before its child.
function keepDropdownsOnScreen() {
  bar.querySelectorAll<HTMLElement>('.dropdown').forEach((dd) => {
    const r = dd.getBoundingClientRect();
    const over = r.bottom - window.innerHeight + 2;
    if (over > 0) dd.style.top = `${dd.offsetTop - Math.min(over, r.top)}px`;
    const owner = dd.parentElement!;
    if (r.right > window.innerWidth) {
      const o = owner.getBoundingClientRect();
      // A top-level menu slides left until it fits. A submenu flips to the left of its
      // parent; if that doesn't fit either, it sits flush with the right edge of the
      // window (overlapping the parent, as Windows does).
      const fit = Math.max(0, window.innerWidth - r.width);
      const x = owner.closest('.dropdown') && o.left - r.width >= 0 ? o.left - r.width : fit;
      dd.style.left = `${x - o.left}px`;
    }
  });
}

function topMenuIndex(k: string) {
  const hit = TREE.findIndex((m) => m.hot?.toUpperCase() === k);
  return hit >= 0 ? hit : TREE.findIndex((m) => m.label[0].toUpperCase() === k);
}

function openTop(i: number) {
  const m = TREE[i];
  menuActive = true;
  barFocus = i;
  if (!m.children) { run(m.action, m.label); return; }
  path = [i, firstSelectable(m.children, 0, 1)];
  renderMenu();
}
function closeMenu() { path = []; menuActive = false; barFocus = -1; renderMenu(); }
// Separators and greyed-out (disabled) items are skipped by the cursor.
const selectable = (m: MenuEntry) => m !== '-' && !m.disabled;
function firstSelectable(items: MenuEntry[], from: number, dir: 1 | -1) {
  const n = items.length;
  for (let k = 0; k < n; k++) { const i = (from + dir * k + n * 2) % n; if (selectable(items[i])) return i; }
  return 0;
}

function activate(level: number, idx: number) {
  const m = entriesAt(level)[idx] as MenuItem;
  if (!selectable(m)) return;
  path = [...path.slice(0, level), idx];
  if (m.children) { path.push(firstSelectable(m.children, 0, 1)); renderMenu(); return; }
  run(m.action, m.label);
}

function menuKey(k: string): boolean {
  if (!menuActive) return false;
  if (!path.length) {
    // bar focused, nothing open
    if (k === 'ArrowRight') { barFocus = (barFocus + 1) % TREE.length; renderMenu(); return true; }
    if (k === 'ArrowLeft') { barFocus = (barFocus - 1 + TREE.length) % TREE.length; renderMenu(); return true; }
    if (k === 'Enter' || k === 'ArrowDown') { openTop(barFocus); return true; }
    if (k === 'Escape' || k === 'F10') { closeMenu(); return true; }
    const hit = topMenuIndex(k);
    if (hit >= 0) openTop(hit);
    return true;
  }
  const level = path.length - 1;
  const items = entriesAt(level);
  const cur = path[level];
  switch (k) {
    case 'ArrowDown': path[level] = firstSelectable(items, cur + 1, 1); renderMenu(); return true;
    case 'ArrowUp': path[level] = firstSelectable(items, cur - 1, -1); renderMenu(); return true;
    case 'Home': path[level] = firstSelectable(items, 0, 1); renderMenu(); return true;
    case 'End': path[level] = firstSelectable(items, items.length - 1, -1); renderMenu(); return true;
    case 'Enter': activate(level, cur); return true;
    case 'ArrowRight': {
      const m = items[cur] as MenuItem;
      if (m.children) activate(level, cur);
      else openTop((path[0] + 1) % TREE.length);
      return true;
    }
    case 'ArrowLeft':
      if (level > 1) { path.pop(); renderMenu(); } else openTop((path[0] - 1 + TREE.length) % TREE.length);
      return true;
    case 'Escape':
      if (level > 1) path.pop(); else { barFocus = path[0]; path = []; }
      renderMenu();
      return true;
  }
  if (k.length === 1) {
    const hits = items.map((m, i) => ({ m, i })).filter(({ m }) => selectable(m) && (m as MenuItem).hot?.toUpperCase() === k);
    const fallback = items.map((m, i) => ({ m, i })).filter(({ m }) => selectable(m) && (m as MenuItem).label.toUpperCase().startsWith(k));
    const list = hits.length ? hits : fallback;
    if (list.length === 1) activate(level, list[0].i);
    else if (list.length > 1) { const nx = list.find((x) => x.i > cur) ?? list[0]; path[level] = nx.i; renderMenu(); }
    return true;
  }
  return true;
}

bar.addEventListener('mousedown', (e) => {
  e.preventDefault();
  if (e.button !== 0) return;   // right-click opens the shortcut menu instead
  const dd = (e.target as HTMLElement).closest('.dd-item') as HTMLElement | null;
  if (dd) { e.stopPropagation(); activate(Number(dd.dataset.l), Number(dd.dataset.i)); return; }
  if ((e.target as HTMLElement).closest('.dropdown')) return;  // gap inside a dropdown: ignore
  const top = (e.target as HTMLElement).closest('.mb-item') as HTMLElement | null;
  if (top) { const i = Number(top.dataset.top); if (path[0] === i) closeMenu(); else openTop(i); }
});
bar.addEventListener('mouseover', (e) => {
  const dd = (e.target as HTMLElement).closest('.dd-item') as HTMLElement | null;
  if (dd) {
    const l = Number(dd.dataset.l), i = Number(dd.dataset.i);
    const m = entriesAt(l)[i] as MenuItem;
    if (!selectable(m)) return;
    // Re-render when moving to another item, when a deeper submenu must close, or when
    // this item's own submenu isn't open yet (e.g. the first item, highlighted on open).
    const subClosed = !!m.children && path.length === l + 1;
    if (path[l] !== i || path.length > l + 1 || subClosed) {
      path = [...path.slice(0, l), i];
      if (m.children) path.push(firstSelectable(m.children, 0, 1));
      renderMenu();
    }
    return;
  }
  const top = (e.target as HTMLElement).closest('.mb-item') as HTMLElement | null;
  if (top && path.length && path[0] !== Number(top.dataset.top)) openTop(Number(top.dataset.top));
});
// Capture phase: the menu re-renders on click, so by the bubble phase the clicked
// element is already detached and would look like an outside click.
document.addEventListener('mousedown', (e) => { if (path.length && !bar.contains(e.target as Node)) closeMenu(); }, true);

// ------------------------------------------------------------------ right panel
const rp = document.getElementById('rightpanel')!;
type Quick = { label: string; action: string };
let rpSel = 0;
let quick: Quick[] = QUICK;

// Each user's own shortcut list: right-click a button to remove it, right-click a menu item to add it.
const quickKey = () => `quick:${session()?.name ?? ''}`;
function savedQuick(): Quick[] {
  try {
    const s = JSON.parse(localStorage.getItem(quickKey()) ?? 'null');
    if (Array.isArray(s)) return s.filter((q) => typeof q?.label === 'string' && typeof q?.action === 'string');
  } catch { /* storage unavailable or bad data */ }
  return QUICK;
}
function saveQuick(list: Quick[]) {
  try { localStorage.setItem(quickKey(), JSON.stringify(list)); } catch { toast('Could not save shortcuts', true); }
  renderQuick();
}
const sameQuick = (a: Quick, b: Quick) => a.action === b.action && (a.action !== '' || a.label === b.label);

function renderQuick() {
  const all = savedQuick();
  quick = all.filter((q) => works(q.action) && (!session() || shortcutAllowed(q.label, q.action)));
  rpSel = Math.max(0, Math.min(rpSel, quick.length - 1));
  rp.innerHTML = quick.map((q, i) => `<div class="rp-btn${i === rpSel ? ' focus' : ''}" data-i="${i}"><span class="rp-no">${i + 1}</span>${esc(q.label)}</div>`).join('');
}

/** Ask for a shortcut number 1..max; null when cancelled or out of range. */
async function askQuickNo(label: string, max: number, def: number): Promise<number | null> {
  const n = await margNumber(`${label} (1-${max})`, def);
  if (n === null) return null;
  if (n < 1 || n > max) { toast(`Enter a number from 1 to ${max}`, true); return null; }
  return n;
}
/** Put `item` at shortcut number `no` (1-based, as numbered on screen), removing any old copy. */
function placeQuick(item: Quick, no: number) {
  const list = savedQuick().filter((x) => !sameQuick(x, item));
  // Numbers on screen count only the visible buttons; map to the saved list's index.
  const anchor = quick.filter((x) => !sameQuick(x, item))[no - 1];
  const at = anchor ? list.findIndex((x) => sameQuick(x, anchor)) : list.length;
  list.splice(at < 0 ? list.length : at, 0, item);
  saveQuick(list);
  toast(`"${item.label}" set at No. ${no}`);
}
async function removeQuickByNo() {
  if (!quick.length) return;
  const no = await askQuickNo('Remove Shortcut No.', quick.length, rpSel + 1);
  if (no === null) return;
  const q = quick[no - 1];
  saveQuick(savedQuick().filter((x) => !sameQuick(x, q)));
  toast(`No. ${no} "${q.label}" removed from shortcuts`);
}
rp.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('.rp-btn') as HTMLElement | null;
  if (b) { rpSel = Number(b.dataset.i); renderQuick(); run(quick[rpSel].action, quick[rpSel].label); }
});
rp.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const b = (e.target as HTMLElement).closest('.rp-btn') as HTMLElement | null;
  const q = b ? quick[Number(b.dataset.i)] : null;
  ctxMenu(e.clientX, e.clientY, [
    ...(q ? [
      { label: `Remove "${q.label}" from Shortcut`, fn: () => { saveQuick(savedQuick().filter((x) => !sameQuick(x, q))); toast(`"${q.label}" removed from shortcuts`); } },
      { label: `Move "${q.label}" to No. …`, fn: async () => { const no = await askQuickNo('Move to Shortcut No.', quick.length, quick.indexOf(q) + 1); if (no !== null) placeQuick(q, no); } },
    ] : []),
    { label: 'Remove Shortcut by No. …', fn: removeQuickByNo },
    { label: 'Reset Shortcuts to Default', fn: () => { saveQuick(QUICK); toast('Shortcuts reset'); } },
  ]);
});

/** Right-click on a menu item: add it to (or remove it from) the shortcut panel. */
bar.addEventListener('contextmenu', (e) => {
  const dd = (e.target as HTMLElement).closest('.dd-item') as HTMLElement | null;
  e.preventDefault();
  if (!dd) return;
  const l = Number(dd.dataset.l), i = Number(dd.dataset.i);
  const m = entriesAt(l)[i] as MenuItem;
  if (!selectable(m) || m.children) return;   // only items that open a screen
  const parent = l === 1 ? TREE[path[0]] : (entriesAt(l - 1)[path[l - 1]] as MenuItem);
  const list = savedQuick();
  const item: Quick = { label: m.label, action: m.action ?? '' };
  const have = list.find((x) => sameQuick(x, item));
  // "Bill" under Sale and under Purchase: name the second one by its menu.
  if (!have && list.some((x) => x.label === item.label)) item.label = `${parent.label} ${m.label}`;
  const shownNo = have ? quick.findIndex((x) => sameQuick(x, have)) + 1 : 0;
  ctxMenu(e.clientX, e.clientY, have
    ? [
      { label: `Remove "${have.label}" from Shortcut${shownNo ? ` (No. ${shownNo})` : ''}`, fn: () => { saveQuick(list.filter((x) => x !== have)); toast(`"${have.label}" removed from shortcuts`); } },
      { label: `Move "${have.label}" to Shortcut No. …`, fn: async () => { const no = await askQuickNo('Move to Shortcut No.', Math.max(quick.length, 1), shownNo || quick.length); if (no !== null) placeQuick(have, no); } },
      { label: 'Remove Shortcut by No. …', fn: removeQuickByNo },
    ]
    : [
      { label: `Add "${item.label}" to Shortcut`, fn: () => { saveQuick([...list, item]); toast(`"${item.label}" added to shortcuts`); } },
      { label: `Add "${item.label}" at Shortcut No. …`, fn: async () => { const no = await askQuickNo('Add at Shortcut No.', quick.length + 1, quick.length + 1); if (no !== null) placeQuick(item, no); } },
      { label: 'Remove Shortcut by No. …', fn: removeQuickByNo },
    ]);
});

/** Small right-click menu. Closes on any click elsewhere, Esc, or after a choice. */
function ctxMenu(x: number, y: number, items: { label: string; fn: () => void }[]) {
  document.getElementById('ctxmenu')?.remove();
  const box = document.createElement('div');
  box.id = 'ctxmenu';
  box.innerHTML = items.map((it, i) => `<div class="ctx-item" data-i="${i}">${esc(it.label)}</div>`).join('');
  document.body.append(box);
  const r = box.getBoundingClientRect();
  box.style.left = `${Math.min(x, window.innerWidth - r.width - 4)}px`;
  box.style.top = `${Math.min(y, window.innerHeight - r.height - 4)}px`;
  const close = () => { box.remove(); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', onKey, true); };
  const outside = (ev: MouseEvent) => { if (!box.contains(ev.target as Node)) close(); };
  const onKey = (ev: KeyboardEvent) => { if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); close(); } };
  box.addEventListener('mousedown', (ev) => {
    ev.preventDefault(); ev.stopPropagation();
    const it = (ev.target as HTMLElement).closest('.ctx-item') as HTMLElement | null;
    if (!it) return;
    close();
    closeMenu();
    items[Number(it.dataset.i)].fn();
  });
  document.addEventListener('mousedown', outside, true);
  document.addEventListener('keydown', onKey, true);
}

// ------------------------------------------------------------------ info bar
let user = localStorage.getItem('user') ?? 'ADMIN';
async function refreshInfo() {
  const c = await api('/company');
  const fy = `${new Date(c.fy_start).toLocaleString('en', { month: 'short' })}., ${c.fy_start.slice(0, 4)} - ${new Date(c.fy_end).toLocaleString('en', { month: 'short' })}., ${c.fy_end.slice(0, 4)}`;
  document.getElementById('companyinfo')!.innerHTML = `<div>${esc(c.name)}</div><div>${esc(c.address1)}</div><div>${esc(c.address2)}</div><div>GSTIN:${esc(c.gstin)}&nbsp; ${fy}</div>`;
  document.getElementById('titlebar')!.textContent = `Flow Ledger|Web|${c.name} ${c.fy_start.slice(0, 4)}-${c.fy_end.slice(0, 4)}|USER-${user}${session() ? ` [${session()!.role}]` : ''}|MAIN COMPUTER`;
}
function tick() {
  const d = new Date();
  document.getElementById('dateinfo')!.innerHTML =
    `<div><b>Date</b>: ${d.getDate()} ${d.toLocaleString('en', { month: 'short' })}.,${d.getFullYear()}</div>
     <div><b>Day</b>: ${d.toLocaleString('en', { weekday: 'long' })}</div>
     <div><b>Time</b>: <span style="font-family:Consolas,monospace;border:1px solid #333;padding:0 4px">${d.toLocaleTimeString('en-GB')}</span></div>`;
}
document.addEventListener('company-changed', refreshInfo);

async function changeMyPassword() {
  const me = session();
  if (!me) return;
  const { formWin } = await import('./ui.ts');
  const r = await formWin(`Change My Password : ${me.name}`, [
    { name: 'old_password', label: 'Old Password', type: 'password', required: true },
    { name: 'password', label: 'New Password', type: 'password', required: true },
  ], {}, (v) => api(`/users/${me.id}/password`, { method: 'PUT', body: v }));
  if (r) toast('Password changed');
}

/** F1: LIST OF COMPANIES over the main screen. Esc there keeps the current company. */
async function switchCompany() {
  closeMenu();
  const changed = await changeCompany();
  renderMenu();
  if (!changed) { refreshInfo(); return; }
  document.dispatchEvent(new Event('company-changed'));
  toast('Company opened');
}

async function changeUser() {
  const u = await login();
  user = u.name;
  refreshInfo();
  toast(`Logged in as ${u.name}`);
}

// ------------------------------------------------------------------ calculator (F12) / calendar (Shift+F12)
function calculator() {
  const w = openWin('Calculator (F12)', 'small', '<span>Type expression, <b>Enter</b> = result</span><span><b>Del</b> Clear</span><span><b>Esc</b> Close</span>');
  w.body.innerHTML = '<div class="calc-tape"></div><div class="calc-display">0</div>';
  const tape = w.body.querySelector('.calc-tape')!, disp = w.body.querySelector('.calc-display')!;
  let expr = '';
  const show = () => (disp.textContent = expr || '0');
  w.onKey = (_e, k) => {
    if (/^[0-9.+\-*/%()]$/.test(k)) { expr += k; show(); return true; }
    if (k === 'Backspace') { expr = expr.slice(0, -1); show(); return true; }
    if (k === 'Delete') { expr = ''; show(); return true; }
    if (k === 'Enter' || k === '=') {
      if (!/^[0-9.+\-*/%() ]+$/.test(expr)) return true;
      try {
        const v = Function(`"use strict";return (${expr})`)();
        tape.innerHTML += `<div>${esc(expr)} = ${esc(v)}</div>`;
        tape.scrollTop = tape.scrollHeight;
        expr = String(Math.round(v * 1e6) / 1e6);
      } catch { expr = ''; toast('Invalid expression', true); }
      show();
      return true;
    }
    return false;
  };
}
function calendar() {
  let cur = new Date();
  const w = openWin('Calendar (Shift+F12)', 'small', '<span><b>PgUp/PgDn</b> Month</span><span><b>Esc</b> Close</span>');
  const draw = () => {
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const t = new Date();
    let cells = '<tr>' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => `<th>${d}</th>`).join('') + '</tr><tr>';
    for (let i = 0; i < first; i++) cells += '<td></td>';
    for (let d = 1; d <= days; d++) {
      const isT = d === t.getDate() && m === t.getMonth() && y === t.getFullYear();
      cells += `<td class="n" style="${isT ? 'background:#ffe68a;font-weight:bold' : ''}">${d}</td>`;
      if ((first + d) % 7 === 0) cells += '</tr><tr>';
    }
    w.body.innerHTML = `<h3 style="text-align:center;margin:4px">${cur.toLocaleString('en', { month: 'long' })} ${y}</h3><table class="grid">${cells}</tr></table>`;
  };
  draw();
  w.onKey = (_e, k) => {
    if (k === 'PageUp' || k === 'ArrowLeft') { cur = new Date(cur.getFullYear(), cur.getMonth() - 1, 1); draw(); return true; }
    if (k === 'PageDown' || k === 'ArrowRight') { cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1); draw(); return true; }
    return false;
  };
}
function shortcutsHelp() {
  const w = openWin('Shortcut Keys (Alt+F1)', 'mid', '<span><b>Esc</b> Close</span>');
  const labels: Record<string, string> = {};
  const walk = (items: MenuEntry[]) => items.forEach((m) => { if (m !== '-') { if (m.action && !labels[m.action]) labels[m.action] = m.label; if (m.children) walk(m.children); } });
  walk(MENU);
  const extra: [string, string][] = [
    ['Alt / F10', 'Activate menu bar'], ['Arrow keys', 'Navigate menus / lists / grids'], ['Enter', 'Select / next field'], ['Esc', 'Close / back'],
    ['Ctrl+W', 'Save entry'], ['F2 (list)', 'Add new'], ['F3 (list)', 'Modify'], ['Del (list)', 'Delete'], ['F10 (report)', 'Print'],
    ['F2 (report)', 'Change period'], ['Ctrl+Del (bill)', 'Delete item row'], ['F2..F7 (voucher)', 'Payment/Receipt/Journal/DN/CN/Contra'],
  ];
  w.body.innerHTML = `<table class="grid"><tr><th>Key</th><th>Function</th></tr>
    ${Object.entries(HOTKEYS).map(([k, a]) => {
      const name = a.startsWith('menu.open:') ? `Open ${TREE[topMenuIndex(a.slice(10))]?.label ?? ''} menu` : labels[a] ?? a;
      return `<tr><td><b>${esc(k)}</b></td><td>${esc(name)}</td></tr>`;
    }).join('')}
    ${extra.map(([k, v]) => `<tr><td><b>${esc(k)}</b></td><td>${esc(v)}</td></tr>`).join('')}</table>`;
}

// ------------------------------------------------------------------ global keyboard
let altAlone = false;
document.addEventListener('keydown', async (e) => {
  const k = keyName(e);
  altAlone = k === 'Alt';
  if (k === 'Alt' || k === 'Control' || k === 'Shift') { if (k === 'Alt') e.preventDefault(); return; }
  // Start-up screens: only the open box gets keys — no menus or hotkeys yet.
  if (isBooting()) {
    if (e.altKey || /F\d+$/.test(k)) e.preventDefault();
    if (winCount()) await handleWinKey(e, k); else e.preventDefault();
    return;
  }
  // Browser defaults we take over (Ctrl+W close tab, Ctrl+L address bar, Ctrl+P print, F-keys, …)
  // Ctrl+C/V/X/A/Z stay native so text editing still works.
  if (e.altKey || /F\d+$/.test(k) || (e.ctrlKey && !['C', 'V', 'X', 'A', 'Z', 'Y', 'ArrowLeft', 'ArrowRight', 'Backspace'].includes(k.split('+').pop()!))) e.preventDefault();

  // While a window or message box (e.g. 404) is up it gets the keys, not the menu behind it.
  if (!winCount() && menuActive && HOTKEYS[k] && (e.altKey || e.ctrlKey)) { e.preventDefault(); run(HOTKEYS[k]); return; }
  if (!winCount() && menuKey(k)) { e.preventDefault(); return; }

  if (winCount()) {
    if (await handleWinKey(e, k)) return;
    // Global Marg hotkeys still work over windows when the window didn't use them.
    if ((e.altKey || e.ctrlKey || k === 'F12' || k === 'Shift+F12') && HOTKEYS[k]) { run(HOTKEYS[k]); }
    return;
  }

  if (HOTKEYS[k]) { e.preventDefault(); run(HOTKEYS[k], undefined); return; }
  if (k === 'F10') { e.preventDefault(); menuActive = true; barFocus = 0; renderMenu(); return; }
  // Main screen: arrows walk the quick panel, letters open menus.
  if (k === 'ArrowDown' || k === 'ArrowUp') { rpSel = (rpSel + (k === 'ArrowDown' ? 1 : -1) + quick.length) % quick.length; renderQuick(); e.preventDefault(); return; }
  if (k === 'Enter' && quick[rpSel]) { run(quick[rpSel].action, quick[rpSel].label); return; }
  if (k.length === 1) {
    const hit = topMenuIndex(k);
    if (hit >= 0) { e.preventDefault(); openTop(hit); }
    return;
  }
}, true);

document.addEventListener('keyup', (e) => {
  // Tapping Alt on its own toggles the menu bar, like Windows.
  if (e.key === 'Alt' && altAlone && !winCount() && !isBooting()) {
    e.preventDefault();
    if (menuActive) closeMenu(); else { menuActive = true; barFocus = 0; renderMenu(); }
  }
  altAlone = false;
}, true);

// ------------------------------------------------------------------ boot
tick();
setInterval(tick, 1000);
document.getElementById('titlebar')!.textContent = 'Flow Ledger|Web|MAIN COMPUTER';
// Splash → login → LIST OF COMPANIES → company menu → SELECT TO EXECUTE → main screen.
(async () => {
  const started = boot();
  renderMenu();          // isBooting() is set now: just "Flow Ledger"
  const u = await started;
  user = u.name;
  renderMenu();
  refreshInfo();
})();
