// The logged-in user and what their role may do. The server enforces the same rules;
// this copy only decides what to show (menus, buttons, cost figures).
import { permsForAction, SUPER } from '../shared/perms.ts';

/** perms = feature permissions (derived on the server); menu = the menu items ticked for the role. */
export interface Session { token: string; id: number; name: string; role: string; is_super: boolean; perms: string[]; menu?: string[] }

let current: Session | null = null;
let granted = new Set<string>();
let menuTicked = new Set<string>();

export function setSession(s: Session | null) {
  current = s;
  granted = new Set(s?.perms ?? []);
  menuTicked = new Set(s?.menu ?? []);
  document.dispatchEvent(new Event('session-changed'));
}
export const session = () => current;
export const token = () => current?.token ?? '';
export const isSuper = () => !!current?.is_super;

/** Does the current role hold this permission key? SuperAdmin holds everything. */
export function can(key: string): boolean {
  if (!current) return false;
  if (current.is_super) return true;
  return key !== SUPER && granted.has(key);
}

/** Can the current role run this menu / hotkey action? */
export function canAction(action: string): boolean {
  const need = permsForAction(action);
  return need === null || need.some(can);
}

/** Is this menu item ticked for the current role? (key from menuKeyOf; SuperAdmin sees all) */
export const menuTickedFor = (key: string) => !!current && (current.is_super || menuTicked.has(key));

/** Cost, margin and profit figures are only for roles with "See purchase rate…". */
export const seeCost = () => can('feature.view_cost');
export const canBackdate = () => can('feature.backdate');
