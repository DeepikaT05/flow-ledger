// Shared UI plumbing: API calls, window stack, keyboard-driven grids, pickers, forms.
import { token } from './session.ts';

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (opts.body) headers['Content-Type'] = 'application/json';
  if (token()) headers.Authorization = `Bearer ${token()}`;
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
export const money = (n: unknown) => Number(n ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const drcr = (n: number) => `${money(Math.abs(n))} ${n >= 0 ? 'Dr' : 'Cr'}`;
export const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const fmtDate = (d: string) => (d ? `${d.slice(8, 10)}-${d.slice(5, 7)}-${d.slice(0, 4)}` : '');
export const fyStart = () => { const d = new Date(); const y = d.getMonth() < 3 ? d.getFullYear() - 1 : d.getFullYear(); return `${y}-04-01`; };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, any> = {}, html = ''): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k in el && typeof v !== 'string') (el as any)[k] = v;
    else el.setAttribute(k, v);
  }
  if (html) el.innerHTML = html;
  return el;
}

/** Normalised key name, e.g. "Ctrl+W", "Alt+N", "Shift+F12", "Enter". */
export function keyName(e: KeyboardEvent): string {
  let k = e.key;
  if (k === ' ') k = 'Space';
  if (k.length === 1) k = k.toUpperCase();
  if (e.code?.startsWith('Key') && (e.altKey || e.ctrlKey)) k = e.code.slice(3);
  if (e.code?.startsWith('Digit') && (e.altKey || e.ctrlKey)) k = e.code.slice(5);
  if (['Control', 'Alt', 'Shift', 'Meta'].includes(k)) return k;
  const isPrintableChar = k.length === 1 && !e.ctrlKey && !e.altKey;
  const mods = [
    e.ctrlKey && 'Ctrl',
    e.altKey && 'Alt',
    e.shiftKey && (!isPrintableChar || k.length > 1) && 'Shift',
  ].filter(Boolean);
  return [...mods, k].join('+');
}

let toastTimer = 0;
export function toast(msg: string, err = false) {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.className = err ? 'err' : '';
  t.style.display = 'block';
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (t.style.display = 'none'), err ? 3500 : 2000);
}

// ------------------------------------------------------------------ windows
export interface Win {
  el: HTMLElement;
  body: HTMLElement;
  close: () => void;
  setFoot: (html: string) => void;
  onKey?: (e: KeyboardEvent, key: string) => boolean | void;
  onClose?: () => void;
  /** return false to veto closing via Esc */
  beforeEsc?: () => boolean | Promise<boolean>;
}
const stack: Win[] = [];
export const topWin = () => stack[stack.length - 1];
export const winCount = () => stack.length;

const winMap = new WeakMap<HTMLElement, Win>();
export function getWinForElement(el: HTMLElement): Win | undefined {
  const winEl = el.closest('.win') as HTMLElement | null;
  return winEl ? winMap.get(winEl) : undefined;
}

/** Triggers Escape key action on the target window (or top window), running beforeEsc, onKey, or close.
 * Guarantees that clicking the close button with mouse runs the exact same 'Exit W/o Save' check as pressing Esc.
 */
export async function triggerEsc(targetWin?: Win): Promise<boolean> {
  const w = targetWin || topWin();
  if (!w) return false;

  // 1. If window has beforeEsc guard (e.g. Exit W/o Save confirmation):
  if (w.beforeEsc) {
    const canClose = await w.beforeEsc();
    if (!canClose) return true; // Cancelled exit (clicked No)
    w.close();
    return true; // Confirmed exit (clicked Yes)
  }

  // 2. Otherwise run onKey for Escape (popups, choosers, search filters)
  const dummyEvent = new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true });
  if (w.onKey?.(dummyEvent, 'Escape')) return true;

  // 3. Fallback close
  w.close();
  return true;
}

// Global click handler (capture phase): any close button or footer Esc item clicked in any window triggers immediate Escape action
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const btn = target.closest('.marg-close-btn, .win-close-btn, .win-title .x, [data-win-close], .esc-clickable, .btn-win-close');
    if (btn) {
      e.preventDefault();
      e.stopPropagation();
      const winEl = btn.closest('.win') as HTMLElement | null;
      const w = winEl ? getWinForElement(winEl) : topWin();
      triggerEsc(w);
      return;
    }
    // Also check if user clicked on any footer span/button that mentions Esc / Exit / Close / Cancel / Back
    const footSpan = target.closest('.win-foot span, .marg-foot span, .cf-foot-keys span');
    if (footSpan) {
      const txt = footSpan.textContent || '';
      if (/\b(esc|exit|close|cancel|back)\b/i.test(txt) && !/\b(save|print|excel|next)\b/i.test(txt)) {
        e.preventDefault();
        e.stopPropagation();
        const winEl = footSpan.closest('.win') as HTMLElement | null;
        const w = winEl ? getWinForElement(winEl) : topWin();
        triggerEsc(w);
        return;
      }
    }
  }, true);
}

/** Call right after opening a window: runs fn when that (top) window closes. */
export function reloadOnClose(fn: () => void) {
  const w = topWin();
  if (!w) return;
  const prev = w.onClose;
  w.onClose = () => { prev?.(); fn(); };
}

export function openWin(title: string, size: 'full' | 'wide' | 'mid' | 'small' = 'mid', foot = ''): Win {
  const prevFocus = document.activeElement as HTMLElement | null;
  const back = h('div', { class: 'win-backdrop' });
  const el = h('div', { class: `win ${size}` });
  el.innerHTML = `<div class="win-title"><span class="win-title-text">${esc(title)}</span><button type="button" class="win-close-btn x" title="Close / Back (Esc)" aria-label="Close" tabindex="-1">&#10006; Esc</button></div>`;
  const body = h('div', { class: 'win-body' });
  const footEl = h('div', { class: 'win-foot' }, foot);
  el.append(body, footEl);
  back.append(el);
  document.getElementById('windows')!.append(back);
  const w: Win = {
    el, body,
    setFoot: (html) => {
      footEl.innerHTML = html;
      footEl.style.display = html ? '' : 'none';
      footEl.querySelectorAll('span').forEach((s) => {
        const txt = s.textContent || '';
        if (/\b(esc|exit|close|cancel|back)\b/i.test(txt) && !/\b(save|print|excel|next)\b/i.test(txt)) {
          s.classList.add('esc-clickable');
          s.setAttribute('title', 'Click or Press Esc to Close');
          s.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            triggerEsc(w);
          });
        }
      });
    },
    close: () => {
      const i = stack.indexOf(w);
      if (i >= 0) stack.splice(i, 1);
      back.remove();
      w.onClose?.();
      if (prevFocus && document.contains(prevFocus)) prevFocus.focus();
    },
  };
  winMap.set(el, w);
  w.setFoot(foot);

  // Direct click listener on window title close button
  const winCloseBtn = el.querySelector('.win-close-btn');
  winCloseBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    triggerEsc(w);
  });

  back.addEventListener('mousedown', (e) => { if (e.target === back) e.preventDefault(); });
  stack.push(w);
  return w;
}

export async function handleWinKey(e: KeyboardEvent, key: string): Promise<boolean> {
  const w = topWin();
  if (!w) return false;
  if (w.onKey?.(e, key)) { e.preventDefault(); return true; }
  if (key === 'Escape') {
    e.preventDefault();
    if (w.beforeEsc && !(await w.beforeEsc())) return true;
    w.close();
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ dialogs
export function confirmBox(msg: string, def = true): Promise<boolean> {
  return new Promise((resolve) => {
    const w = openWin('Confirm', 'small', '<span><b>Y</b> - Yes</span><span><b>N</b> - No</span><span><b>Esc</b> - Cancel</span>');
    w.body.innerHTML = `<div style="font-size:17px;padding:14px;text-align:center">${esc(msg)}</div>
      <div style="text-align:center"><button data-v="1">Yes</button> <button data-v="0">No</button></div>`;
    let done = false;
    const finish = (v: boolean) => { if (done) return; done = true; w.close(); resolve(v); };
    w.body.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => finish(b.dataset.v === '1')));
    (w.body.querySelector(`button[data-v="${def ? 1 : 0}"]`) as HTMLButtonElement).focus();
    w.onKey = (_e, k) => {
      if (k === 'Y') { finish(true); return true; }
      if (k === 'N') { finish(false); return true; }
      if (k === 'Escape') { finish(false); return true; }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
        const bs = [...w.body.querySelectorAll('button')];
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + 1) % 2].focus();
        return true;
      }
      return false;
    };
  });
}

export function alertBox(msg: string): Promise<void> {
  return new Promise((resolve) => {
    const w = openWin('FLOW LEDGER', 'small', '<span><b>Enter / Esc</b> - OK</span>');
    w.body.innerHTML = `<div style="font-size:16px;padding:14px;text-align:center">${esc(msg)}</div>`;
    w.onKey = (_e, k) => { if (k === 'Enter' || k === 'Escape') { w.close(); resolve(); return true; } return false; };
  });
}

// ------------------------------------------------------------------ grid list
export interface Col<T> { title: string; get: (r: T) => unknown; num?: boolean; money?: boolean; width?: string }

/** Keyboard navigable table with type-to-search. */
export class GridList<T extends Record<string, any>> {
  rows: T[] = [];
  view: T[] = [];
  sel = 0;
  search: HTMLInputElement;
  table: HTMLTableElement;
  wrap: HTMLElement;
  footerRow?: (rows: T[]) => string;

  constructor(parent: HTMLElement, public cols: Col<T>[], public searchKey?: (r: T) => string, height = 'calc(100% - 44px)') {
    this.search = h('input', { class: 'search', placeholder: searchKey ? 'Type to search…' : '' });
    if (!searchKey) this.search.style.display = 'none';
    this.wrap = h('div', { style: `overflow:auto;height:${searchKey ? height : '100%'};background:#fff;border:1px solid #99a` });
    this.table = h('table', { class: 'grid' });
    this.wrap.append(this.table);
    parent.append(this.search, this.wrap);
    this.search.addEventListener('input', () => { this.filter(); });
    this.table.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr[data-i]') as HTMLElement | null;
      if (tr) { this.sel = Number(tr.dataset.i); this.paint(); this.search.focus(); }
    });
  }
  setRows(rows: T[], keepSel = false) {
    const cur = this.current;
    this.rows = rows;
    this.filter();
    if (keepSel && cur) { const i = this.view.findIndex((r) => r.id === cur.id); if (i >= 0) this.sel = i; this.paint(); }
  }
  filter() {
    const q = this.search.value.trim().toLowerCase();
    if (!q || !this.searchKey) this.view = this.rows;
    else {
      const starts = this.rows.filter((r) => this.searchKey!(r).toLowerCase().startsWith(q));
      const has = this.rows.filter((r) => !starts.includes(r) && this.searchKey!(r).toLowerCase().includes(q));
      this.view = [...starts, ...has];
    }
    this.sel = 0;
    this.render();
  }
  get current(): T | undefined { return this.view[this.sel]; }
  render() {
    const head = `<thead><tr>${this.cols.map((c) => `<th class="${c.num || c.money ? 'n' : ''}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.title)}</th>`).join('')}</tr></thead>`;
    const body = this.view.map((r, i) => `<tr data-i="${i}">${this.cols.map((c) => {
      const v = c.get(r);
      return `<td class="${c.num || c.money ? 'n' : ''}">${c.money ? money(v) : esc(v)}</td>`;
    }).join('')}</tr>`).join('');
    const foot = this.footerRow ? this.footerRow(this.view) : '';
    this.table.innerHTML = head + `<tbody>${body || `<tr><td colspan="${this.cols.length}" class="muted">No records</td></tr>`}${foot}</tbody>`;
    this.paint();
  }
  paint() {
    this.table.querySelectorAll('tr.sel').forEach((t) => t.classList.remove('sel'));
    const tr = this.table.querySelector(`tr[data-i="${this.sel}"]`);
    tr?.classList.add('sel');
    tr?.scrollIntoView({ block: 'nearest' });
  }
  /** Handles navigation keys; returns true if consumed. */
  nav(key: string): boolean {
    const n = this.view.length;
    if (!n) return false;
    const page = Math.max(1, Math.floor(this.wrap.clientHeight / 26) - 1);
    const moves: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
    if (key in moves) this.sel = Math.min(n - 1, Math.max(0, this.sel + moves[key]));
    else if (key === 'Ctrl+Home') this.sel = 0;
    else if (key === 'Ctrl+End') this.sel = n - 1;
    else return false;
    this.paint();
    return true;
  }
  focus() { (this.searchKey ? this.search : this.wrap).focus(); }
}

/** Marg-style popup list to choose a record (party/item/ledger). F2 creates a new one. */
export function pick<T extends Record<string, any>>(opts: {
  title: string; rows: T[]; cols: Col<T>[]; key: (r: T) => string; initial?: string;
  onNew?: () => Promise<T | null | undefined>; size?: 'wide' | 'mid';
}): Promise<T | null> {
  return new Promise((resolve) => {
    const w = openWin(opts.title, opts.size ?? 'mid', `<span><b>Enter</b> Select</span>${opts.onNew ? '<span><b>F2</b> New</span>' : ''}<span><b>Esc</b> Cancel</span>`);
    w.body.style.height = '60vh';
    const g = new GridList<T>(w.body, opts.cols, opts.key);
    g.search.value = opts.initial ?? '';
    g.setRows(opts.rows);
    g.focus();
    let done = false;
    const finish = (v: T | null) => { if (done) return; done = true; w.close(); resolve(v); };
    g.table.addEventListener('dblclick', () => g.current && finish(g.current));
    w.onKey = (_e, k) => {
      if (g.nav(k)) return true;
      if (k === 'Enter') { if (g.current) finish(g.current); return true; }
      if (k === 'Escape') { finish(null); return true; }
      if (k === 'F2' && opts.onNew) { opts.onNew().then((r) => r && finish(r)); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ forms
export interface Field {
  name: string; label: string; type?: 'text' | 'number' | 'select' | 'date' | 'password';
  options?: { value: string | number; label: string }[]; required?: boolean; upper?: boolean;
}

/** Form where Enter advances to the next field, like Marg. Resolves saved values or null. */
export function formWin(title: string, fields: Field[], values: Record<string, any>, save: (v: Record<string, any>) => Promise<unknown>): Promise<any> {
  return new Promise((resolve) => {
    const w = openWin(title, 'mid', '<span><b>Enter</b> Next field</span><span><b>Ctrl+W</b> Save</span><span><b>Esc</b> Close</span>');
    const form = h('div', { class: 'form' });
    const inputs: (HTMLInputElement | HTMLSelectElement)[] = [];
    for (const f of fields) {
      const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
      form.append(h('label', { for: id }, esc(f.label)));
      let inp: HTMLInputElement | HTMLSelectElement;
      if (f.type === 'select') {
        inp = h('select', { id });
        inp.innerHTML = f.options!.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('');
      } else {
        inp = h('input', { id, type: f.type === 'date' ? 'date' : f.type === 'password' ? 'password' : 'text', autocomplete: 'off' });
        if (f.type === 'number') inp.classList.add('num');
        if (f.upper) inp.addEventListener('input', () => { const p = (inp as HTMLInputElement).selectionStart; inp.value = inp.value.toUpperCase(); (inp as HTMLInputElement).setSelectionRange(p, p); });
      }
      inp.value = values[f.name] ?? (f.type === 'number' ? '0' : '');
      inp.dataset.name = f.name;
      inputs.push(inp);
      form.append(inp);
    }
    w.body.append(form);
    inputs[0].focus();
    (inputs[0] as HTMLInputElement).select?.();
    let dirty = false;
    form.addEventListener('input', () => (dirty = true));
    let done = false;
    const doSave = async () => {
      const v: Record<string, any> = { ...values };
      for (const [i, f] of fields.entries()) {
        const raw = inputs[i].value.trim();
        if (f.required && !raw) { toast(`${f.label} is required`, true); inputs[i].focus(); return; }
        v[f.name] = f.type === 'number' ? Number(raw || 0) : raw;
      }
      try {
        const r = await save(v);
        done = true;
        w.close();
        toast('Saved');
        resolve({ ...v, ...(r as object) });
      } catch (err) { toast((err as Error).message, true); }
    };
    w.onKey = (e, k) => {
      if (k === 'Ctrl+W') { doSave(); return true; }
      const i = inputs.indexOf(e.target as any);
      if (k === 'Enter' && i >= 0) {
        if (i === inputs.length - 1) confirmBox('Save ?').then((y) => { if (y) doSave(); });
        else { inputs[i + 1].focus(); (inputs[i + 1] as HTMLInputElement).select?.(); }
        return true;
      }
      if (k === 'ArrowDown' && i >= 0 && inputs[i].tagName !== 'SELECT') { inputs[Math.min(i + 1, inputs.length - 1)].focus(); return true; }
      if (k === 'ArrowUp' && i > 0 && inputs[i].tagName !== 'SELECT') { inputs[i - 1].focus(); return true; }
      return false;
    };
    w.beforeEsc = async () => {
      if (!dirty) return true;
      const y = await confirmBox('Save changes ?');
      if (y) { await doSave(); return false; }
      return true;
    };
    w.onClose = () => { if (!done) resolve(null); };
  });
}
