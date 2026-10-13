// SuperAdmin screens: Users (who logs in, with which role) and Roles & Permissions
// (which pages / features each role may use). The server re-checks every rule.
import { api, openWin, GridList, formWin, confirmBox, toast, esc } from './ui.ts';
import { type Perm } from '../shared/perms.ts';
import { SPECIAL, MENU_LEAVES } from '../shared/menuPerms.ts';
import { session } from './session.ts';

interface Role { id: number; name: string; is_super: number; perms: string[]; users: number }
interface UserRow { id: number; name: string; role_id: number; role: string; is_super: number }

const roleOptions = (roles: Role[]) => roles.map((r) => ({ value: r.id, label: r.is_super ? `${r.name} (all features)` : r.name }));

// ------------------------------------------------------------------ users
export async function usersWindow() {
  const w = openWin('Users', 'wide',
    '<span><b>F2</b> New User</span><span><b>F3</b> Change Role</span><span><b>F4</b> Reset Password</span>' +
    '<span><b>F6</b> Roles &amp; Permissions</span><span><b>Del</b> Delete</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  const g = new GridList<UserRow>(w.body, [
    { title: 'User Name', get: (r) => r.name + (r.id === session()?.id ? '  (you)' : '') },
    { title: 'Role', get: (r) => r.role },
    { title: 'Access', get: (r) => (r.is_super ? 'Every feature — no restriction' : 'As set in the role') },
  ], (r) => `${r.name} ${r.role}`);
  let roles: Role[] = [];
  const load = async () => {
    [roles] = await Promise.all([api<Role[]>('/roles')]);
    g.setRows(await api<UserRow[]>('/users'), true);
  };
  await load();
  g.focus();
  w.onKey = (_e, k) => {
    if (g.nav(k)) return true;
    const cur = g.current;
    if (k === 'F2') {
      formWin('New User', [
        { name: 'name', label: 'User Name', required: true, upper: true },
        { name: 'password', label: 'Password', type: 'password', required: true },
        { name: 'role_id', label: 'Role', type: 'select', options: roleOptions(roles) },
      ], { role_id: roles.find((r) => r.name === 'CASHIER')?.id ?? roles[0]?.id },
      (v) => api('/users', { method: 'POST', body: { ...v, role_id: Number(v.role_id) } })).then((r) => r && load());
      return true;
    }
    if (k === 'F3' && cur) {
      formWin(`Change Role : ${cur.name}`, [
        { name: 'role_id', label: 'Role', type: 'select', options: roleOptions(roles) },
      ], { role_id: cur.role_id }, (v) => api(`/users/${cur.id}`, { method: 'PUT', body: { role_id: Number(v.role_id) } }))
        .then((r) => r && load());
      return true;
    }
    if (k === 'F4' && cur) {
      formWin(`Reset Password : ${cur.name}`, [
        { name: 'password', label: 'New Password', type: 'password', required: true },
      ], {}, (v) => api(`/users/${cur.id}/password`, { method: 'PUT', body: v })).then((r) => { if (r) toast('Password changed'); });
      return true;
    }
    if (k === 'F6') { rolesWindow().then(() => undefined); return true; }
    if (k === 'Delete' && cur) {
      confirmBox(`Delete user ${cur.name} ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/users/${cur.id}`, { method: 'DELETE' }); toast('User deleted'); load(); } catch (e) { toast((e as Error).message, true); }
      });
      return true;
    }
    return false;
  };
}

// ------------------------------------------------------------------ roles & permissions
export async function rolesWindow() {
  const w = openWin('Roles & Permissions  (Passwords & Powers)', 'wide',
    '<span><b>↑↓</b> Role</span><span><b>Enter / →</b> Edit permissions</span><span><b>Space</b> Tick / untick</span>' +
    '<span><b>*</b> Whole group</span><span><b>Ctrl+W</b> Save</span><span><b>F2</b> New Role</span><span><b>F3</b> Rename</span>' +
    '<span><b>F5</b> Copy Role</span><span><b>Del</b> Delete Role</span><span><b>Esc</b> Close</span>');
  w.body.style.height = '100%';
  w.body.innerHTML = `<div class="roles-screen">
    <div class="roles-left"><div class="roles-head">ROLES</div><div class="roles-list"></div></div>
    <div class="roles-right"><div class="roles-head perm-title"></div><div class="perm-list"></div></div></div>`;
  const listEl = w.body.querySelector('.roles-list') as HTMLElement;
  const permEl = w.body.querySelector('.perm-list') as HTMLElement;
  const titleEl = w.body.querySelector('.perm-title') as HTMLElement;

  let roles: Role[] = [];
  let sel = 0;              // selected role
  let cursor = 0;           // row in the permission list
  let pane: 'roles' | 'perms' = 'roles';
  let draft = new Set<string>();
  let dirty = false;
  // Special powers first, then every menu item grouped by its top menu (same list as the Admin Panel).
  const rows: Perm[] = [
    ...SPECIAL,
    ...MENU_LEAVES.map((l) => ({ key: l.key, group: l.path[0], label: `${l.path.slice(1).join(' › ')}${l.built ? '' : '  (not built yet)'}` })),
  ];
  const ALL_KEYS = rows.map((p) => p.key);
  const role = () => roles[sel];

  const load = async (keepName?: string) => {
    roles = await api<Role[]>('/roles');
    if (keepName) sel = Math.max(0, roles.findIndex((r) => r.name === keepName));
    sel = Math.min(sel, roles.length - 1);
    pick(sel);
  };
  function pick(i: number) {
    sel = i;
    draft = new Set(role()?.perms ?? []);
    dirty = false;
    render();
  }
  function render() {
    listEl.innerHTML = roles.map((r, i) => `<div class="role-row${i === sel ? ' sel' : ''}${pane === 'roles' && i === sel ? ' focus' : ''}" data-i="${i}">
      <b>${esc(r.name)}</b><span>${r.is_super ? 'ALL' : `${r.perms.length}/${rows.length}`} · ${r.users} user${r.users === 1 ? '' : 's'}</span></div>`).join('');
    const r = role();
    if (!r) { permEl.innerHTML = ''; return; }
    titleEl.innerHTML = `PERMISSIONS — ${esc(r.name)}${dirty ? ' <span class="dirty">● unsaved (Ctrl+W)</span>' : ''}`;
    if (r.is_super) {
      permEl.innerHTML = `<div class="super-note">SUPERADMIN has <b>every page and feature, with no restriction</b>, and is the only role
        that can create users and roles. It cannot be limited or deleted.</div>` +
        rows.map((p) => `<div class="perm-row locked"><span class="box">☑</span>${esc(p.label)}</div>`).join('');
      return;
    }
    let lastGroup = '';
    permEl.innerHTML = rows.map((p, i) => {
      const head = p.group !== lastGroup ? `<div class="perm-group">${esc((lastGroup = p.group))}
        <span>${rows.filter((x) => x.group === p.group && draft.has(x.key)).length}/${rows.filter((x) => x.group === p.group).length}</span></div>` : '';
      return `${head}<div class="perm-row${pane === 'perms' && i === cursor ? ' focus' : ''}" data-p="${i}">
        <span class="box">${draft.has(p.key) ? '☑' : '☐'}</span>${esc(p.label)}</div>`;
    }).join('');
    permEl.querySelector('.perm-row.focus')?.scrollIntoView({ block: 'nearest' });
  }

  async function save() {
    const r = role();
    if (!r || r.is_super) return;
    try {
      await api(`/roles/${r.id}`, { method: 'PUT', body: { perms: [...draft] } });
      toast(`Role ${r.name} saved — takes effect immediately`);
      await load(r.name);
    } catch (e) { toast((e as Error).message, true); }
  }
  /** Leaving a role with unticked changes: ask first. Resolves false to stay. */
  async function leaveOk() {
    if (!dirty) return true;
    const y = await confirmBox(`Save changes to ${role().name} ?`);
    if (y) await save(); else dirty = false;
    return true;
  }
  const toggle = (key: string) => { draft.has(key) ? draft.delete(key) : draft.add(key); dirty = true; render(); };

  listEl.addEventListener('click', async (e) => {
    const row = (e.target as HTMLElement).closest('.role-row') as HTMLElement | null;
    if (row && await leaveOk()) { pane = 'roles'; pick(Number(row.dataset.i)); }
  });
  permEl.addEventListener('click', (e) => {
    const row = (e.target as HTMLElement).closest('.perm-row[data-p]') as HTMLElement | null;
    if (!row || role()?.is_super) return;
    pane = 'perms';
    cursor = Number(row.dataset.p);
    toggle(rows[cursor].key);
  });

  const newRole = (base?: Role) => formWin(base ? `Copy Role ${base.name} as` : 'New Role (any name — e.g. ACCOUNTANT, STORE KEEPER)', [
    { name: 'name', label: 'Role Name', required: true, upper: true },
  ], {}, (v) => api('/roles', { method: 'POST', body: { name: v.name, perms: base ? (base.is_super ? ALL_KEYS : base.perms) : [] } }))
    .then((r) => { if (r) load(String(r.name).toUpperCase()).then(() => { pane = 'perms'; cursor = 0; render(); }); });

  w.onKey = (_e, k) => {
    const r = role();
    if (k === 'Ctrl+W') { save(); return true; }
    if (k === 'F2') { leaveOk().then(() => newRole()); return true; }
    if (k === 'F5' && r) { leaveOk().then(() => newRole(r)); return true; }
    if (k === 'F3' && r) {
      if (r.is_super) { toast('SUPERADMIN cannot be renamed', true); return true; }
      formWin(`Rename Role ${r.name}`, [{ name: 'name', label: 'New Name', required: true, upper: true }], { name: r.name },
        (v) => api(`/roles/${r.id}`, { method: 'PUT', body: { name: v.name, perms: [...draft] } }))
        .then((x) => { if (x) load(String(x.name).toUpperCase()); });
      return true;
    }
    if (k === 'Delete' && r && pane === 'roles') {
      confirmBox(`Delete role ${r.name} ?`, false).then(async (y) => {
        if (!y) return;
        try { await api(`/roles/${r.id}`, { method: 'DELETE' }); toast('Role deleted'); sel = 0; load(); } catch (e) { toast((e as Error).message, true); }
      });
      return true;
    }
    if (pane === 'roles') {
      if (k === 'ArrowDown' || k === 'ArrowUp') {
        const to = Math.min(roles.length - 1, Math.max(0, sel + (k === 'ArrowDown' ? 1 : -1)));
        if (to !== sel) leaveOk().then(() => pick(to));
        return true;
      }
      if ((k === 'Enter' || k === 'ArrowRight' || k === 'Tab') && r) {
        if (r.is_super) { toast('SUPERADMIN always has every feature', true); return true; }
        pane = 'perms'; render(); return true;
      }
      return false;
    }
    // permission pane
    if (k === 'ArrowDown') { cursor = Math.min(rows.length - 1, cursor + 1); render(); return true; }
    if (k === 'ArrowUp') { cursor = Math.max(0, cursor - 1); render(); return true; }
    if (k === 'PageDown') { cursor = Math.min(rows.length - 1, cursor + 8); render(); return true; }
    if (k === 'PageUp') { cursor = Math.max(0, cursor - 8); render(); return true; }
    if (k === 'Space' || k === '+' || k === 'Enter') { toggle(rows[cursor].key); return true; }
    if (k === '*') {
      const group = rows.filter((p) => p.group === rows[cursor].group);
      const allOn = group.every((p) => draft.has(p.key));
      group.forEach((p) => (allOn ? draft.delete(p.key) : draft.add(p.key)));
      dirty = true; render(); return true;
    }
    if (k === 'ArrowLeft' || k === 'Tab') { pane = 'roles'; render(); return true; }
    return false;
  };
  w.beforeEsc = async () => {
    if (pane === 'perms') { pane = 'roles'; render(); return false; }   // Esc steps back to the role list first
    if (!dirty) return true;
    const y = await confirmBox(`Save changes to ${role().name} ?`);
    if (y) await save();
    return true;
  };
  await load();
}
