// MARG start-up, in the same order as the real program:
//   User Id / User Password  →  LIST OF COMPANIES
//   →  company menu (A MARG GATEWAY …)  →  SELECT TO EXECUTE (financial year)  →  main screen.
import { api, esc, h, openWin, toast, alertBox, confirmBox } from './ui.ts';
import { margBar } from './margui.ts';
import { companyScreen } from './companyform.ts';
import { setSession, token, isSuper, type Session } from './session.ts';

export type User = Session;
export interface Company { id: number; name: string; station: string; address1: string; address2: string; gstin: string; state: string; details?: string }
interface Year { id: number; code: string; fy_start: string; fy_end: string; backup_upto: string | null; freez_upto: string | null }

let booting = false;
/** True while the start-up screens are up: the main menu and hotkeys stay off. */
export const isBooting = () => booting;

/** Company and year open in this session (kept when the user changes with Ctrl+U). */
let open: { company: Company; yearId: number } | null = null;
export const openCompany = () => open;

const hint = (text: string) => { document.getElementById('hintbar')!.textContent = text; };
const MAIN_HINT = document.getElementById('hintbar')!.textContent ?? '';

/** Bottom-left info panel: the highlighted company's name and address. */
function setInfo(c: Partial<Company> | null) {
  document.getElementById('companyinfo')!.innerHTML = !c ? '' :
    [c.name + (c.station && c.station !== c.name ? `-${c.station}` : ''), c.address1, c.address2, c.gstin ? `GSTIN:${c.gstin}` : '']
      .filter(Boolean).map((t) => `<div>${esc(t)}</div>`).join('');
}

/** Windows that sit inside the desktop area, leaving the info bar visible. */
function inDesktop(w: { el: HTMLElement }) {
  w.el.parentElement!.classList.add('boot-back');
}

// ------------------------------------------------------------------ the whole start-up
export async function boot(): Promise<User> {
  booting = true;
  document.body.classList.add('boot');
  const lic = await api<{ user: string }>('/licence').catch(() => ({ user: '' }));
  document.getElementById('boot-user')!.textContent = lic.user;
  hint('Enter-Next   F2-User List');

  let u: User | null = null;
  if (token()) {
    try {
      const me = await api<User & { company_id?: number; year_id?: number }>('/me');
      u = me;
      setSession(me);
      if (me.company_id && me.year_id) {
        const comps = await api<Company[]>('/companies').catch(() => []);
        const found = comps.find((c) => c.id === me.company_id);
        if (found) {
          open = { company: found, yearId: me.year_id };
          setInfo(found);
        }
      }
    } catch {
      setSession(null);
      u = null;
    }
  }

  if (!u) {
    u = await login();
  }
  if (!open) {
    const comps = await api<Company[]>('/companies').catch(() => []);
    if (comps.length === 1) {
      const c = comps[0];
      await api('/session/company', { method: 'POST', body: { id: c.id } });
      const y = await selectYear();
      if (y) {
        await api('/session/year', { method: 'POST', body: { id: y.id } });
        open = { company: c, yearId: y.id };
        setInfo(c);
      } else {
        await chooseCompany(true);
      }
    } else {
      await chooseCompany(true);
    }
  }
  document.body.classList.remove('boot');
  hint(MAIN_HINT);
  booting = false;
  return u;
}

/** F1 — back to LIST OF COMPANIES from the main screen. Resolves true if another company/year was opened. */
export async function changeCompany(): Promise<boolean> {
  const comps = await api<Company[]>('/companies').catch(() => []);
  if (comps.length <= 1) {
    toast(comps.length === 1 ? `You are restricted to ${comps[0].name} only` : 'No company available', true);
    return false;
  }
  booting = true;
  try { return await chooseCompany(false); } finally {
    booting = false;
    hint(MAIN_HINT);
  }
}

/** LIST OF COMPANIES → company menu → year, until a year is opened (or Esc when `required` is false). */
async function chooseCompany(required: boolean): Promise<boolean> {
  let last: number | undefined = open?.company.id;
  for (;;) {
    hint('F8/Enter-Select F2-New F3-Edit');
    const c = await companyList(last, required);
    if (!c) { if (open) setInfo(null); return false; }
    last = c.id;
    for (;;) {
      const opt = await companyMenu(c);
      if (!opt) break;                       // Esc: back to the list
      if (opt === 'A') {
        await api('/session/company', { method: 'POST', body: { id: c.id } });
        hint('Enter-Run');
        const y = await selectYear();
        if (y) {
          await api('/session/year', { method: 'POST', body: { id: y.id } });
          open = { company: c, yearId: y.id };
          return true;
        }
        hint('F8/Enter-Select F2-New F3-Edit');
        continue;
      }
      if (opt === 'C') await backup(c);
      else if (opt === 'E') await newYear(c);
    }
  }
}

// ------------------------------------------------------------------ User Id / User Password
/** Login box. Also used by Ctrl+U (change user), which keeps the open company and year. */
export function login(): Promise<User> {
  return new Promise((resolve) => {
    const w = openWin('LOGIN', 'small');
    w.el.className = 'win marg marg-loginbox';
    w.el.parentElement!.classList.add('clear');
    w.setFoot('');
    w.body.innerHTML = `
      <div class="login-logo"><img src="logo.gif" alt="Flow Ledger"></div>
      <div class="lg-form">
        <label>User Id</label><span>:</span><input data-k="name" autocomplete="off" spellcheck="false">
        <label>User Password</label><span>:</span><input data-k="pass" type="password" autocomplete="off">
      </div>
      <div class="err"></div>`;
    const nameI = w.body.querySelector('[data-k=name]') as HTMLInputElement;
    const passI = w.body.querySelector('[data-k=pass]') as HTMLInputElement;
    const err = w.body.querySelector('.err') as HTMLElement;
    try { nameI.value = localStorage.getItem('user') ?? ''; } catch { /* storage unavailable */ }
    setTimeout(() => { nameI.focus(); nameI.select(); }, 0);
    nameI.addEventListener('input', () => { nameI.value = nameI.value.toUpperCase(); });

    const tryLogin = async () => {
      err.textContent = '';
      try {
        const keep = open ? { company_id: open.company.id, year_id: open.yearId } : {};
        const u = await api<User>('/login', { method: 'POST', body: { name: nameI.value.trim(), password: passI.value, ...keep } });
        // Ctrl+U: end the previous user's session (a fresh page has none to end).
        if (token()) await api('/logout', { method: 'POST' }).catch(() => undefined);
        setSession(u);
        try { localStorage.setItem('user', u.name); } catch { /* storage unavailable */ }
        w.close();
        resolve(u);
      } catch (e) {
        err.textContent = (e as Error).message;
        passI.value = '';
        passI.focus();
      }
    };
    /** Move on to the password only when the User Id exists; otherwise say so and stay on it. */
    const checkUser = async () => {
      const name = nameI.value.trim();
      if (!name) return;
      const users = await api<{ name: string }[]>('/login/users').catch(() => null);
      if (users && !users.some((u) => u.name === name)) {
        await alertBox('Wrong User Id');
        nameI.focus(); nameI.select();
        return;
      }
      passI.focus();
    };
    w.onKey = (e, k) => {
      if (k === 'Enter') {
        if (e.target === nameI) { checkUser(); return true; }
        tryLogin();
        return true;
      }
      if (k === 'ArrowDown' && e.target === nameI) { checkUser(); return true; }
      if (k === 'ArrowUp' && e.target === passI) { nameI.focus(); return true; }
      if (k === 'F2') {
        api<{ name: string }[]>('/login/users').then((us) => { err.textContent = `Users: ${us.map((u) => u.name).join(', ')}`; });
        return true;
      }
      if (k === 'Escape') return true;   // login cannot be skipped
      return false;
    };
    w.beforeEsc = async () => false;
  });
}

// ------------------------------------------------------------------ LIST OF COMPANIES
function companyList(startId: number | undefined, required: boolean): Promise<Company | null> {
  return new Promise(async (resolve) => {
    let rows = await api<Company[]>('/companies');
    const w = openWin('LIST OF COMPANIES', 'full');
    w.el.classList.add('marg', 'marg-companies');
    w.setFoot('');
    inDesktop(w);
    w.body.append(margBar('LIST OF COMPANIES'));
    const list = h('div', { class: 'co-rows' });
    const find = h('div', { class: 'co-find' }, '<span>Name ?</span><span class="brk">[</span>');
    const input = h('input', { autocomplete: 'off', spellcheck: false });
    find.append(input, h('span', { class: 'brk' }, ']'));
    w.body.append(list, find);

    let sel = Math.max(0, rows.findIndex((r) => r.id === startId));
    const draw = () => {
      if (rows.length === 0) {
        list.innerHTML = `<div style="padding:20px;text-align:center;color:#666;font-size:13px;line-height:1.6;">No companies created yet.<br><br>Press <b style="color:#000;">F2</b> to create a new company,<br>or add one from the SuperAdmin Panel.</div>`;
        setInfo(null);
        return;
      }
      list.innerHTML = rows.map((r, i) => `<div class="co-row${i === sel ? ' sel' : ''}" data-i="${i}">
        <span>${esc(r.name)}</span><span>${esc(r.station)}</span></div>`).join('');
      list.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
      setInfo(rows[sel] ?? null);
    };
    draw();
    setTimeout(() => input.focus(), 0);

    // Typing jumps to the first company starting with what was typed.
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase();
      const q = input.value.trim();
      if (!q) return;
      const i = rows.findIndex((r) => r.name.startsWith(q));
      const j = i >= 0 ? i : rows.findIndex((r) => r.name.includes(q) || r.station.startsWith(q));
      if (j >= 0) { sel = j; draw(); }
    });
    list.addEventListener('click', (e) => {
      const r = (e.target as HTMLElement).closest('.co-row') as HTMLElement | null;
      if (r) { sel = Number(r.dataset.i); draw(); input.focus(); }
    });
    list.addEventListener('dblclick', () => finish(rows[sel]));

    let done = false;
    const finish = (v: Company | null) => { if (done || (v && !v.id)) return; done = true; w.close(); resolve(v); };
    const reload = async (id?: number) => {
      rows = await api<Company[]>('/companies');
      sel = Math.max(0, rows.findIndex((r) => r.id === id));
      draw();
      input.focus();
    };
    const edit = async (c?: Company) => {
      if (!isSuper()) { toast('Only SuperAdmin can create or change companies', true); return; }
      const id = await companyScreen(c);   // F2 COMPANY CREATION / F3 COMPANY ALTERATION
      if (id) await reload(id); else input.focus();
    };

    w.onKey = (_e, k) => {
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        sel = Math.min(rows.length - 1, Math.max(0, sel + (k === 'ArrowDown' ? 1 : -1)));
        input.value = '';
        draw();
        return true;
      }
      if (k === 'Home' || k === 'Ctrl+Home') { sel = 0; draw(); return true; }
      if (k === 'End' || k === 'Ctrl+End') { sel = rows.length - 1; draw(); return true; }
      if (k === 'Enter' || k === 'F8') { if (rows[sel]) finish(rows[sel]); return true; }
      if (k === 'F2') { edit(); return true; }
      if (k === 'F3') { if (rows[sel]) edit(rows[sel]); return true; }
      if (k === 'Escape') { if (!required) finish(null); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ company menu (A MARG GATEWAY …)
const COMPANY_MENU: [string, string][] = [
  ['A', 'FLOW LEDGER GATEWAY'], ['C', 'BACKUP OF FINANCIAL YEAR'], ['E', 'NEW FINANCIAL YEAR'],
];

function companyMenu(c: Company): Promise<string | null> {
  return new Promise((resolve) => {
    const w = openWin(c.name, 'small');
    w.el.className = 'win marg marg-comenu';
    w.el.parentElement!.classList.add('clear');
    w.setFoot('');
    w.body.append(margBar(c.station ? `${c.station}:${c.name}` : c.name));
    const box = h('div', { class: 'opts' });
    w.body.append(box);
    let sel = 0;
    const draw = () => {
      box.innerHTML = COMPANY_MENU.map(([k, t], i) => `<div class="${i === sel ? 'sel' : ''}" data-i="${i}"><b>${k}</b><span>${esc(t)}</span></div>`).join('');
    };
    draw();
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; w.close(); resolve(v); };
    box.addEventListener('click', (e) => {
      const d = (e.target as HTMLElement).closest('[data-i]') as HTMLElement | null;
      if (d) finish(COMPANY_MENU[Number(d.dataset.i)][0]);
    });
    w.onKey = (_e, k) => {
      if (k === 'ArrowDown') { sel = (sel + 1) % COMPANY_MENU.length; draw(); return true; }
      if (k === 'ArrowUp') { sel = (sel - 1 + COMPANY_MENU.length) % COMPANY_MENU.length; draw(); return true; }
      if (k === 'Enter') { finish(COMPANY_MENU[sel][0]); return true; }
      if (k === 'Escape') { finish(null); return true; }
      const i = COMPANY_MENU.findIndex(([key]) => key === k);
      if (i >= 0) { sel = i; draw(); finish(k); return true; }
      return true;
    };
  });
}

async function backup(c: Company) {
  if (!isSuper()) { toast('Only SuperAdmin can take a backup', true); return; }
  if (!(await confirmBox(`Take backup of ${c.name} ?`))) return;
  try {
    const r = await api<{ file: string }>(`/companies/${c.id}/backup`, { method: 'POST' });
    await alertBox(`Backup saved to ${r.file}`);
  } catch (e) { toast((e as Error).message, true); }
}

async function newYear(c: Company) {
  if (!isSuper()) { toast('Only SuperAdmin can create a financial year', true); return; }
  if (!(await confirmBox(`Create the next financial year for ${c.name} ?`, false))) return;
  try {
    const r = await api<{ code: string; fy_start: string; fy_end: string }>(`/companies/${c.id}/new-year`, { method: 'POST' });
    await alertBox(`Year ${r.code} created : ${dmy(r.fy_start)} to ${dmy(r.fy_end)}`);
  } catch (e) { toast((e as Error).message, true); }
}

// ------------------------------------------------------------------ SELECT TO EXECUTE
const dmy = (d?: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : '');

/** The financial-year picker. Resolves null on Esc (back to the company menu). */
export function selectYear(): Promise<Year | null> {
  return new Promise(async (resolve) => {
    const [years, company] = await Promise.all([api<Year[]>('/years'), api<any>('/company')]);
    if (!years.length) { await alertBox('No financial year in this company — use E NEW FINANCIAL YEAR'); resolve(null); return; }
    const w = openWin('SELECT TO EXECUTE', 'full');
    w.el.classList.add('marg');
    w.setFoot('');
    const box = h('div', { class: 'marg-select' });
    box.append(margBar('SELECT TO EXECUTE'));
    const rest = h('div', { style: 'flex:1;display:flex;flex-direction:column' });
    box.append(rest);
    w.body.append(box);
    // Open on the year that covers today, else the latest.
    const t = new Date().toISOString().slice(0, 10);
    let sel = Math.max(0, years.findIndex((y) => y.fy_start <= t && t <= y.fy_end));
    const draw = () => {
      rest.innerHTML = `
        <div class="co">${esc(company.name)}<span>${esc(company.address1)} ${esc(company.address2)}</span></div>
        <table><tr><th>CODE</th><th>YEAR</th><th>FROM</th><th>TO</th><th>BACKUP UPTO</th><th>FREEZ UPTO</th></tr>
        ${years.map((y, i) => `<tr class="${i === sel ? 'sel' : ''}" data-i="${i}">
          <td>${esc(y.code)}</td><td>${y.fy_start.slice(0, 4)} - ${y.fy_end.slice(0, 4)}</td>
          <td>${dmy(y.fy_start)}</td><td>${dmy(y.fy_end)}</td><td>${dmy(y.backup_upto)}</td><td>${dmy(y.freez_upto)}</td></tr>`).join('')}
        </table><div style="flex:1"></div>
        <div class="folder">Data Folder : <b>data</b></div>`;
      rest.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('dblclick', () => finish(years[Number((tr as HTMLElement).dataset.i)])));
      rest.querySelectorAll('tr[data-i]').forEach((tr) => tr.addEventListener('click', () => { sel = Number((tr as HTMLElement).dataset.i); draw(); }));
    };
    draw();
    let done = false;
    const finish = (v: Year | null) => { if (done) return; done = true; w.close(); resolve(v); };
    w.onKey = (_e, k) => {
      if (k === 'ArrowDown') { sel = Math.min(years.length - 1, sel + 1); draw(); return true; }
      if (k === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); return true; }
      if (k === 'Enter') { finish(years[sel]); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}
