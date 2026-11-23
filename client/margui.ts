// Building blocks for the classic MARG screens: the green header bar, the popup
// lists (LEDGERS / item search / BATCH / M.R.) and the red "Exit W/o Save" box.
import { openWin, esc, h, triggerEsc, getWinForElement, topWin, type Win } from './ui.ts';

export const clock = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}-${p(d.getMonth() + 1)}-${d.getFullYear()}|${d.toLocaleString('en', { weekday: 'short' })}|P| ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

/** A full-screen MARG window: no blue title bar, green section bar instead. */
export function margWin(title: string, foot = ''): Win & { bar: HTMLElement } {
  const w = openWin(title, 'full', foot) as Win & { bar: HTMLElement };
  w.el.classList.add('marg');
  return w;
}

export function margBar(title: string) {
  const el = h('div', { class: 'marg-bar' });
  el.innerHTML = `<span class="marg-bar-title">${esc(title)}</span><div class="marg-bar-right"><span class="clock">${clock()}</span><button type="button" class="marg-close-btn" title="Close / Back (Esc)" aria-label="Close" tabindex="-1">&#10006; Esc</button></div>`;
  const clockEl = el.querySelector('.clock');
  const t = setInterval(() => {
    if (!el.isConnected) { clearInterval(t); return; }
    if (clockEl) clockEl.textContent = clock();
  }, 1000);

  // Direct click listener on close button
  const closeBtn = el.querySelector('.marg-close-btn');
  closeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const winEl = el.closest('.win') as HTMLElement | null;
    const w = winEl ? getWinForElement(winEl) : topWin();
    triggerEsc(w);
  });

  return el;
}

/** A MARG popup shell (green bar + footer keys) sized to `width` or full-screen. */
export function margPop(title: string, foot: string, width?: string, full = false): Win {
  const p = openWin(title, full ? 'full' : 'mid', foot);
  p.el.classList.add('marg', 'marg-pop');
  if (full) {
    p.el.classList.remove('mid');
    p.el.classList.add('full');
    p.el.style.width = '98vw';
    p.el.style.height = '94vh';
    p.el.style.maxWidth = '98vw';
    p.el.style.maxHeight = '96vh';
  } else {
    p.el.classList.remove('mid');
    if (width) p.el.style.width = width;
  }
  p.body.style.display = 'flex';
  p.body.style.flexDirection = 'column';
  p.body.style.height = '100%';
  p.body.prepend(margBar(title));
  return p;
}

export interface PopCol<T> { title: string; get: (r: T) => unknown; width?: string; num?: boolean; cls?: (r: T) => string }

export interface PopOpts<T> {
  title: string;
  rows: T[];
  cols: PopCol<T>[];
  search: (r: T) => string;
  findLabel?: string;          // "Name ? >>", "Find Name ? >>", "Find ? >>"
  detail?: (r: T | undefined) => string;
  detailCols?: 2 | 3;
  foot: string;
  width?: string;
  height?: string;
  full?: boolean;
  rowCls?: (r: T) => string;
  extra?: string;              // text shown next to the find box, e.g. "Total : 21"
  extraHtml?: string;          // custom HTML next to find box (buttons, etc)
  initial?: string;            // text already typed by the user
  /** Extra keys. Return true when handled; return a row to select it. */
  onKey?: (k: string, cur: T | undefined, api: PopApi<T>) => boolean | void;
  /** When Enter is pressed but no items match the filter */
  onEnterNotFound?: (typed: string, api: PopApi<T>) => boolean | void;
  showHeader?: boolean;
}
export interface PopApi<T> { close: (v: T | null) => void; setRows: (rows: T[]) => void; refresh: () => void; current: () => T | undefined }

/** MARG-style chooser popup. Resolves with the selected row, or null on Esc. */
export function popList<T extends Record<string, any>>(o: PopOpts<T>): Promise<T | null> {
  return new Promise((resolve) => {
    const isFull = o.full ?? false;
    const w = openWin(o.title, isFull ? 'full' : 'mid', o.foot);
    w.el.classList.add('marg', 'marg-pop');
    if (isFull) {
      w.el.classList.remove('mid');
      w.el.classList.add('full');
      w.el.style.width = '98vw';
      w.el.style.height = '94vh';
      w.el.style.maxWidth = '98vw';
      w.el.style.maxHeight = '96vh';
    } else {
      w.el.classList.remove('mid');
      w.el.style.width = o.width ?? '900px';
      w.el.style.height = o.height ?? '';
    }
    w.body.style.height = '100%';
    w.body.style.display = 'flex';
    w.body.style.flexDirection = 'column';

    const wrap = h('div', { class: 'marg-list' });
    wrap.style.cssText = 'flex:1; display:flex; flex-direction:column; min-height:0; height:100%;';
    wrap.append(margBar(o.title));
    const rowsBox = h('div', { class: 'rows' });
    rowsBox.style.cssText = isFull ? 'flex:1; overflow:auto; min-height:0;' : `height:${o.height ? 'auto' : '320px'}`;
    const table = h('table');
    rowsBox.append(table);
    const find = h('div', { class: 'marg-find' },
      `<span>${esc(o.findLabel ?? 'Find ? >>')}</span><span class="brk">[</span>`);
    const input = h('input', { autocomplete: 'off' });
    const extraEl = h('span', { class: 'extra' });
    if (o.extraHtml) extraEl.innerHTML = o.extraHtml;
    else if (o.extra) extraEl.textContent = o.extra;
    find.append(input, h('span', { class: 'brk' }, ']'), extraEl);
    const detail = h('div', { class: `marg-detail cols${o.detailCols ?? 2}` });
    wrap.append(rowsBox, find, detail);
    if (!o.detail) detail.style.display = 'none';
    w.body.append(wrap);

    let all = o.rows;
    let view = all;
    let sel = 0;
    let done = false;
    const current = () => view[sel];
    const finish = (v: T | null) => { if (done) return; done = true; w.close(); resolve(v); };

    function render() {
      const head = o.showHeader === false ? '' :
        `<thead><tr>${o.cols.map((c) => `<th class="${c.num ? 'n' : ''}" ${c.width ? `style="width:${c.width}"` : ''}>${esc(c.title)}</th>`).join('')}</tr></thead>`;
      table.innerHTML = head + `<tbody>${view.map((r, i) => `<tr data-i="${i}" class="${i === sel ? 'sel ' : ''}${o.rowCls?.(r) ?? ''}">${
        o.cols.map((c) => `<td class="${c.num ? 'n' : ''} ${c.cls?.(r) ?? ''}">${esc(c.get(r) ?? '')}</td>`).join('')}</tr>`).join('')}</tbody>`;
      table.querySelector('tr.sel')?.scrollIntoView({ block: 'nearest' });
      if (o.detail) detail.innerHTML = o.detail(current());
    }
    function filter() {
      const q = input.value.trim().toLowerCase();
      view = !q ? all : [
        ...all.filter((r) => o.search(r).toLowerCase().startsWith(q)),
        ...all.filter((r) => !o.search(r).toLowerCase().startsWith(q) && o.search(r).toLowerCase().includes(q)),
      ];
      sel = 0;
      render();
    }
    const api: PopApi<T> = {
      close: finish,
      setRows: (rows) => { all = rows; filter(); },
      refresh: render,
      current,
    };

    input.addEventListener('input', filter);
    table.addEventListener('click', (e) => {
      const tr = (e.target as HTMLElement).closest('tr[data-i]') as HTMLElement | null;
      if (tr) { sel = Number(tr.dataset.i); render(); input.focus(); }
    });
    table.addEventListener('dblclick', () => current() && finish(current()));

    // Support clicking on [data-pop-action] buttons in extraHtml or footer
    const handleActionClick = (e: Event) => {
      const btn = (e.target as HTMLElement).closest('[data-pop-action]') as HTMLElement | null;
      if (btn) {
        e.preventDefault();
        e.stopPropagation();
        const act = btn.dataset.popAction;
        if (act === 'new') o.onKey?.('F2', current(), api);
      }
    };
    wrap.addEventListener('click', handleActionClick);
    w.el.querySelector('.win-foot')?.addEventListener('click', handleActionClick);

    if (o.initial) { input.value = o.initial; filter(); } else render();
    setTimeout(() => { input.focus(); input.select(); }, 0);

    w.onKey = (_e, k) => {
      if (o.onKey?.(k, current(), api)) return true;
      const page = Math.max(1, Math.floor(rowsBox.clientHeight / 24) - 1);
      const step: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: page, PageUp: -page };
      if (k in step && view.length) { sel = Math.min(view.length - 1, Math.max(0, sel + step[k])); render(); return true; }
      if (k === 'Ctrl+Home') { sel = 0; render(); return true; }
      if (k === 'Ctrl+End') { sel = view.length - 1; render(); return true; }
      if (k === 'Enter') {
        if (!view.length && input.value.trim() && o.onEnterNotFound) {
          if (o.onEnterNotFound(input.value.trim(), api)) return true;
        }
        if (current()) finish(current());
        return true;
      }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}

/** The red MARG message box (Exit W/o Save). Yes is focused, like Marg. */
export function margConfirm(msg: string, defaultYes = true): Promise<boolean> {
  return new Promise((resolve) => {
    const w = openWin(msg, 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    w.el.style.border = 'none';
    w.el.style.background = 'transparent';
    w.el.style.boxShadow = 'none';
    w.setFoot('');
    w.body.style.background = 'transparent';
    w.body.innerHTML = `<div class="marg-confirm"><div class="msg">${esc(msg)}</div>
      <button data-v="0">No</button> &nbsp; <button data-v="1">Yes</button></div>`;
    let done = false;
    const finish = (v: boolean) => { if (done) return; done = true; w.close(); resolve(v); };
    const btns = [...w.body.querySelectorAll('button')] as HTMLButtonElement[];
    btns.forEach((b) => b.addEventListener('click', () => finish(b.dataset.v === '1')));
    btns[defaultYes ? 1 : 0].focus();
    w.onKey = (_e, k) => {
      if (k === 'Y' || k === 'y') { finish(true); return true; }
      if (k === 'N' || k === 'n' || k === 'Escape') { finish(false); return true; }
      if (k === 'Enter') { finish(document.activeElement === btns[1]); return true; }
      if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') {
        btns[btns.indexOf(document.activeElement as HTMLButtonElement) === 0 ? 1 : 0].focus();
        return true;
      }
      return false;
    };
  });
}

let notExistOpen = false;
/**
 * "404 — NOT EXIST": shown for a key or menu item that leads nowhere (an unmapped
 * key, or a Marg option this edition doesn't have). Enter / Esc / Space closes it.
 * Only one at a time, so a burst of stray keys doesn't stack boxes.
 */
export function notExist(what = ''): Promise<void> {
  if (notExistOpen) return Promise.resolve();
  notExistOpen = true;
  return new Promise((resolve) => {
    const w = openWin('404', 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    w.el.style.border = 'none';
    w.el.style.background = 'transparent';
    w.el.style.boxShadow = 'none';
    w.setFoot('');
    w.body.style.background = 'transparent';
    w.body.innerHTML = `<div class="marg-confirm not-exist"><div class="code">404</div><div class="msg">NOT EXIST</div>
      ${what ? `<div class="what">${esc(what)}</div>` : ''}<button>OK</button></div>`;
    const btn = w.body.querySelector('button') as HTMLButtonElement;
    let done = false;
    const finish = () => { if (done) return; done = true; notExistOpen = false; w.close(); resolve(); };
    btn.addEventListener('click', finish);
    btn.focus();
    w.onKey = (_e, k) => {
      if (k === 'Enter' || k === 'Escape' || k === 'Space') { finish(); return true; }
      return true;   // swallow everything else while the box is up
    };
  });
}

/**
 * Small MARG number box ("MRP for Search", "No. of Copies"): a label and one blue
 * number field. Enter returns the number, Esc returns null.
 */
export function margNumber(label: string, def = 1): Promise<number | null> {
  return new Promise((resolve) => {
    const w = openWin(label, 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    w.el.style.border = 'none';
    w.el.style.background = 'transparent';
    w.el.style.boxShadow = 'none';
    w.setFoot('');
    w.body.style.background = 'transparent';
    w.body.innerHTML = `<div class="marg-ask" style="display:flex;align-items:center;gap:6px"><label>${esc(label)}</label><input class="marg-amt" value="${def}"></div>`;
    const inp = w.body.querySelector('input') as HTMLInputElement;
    inp.focus();
    inp.select();
    let done = false;
    const finish = (v: number | null) => { if (done) return; done = true; w.close(); resolve(v); };
    w.onKey = (_e, k) => {
      if (k === 'Enter') { const n = Math.floor(Number(inp.value)); finish(Number.isFinite(n) && n > 0 ? n : 0); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}

/** Like margNumber, but returns the typed text ("Batch", "MRP for Search" with decimals). Esc returns null. */
export function margAsk(label: string, def = ''): Promise<string | null> {
  return new Promise((resolve) => {
    const w = openWin(label, 'small');
    w.el.classList.add('marg');
    w.el.classList.remove('small');
    w.el.style.border = 'none';
    w.el.style.background = 'transparent';
    w.el.style.boxShadow = 'none';
    w.setFoot('');
    w.body.style.background = 'transparent';
    w.body.innerHTML = `<div class="marg-ask" style="display:flex;align-items:center;gap:6px"><label>${esc(label)}</label><input class="marg-amt" value="${esc(def)}" style="width:160px"></div>`;
    const inp = w.body.querySelector('input') as HTMLInputElement;
    inp.focus();
    inp.select();
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; w.close(); resolve(v); };
    w.onKey = (_e, k) => {
      if (k === 'Enter') { finish(inp.value.trim()); return true; }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}
