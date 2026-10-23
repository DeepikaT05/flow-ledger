// LIST OF COMPANIES → F2 COMPANY CREATION / F3 COMPANY ALTERATION, laid out as in MARG:
// two columns of fields, the State Code's list on the right, Enter / ↓ to the next field,
// "Save ?" after the last one.
import { api, esc, h, toast, confirmBox, openWin, triggerEsc } from './ui.ts';
import { margBar } from './margui.ts';

export interface CompanyRec {
  id: number; name: string; station: string; address1: string; address2: string; gstin: string; state: string;
  details?: string | Record<string, string>;
}

// GST state codes, as in MARG's State Code's panel (28 is left blank there).
export const STATE_CODES: [string, string][] = [
  ['00', 'Other State'], ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'],
  ['05', 'Uttarakhand'], ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'],
  ['11', 'Sikkim'], ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'],
  ['17', 'Meghalaya'], ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Orissa'], ['22', 'Chhattisgarh'],
  ['23', 'Madhya Pradesh'], ['24', 'Gujarat'], ['25', 'Daman and Diu'], ['26', 'Dadra and Nagar Haveli'], ['27', 'Maharashtra'],
  ['28', ''], ['29', 'Karnataka'], ['30', 'Goa'], ['31', 'Lakshadweep'], ['32', 'Kerala'], ['33', 'Tamil Nadu'], ['34', 'Puducherry'],
  ['35', 'Andaman and Nicobar Islands'], ['36', 'Telangana'], ['37', 'Andhra Pradesh'], ['38', 'Ladakh'],
];
const stateCode = (name: string) => STATE_CODES.find(([, n]) => n && n.toLowerCase() === name.toLowerCase())?.[0] ?? '';
const stateLabel = (name: string) => { const c = stateCode(name); return c ? `${c}-${name.toUpperCase()}` : name.toUpperCase(); };
/** "22", "22-CHHATTISG…" or "chhat" → "Chhattisgarh". */
function findState(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t) return '';
  const code = t.match(/^(\d{1,2})/)?.[1];
  if (code) return STATE_CODES.find(([c, n]) => n && Number(c) === Number(code))?.[1] ?? null;
  return STATE_CODES.find(([, n]) => n && n.toLowerCase().startsWith(t))?.[1] ?? null;
}

const COUNTRIES = ['India', 'Nepal', 'Bhutan', 'Bangladesh', 'Sri Lanka', 'Afghanistan', 'U.A.E.', 'Others'];
// Business Type, as in MARG's COMPANY CREATION (the type picks the features to switch on).
const BUSINESS_TYPES = [
  'PHARMACY SHOP (CHEMIST)', 'PHARMA DISTRIBUTION', 'PHARMA MANUFACTURING', 'HOSPITAL / CLINIC',
  'FMCG DISTRIBUTION', 'FMCG RETAIL', 'SUPERMARKET / MART', 'GROCERY / KIRANA',
  'AGRO (SEEDS / FERTILIZER / PESTICIDES)', 'GARMENTS', 'FOOTWEAR', 'TEXTILE',
  'ELECTRONICS', 'MOBILE', 'COMPUTER', 'ELECTRICAL', 'HARDWARE / SANITARY', 'PAINTS',
  'AUTOMOBILE', 'AUTO PARTS', 'BOOKS & STATIONERY', 'JEWELLERY', 'COSMETICS', 'OPTICALS',
  'RESTAURANT', 'HOTEL & RESORTS', 'BAKERY / SWEETS', 'MANUFACTURING', 'SERVICES', 'BILLING (GENERAL)',
];
// Creation asks Working Style + Selection; alteration shows the two combined.
const STYLES_NEW = ['Normal (W/o Secondary)', 'Secondary (Batch/Mrp/Size/Serial/etc)'];
const SELECTIONS = ['Self', 'Fifo', 'Manual'];
const STYLES_ALT = ['Normal W/o Secondary', 'Fifo-Secondary', 'Self-Secondary', 'Manual-Secondary'];
const DATE_TYPES = ['1 English', '2 Bikram Samwat', '3 Afghan Calendar'];
const CO_TYPES = ['1 Registered', '2 Composition', '3 Un-Registered'];
const TAX_STRUCT = ['Product Wise', 'Bill Wise'];
const STOCK_VALUE = ['Last Purchase', 'Average Rate', 'Self Feeding'];
const LICENCES: [string, string][] = [['vat', 'VAT No.'], ['dl', 'D.L.No.'], ['mfg', 'Mfg.Lic.No.'], ['lst', 'LST No.'], ['stax', 'Service Tax'], ['food', 'Food Lic.No.']];

type F = { k: string; label: string; star?: boolean; opts?: string[]; w?: string; upper?: boolean; date?: boolean; pass?: boolean; ro?: boolean };

const dmy = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
const iso = (t: string) => { const m = t.trim().match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/); return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : ''; };

/** Opens the screen; resolves the saved company's id, or null on Esc. */
export function companyScreen(c?: CompanyRec): Promise<number | null> {
  return new Promise((resolve) => {
    const isNew = !c;
    const det: Record<string, string> = typeof c?.details === 'string' ? safeJson(c.details) : { ...(c?.details ?? {}) };
    const now = new Date();
    const fy = now.getMonth() < 3 ? now.getFullYear() - 1 : now.getFullYear();
    const v: Record<string, string> = {
      country: 'India', business: BUSINESS_TYPES[0], style: STYLES_NEW[1], selection: 'Self', style_alt: 'Self-Secondary',
      date_type: DATE_TYPES[0], co_type: CO_TYPES[0], tax_structure: TAX_STRUCT[0], stock_value: STOCK_VALUE[0], inventory: 'Yes',
      fy_from: dmy(`${fy}-04-01`), fy_to: dmy(`${fy + 1}-03-31`), state: 'Chhattisgarh',
      ...det,
      ...(c ? { name: c.name, branch: c.station, address1: c.address1 ?? '', address2: c.address2 ?? '', gstin: c.gstin ?? '', state: c.state || det.state || '' } : {}),
    };
    if (c && !det.style_alt) v.style_alt = v.style === STYLES_NEW[0] ? STYLES_ALT[0] : `${v.selection || 'Self'}-Secondary`;

    // [left field, right field] per row, top to bottom — matching Marg screenshot
    const L = (k: string, label: string, o: Partial<F> = {}): F => ({ k, label, ...o });
    const rows: [F | null, F | null][] = [
      [L('name', 'Company Name', { star: true, upper: true, w: '620px' }), null],
      [L('address1', 'Address', { star: true, w: '620px' }), null],
      [L('address2', '', { star: true, w: '620px' }), null],
      [L('address3', '', { star: true, w: '620px' }), null],
      [L('phone', 'Phone No.', { star: true, w: '240px' }), null],
      [L('branch', 'Branch Code', { star: true, upper: true, w: '200px' }), null],
      [L('fax', 'Fax No.', { w: '240px' }), null],
      [L('website', 'Website', { w: '380px' }), null],
      [L('email', 'E-Mail', { w: '380px' }), null],
      [L('country', 'Country', { opts: COUNTRIES, w: '145px' }), L('state', 'State', { w: '220px' })],
      ...(isNew
        ? [[L('business', 'Business Type', { opts: BUSINESS_TYPES, w: '340px' }), L('date_type', 'Date Type', { opts: DATE_TYPES, w: '160px' })],
           [L('style', 'Working Style', { opts: STYLES_NEW, w: '340px' }), L('selection', 'Selection', { opts: SELECTIONS, w: '130px' })]] as [F, F][]
        : [[L('style_alt', 'Working Style', { opts: STYLES_ALT, w: '240px' }), L('date_type', 'Date Type', { opts: DATE_TYPES, w: '160px' })]] as [F, F][]),
      [L('gstin', 'GSTIN', { upper: true, w: '240px' }), L('gst_date', isNew ? 'Exp.Date' : 'Date', { date: true, w: '130px' })],
      ...LICENCES.map(([k, label]) => [L(k, label, { upper: true, w: '240px' }), L(`${k}_exp`, 'Exp.Date', { date: true, w: '130px' })] as [F, F]),
      [L('jurisdiction', 'Jurisdiction', { upper: true, w: '240px' }), L('co_type', 'Company', { opts: CO_TYPES, w: '130px' })],
      ...(isNew
        ? [[L('tax_structure', 'Tax Structure', { opts: TAX_STRUCT, w: '340px' }), L('stock_value', 'Valuation', { opts: STOCK_VALUE, w: '140px' })]] as [F, F][]
        : [[L('tax_structure', 'Tax Structure', { opts: TAX_STRUCT, w: '240px' }), L('inventory', 'Inventory', { opts: ['Yes', 'No'], w: '58px' })],
           [L('stock_value', 'Stock Value', { opts: STOCK_VALUE, w: '240px' }), null]] as [F, F | null][]),
      [L('fy', isNew ? 'Financial Year' : 'Current F.Year'), L('password', 'Password', { pass: true, w: '160px' })],
      [L('datadir', 'Data Directory', { ro: true }), null],
    ];

    const w = openWin(isNew ? 'COMPANY CREATION' : 'COMPANY ALTERATION', 'full');
    w.el.classList.add('marg', 'marg-coform');
    w.setFoot(
      `<span class="help-badge">HELP</span>` +
      `<span><b>F8/Enter</b>-Select</span><span><b>F2/Ctrl+W</b>-Save</span><span><b>Esc</b>-Exit</span>` +
      `<div class="cf-foot-actions" style="margin-left:auto;display:flex;gap:10px">` +
        `<button type="button" class="cf-btn-save">Save</button>` +
        `<button type="button" class="cf-btn-cancel">Cancel</button>` +
      `</div>`
    );

    const main = h('div', { class: 'cf-main' });
    main.append(margBar(isNew ? 'COMPANY CREATION' : 'COMPANY ALTERATION'));
    const grid = h('div', { class: 'cf-grid' });
    main.append(grid);
    const side = h('div', { class: 'cf-states' });
    side.innerHTML = `<div class="cf-states-head">State Code's</div><div class="cf-states-list">${STATE_CODES.map(([code, n]) =>
      `<div data-s="${esc(n)}" class="${n === v.state ? 'sel' : ''}">${n ? `${code}-${esc(n)}` : '&nbsp;'}</div>`).join('')}</div>`;
    w.body.append(main, side);

    const padLabel = (txt: string, len = 14) => txt.padEnd(len, ' ');
    const cell = (f: F | null, right: boolean) => {
      if (!f) return '<div class="cf-cell right empty"></div>';
      const labelText = padLabel(f.label, 14);
      const star = f.star ? '*' : ' ';
      const lbl = `<span class="cf-l">${esc(labelText)}</span><span class="cf-star">${star}</span><span class="cf-c">:</span>`;
      let val: string;
      if (f.k === 'fy') {
        val = `<span class="cf-v cf-fy"><input data-k="fy_from" value="${esc(v.fy_from)}" class="cf-txt" style="width:125px"${isNew ? '' : ' readonly tabindex="-1"'}> -<input data-k="fy_to" value="${esc(v.fy_to)}" class="cf-txt" style="width:125px"${isNew ? '' : ' readonly tabindex="-1"'}></span>`;
      } else if (f.k === 'datadir') {
        val = '<span class="cf-v cf-ro">data</span>';
      } else if (f.opts) {
        val = `<select data-k="${f.k}" class="cf-sel" style="width:${f.w || 'auto'}">${f.opts.map((o) => `<option${o === v[f.k] ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
      } else {
        const shown = f.k === 'state' ? stateLabel(v.state ?? '') : (v[f.k] ?? '');
        const defW = right ? '140px' : (f.star && (f.k === 'name' || f.k.startsWith('address')) ? '620px' : (f.w || '240px'));
        val = `<input data-k="${f.k}" class="cf-txt${f.date ? ' cf-date' : ''}" ${f.pass ? 'type="password"' : ''} value="${esc(shown)}" autocomplete="off" spellcheck="false" style="width:${f.w || defW}">`;
      }
      return `<div class="cf-cell ${right ? 'right' : 'left'}">${lbl}<div class="cf-val">${val}</div></div>`;
    };

    grid.innerHTML = rows.map(([a, b]) => {
      if (!b) return `<div class="cf-row full">${cell(a, false)}</div>`;
      return `<div class="cf-row split">${cell(a, false)}${cell(b, true)}</div>`;
    }).join('');

    const inputs = [...grid.querySelectorAll('input:not([readonly]), select')] as (HTMLInputElement | HTMLSelectElement)[];
    const live = () => inputs.filter((el) => !el.disabled);
    const byKey = (k: string) => grid.querySelector(`[data-k="${k}"]`) as HTMLInputElement | HTMLSelectElement;
    // Selection (Self / Fifo / Manual) works only with a Secondary (batch-wise) Working Style.
    const styleSel = grid.querySelector('[data-k="style"]') as HTMLSelectElement | null;
    const selSel = grid.querySelector('[data-k="selection"]') as HTMLSelectElement | null;
    const syncSel = () => { if (styleSel && selSel) selSel.disabled = styleSel.value === STYLES_NEW[0]; };
    styleSel?.addEventListener('change', syncSel);
    for (const f of rows.flat()) {
      if (f?.upper) { const el = byKey(f.k) as HTMLInputElement; el?.addEventListener('input', () => { const p = el.selectionStart; el.value = el.value.toUpperCase(); el.setSelectionRange(p, p); }); }
    }
    const stateI = byKey('state') as HTMLInputElement;
    const pickState = (name: string) => {
      v.state = name;
      stateI.value = stateLabel(name);
      const gst = byKey('gstin') as HTMLInputElement;
      const code = stateCode(name);
      if (code && (!gst.value || /^\d{0,2}$/.test(gst.value))) gst.value = code;   // GSTIN starts with the state code
      side.querySelectorAll('[data-s]').forEach((d) => d.classList.toggle('sel', (d as HTMLElement).dataset.s === name));
    };
    pickState(v.state ?? '');
    stateI.addEventListener('focus', () => {
      stateI.value = stateCode(v.state) || v.state;
      stateI.select();
      side.querySelector(`[data-s="${CSS.escape(v.state)}"]`)?.scrollIntoView({ block: 'nearest' });
    });
    stateI.addEventListener('input', () => {
      const s = findState(stateI.value);
      if (s) {
        side.querySelectorAll('[data-s]').forEach((d) => d.classList.toggle('sel', (d as HTMLElement).dataset.s === s));
        side.querySelector('[data-s].sel')?.scrollIntoView({ block: 'nearest' });
      }
    });
    const commitState = () => {
      const s = findState(stateI.value);
      if (s === null) { toast('Enter a State Code from the list on the right', true); return false; }
      pickState(s);
      return true;
    };
    side.addEventListener('mousedown', (e) => {
      const d = (e.target as HTMLElement).closest('[data-s]') as HTMLElement | null;
      if (!d?.dataset.s) return;
      e.preventDefault();
      pickState(d.dataset.s);
      byKey(isNew ? 'business' : 'style_alt').focus();
    });

    const focusAt = (i: number) => { const l = live(); const el = l[Math.max(0, Math.min(l.length - 1, i))]; el.focus(); if (el instanceof HTMLInputElement) el.select(); };
    syncSel();
    setTimeout(() => focusAt(0), 0);

    let done = false;
    const finish = (id: number | null) => { if (done) return; done = true; w.close(); resolve(id); };

    const btnSave = w.el.querySelector('.cf-btn-save');
    const btnCancel = w.el.querySelector('.cf-btn-cancel');
    btnSave?.addEventListener('click', (e) => { e.preventDefault(); save(); });
    btnCancel?.addEventListener('click', (e) => { e.preventDefault(); triggerEsc(w); });

    const collect = () => {
      const out: Record<string, string> = {};
      for (const el of inputs) if (el.dataset.k !== 'state') out[el.dataset.k!] = el.value.trim();
      out.state = v.state;
      return out;
    };
    const save = async () => {
      const f = collect();
      const need: [string, string][] = isNew
        ? [['name', 'Company Name'], ['address1', 'Address'], ['phone', 'Phone No.'], ['branch', 'Branch Code']]
        : [['name', 'Company Name'], ['branch', 'Branch Code']];
      const miss = need.find(([k]) => !f[k]);
      if (miss) { toast(`${miss[1]} is required`, true); byKey(miss[0]).focus(); return; }
      for (const k of ['gst_date', ...LICENCES.map(([l]) => `${l}_exp`)]) {
        if (f[k] && !iso(f[k])) { toast('Enter dates as DD/MM/YYYY', true); byKey(k).focus(); return; }
      }
      let fyStart = '', fyEnd = '';
      if (isNew) {
        fyStart = iso(f.fy_from); fyEnd = iso(f.fy_to);
        if (!fyStart || !fyEnd || fyEnd <= fyStart) { toast('Enter the Financial Year as DD/MM/YYYY - DD/MM/YYYY', true); byKey('fy_from').focus(); return; }
      }
      if (!(await confirmBox('Save ?'))) { focusAt(inputs.length - 1); return; }
      // Alteration's combined Working Style keeps the creation pair in step, and vice versa.
      if (isNew) f.style_alt = f.style === STYLES_NEW[0] ? STYLES_ALT[0] : `${f.selection}-Secondary`;
      else { const s = f.style_alt; f.style = s === STYLES_ALT[0] ? STYLES_NEW[0] : STYLES_NEW[1]; if (s !== STYLES_ALT[0]) f.selection = s.split('-')[0]; }
      const { name, branch, address1, address2, gstin, state, fy_from: _a, fy_to: _b, ...rest } = f;
      const details = { ...det, ...rest };
      const body = { name, station: branch, address1, address2, gstin, state, details, ...(isNew ? { fy_start: fyStart, fy_end: fyEnd } : {}) };
      try {
        if (isNew) { const r = await api<{ id: number }>('/companies', { method: 'POST', body }); toast('Company created'); finish(r.id); }
        else { await api(`/companies/${c!.id}`, { method: 'PUT', body }); toast('Company updated'); finish(c!.id); }
      } catch (e) { toast((e as Error).message, true); }
    };

    w.onKey = (e, k) => {
      const t = e.target as HTMLElement;
      const i = live().indexOf(t as HTMLInputElement);
      if (i < 0) return false;
      if (k === 'Enter' || (k === 'ArrowDown' && t.tagName !== 'SELECT') || k === 'Tab') {
        if (t === stateI && !commitState()) return true;
        if (i === live().length - 1) save(); else focusAt(i + 1);
        return true;
      }
      if ((k === 'ArrowUp' && t.tagName !== 'SELECT') || k === 'Shift+Tab') {
        if (t === stateI) commitState();
        focusAt(i - 1);
        return true;
      }
      if (k === 'F2' || k === 'Ctrl+S' || k === 'PageDown') { if (t === stateI && !commitState()) return true; save(); return true; }
      if (k === 'Escape') {
        confirmBox(isNew ? 'Quit W/o Save ?' : 'Exit W/o Save ?', false).then((y) => { if (y) finish(null); else t.focus(); });
        return true;
      }
      return false;
    };
    stateI.addEventListener('blur', () => { if (findState(stateI.value) !== null) pickState(findState(stateI.value)!); else stateI.value = stateLabel(v.state); });
  });
}

function safeJson(s: string): Record<string, string> {
  try { const o = JSON.parse(s); return o && typeof o === 'object' ? o : {}; } catch { return {}; }
}
