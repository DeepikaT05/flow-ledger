// Every MARG menu item as a grantable permission. A role stores the menu items it
// may open (keys "m:<Top>><Sub>><Item>") plus the special powers; the feature
// permissions the server checks (sale.bill, reports.final, …) are derived from the
// menu items ticked, so hotkeys, quick buttons and the API follow the same ticks.
import { MENU, type MenuEntry, type MenuItem } from '../client/menu.ts';
import { PERMS, SUPER, permsForAction } from './perms.ts';

/** path = the menu labels from the top menu down to this item. built = it opens a real screen. */
export interface MenuNode { key: string; label: string; path: string[]; action?: string; built: boolean; children?: MenuNode[] }

export const SPECIAL = PERMS.filter((p) => p.group === 'Special Powers');
export const SPECIAL_KEYS = SPECIAL.map((p) => p.key);

/** Never hidden — nobody may be locked out of logging out or changing user / company / password. */
const ALWAYS_OPEN = new Set(['exit', 'user.change', 'user.password', 'company.change']);

const keyOf = new WeakMap<MenuItem, string>();
export const MENU_LEAVES: MenuNode[] = [];

function build(items: MenuEntry[], path: string[], labels: string[]): MenuNode[] {
  const out: MenuNode[] = [];
  const seen = new Map<string, number>();
  for (const m of items) {
    if (m === '-' || m.disabled) continue;
    const n = (seen.get(m.label) ?? 0) + 1;     // same label twice under one parent
    seen.set(m.label, n);
    const p = [...path, n > 1 ? `${m.label}#${n}` : m.label];
    if (m.children) {
      const kids = build(m.children, p, [...labels, m.label]);
      if (kids.length) out.push({ key: `g:${p.join('>')}`, label: m.label, path: [...labels, m.label], built: kids.some((k) => k.built), children: kids });
      continue;
    }
    if (m.action && ALWAYS_OPEN.has(m.action.split(':')[0])) continue;
    if (m.action && permsForAction(m.action)?.includes(SUPER)) continue;   // users & roles: SuperAdmin only
    const node: MenuNode = { key: `m:${p.join('>')}`, label: m.label, path: [...labels, m.label], action: m.action, built: !!m.action };
    keyOf.set(m, node.key);
    MENU_LEAVES.push(node);
    out.push(node);
  }
  return out;
}

/** Top menus (Masters, Transactions, …) with their submenus and items. */
export const MENU_TREE: MenuNode[] = MENU.flatMap((top) => {
  const kids = build(top.children ?? [], [top.label], [top.label]);
  return kids.length ? [{ key: `g:${top.label}`, label: top.label, path: [top.label], built: kids.some((k) => k.built), children: kids }] : [];
});

const LEAF = new Map(MENU_LEAVES.map((l) => [l.key, l]));
export const menuKeyOf = (m: MenuItem) => keyOf.get(m);
export const GRANTABLE = new Set([...SPECIAL_KEYS, ...LEAF.keys()]);

/** The feature permissions a role's ticked menu items and special powers add up to. */
export function featurePerms(stored: Iterable<string>): string[] {
  const out = new Set<string>();
  const either: string[][] = [];
  for (const k of stored) {
    if (SPECIAL_KEYS.includes(k)) { out.add(k); continue; }
    const a = LEAF.get(k)?.action;
    const need = a ? permsForAction(a) : null;
    if (need?.length === 1) out.add(need[0]);
    else if (need?.length) either.push(need);
  }
  // An item any of several permissions opens (e.g. Item Register: stock reports OR
  // item master) adds nothing when the role already holds one of them. Otherwise
  // ticking it under Masters would quietly unlock every stock report.
  for (const need of either) if (!need.some((p) => out.has(p))) out.add(need[0]);
  return [...out];
}

/** Menu items that open this action / carry this label. */
export const leavesForAction = (action: string) => MENU_LEAVES.filter((l) => l.action === action);
export const leavesForLabel = (label: string) => MENU_LEAVES.filter((l) => l.label === label);

/**
 * Converts a role saved with the old 33 feature permissions: it gets every menu item
 * it could already open, plus every not-yet-built item (those were visible to everyone).
 */
export function menuPermsFromFeatures(old: string[]): string[] {
  const has = new Set(old);
  const leaves = MENU_LEAVES.filter((l) => {
    const need = l.action ? permsForAction(l.action) : null;
    return !need || need.some((k) => has.has(k));
  });
  return [...SPECIAL_KEYS.filter((k) => has.has(k)), ...leaves.map((l) => l.key)];
}
