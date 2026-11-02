// Flow Ledger Admin Panel — a separate page (its own port) where a SuperAdmin manages
// companies, users and roles. It calls the same /api as the ERP screens, so every
// rule (SuperAdmin only, the last SuperAdmin, …) is still enforced by the server.
// Framework-free and mobile-first, so the same files can be wrapped into an
// Android APK later (e.g. with Capacitor) — set SERVER below for that build.
import { MENU_TREE, SPECIAL, GRANTABLE, type MenuNode } from '../shared/menuPerms.ts';

interface Me { token: string; id: number; name: string; role: string; is_super: boolean }
interface Company { id: number; name: string; station: string; address1: string | null; address2: string | null; gstin: string | null; state: string | null; file: string }
interface User {
  id: number;
  name: string;
  role_id: number | null;
  role: string | null;
  is_super: number | null;
  access_type?: 'BOTH' | 'APP' | 'WEB';
  app_perms?: Record<string, boolean>;
}
interface Role { id: number; name: string; is_super: number; perms: string[]; users: number }
type Tab = 'companies' | 'users' | 'roles';

// ---------------------------------------------------------------- storage
const store = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
  del: (k: string) => { try { localStorage.removeItem(k); } catch { /* private mode */ } },
};

/** Where the API lives. Blank = the server this page came from. For an APK, put the PC's address here, e.g. 'http://192.168.1.10:3100'. */
const SERVER = '';
store.del('margAdmin.server');   // the old login-screen setting
let me: Me | null = (() => { try { return JSON.parse(store.get('margAdmin.me') ?? 'null') as Me | null; } catch { return null; } })();
let tab: Tab = (['companies', 'users', 'roles'] as Tab[]).find((t) => t === store.get('margAdmin.tab')) ?? 'companies';

// Roles & Permissions editor state (survives a re-render of the page).
let roleSel: number | undefined;
let draft = new Set<string>();
let dirty = false;

const app = document.getElementById('app')!;

// ---------------------------------------------------------------- DOM helper
type Child = Node | string | number | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...kids: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'class') e.className = String(v);
    else if (k in e && typeof v !== 'string') (e as unknown as Record<string, unknown>)[k] = v;   // checked, disabled, selected…
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c instanceof Node ? c : String(c));
  return e;
}
const svg = (paths: string) => {
  const s = document.createElement('span');
  s.className = 'ico';
  s.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  return s;
};
const ICON = {
  building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.5 3.3-5.5 6.5-5.5s5.9 2 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.7.8 2.8 2.5 3 5.2"/>',
  shield: '<path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m9 12 2 2 4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};

// ---------------------------------------------------------------- API
async function api<T = unknown>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVER}/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(me ? { Authorization: `Bearer ${me.token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error(`Cannot reach the server${SERVER ? ` at ${SERVER}` : ''} — is it running?`);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (res.status === 401 && me) {
    signOut();
    throw new Error('Session expired');
  }
  if (!res.ok) throw new Error(data.error ?? `Server error ${res.status}`);
  return data;
}

let toastTimer = 0;
function toast(msg: string, kind: 'ok' | 'err' = 'ok') {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.className = `show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { t.className = ''; }, 3500);
}
const fail = (e: unknown) => {
  const msg = (e as Error)?.message || '';
  if (msg.toLowerCase().includes('session expired')) return;
  toast(msg, 'err');
};

// ---------------------------------------------------------------- modals
function openModal(title: string, body: Node, foot: Node[], onClose?: () => void) {
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'modal-head' }, h('h2', {}, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => close() }, '✕')),
    h('div', { class: 'modal-body' }, body),
    h('div', { class: 'modal-foot' }, foot));
  const overlay = h('div', { class: 'overlay', onmousedown: (e: Event) => { if (e.target === overlay) close(); } }, box);
  document.body.append(overlay);
  document.addEventListener('keydown', onKey);
  (box.querySelector('.modal-body input, .modal-body select, .modal-foot .primary, .modal-foot .danger') as HTMLElement | null)?.focus();
  return { close };
}

interface Field {
  name: string; label: string; type?: 'text' | 'password' | 'select';
  value?: string; options?: { value: string; label: string }[];
  required?: boolean; placeholder?: string; hint?: string; upper?: boolean; maxlength?: number;
}

function formModal(title: string, fields: Field[], submit: string, onSubmit: (v: Record<string, string>) => Promise<unknown>) {
  const err = h('div', { class: 'form-err', role: 'alert' });
  const inputs = new Map<string, HTMLInputElement | HTMLSelectElement>();
  const form = h('form', { class: 'form', novalidate: true },
    fields.map((f) => {
      const id = `f-${f.name}`;
      const input = f.type === 'select'
        ? h('select', { id, name: f.name }, (f.options ?? []).map((o) => h('option', { value: o.value, selected: o.value === f.value }, o.label)))
        : h('input', {
          id, name: f.name, type: f.type ?? 'text', value: f.value ?? '', placeholder: f.placeholder, maxlength: f.maxlength,
          autocomplete: f.type === 'password' ? 'new-password' : 'off', class: f.upper ? 'upper' : undefined,
        });
      inputs.set(f.name, input);
      return h('label', { class: 'field', for: id },
        h('span', { class: 'field-label' }, f.label, f.required ? h('b', { class: 'req', 'aria-hidden': 'true' }, ' *') : null),
        input,
        f.hint ? h('small', {}, f.hint) : null);
    }),
    err,
    h('button', { type: 'submit', hidden: true, tabindex: '-1' }));
  const btn = h('button', { class: 'btn primary', type: 'button', onclick: () => go() }, submit);
  const m = openModal(title, form, [h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'), btn]);
  form.addEventListener('submit', (e) => { e.preventDefault(); go(); });

  async function go() {
    const v: Record<string, string> = {};
    for (const f of fields) {
      const raw = inputs.get(f.name)!.value;
      v[f.name] = f.type === 'password' ? raw : raw.trim();
    }
    const miss = fields.find((f) => f.required && !v[f.name]);
    if (miss) { err.textContent = `${miss.label} is required`; inputs.get(miss.name)!.focus(); return; }
    btn.disabled = true;
    err.textContent = '';
    try { await onSubmit(v); m.close(); } catch (e) { err.textContent = (e as Error).message; } finally { btn.disabled = false; }
  }
}

function confirmModal(title: string, text: string, okLabel: string, danger = true): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => { if (!done) { done = true; resolve(v); } m.close(); };
    const m = openModal(title, h('p', { class: 'confirm-text' }, text), [
      h('button', { class: 'btn', type: 'button', onclick: () => finish(false) }, 'Cancel'),
      h('button', { class: `btn ${danger ? 'danger' : 'primary'}`, type: 'button', onclick: () => finish(true) }, okLabel),
    ], () => { if (!done) { done = true; resolve(false); } });
  });
}

const passwordFields = (label = 'New password'): Field[] => [
  { name: 'password', label, type: 'password', required: true },
  { name: 'confirm', label: 'Confirm password', type: 'password', required: true },
];
const checkPasswords = (v: Record<string, string>) => {
  if (v.password.length < 4) throw new Error('Use at least 4 characters for the password');
  if (v.password !== v.confirm) throw new Error('The two passwords do not match');
};

// ---------------------------------------------------------------- session
function signOut() {
  me = null;
  dirty = false;
  store.del('margAdmin.me');
  const t = document.getElementById('toast');
  if (t) { t.className = ''; t.textContent = ''; }
  render();
}
async function logout() {
  await api('/logout', 'POST').catch(() => undefined);
  signOut();
}
function changeMyPassword() {
  formModal('Change my password', passwordFields(), 'Change password', async (v) => {
    checkPasswords(v);
    await api(`/users/${me!.id}/password`, 'PUT', { password: v.password });
    toast('Your password has been changed');
  });
}

// ---------------------------------------------------------------- views
function render() {
  if (!me) app.replaceChildren(loginView());
  else app.replaceChildren(shellView());
}

function loginView() {
  const err = h('div', { class: 'form-err', role: 'alert' });
  const user = h('input', { id: 'l-user', autocomplete: 'username', class: 'upper', placeholder: 'User Id', autocapitalize: 'characters' });
  const pass = h('input', { id: 'l-pass', type: 'password', autocomplete: 'current-password', placeholder: 'Password' });
  const btn = h('button', { class: 'btn primary block', type: 'submit' }, 'Sign in');

  const submit = async (e: Event) => {
    e.preventDefault();
    err.textContent = '';
    if (!user.value.trim() || !pass.value) { err.textContent = 'Enter your User Id and password'; return; }
    btn.disabled = true;
    try {
      const r = await api<Me>('/login', 'POST', { name: user.value.trim(), password: pass.value });
      if (!r.is_super) {
        // Don't leave a session behind for someone who can't use this panel.
        fetch(`${SERVER}/api/logout`, { method: 'POST', headers: { Authorization: `Bearer ${r.token}` } }).catch(() => undefined);
        throw new Error(`${r.name} is ${r.role}. Only a SUPERADMIN can use the admin panel.`);
      }
      me = { token: r.token, id: r.id, name: r.name, role: r.role, is_super: r.is_super };
      store.set('margAdmin.me', JSON.stringify(me));
      render();
    } catch (e2) {
      err.textContent = (e2 as Error).message;
      btn.disabled = false;
    }
  };

  return h('div', { class: 'login-wrap' },
    h('form', { class: 'login-card', onsubmit: submit },
      h('div', { class: 'brand-mark' }, h('img', { src: 'logo.png', alt: '' })),
      h('h1', {}, 'Flow Ledger SuperAdmin Panel'),
      h('p', { class: 'muted' }, 'Companies, users and access. SuperAdmin only.'),
      h('label', { class: 'field', for: 'l-user' }, h('span', { class: 'field-label' }, 'User Id'), user),
      h('label', { class: 'field', for: 'l-pass' }, h('span', { class: 'field-label' }, 'Password'), pass),
      err,
      btn));
}

function shellView() {
  const tabs: [Tab, string, string][] = [
    ['companies', 'Companies', ICON.building],
    ['users', 'Users', ICON.users],
    ['roles', 'Roles & Permissions', ICON.shield],
  ];
  const content = h('main', { class: 'content', id: 'content' });

  const switchTab = async (k: Tab) => {
    if (k === tab) return;
    if (dirty && !(await confirmModal('Unsaved changes', 'You have unsaved permission changes. Discard them?', 'Discard'))) return;
    dirty = false;
    tab = k;
    store.set('margAdmin.tab', k);
    render();
  };

  const menu = h('details', { class: 'user-menu' },
    h('summary', { 'aria-label': 'Account menu' },
      h('span', { class: 'avatar' }, me!.name.slice(0, 2)),
      h('span', { class: 'user-name' }, me!.name)),
    h('div', { class: 'menu-pop' },
      h('div', { class: 'menu-who' }, h('strong', {}, me!.name), h('small', {}, me!.role)),
      h('button', { type: 'button', onclick: () => { menu.open = false; changeMyPassword(); } }, 'Change my password'),
      h('button', { type: 'button', class: 'danger-text', onclick: () => logout() }, 'Sign out')));
  const shell = h('div', { class: 'shell' },
    h('header', { class: 'topbar' },
      h('div', { class: 'brand' }, h('span', { class: 'brand-mark small' }, h('img', { src: 'logo.png', alt: '' })), h('span', {}, 'Flow Ledger ', h('b', {}, 'SuperAdmin'))),
      menu),
    h('nav', { class: 'nav', 'aria-label': 'Sections' },
      tabs.map(([k, label, icon]) => h('button', {
        class: `nav-btn${tab === k ? ' active' : ''}`, type: 'button',
        'aria-current': tab === k ? 'page' : undefined, onclick: () => switchTab(k),
      }, svg(icon), h('span', {}, label)))),
    content);

  const view = tab === 'companies' ? companiesView : tab === 'users' ? usersView : rolesView;
  view(content).catch((e) => content.replaceChildren(h('div', { class: 'empty err' }, (e as Error).message)));
  return shell;
}

const pageHead = (title: string, sub: string, action?: Node) =>
  h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, title), h('p', { class: 'muted' }, sub)), action ?? null);
const loading = () => h('div', { class: 'empty' }, 'Loading…');
const addBtn = (label: string, onclick: () => void) => h('button', { class: 'btn primary', type: 'button', onclick }, svg(ICON.plus), h('span', {}, label));

// ---------------------------------------------------------------- companies
const STATES = ['Andaman and Nicobar Islands', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chandigarh', 'Chhattisgarh',
  'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jammu and Kashmir', 'Jharkhand',
  'Karnataka', 'Kerala', 'Ladakh', 'Lakshadweep', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha',
  'Puducherry', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal'];

const fyStartYear = () => { const d = new Date(); return d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1; };

function companyForm(c?: Company) {
  const cur = fyStartYear();
  const fields: Field[] = [
    { name: 'name', label: 'Company name', required: true, upper: true, value: c?.name },
    { name: 'station', label: 'Station / short code', upper: true, value: c?.station, hint: 'Shown next to the name in the company list' },
    { name: 'address1', label: 'Address line 1', value: c?.address1 ?? '' },
    { name: 'address2', label: 'Address line 2', value: c?.address2 ?? '' },
    { name: 'gstin', label: 'GSTIN', upper: true, maxlength: 15, value: c?.gstin ?? '' },
    { name: 'state', label: 'State', type: 'select', value: c?.state || 'Chhattisgarh', options: STATES.map((s) => ({ value: s, label: s })) },
  ];
  if (!c) {
    fields.push({
      name: 'fy_start', label: 'First financial year', type: 'select', value: `${cur}-04-01`,
      options: [cur + 1, cur, cur - 1, cur - 2, cur - 3].map((y) => ({ value: `${y}-04-01`, label: `${y}–${String(y + 1).slice(2)} (1 Apr ${y} – 31 Mar ${y + 1})` })),
    });
  }
  formModal(c ? `Edit ${c.name}` : 'New company', fields, c ? 'Save changes' : 'Create company', async (v) => {
    const body = { ...v, name: v.name.toUpperCase(), station: v.station.toUpperCase(), gstin: v.gstin.toUpperCase() };
    if (c) await api(`/companies/${c.id}`, 'PUT', body);
    else await api('/companies', 'POST', body);
    toast(c ? 'Company updated' : `${body.name} created`);
    render();
  });
}

async function companiesView(root: HTMLElement) {
  root.replaceChildren(pageHead('Companies', 'Each company keeps its own ledgers, items and bills.', addBtn('New company', () => companyForm())), loading());
  const list = await api<Company[]>('/companies');

  const search = h('input', { type: 'search', class: 'search', placeholder: 'Search by name, station, state or GSTIN', 'aria-label': 'Search companies' });
  const grid = h('div', { class: 'cards' });
  const meta = (k: string, v: string) => [h('dt', {}, k), h('dd', {}, v || '—')];

  const card = (c: Company) => h('article', { class: 'card' },
    h('div', { class: 'card-top' }, h('h3', {}, c.name), c.station ? h('span', { class: 'badge' }, c.station) : null),
    h('dl', { class: 'meta' },
      meta('Address', [c.address1, c.address2].filter(Boolean).join(', ')),
      meta('GSTIN', c.gstin ?? ''),
      meta('State', c.state ?? '')),
    h('div', { class: 'card-actions' },
      h('button', { class: 'btn small', type: 'button', onclick: () => companyForm(c) }, 'Edit'),
      h('button', {
        class: 'btn small', type: 'button', onclick: async (e: Event) => {
          const b = e.currentTarget as HTMLButtonElement;
          b.disabled = true;
          try { const r = await api<{ file: string }>(`/companies/${c.id}/backup`, 'POST'); toast(`Backup saved: ${r.file}`); } catch (er) { fail(er); }
          b.disabled = false;
        },
      }, 'Backup'),
      h('button', {
        class: 'btn small', type: 'button', onclick: async () => {
          if (!(await confirmModal('New financial year', `Add the next financial year to ${c.name}?`, 'Add year', false))) return;
          try { const r = await api<{ code: string; fy_start: string; fy_end: string }>(`/companies/${c.id}/new-year`, 'POST'); toast(`Year ${r.code} added (${r.fy_start} to ${r.fy_end})`); } catch (er) { fail(er); }
        },
      }, 'New year')));

  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const rows = list.filter((c) => !q || `${c.name} ${c.station} ${c.state ?? ''} ${c.gstin ?? ''}`.toLowerCase().includes(q));
    grid.replaceChildren(...(rows.length ? rows.map(card) : [h('div', { class: 'empty' }, q ? 'No company matches your search' : 'No companies yet. Create the first one.')]));
  };
  search.addEventListener('input', draw);
  draw();
  root.replaceChildren(
    pageHead('Companies', `${list.length} compan${list.length === 1 ? 'y' : 'ies'}. Each keeps its own ledgers, items and bills.`, addBtn('New company', () => companyForm())),
    h('div', { class: 'toolbar' }, search),
    grid);
}

// ---------------------------------------------------------------- users
async function usersView(root: HTMLElement) {
  root.replaceChildren(pageHead('Users', 'Who can sign in, platform access (Web / APK) and permissions.'), loading());
  const [users, roles] = await Promise.all([api<User[]>('/users'), api<Role[]>('/roles')]);
  const roleOptions = roles.map((r) => ({ value: String(r.id), label: r.is_super ? `${r.name} (full access)` : r.name }));
  const defaultRole = String((roles.find((r) => r.name === 'ADMIN') ?? roles.find((r) => !r.is_super) ?? roles[0])?.id ?? '');

  function userModal(userToEdit?: User) {
    const isEdit = !!userToEdit;
    const title = isEdit ? `Edit Permissions & Role: ${userToEdit.name}` : 'New User';
    const err = h('div', { class: 'form-err', role: 'alert' });

    const nameInput = h('input', {
      id: 'u-name',
      name: 'name',
      type: 'text',
      value: userToEdit ? userToEdit.name : '',
      placeholder: 'e.g. RAHUL or OPERATOR1',
      class: 'upper',
      disabled: isEdit,
    });

    const passInput = h('input', {
      id: 'u-pass',
      name: 'password',
      type: 'password',
      placeholder: 'Password (min 4 characters)',
      autocomplete: 'new-password',
    });

    const confirmInput = h('input', {
      id: 'u-confirm',
      name: 'confirm',
      type: 'password',
      placeholder: 'Confirm password',
      autocomplete: 'new-password',
    });

    const roleSelect = h('select', { id: 'u-role', name: 'role_id' },
      roleOptions.map((o) => h('option', { value: o.value, selected: String(userToEdit?.role_id ?? defaultRole) === o.value }, o.label))
    );

    const curAccess = userToEdit?.access_type || 'BOTH';
    const accessSelect = h('select', { id: 'u-access', name: 'access_type' },
      [
        { value: 'BOTH', label: 'Both Web & Mobile App (APK)' },
        { value: 'APP', label: 'Mobile App (APK) Only' },
        { value: 'WEB', label: 'Web ERP Only' },
      ].map((o) => h('option', { value: o.value, selected: curAccess === o.value }, o.label))
    );

    // App Permissions checkboxes
    const existingApp = userToEdit?.app_perms || {
      sale: true,
      purchase: true,
      receipt: true,
      payment: true,
      contra: true,
      ledger: true,
      edit: true,
      delete: false,
    };

    const checks: Record<string, HTMLInputElement> = {
      sale: h('input', { type: 'checkbox', checked: existingApp.sale !== false }),
      purchase: h('input', { type: 'checkbox', checked: existingApp.purchase !== false }),
      receipt: h('input', { type: 'checkbox', checked: existingApp.receipt !== false }),
      payment: h('input', { type: 'checkbox', checked: existingApp.payment !== false }),
      contra: h('input', { type: 'checkbox', checked: existingApp.contra !== false }),
      ledger: h('input', { type: 'checkbox', checked: existingApp.ledger !== false }),
      edit: h('input', { type: 'checkbox', checked: existingApp.edit !== false }),
      delete: h('input', { type: 'checkbox', checked: !!existingApp.delete }),
    };

    const apkBox = h('div', { class: 'apk-box' },
      h('div', { class: 'apk-title' },
        h('span', {}, 'Mobile App (APK) Permissions'),
        h('small', { class: 'muted' }, 'Tick allowed menus in APK')
      ),
      h('div', { class: 'apk-grid' },
        h('label', { class: 'apk-check' }, checks.sale, h('span', {}, 'Sale')),
        h('label', { class: 'apk-check' }, checks.purchase, h('span', {}, 'Purchase')),
        h('label', { class: 'apk-check' }, checks.receipt, h('span', {}, 'Receipt')),
        h('label', { class: 'apk-check' }, checks.payment, h('span', {}, 'Payment')),
        h('label', { class: 'apk-check' }, checks.contra, h('span', {}, 'Contra')),
        h('label', { class: 'apk-check' }, checks.ledger, h('span', {}, 'Ledger')),
        h('label', { class: 'apk-check', style: 'color: #0284c7; font-weight: 600;' }, checks.edit, h('span', {}, 'Allow Edit in APK')),
        h('label', { class: 'apk-check', style: 'color: #dc2626; font-weight: 600;' }, checks.delete, h('span', {}, 'Allow Delete in APK'))
      )
    );

    const updateApkVis = () => {
      apkBox.hidden = accessSelect.value === 'WEB';
    };
    accessSelect.addEventListener('change', updateApkVis);
    updateApkVis();

    const formKids: (Node | null)[] = [
      h('label', { class: 'field', for: 'u-name' },
        h('span', { class: 'field-label' }, 'User Id', h('b', { class: 'req' }, ' *')),
        nameInput,
        isEdit ? null : h('small', {}, 'Username used to sign in, e.g. RAHUL')
      ),
    ];

    if (!isEdit) {
      formKids.push(
        h('label', { class: 'field', for: 'u-pass' },
          h('span', { class: 'field-label' }, 'Password', h('b', { class: 'req' }, ' *')),
          passInput
        ),
        h('label', { class: 'field', for: 'u-confirm' },
          h('span', { class: 'field-label' }, 'Confirm Password', h('b', { class: 'req' }, ' *')),
          confirmInput
        )
      );
    }

    formKids.push(
      h('label', { class: 'field', for: 'u-access' },
        h('span', { class: 'field-label' }, 'Platform Access', h('b', { class: 'req' }, ' *')),
        accessSelect,
        h('small', {}, 'Select whether this user can sign in to Web, Mobile App (APK), or Both')
      ),
      h('label', { class: 'field', for: 'u-role' },
        h('span', { class: 'field-label' }, 'Web Role'),
        roleSelect,
        h('small', {}, 'Role used for Web ERP menu permissions')
      ),
      apkBox,
      err
    );

    const form = h('form', { class: 'form', novalidate: true }, formKids.filter(Boolean) as Node[]);
    const saveBtn = h('button', { class: 'btn primary', type: 'button', onclick: () => save() }, isEdit ? 'Save Changes' : 'Create User');
    const m = openModal(title, form, [
      h('button', { class: 'btn', type: 'button', onclick: () => m.close() }, 'Cancel'),
      saveBtn,
    ]);

    async function save() {
      err.textContent = '';
      const name = nameInput.value.trim().toUpperCase();
      if (!name) { err.textContent = 'User Id is required'; nameInput.focus(); return; }

      let pass = '';
      if (!isEdit) {
        pass = passInput.value;
        if (!pass || pass.length < 4) { err.textContent = 'Password must be at least 4 characters'; passInput.focus(); return; }
        if (pass !== confirmInput.value) { err.textContent = 'Passwords do not match'; confirmInput.focus(); return; }
      }

      const appPermsData = {
        sale: checks.sale.checked,
        purchase: checks.purchase.checked,
        receipt: checks.receipt.checked,
        payment: checks.payment.checked,
        contra: checks.contra.checked,
        ledger: checks.ledger.checked,
        edit: checks.edit.checked,
        delete: checks.delete.checked,
      };

      saveBtn.disabled = true;
      try {
        if (isEdit) {
          await api(`/users/${userToEdit!.id}`, 'PUT', {
            role_id: Number(roleSelect.value),
            access_type: accessSelect.value,
            app_perms: appPermsData,
          });
          toast(`Permissions updated for ${userToEdit!.name}`);
        } else {
          await api('/users', 'POST', {
            name,
            password: pass,
            role_id: Number(roleSelect.value),
            access_type: accessSelect.value,
            app_perms: appPermsData,
          });
          toast(`User ${name} created successfully`);
        }
        m.close();
        render();
      } catch (e) {
        err.textContent = (e as Error).message;
      } finally {
        saveBtn.disabled = false;
      }
    }
  }

  const resetPassword = (u: User) => formModal(`Reset password: ${u.name}`, passwordFields(), 'Reset password', async (v) => {
    checkPasswords(v);
    await api(`/users/${u.id}/password`, 'PUT', { password: v.password });
    toast(`Password for ${u.name} reset`);
  });

  const remove = async (u: User) => {
    if (!(await confirmModal('Delete user', `Delete user ${u.name}? They will no longer be able to sign in.`, 'Delete'))) return;
    try { await api(`/users/${u.id}`, 'DELETE'); toast(`${u.name} deleted`); render(); } catch (e) { fail(e); }
  };

  const supers = users.filter((u) => u.is_super).length;
  const rows = users.map((u) => {
    const self = u.id === me!.id;
    const accessType = u.access_type || 'BOTH';

    let accessBadge = h('span', { class: 'badge both' }, 'Web & App');
    if (accessType === 'APP') accessBadge = h('span', { class: 'badge app' }, 'App Only');
    else if (accessType === 'WEB') accessBadge = h('span', { class: 'badge web' }, 'Web Only');

    const pills: Node[] = [];
    if (accessType !== 'WEB') {
      const ap = u.app_perms || { sale: true, purchase: true, receipt: true, payment: true, contra: true, ledger: true, delete: false };
      if (ap.sale !== false) pills.push(h('span', { class: 'pill' }, 'Sale'));
      if (ap.purchase !== false) pills.push(h('span', { class: 'pill' }, 'Purc'));
      if (ap.receipt !== false) pills.push(h('span', { class: 'pill' }, 'Rcpt'));
      if (ap.payment !== false) pills.push(h('span', { class: 'pill' }, 'Pay'));
      if (ap.contra !== false) pills.push(h('span', { class: 'pill' }, 'Contra'));
      if (ap.ledger !== false) pills.push(h('span', { class: 'pill' }, 'Ledger'));
      if (ap.edit !== false) pills.push(h('span', { class: 'pill edit-on' }, 'Edit Allowed'));
      else pills.push(h('span', { class: 'pill edit-off' }, 'No Edit'));
      if (ap.delete) pills.push(h('span', { class: 'pill del-on' }, 'Del Allowed'));
      else pills.push(h('span', { class: 'pill del-off' }, 'No Delete'));
    }

    return h('li', { class: 'user-row' },
      h('span', { class: `avatar${u.is_super ? ' gold' : ''}` }, u.name.slice(0, 2)),
      h('div', { class: 'user-info' },
        h('div', { style: 'display: flex; align-items: center; gap: 8px;' },
          h('strong', {}, u.name, self ? h('span', { class: 'you' }, 'you') : null),
          accessBadge,
          h('span', { class: `badge${u.is_super ? ' gold' : ''}` }, u.role ?? 'NO ROLE')
        ),
        pills.length ? h('div', { class: 'pill-list' }, pills) : null
      ),
      h('div', { class: 'row-actions' },
        h('button', { class: 'btn small primary-ghost', type: 'button', onclick: () => userModal(u) }, 'Permissions & Access'),
        h('button', { class: 'btn small', type: 'button', onclick: () => resetPassword(u) }, 'Password'),
        h('button', { class: 'btn small danger-ghost', type: 'button', disabled: self, title: self ? 'You cannot delete yourself' : undefined, onclick: () => remove(u) }, 'Delete')
      )
    );
  });

  root.replaceChildren(
    pageHead('Users', `${users.length} user${users.length === 1 ? '' : 's'} · ${supers} SuperAdmin${supers === 1 ? '' : 's'}`, addBtn('New user', () => userModal())),
    h('ul', { class: 'user-list' }, rows));
}

// ---------------------------------------------------------------- roles & permissions
async function rolesView(root: HTMLElement) {
  root.replaceChildren(pageHead('Roles & Permissions', 'Tick exactly which pages and features each role gets.'), loading());
  const roles = await api<Role[]>('/roles');
  if (!roles.some((r) => r.id === roleSel)) { roleSel = (roles.find((r) => !r.is_super) ?? roles[0])?.id; dirty = false; }
  if (!dirty) draft = new Set(roles.find((r) => r.id === roleSel)?.perms ?? []);

  const listEl = h('div', { class: 'role-list', role: 'tablist', 'aria-label': 'Roles' });
  const editor = h('section', { class: 'role-editor' });

  const select = async (id: number) => {
    if (id === roleSel) return;
    if (dirty && !(await confirmModal('Unsaved changes', 'You have unsaved permission changes. Discard them?', 'Discard'))) return;
    roleSel = id;
    dirty = false;
    draft = new Set(roles.find((r) => r.id === id)?.perms ?? []);
    drawList();
    drawEditor();
  };

  const drawList = () => listEl.replaceChildren(...roles.map((r) => h('button', {
    class: `role-item${r.id === roleSel ? ' active' : ''}`, type: 'button', role: 'tab', 'aria-selected': String(r.id === roleSel), onclick: () => select(r.id),
  },
    h('strong', {}, r.name, r.is_super ? h('span', { class: 'badge gold' }, 'FULL') : null),
    h('small', {}, r.is_super ? 'Every permission · locked' : `${r.perms.filter((k) => GRANTABLE.has(k)).length} of ${GRANTABLE.size} permissions`, ` · ${r.users} user${r.users === 1 ? '' : 's'}`))));

  const save = async (name?: string) => {
    const r = roles.find((x) => x.id === roleSel)!;
    await api(`/roles/${r.id}`, 'PUT', { name: name ?? r.name, perms: [...draft] });
    dirty = false;
    toast(`Role ${name ?? r.name} saved`);
    render();
  };

  const newRole = (copyOf?: Role) => formModal(copyOf ? `Copy ${copyOf.name}` : 'New role', [
    { name: 'name', label: 'Role name', required: true, upper: true, placeholder: 'e.g. ACCOUNTANT', value: copyOf ? `${copyOf.name} COPY` : '' },
    ...(copyOf ? [] : [{
      name: 'from', label: 'Start with permissions of', type: 'select' as const, value: '',
      options: [
        { value: '', label: 'Nothing ticked' }, { value: 'all', label: 'Everything ticked' },
        ...roles.filter((r) => !r.is_super).map((r) => ({ value: String(r.id), label: r.name })),
      ],
    }]),
  ], copyOf ? 'Create copy' : 'Create role', async (v) => {
    const perms = copyOf ? [...draft] : v.from === 'all' ? [...GRANTABLE] : roles.find((r) => r.id === Number(v.from))?.perms ?? [];
    const r = await api<{ id: number }>('/roles', 'POST', { name: v.name.toUpperCase(), perms });
    roleSel = r.id;
    dirty = false;
    toast(`Role ${v.name.toUpperCase()} created`);
    render();
  });

  const drawEditor = () => {
    const r = roles.find((x) => x.id === roleSel);
    if (!r) { editor.replaceChildren(h('div', { class: 'empty' }, 'No roles yet')); return; }
    const locked = !!r.is_super;
    const has = (k: string) => locked || draft.has(k);

    const saveBtn = h('button', { class: 'btn primary', type: 'button', disabled: !dirty || locked, onclick: () => save().catch(fail) }, 'Save changes');
    const count = h('span', { class: 'muted' });
    const setPerm = (k: string, on: boolean) => { if (on) draft.add(k); else draft.delete(k); dirty = true; };

    // One checkbox per menu item / special power, and a tri-state box per (sub)menu.
    const boxes = new Map<string, HTMLInputElement>();     // item key → its checkbox
    const rowEl = new Map<string, HTMLElement>();          // item key → its row
    const groupEl = new Map<string, HTMLDetailsElement>(); // (sub)menu key → its section
    const groups: { box: HTMLInputElement; countEl: HTMLElement; keys: string[] }[] = [];
    const visible = (keys: string[]) => keys.filter((k) => !rowEl.get(k)!.hidden);
    const setMany = (keys: string[], on: boolean) => {
      for (const k of keys) { setPerm(k, on); boxes.get(k)!.checked = on; }
      sync();
    };

    const itemRow = (key: string, label: string, built: boolean, title?: string) => {
      const box = h('input', {
        type: 'checkbox', checked: has(key), disabled: locked,
        onchange: (e: Event) => { setPerm(key, (e.target as HTMLInputElement).checked); sync(); },
      });
      boxes.set(key, box);
      const row = h('label', { class: 'perm', title }, box, h('span', {}, label), built ? null : h('span', { class: 'tag' }, 'not built yet'));
      rowEl.set(key, row);
      return row;
    };
    const section = (key: string, label: string, keys: string[], kids: Node[], cls: string, open = false) => {
      const box = h('input', {
        type: 'checkbox', disabled: locked, 'aria-label': `All of ${label}`,
        onchange: (e: Event) => setMany(visible(keys), (e.target as HTMLInputElement).checked),
      });
      const countEl = h('span', { class: 'count' });
      groups.push({ box, countEl, keys });
      const el = h('details', { class: cls, open },
        h('summary', {}, box, h('span', { class: 'menu-label' }, label), countEl),
        h('div', { class: 'menu-kids' }, kids));
      groupEl.set(key, el);
      return el;
    };
    const keysUnder = (n: MenuNode): string[] => (n.children ? n.children.flatMap(keysUnder) : [n.key]);
    const nodeEl = (n: MenuNode, depth: number): HTMLElement => n.children
      ? section(n.key, n.label, keysUnder(n), n.children.map((c) => nodeEl(c, depth + 1)), depth ? 'menu-sub' : 'menu-group')
      : itemRow(n.key, n.label, n.built, n.path.join(' › '));

    const specialEl = section('special', 'Special Powers', SPECIAL.map((p) => p.key),
      SPECIAL.map((p) => itemRow(p.key, p.label, true)), 'menu-group special', true);
    const tree = MENU_TREE.map((n) => nodeEl(n, 0));

    const total = GRANTABLE.size;
    const sync = () => {
      saveBtn.disabled = !dirty || locked;
      const n = [...draft].filter((k) => GRANTABLE.has(k)).length;
      count.textContent = locked ? `All ${total} permissions` : `${n} of ${total} ticked${dirty ? ' · unsaved' : ''}`;
      for (const g of groups) {
        const on = g.keys.filter(has).length;
        g.box.checked = on === g.keys.length;
        g.box.indeterminate = on > 0 && on < g.keys.length;
        g.countEl.textContent = `${on}/${g.keys.length}`;
      }
    };

    // Search + "only working screens": hide rows that don't match, and menus left empty.
    const search = h('input', { type: 'search', class: 'search', placeholder: 'Search menu items, e.g. sale bill', 'aria-label': 'Search menu items' });
    const onlyBuilt = h('input', { type: 'checkbox', id: 'only-built' });
    const noMatch = h('div', { class: 'empty', hidden: true }, 'No menu item matches your search');
    const applyFilter = () => {
      const q = search.value.trim().toLowerCase();
      const builtOnly = onlyBuilt.checked;
      const walk = (n: MenuNode): boolean => {
        if (!n.children) {
          const ok = (!builtOnly || n.built) && (!q || n.path.join(' ').toLowerCase().includes(q));
          rowEl.get(n.key)!.hidden = !ok;
          return ok;
        }
        const any = n.children.map(walk).some(Boolean);   // map first so every child is updated
        const el = groupEl.get(n.key)!;
        el.hidden = !any;
        if (q) el.open = any;
        return any;
      };
      const shown = MENU_TREE.map(walk).filter(Boolean).length;
      for (const p of SPECIAL) rowEl.get(p.key)!.hidden = !!q && !p.label.toLowerCase().includes(q);
      specialEl.hidden = visible(SPECIAL.map((p) => p.key)).length === 0;
      noMatch.hidden = shown > 0 || !specialEl.hidden;
    };
    search.addEventListener('input', applyFilter);
    onlyBuilt.addEventListener('change', applyFilter);
    const allDetails = () => [specialEl, ...groupEl.values()];
    const toolbar = h('div', { class: 'perm-toolbar' },
      search,
      h('label', { class: 'check-inline', for: 'only-built' }, onlyBuilt, h('span', {}, 'Only working screens')),
      h('div', { class: 'perm-tools' },
        h('button', { class: 'btn small', type: 'button', onclick: () => allDetails().forEach((d) => { d.open = true; }) }, 'Expand all'),
        h('button', { class: 'btn small', type: 'button', onclick: () => allDetails().forEach((d) => { d.open = d === specialEl; }) }, 'Collapse all'),
        h('button', { class: 'btn small', type: 'button', disabled: locked, onclick: () => setMany(visible([...boxes.keys()]), true) }, 'Tick all'),
        h('button', { class: 'btn small', type: 'button', disabled: locked, onclick: () => setMany(visible([...boxes.keys()]), false) }, 'Untick all')));

    editor.replaceChildren(
      h('div', { class: 'editor-head' },
        h('div', {}, h('h2', {}, r.name), count),
        h('div', { class: 'editor-actions' },
          h('button', {
            class: 'btn small', type: 'button', disabled: locked, onclick: () => formModal(`Rename ${r.name}`, [
              { name: 'name', label: 'Role name', required: true, upper: true, value: r.name },
            ], 'Rename', (v) => save(v.name.toUpperCase())),
          }, 'Rename'),
          h('button', { class: 'btn small', type: 'button', disabled: locked, onclick: () => newRole(r) }, 'Copy'),
          h('button', {
            class: 'btn small danger-ghost', type: 'button', disabled: locked, onclick: async () => {
              if (!(await confirmModal('Delete role', `Delete role ${r.name}?${r.users ? ` ${r.users} user(s) still have it, so move them to another role first.` : ''}`, 'Delete'))) return;
              try { await api(`/roles/${r.id}`, 'DELETE'); dirty = false; roleSel = undefined; toast(`Role ${r.name} deleted`); render(); } catch (e) { fail(e); }
            },
          }, 'Delete'),
          saveBtn)),
      ...(locked ? [h('div', { class: 'notice' }, 'SUPERADMIN always has every page and feature, and is the only role that can manage companies, users and roles. It cannot be changed or deleted.')] : []),
      h('p', { class: 'muted perm-hint' }, 'Each item is one menu entry in Flow Ledger. Unticked items are hidden from that role\'s menus, and the server blocks them too. Items marked "not built yet" can be set now and will apply once those screens exist.'),
      toolbar,
      h('div', { class: 'perm-tree' }, specialEl, tree, noMatch));
    sync();
  };

  drawList();
  drawEditor();
  root.replaceChildren(
    pageHead('Roles & Permissions', 'Tick exactly which pages and features each role gets.', addBtn('New role', () => newRole())),
    h('div', { class: 'roles-layout' }, listEl, editor));
}

// ---------------------------------------------------------------- start
window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); });
// Close the account menu on any click outside it.
document.addEventListener('click', (e) => {
  const menu = document.querySelector<HTMLDetailsElement>('.user-menu');
  if (menu && !menu.contains(e.target as Node)) menu.open = false;
});
render();
// A saved sign-in may belong to a server that restarted (sessions live in memory).
if (me) api<Me>('/me').then((r) => { if (!r.is_super) { toast(`${r.name} is no longer a SUPERADMIN`, 'err'); signOut(); } }).catch(() => undefined);
