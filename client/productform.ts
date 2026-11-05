// NEW PRODUCT / MODIFY PRODUCT — the MARG product master screen: the header block
// (Status, Type, Hide, Product, Packing … Item MID) over three columns of tax, rate and
// discount fields. Enter / ↓ moves to the next field; Enter on the last one asks "Save ?".
// Fields the item table has no column for are kept in items.details (JSON).
import { api, esc, h, toast, confirmBox } from './ui.ts';
import { margPop, margConfirm } from './margui.ts';
import { seeCost } from './session.ts';
import type { Item } from './masters.ts';
import { isJewellery } from './jewellery.ts';

type Kind = 'text' | 'num' | 'sel';
interface Fld { k: string; label: string; kind: Kind; opts?: string[]; dec?: number; w?: string; upper?: boolean; small?: boolean; ro?: boolean; after?: Fld[]; sep?: string }

const T = (k: string, label: string, o: Partial<Fld> = {}): Fld => ({ k, label, kind: 'text', upper: true, ...o });
const N = (k: string, label: string, dec = 2, o: Partial<Fld> = {}): Fld => ({ k, label, kind: 'num', dec, ...o });
const S = (k: string, label: string, opts: string[], w = '58px', o: Partial<Fld> = {}): Fld => ({ k, label, kind: 'sel', opts, w, ...o });
const YN = ['Yes', 'No'];
const NOYES = ['No', 'Yes'];

// Header block: [left, middle, right] per row.
const TOP: (Fld | null)[][] = [
  [S('status', 'STATUS', ['CONTINUE', 'CLOSE'], '118px'), S('type', 'TYPE', ['NORMAL', 'PROHIBITED'], '88px'), S('hide', 'HIDE', ['YES', 'NO'], '58px')],
  [T('name', 'PRODUCT', { w: '380px' }), null, T('pack', 'PACKING', { w: '200px' })],
  [T('barcode', 'BARCODE', { w: '260px' }), null, T('code', 'CODE', { w: '160px' })],
  [T('unit', 'UNIT', { w: '120px' }), null, S('decimal', 'DECIMAL', NOYES)],
  [T('fast_search', 'FAST SEARCH', { w: '260px' }), null, null],
  [S('color_type', 'COLOR TYPE', ['NORMAL', 'RED', 'BLUE', 'GREEN', 'PURPLE'], '125px'), null, S('item_type', 'ITEM TYPE', ['1 NORMAL', '2 COSTLY ITEMS', '3 8° STORAGE', '4 24° STORAGE'], '148px', { small: true })],
  [S('company_on', 'COMPANY', YN, '58px', { after: [T('company', '', { w: '230px' })] }), null, T('rack', 'RACK NO.', { w: '160px' })],
  [S('salt_on', 'SALT', YN, '58px', { after: [T('salt', '', { w: '230px' })] }), null, T('group', 'GROUP', { w: '200px' })],
  [S('hsn_on', 'HSN/SAC', YN, '58px', { after: [T('hsn', '', { w: '120px' })] }), null, T('expiry', 'EXPIRY (MM/YY)', { w: '110px' })],
  [T('item_mid', 'ITEM MID', { w: '200px' }), null, T('batch', 'BATCH NO.', { w: '110px' })],
];

// Three columns below, 12 rows each (null = empty line).
const COLS: (Fld | null)[][] = [
  [S('local', 'LOCAL', ['Taxable', 'Tax Paid', 'Exempted'], '88px'), S('central', 'CENTRAL', ['Taxable', 'Exempted'], '88px'), N('csr', 'C.S.R.'),
   N('mrp', 'M.R.P.'), N('sale_rate', 'Rate-A'), N('conv_box', 'CONV.BOX', 3), N('min_stock', 'MINIMUM QTY.', 0, { small: true }),
   N('vol_disc', 'VOLUME DISCOUNT', 3, { small: true }), N('item_disc', 'ITEM DISCOUNT', 2, { small: true }), N('max_disc', 'MAXIMUM DISCOUNT', 2, { small: true, sep: '%' }),
   N('min_margin', 'MINIMUM MARGIN %', 2, { small: true }), S('narcotic', 'NARCOTIC', NOYES)],
  [N('sgst', 'SGST %'), N('igst', 'IGST %'), N('opening_stock', 'OPENING QTY', 0, { small: true }), N('purchase_rate', 'P.RATE'), N('rate_b', 'Rate-B'),
   N('def_sale_qty', 'DEF.SALE QTY', 3, { small: true }), N('max_qty', 'MAXIMUM QTY.', 0, { small: true }), N('on_qty', 'On Qty.', 1),
   N('special_disc', 'SPECIAL DISC.', 2, { small: true }), N('purc_disc', 'PURC.Disc.', 2, { small: true }), N('disc_less', 'DISC. LESS', 2, { small: true })],
  [N('cgst', 'CGST %', 2, { ro: true }), N('cess', 'CESS%', 2, { sep: 'A:', after: [N('cess_amt', '+', 3)] }), null, N('cost', 'COST/', 5),
   N('rate_c', 'Rate-C'), S('negative', 'NEGATIVE', NOYES), N('reorder_qty', 'REORDER QTY.', 0, { small: true, after: [N('reorder_days', 'DAYS', 0)] }),
   S('discount', 'DISCOUNT', ['No Discount', 'No Scheme', 'No Sch+Disc', 'Applicable'], '118px', { small: true }),
   N('on_quantity', 'ON QUANTITY', 0, { small: true }), S('f6_rate', 'F6/RATE±', ['YES', 'NO'], '58px', { small: true }),
   T('manufacturer', 'Manufactur F3', { small: true, w: '200px' }),
   S('schedule_h1', 'SCHEDULE H1', NOYES, '58px', { small: true, after: [S('schedule_h1_type', '', ['Normal', 'Schedule', 'TB', 'Tramadol'], '88px')] })],
];
// SCHEDULE H sits in the middle column's last line.
COLS[1].push(S('schedule_h', 'SCHEDULE H', NOYES, '58px', { small: true }));

// JEWELLERY business: the item's own jewellery detail (as in MARG's jewellery item setup —
// purity, making "charge on", polish, weight, Diamond / Stone Yes-No, tray). The sale / purchase
// DESCRIPTION window starts from these. Kept in items.details like the other extra fields.
/** Three columns, as the block above (Enter walks down each column). */
const JW_COLS: Fld[][] = [
  [S('jw_purity_unit', 'PURITY ON', ['%', 'K']), S('jw_making_unit', 'MAKING ON', ['GM', '%', 'PCS', 'FIX'], '68px'), S('jw_polish_unit', 'POLISH ON', ['%', 'GWt'], '68px'), T('jw_tray', 'TRAY NAME', { w: '150px' })],
  [N('jw_purity', 'PURITY', 3), N('jw_making', 'MAKING', 2), N('jw_polish', 'POLISH', 3)],
  [N('jw_weight', 'WEIGHT (GM)', 3, { small: true }), S('jw_diamond', 'DIAMOND', NOYES), S('jw_stone', 'STONE', NOYES)],
];
const JW_DEFAULTS: Record<string, string> = {
  jw_purity_unit: '%', jw_purity: '100', jw_making_unit: '%', jw_making: '0', jw_polish_unit: '%', jw_polish: '0',
  jw_weight: '0', jw_diamond: 'No', jw_stone: 'No', jw_tray: '',
};

const DEFAULTS: Record<string, string> = {
  status: 'CONTINUE', type: 'NORMAL', hide: 'NO', unit: 'PCS', decimal: 'No', color_type: 'NORMAL', item_type: '1 NORMAL',
  company_on: 'Yes', salt_on: 'Yes', hsn_on: 'Yes', local: 'Taxable', central: 'Taxable', narcotic: 'No', negative: 'No',
  discount: 'Applicable', f6_rate: 'YES', schedule_h: 'No', schedule_h1: 'No', schedule_h1_type: 'Normal',
};
const ITEM_COLS = ['name', 'company', 'unit', 'pack', 'hsn', 'mrp', 'sale_rate', 'purchase_rate', 'min_stock', 'reorder_qty', 'expiry', 'batch', 'opening_stock'];

const fmt = (v: unknown, dec: number) => (Number(v) || 0).toFixed(dec);

/** Opens NEW PRODUCT (no id) or MODIFY PRODUCT; resolves the saved item, or null on Esc. */
export async function productScreen(existing?: Partial<Item> & { details?: string }): Promise<Item | null> {
  const company = await api<{ business_type?: string }>('/company').catch(() => ({} as { business_type?: string }));
  const jewel = isJewellery(company.business_type);
  return new Promise((resolve) => {
    const isNew = !existing?.id;
    let det: Record<string, string> = {};
    try { det = JSON.parse(existing?.details || '{}'); } catch { /* bad JSON: start empty */ }
    const v: Record<string, string> = { ...DEFAULTS, ...(jewel ? JW_DEFAULTS : {}), ...det };
    for (const k of ITEM_COLS) if (existing && (existing as Record<string, unknown>)[k] != null) v[k] = String((existing as Record<string, unknown>)[k]);
    const gst = Number(existing?.gst_rate ?? 0);
    v.igst = String(gst); v.sgst = String(gst / 2); v.cgst = String(gst / 2);
    const cost = seeCost();

    const expShort = (e?: string) => {
      if (!e) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(e)) return `${e.slice(5, 7)}/${e.slice(2, 4)}`;
      return e;
    };
    if (v.expiry) v.expiry = expShort(v.expiry);

    const title = isNew ? 'NEW PRODUCT' : 'MODIFY PRODUCT';
    const p = margPop(title, '', '1000px');
    p.el.classList.add('marg-prod');

    const field = (f: Fld): string => {
      const hidden = !cost && (f.k === 'purchase_rate' || f.k === 'cost');
      let el: string;
      if (f.kind === 'sel') {
        el = `<select data-k="${f.k}" style="width:${f.w}">${f.opts!.map((o) => `<option${o === v[f.k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else if (f.kind === 'num') {
        el = `<input data-k="${f.k}" class="pf-num" data-dec="${f.dec}" value="${hidden ? '' : fmt(v[f.k], f.dec!)}" autocomplete="off"${f.ro || hidden ? ' readonly tabindex="-1"' : ''}>`;
      } else {
        el = `<input data-k="${f.k}" class="pf-txt${f.upper ? ' up' : ''}" value="${esc(v[f.k] ?? '')}" autocomplete="off" spellcheck="false" style="width:${f.w ?? '200px'}">`;
      }
      const more = (f.after ?? []).map((a) => `${a.label ? `<span class="pf-l in${a.small ? ' sm' : ''}">${esc(a.label)}${a.label === '+' ? '' : ' :'}</span>` : ''}${field({ ...a, after: [] })}`).join('');
      return el + more;
    };
    const cell = (f: Fld | null, cls = '') => !f ? `<div class="pf-cell ${cls}"></div>` :
      `<div class="pf-cell ${cls}"><span class="pf-l${f.small ? ' sm' : ''}">${esc(f.label)}</span><span class="pf-c">${f.sep ?? ':'}</span><span class="pf-v">${field(f)}</span></div>`;

    const top = h('div', { class: 'pf-top' });
    top.innerHTML = TOP.map((r) => r[1] || r[0]?.k === 'status'
      ? `${cell(r[0])}${cell(r[1], 'mid')}${cell(r[2], 'right')}`
      : `${cell(r[0], 'wide')}${cell(r[2], 'right')}`).join('');
    const bottom = h('div', { class: 'pf-bottom' });
    bottom.innerHTML = COLS.map((c) => `<div class="pf-col">${c.map((f) => cell(f)).join('')}</div>`).join('');
    p.body.append(top, bottom);
    if (jewel) {
      const jw = h('div', { class: 'pf-jw' });
      jw.innerHTML = `<div class="pf-jw-h">JEWELLERY DETAIL</div><div class="pf-bottom">${
        JW_COLS.map((c) => `<div class="pf-col">${c.map((f) => cell(f)).join('')}</div>`).join('')}</div>`;
      p.body.append(jw);
    }

    const inputs = [...p.body.querySelectorAll('input:not([readonly]), select')] as (HTMLInputElement | HTMLSelectElement)[];
    const byKey = (k: string) => p.body.querySelector(`[data-k="${k}"]`) as HTMLInputElement | HTMLSelectElement;
    p.body.querySelectorAll<HTMLInputElement>('input.up').forEach((el) => el.addEventListener('input', () => {
      const at = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(at, at);
    }));
    p.body.querySelectorAll<HTMLInputElement>('input.pf-num').forEach((el) => {
      el.addEventListener('focus', () => el.select());
      el.addEventListener('blur', () => { if (!el.readOnly) el.value = fmt(el.value, Number(el.dataset.dec)); });
    });
    // SGST = CGST = half of IGST.
    const sg = byKey('sgst') as HTMLInputElement, ig = byKey('igst') as HTMLInputElement, cg = byKey('cgst') as HTMLInputElement;
    sg.addEventListener('input', () => { const n = Number(sg.value) || 0; cg.value = fmt(n, 2); ig.value = fmt(n * 2, 2); });
    ig.addEventListener('input', () => { const n = Number(ig.value) || 0; cg.value = fmt(n / 2, 2); sg.value = fmt(n / 2, 2); });

    // Expiry MM/YY auto-format on blur
    const expEl = byKey('expiry') as HTMLInputElement | null;
    if (expEl) {
      expEl.addEventListener('blur', () => {
        const val = expEl.value.trim();
        if (!val) return;
        const m = val.match(/^(\d{1,2})[/-]?(\d{2}|\d{4})$/);
        if (m) {
          const mm = String(Number(m[1])).padStart(2, '0');
          const yy = m[2].length === 4 ? m[2].slice(2) : m[2].padStart(2, '0');
          if (Number(mm) >= 1 && Number(mm) <= 12) {
            expEl.value = `${mm}/${yy}`;
          }
        }
      });
    }

    const start = byKey('name') as HTMLInputElement;
    setTimeout(() => { start.focus(); start.select(); }, 0);
    let dirty = false;
    p.body.addEventListener('input', () => { dirty = true; });
    p.body.addEventListener('change', () => { dirty = true; });

    let done = false;
    const finish = (r: Item | null) => { if (done) return; done = true; p.close(); resolve(r); };
    const save = async () => {
      const name = start.value.trim();
      if (!name) { toast('Enter the Product name', true); start.focus(); return; }
      if (!(await confirmBox('Save ?'))) { inputs[inputs.length - 1].focus(); return; }
      const out: Record<string, string> = {};
      for (const el of p.body.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]')) out[el.dataset.k!] = el.value.trim();
      const { sgst: _s, cgst: _c, igst, ...rest } = out;
      const gstVal = Number(igst) || (Number(_s) * 2) || (Number(_c) * 2) || 0;
      const body: Record<string, unknown> = { gst_rate: gstVal, opening_stock: existing?.opening_stock ?? 0 };
      const details: Record<string, string> = { ...det };
      for (const [k, val] of Object.entries(rest)) {
        if (ITEM_COLS.includes(k)) body[k] = ['mrp', 'sale_rate', 'purchase_rate', 'min_stock', 'reorder_qty', 'opening_stock'].includes(k) ? Number(val) || 0 : val;
        else details[k] = val;
      }
      body.name = name;
      if (!cost) { delete body.purchase_rate; delete details.cost; if (isNew) body.purchase_rate = 0; }

      // Validate & normalize Expiry
      let cleanExp = out.expiry?.trim() || '';
      if (cleanExp) {
        const m = cleanExp.match(/^(\d{1,2})[/-]?(\d{2}|\d{4})$/);
        if (m) {
          const mm = Number(m[1]);
          const yy = m[2].length === 2 ? 2000 + Number(m[2]) : Number(m[2]);
          if (mm >= 1 && mm <= 12) {
            const lastDay = new Date(yy, mm, 0).getDate();
            cleanExp = `${yy}-${String(mm).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
          } else {
            toast('Enter valid expiry MM/YY (month 01-12)', true);
            expEl?.focus();
            return;
          }
        } else if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanExp)) {
          toast('Enter valid expiry as MM/YY, e.g. 12/28', true);
          expEl?.focus();
          return;
        }
      }
      body.expiry = cleanExp;
      if (out.batch) body.batch = out.batch.trim().toUpperCase();
      if (out.opening_stock) body.opening_stock = Number(out.opening_stock) || 0;

      body.details = details;
      try {
        const r = isNew ? await api<{ id: number }>('/items', { method: 'POST', body }) : await api(`/items/${existing!.id}`, { method: 'PUT', body });
        const id = isNew ? (r as { id: number }).id : existing!.id;
        toast(isNew ? 'Product saved' : 'Product updated');
        finish(await api<Item>(`/items/${id}`));
      } catch (e) { toast((e as Error).message, true); }
    };

    p.beforeEsc = async () => {
      if (!dirty) { finish(null); return true; }
      const y = await margConfirm('Exit W/o Save');
      if (y) finish(null);
      return y;
    };

    p.onKey = (e, k) => {
      const t = e.target as HTMLElement;
      const i = inputs.indexOf(t as HTMLInputElement);
      if (k === 'Escape') {
        p.beforeEsc!();
        return true;
      }
      if (i < 0) return false;
      const isSel = t.tagName === 'SELECT';
      if (k === 'Enter' || k === 'Tab' || (k === 'ArrowDown' && !isSel)) {
        if (i === inputs.length - 1) save(); else { const n = inputs[i + 1]; n.focus(); if (n instanceof HTMLInputElement) n.select(); }
        return true;
      }
      if (k === 'Shift+Tab' || (k === 'ArrowUp' && !isSel)) {
        const n = inputs[Math.max(0, i - 1)]; n.focus(); if (n instanceof HTMLInputElement) n.select();
        return true;
      }
      if (k === 'Ctrl+W' || k === 'Ctrl+S' || k === 'PageDown') { save(); return true; }   // MARG saves with Ctrl+W → "Yes"
      return false;
    };
  });
}
