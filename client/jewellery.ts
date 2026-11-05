// JEWELLERY business type — the SALE / PURCHASE line windows of a MARG ERP 9+ jewellery company.
// The bill grid shows DESCRIPTION | SET | DMND | STONE | GROSS | PURE% | PURE | RATE | AMOUNT, and every
// item opens the DESCRIPTION window (Sets/Pcs, Gross Weight, Diamond, Stone, Making, Polish, Net / Pure
// Weight …). A purchase adds the SALES DESCRIPTION part (tray, sale making, M.R.P. …); a sale adds
// Order No. / Advance / Metal Advance. Stone Pcs = Yes opens STONE DETAIL. Receipt, payment and the
// reports stay as they are for every business type.
import { api, esc, h, toast } from './ui.ts';
import { margPop, popList } from './margui.ts';
import { itemForm, type Item } from './masters.ts';
import { canAction } from './session.ts';

/** True when the company was created with Business Type JEWELLERY. */
export const isJewellery = (business: unknown) => /JEWEL/i.test(String(business ?? ''));

export interface Stone {
  desc: string; on: 'W' | 'P'; pcs: number; weight: number; prate: number; srate: number;
  hc: string; col: string; clear: string; cut: string;
}
export interface JwLine {
  sets: number; rate: number; gross: number; purityUnit: '%' | 'K'; purity: number; testing: number;
  diamond: 'No' | 'Yes'; diamondPcs: number; diamondWt: number; diamondAmt: number; lessWeight: 'Both' | 'Stone' | 'Diamond' | 'None';
  stoneYes: 'No' | 'Yes'; stonePcs: number; stoneUnit: 'Crt' | 'Gm'; stone: number; stoneAmt: number; stones: Stone[];
  makingUnit: 'GM' | '%' | 'PCS' | 'FIX'; making: number; polishUnit: 'GWt' | '%'; polish: number;
  extra: number; discUnit: 'All' | '%'; disc: number; lessBy: number;
  description: string; narration: string;
  // sale side
  orderNo: string; advance: number; metalAdvance: number; oRate: number;
  // purchase side: SALES DESCRIPTION
  tray: string; sMakingUnit: 'GM' | '%' | 'PCS' | 'FIX'; sMaking: number; sPurityUnit: '%' | 'K'; sPurity: number;
  sPolishUnit: 'GWt' | '%'; sPolish: number; sExtra: number; mrp: number; sDiamondAmt: number; stoneRate: number; photo: 'No' | 'Yes';
  // worked out (kept on the line so stock and reports can read the weights)
  stoneWt: number; net: number; pure: number; polishWt: number; metalAmt: number; makingAmt: number; amount: number; sAmount: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
const f2 = (n: unknown) => Number(n ?? 0).toFixed(2);
const f3 = (n: unknown) => Number(n ?? 0).toFixed(3);
/** 1 carat = 0.2 gram. */
const CRT = 0.2;

/** The item master's JEWELLERY DETAIL (items.details: jw_purity, jw_making …). */
export function itemJw(it: Partial<Item> & { details?: string }) {
  let d: Record<string, string> = {};
  try { d = JSON.parse(it.details || '{}'); } catch { /* bad JSON: no defaults */ }
  const n = (k: string, def: number) => (d[k] != null && d[k] !== '' && !Number.isNaN(Number(d[k])) ? Number(d[k]) : def);
  return {
    purityUnit: (d.jw_purity_unit === 'K' ? 'K' : '%') as '%' | 'K', purity: n('jw_purity', 100),
    makingUnit: (['GM', '%', 'PCS', 'FIX'].includes(d.jw_making_unit) ? d.jw_making_unit : '') as JwLine['makingUnit'] | '', making: n('jw_making', 0),
    polishUnit: (d.jw_polish_unit === 'GWt' ? 'GWt' : d.jw_polish_unit === '%' ? '%' : '') as JwLine['polishUnit'] | '', polish: n('jw_polish', 0),
    weight: n('jw_weight', 0), diamond: d.jw_diamond === 'Yes', stone: d.jw_stone === 'Yes', tray: d.jw_tray ?? '',
  };
}

export function blankJw(it: Partial<Item> & { details?: string } = {}, purchase = false): JwLine {
  const rate = Number((purchase ? it.purchase_rate : it.sale_rate) ?? 0);
  const m = itemJw(it);
  // Item making / polish are what the customer is charged: on a sale they fill Making / Polish,
  // on a purchase the SALES DESCRIPTION part (the supplier's own making is typed on the bill).
  const mk = { unit: m.makingUnit || '%', v: m.making } as const;
  const pl = { unit: m.polishUnit || '%', v: m.polish } as const;
  return {
    sets: 1, rate, gross: m.weight, purityUnit: m.purityUnit, purity: m.purity, testing: 0,
    diamond: m.diamond ? 'Yes' : 'No', diamondPcs: 0, diamondWt: 0, diamondAmt: 0, lessWeight: 'Both',
    stoneYes: m.stone ? 'Yes' : 'No', stonePcs: 0, stoneUnit: purchase ? 'Crt' : 'Gm', stone: 0, stoneAmt: 0, stones: [],
    makingUnit: purchase ? 'GM' : mk.unit, making: purchase ? 0 : mk.v,
    polishUnit: purchase ? 'GWt' : pl.unit, polish: purchase ? 0 : pl.v,
    extra: 0, discUnit: 'All', disc: 0, lessBy: 0, description: '', narration: '',
    orderNo: '', advance: 0, metalAdvance: 0, oRate: 0,
    tray: m.tray, sMakingUnit: m.makingUnit || 'GM', sMaking: m.making, sPurityUnit: m.purityUnit, sPurity: m.purity,
    sPolishUnit: m.polishUnit || '%', sPolish: m.polish, sExtra: 0,
    mrp: Number(it.mrp ?? 0), sDiamondAmt: 0, stoneRate: 0, photo: 'No',
    stoneWt: 0, net: 0, pure: 0, polishWt: 0, metalAmt: 0, makingAmt: 0, amount: 0, sAmount: 0,
  };
}

const purityFactor = (unit: string, p: number) => (unit === 'K' ? p / 24 : p / 100);
function makingAmount(unit: string, making: number, j: { net: number; sets: number; metalAmt: number }) {
  if (unit === 'GM') return making * j.net;          // rate per gram of net weight
  if (unit === '%') return (j.metalAmt * making) / 100; // % of the metal value
  if (unit === 'PCS') return making * j.sets;         // per set / piece
  return making;                                      // FIX — a flat amount
}

/** Works out Net / Pure Weight and the line Amount, as the DESCRIPTION window does. */
export function calcJw(j: JwLine, saleRate = 0): JwLine {
  const stoneWt = j.stoneUnit === 'Crt' ? j.stone * CRT : j.stone;
  const diaWt = j.diamondWt * CRT;
  const less = j.lessWeight === 'Both' ? stoneWt + diaWt : j.lessWeight === 'Stone' ? stoneWt : j.lessWeight === 'Diamond' ? diaWt : 0;
  const net = r3(Math.max(0, j.gross - j.testing - less));
  const pure = r3(Math.max(0, net * purityFactor(j.purityUnit, j.purity) - j.lessBy));
  const polishWt = r3(j.polishUnit === 'GWt' ? j.polish : (net * j.polish) / 100);
  const metalAmt = r2((pure + polishWt) * j.rate);
  const makingAmt = r2(makingAmount(j.makingUnit, j.making, { net, sets: j.sets, metalAmt }));
  const before = metalAmt + makingAmt + j.diamondAmt + j.stoneAmt + j.extra;
  const disc = j.discUnit === '%' ? (before * j.disc) / 100 : j.disc;
  const amount = r2(Math.max(0, before - disc));
  // Purchase: the value it will be sold at (SALES DESCRIPTION).
  const sPure = net * purityFactor(j.sPurityUnit, j.sPurity);
  const sPolish = j.sPolishUnit === 'GWt' ? j.sPolish : (net * j.sPolish) / 100;
  const sMetal = (sPure + sPolish) * saleRate;
  const sAmount = r2(sMetal + makingAmount(j.sMakingUnit, j.sMaking, { net, sets: j.sets, metalAmt: sMetal }) + j.sExtra + j.sDiamondAmt + j.stoneRate * j.stone);
  return { ...j, stoneWt: r3(stoneWt), net, pure, polishWt, metalAmt, makingAmt, amount, sAmount };
}

// ------------------------------------------------------------------ item window
interface JwStock { item_id: number; sets: number; dmnd: number; stone: number; gross: number; pure: number }

/** STORE:MAIN STORE for a jewellery company — DESCRIPTION, SET, DIAMOND_WT, STONE_WT, GROSS_WT, PURE_WT. */
export async function pickJewelItem(initial: string): Promise<Item | null> {
  const load = async () => {
    const [items, stock] = await Promise.all([api<Item[]>('/items'), api<JwStock[]>('/items/jewel-stock')]);
    const by = new Map(stock.map((s) => [s.item_id, s]));
    return items.map((i) => ({ ...i, jw: by.get(i.id) }));
  };
  type Row = Item & { jw?: JwStock };
  const rows: Row[] = await load();
  const w = (n: unknown) => (Number(n) ? f3(n) : '');
  return popList<Row>({
    title: 'STORE:MAIN STORE', rows, search: (r) => `${r.name} ${r.company}`, width: '1020px', findLabel: 'Find Name ? >>', initial,
    detailCols: 3, showHeader: true,
    cols: [
      { title: 'D E S C R I P T I O N', get: (r) => r.name.toUpperCase(), width: '40%' },
      { title: 'SET', get: (r) => (r.jw?.sets ? r.jw.sets : ''), num: true, width: '8%' },
      { title: 'DIAMOND_WT', get: (r) => w(r.jw?.dmnd), num: true, width: '13%' },
      { title: 'STONE_WT', get: (r) => w(r.jw?.stone), num: true, width: '13%' },
      { title: 'GROSS_WT', get: (r) => w(r.jw?.gross), num: true, width: '13%' },
      { title: 'PURE_WT', get: (r) => w(r.jw?.pure), num: true, width: '13%' },
    ],
    detail: (r) => !r ? '' : `
      <div>PurRate: <b>${r.purchase_rate == null ? '****' : f2(r.purchase_rate)}</b></div><div>M.R.P. &nbsp;: <b>${f2(r.mrp)}</b></div><div>Group &nbsp;: <b>${esc(r.company || '')}</b></div>
      <div>Cost &nbsp;&nbsp;: <b>${r.purchase_rate == null ? '****' : f2(r.purchase_rate)}</b></div><div>Rate &nbsp;&nbsp;: <b>${f2(r.sale_rate)}</b></div><div>SALT &nbsp;&nbsp;:</div>
      <div>Margin%:</div><div>Tax-T &nbsp;: <b>${f2(r.gst_rate)}</b></div><div>HSN/SAC: <b>${esc(r.hsn ?? '')}</b></div>
      <div>W/oDeal:</div><div>F.Rate&nbsp;: <b>${f2(r.sale_rate)}</b></div><div>Mfr. &nbsp;&nbsp;:</div>
      <div>PurDeal:</div><div>Deal[ ]:</div><div>Pcs/Set: <b>${r.jw?.sets ?? 0}</b></div>
      <div>PurDisc:</div><div>Scheme&nbsp;:</div><div>Barcode:</div>`,
    foot: '<span><b>Alt+F1</b>-Help</span><span><b>F2</b>-New</span><span><b>F3</b>-Modify</span><span><b>F4</b>-Reg.</span><span><b>?</b>-Search</span>',
    onKey: (k, cur, pop) => {
      if (k === 'F2') {
        if (!canAction('item.add')) { toast('Access denied — cannot add items', true); return true; }
        itemForm({ name: initial.toUpperCase() }).then(async (i) => { if (i) pop.setRows(await load()); });
        return true;
      }
      if (k === 'F3' && cur) {
        if (!canAction('item.list')) { toast('Access denied — cannot edit items', true); return true; }
        itemForm(cur).then(async (i) => { if (i) pop.setRows(await load()); });
        return true;
      }
      return false;
    },
  });
}

// ------------------------------------------------------------------ STONE DETAIL
function stoneDetail(init: Stone[], purchase: boolean, unit: string): Promise<Stone[] | null> {
  return new Promise((resolve) => {
    const p = margPop('STONE DETAIL', '<span><b>Enter</b>-Next</span><span><b>Ctrl+Del</b>-Delete Row</span><span><b>End/F10</b>-Save</span><span><b>Esc</b>-Back</span>', '980px');
    const rows: Stone[] = init.length ? init.map((s) => ({ ...s })) : [];
    const blank = (): Stone => ({ desc: '', on: 'W', pcs: 0, weight: 0, prate: 0, srate: 0, hc: '0', col: '-', clear: '', cut: '' });
    rows.push(blank());
    const cols: { k: keyof Stone; t: string; num?: boolean; w: string }[] = [
      { k: 'desc', t: 'DESC.', w: '20%' }, { k: 'on', t: '@RATE', w: '7%' }, { k: 'pcs', t: 'PCS', num: true, w: '7%' },
      { k: 'weight', t: 'WEIGHT', num: true, w: '10%' },
      ...(purchase ? [{ k: 'prate' as const, t: 'PURC.RATE', num: true, w: '11%' }] : []),
      { k: 'srate', t: 'SALE RATE', num: true, w: '11%' }, { k: 'hc', t: 'H.C.', w: '7%' }, { k: 'col', t: 'COL.', w: '7%' },
      { k: 'clear', t: 'CLEAR', w: '8%' }, { k: 'cut', t: 'CUT', w: '8%' },
    ];
    const box = h('div', { class: 'jw-stone' });
    p.body.append(box);
    const amt = (s: Stone, rate: number) => (s.on === 'P' ? s.pcs : s.weight) * rate;
    const draw = (fr = 0, fc = 'desc') => {
      const pcs = rows.reduce((t, s) => t + s.pcs, 0), wt = rows.reduce((t, s) => t + s.weight, 0);
      const pa = rows.reduce((t, s) => t + amt(s, s.prate), 0), sa = rows.reduce((t, s) => t + amt(s, s.srate), 0);
      box.innerHTML = `<table class="marg-grid"><thead><tr>${cols.map((c) => `<th class="${c.num ? 'n' : ''}" style="width:${c.w}">${c.t}</th>`).join('')}</tr></thead>
        <tbody>${rows.map((s, i) => `<tr>${cols.map((c) => `<td class="${c.num ? 'n' : ''}"><input data-r="${i}" data-c="${c.k}" value="${esc(String(s[c.k] ?? ''))}" autocomplete="off"></td>`).join('')}</tr>`).join('')}</tbody></table>
        <div class="jw-stone-tot">TOTAL PCS : <b>${pcs}</b> &nbsp; WEIGHT : <b>${f3(wt)}</b> ${esc(unit)} &nbsp; ${purchase ? `P.AMT : <b>${f2(pa)}</b> &nbsp; ` : ''}S.AMT : <b>${f2(sa)}</b></div>`;
      const el = box.querySelector(`input[data-r="${fr}"][data-c="${fc}"]`) as HTMLInputElement | null;
      el?.focus(); el?.select();
    };
    const read = (el: HTMLInputElement) => {
      const s = rows[Number(el.dataset.r)], k = el.dataset.c as keyof Stone;
      const v = el.value.trim();
      if (k === 'on') s.on = v.toUpperCase().startsWith('P') ? 'P' : 'W';
      else if (['pcs', 'weight', 'prate', 'srate'].includes(k)) (s as any)[k] = Number(v) || 0;
      else (s as any)[k] = k === 'desc' ? v.toUpperCase() : v;
    };
    draw();
    let done = false;
    const finish = (v: Stone[] | null) => { if (done) return; done = true; p.close(); resolve(v); };
    p.onKey = (e, k) => {
      const el = e.target as HTMLInputElement;
      const ri = Number(el.dataset?.r ?? -1), c = el.dataset?.c as keyof Stone | undefined;
      if (k === 'End' || k === 'F10' || k === 'Ctrl+W') { if (c) read(el); finish(rows.filter((s) => s.desc || s.pcs || s.weight)); return true; }
      if (k === 'Escape') { finish(null); return true; }
      if (!c) return false;
      if (k === 'Enter' || k === 'Tab') {
        read(el);
        const ci = cols.findIndex((x) => x.k === c);
        if (c === 'desc' && !rows[ri].desc && ri === rows.length - 1) { finish(rows.filter((s) => s.desc || s.pcs || s.weight)); return true; }
        if (ci < cols.length - 1) draw(ri, cols[ci + 1].k);
        else { if (ri === rows.length - 1) rows.push(blank()); draw(ri + 1, 'desc'); }
        return true;
      }
      if (k === 'Ctrl+Delete' || k === 'Shift+Delete') { rows.splice(ri, 1); if (!rows.length) rows.push(blank()); draw(Math.max(0, ri - 1)); return true; }
      if (k === 'ArrowDown' && ri < rows.length - 1) { read(el); draw(ri + 1, c); return true; }
      if (k === 'ArrowUp' && ri > 0) { read(el); draw(ri - 1, c); return true; }
      return false;
    };
  });
}

// ------------------------------------------------------------------ DESCRIPTION window
type F = { k: keyof JwLine; label: string; sel?: string[]; unitOf?: keyof JwLine; units?: string[]; text?: boolean; ro?: boolean; dec?: 0 | 2 | 3; cls?: string };

/**
 * The DESCRIPTION window of a jewellery SALE / PURCHASE line. Enter moves field to field;
 * End / F10 / Ctrl+W (or Enter on the last field) takes the line; Esc drops it.
 */
export function jewelDetail(item: Item, purchase: boolean, init?: JwLine): Promise<JwLine | null> {
  return new Promise((resolve) => {
    let j: JwLine = calcJw({ ...blankJw(item, purchase), ...(init ?? {}) }, Number(item.sale_rate ?? 0));
    const p = margPop('DESCRIPTION', '<span><b>Enter</b>-Next</span><span><b>F3</b>-Rate</span><span><b>F2</b>-Pure Weight</span><span><b>End/F10</b>-Accept</span><span><b>Esc</b>-Back</span>', '880px');
    p.el.classList.add('jw-pop');
    const left: F[] = [
      { k: 'sets', label: 'Sets/Pcs', dec: 0 },
      { k: 'gross', label: 'Gross Weight', dec: 3 },
      ...(purchase ? [{ k: 'testing' as const, label: 'Testing', dec: 3 as const }] : []),
      { k: 'diamondPcs', label: 'Diamond Pcs', unitOf: 'diamond', units: ['No', 'Yes'], dec: 0 },
      { k: 'diamondWt', label: 'Diamond Weight', dec: 3 },
      { k: 'stonePcs', label: 'Stone Pcs', unitOf: 'stoneYes', units: ['No', 'Yes'], dec: 0 },
      { k: 'stone', label: 'Stone', unitOf: 'stoneUnit', units: ['Crt', 'Gm'], dec: 3 },
      { k: 'making', label: 'Making', unitOf: 'makingUnit', units: ['GM', '%', 'PCS', 'FIX'], dec: 2 },
      { k: 'polish', label: 'Polish', unitOf: 'polishUnit', units: ['GWt', '%'], dec: 3 },
      { k: 'extra', label: 'Extra  Goods', dec: 2 },
      { k: 'disc', label: 'Disc.', unitOf: 'discUnit', units: ['All', '%'], dec: 2 },
      { k: 'net', label: 'Net Weight', ro: true, dec: 3, cls: 'red' },
      { k: 'pure', label: 'Pure Weight <sup>F2</sup>', ro: true, dec: 3, cls: 'red' },
    ];
    const right: (F | null)[] = [
      { k: 'rate', label: 'Rate <sup>F3</sup>', dec: purchase ? 3 : 2 },
      { k: 'purity', label: 'Purity', unitOf: 'purityUnit', units: ['%', 'K'], dec: 3 },
      ...(purchase ? [null] : []),
      { k: 'lessWeight', label: 'Less Weight', sel: ['Both', 'Stone', 'Diamond', 'None'], cls: 'small' },
      { k: 'diamondAmt', label: 'Amount', dec: 2 },
      null,
      { k: 'stoneAmt', label: 'Amount', dec: 2 },
      { k: 'makingAmt', label: 'Amount', ro: true, dec: 2 },
      { k: 'polishWt', label: 'Weight', ro: true, dec: 3 },
      null, null,
      { k: 'lessBy', label: 'Less By', dec: 3, cls: 'red' },
      { k: 'amount', label: 'Amount', ro: true, dec: 2, cls: 'red' },
    ];
    const tail: F[] = [
      { k: 'description', label: 'Description', text: true },
      { k: 'narration', label: 'Narration', text: true },
    ];
    const saleExtra: F[][] = [
      [{ k: 'orderNo', label: 'Order No.', text: true }, { k: 'advance', label: 'Advance', dec: 2 }],
      [{ k: 'metalAdvance', label: 'Metal Advance', dec: 3 }, { k: 'oRate', label: 'O.Rate', dec: 2 }],
    ];
    const purExtra: F[][] = [
      [{ k: 'tray', label: 'Tray Name', text: true }],
      [{ k: 'sMaking', label: 'Making Charges', unitOf: 'sMakingUnit', units: ['GM', '%', 'PCS', 'FIX'], dec: 2 }, { k: 'sPurity', label: 'Purity', unitOf: 'sPurityUnit', units: ['%', 'K'], dec: 3 }],
      [{ k: 'sPolish', label: 'Polish', unitOf: 'sPolishUnit', units: ['%', 'GWt'], dec: 3 }],
      [{ k: 'sExtra', label: 'Extra Goods', dec: 2 }, { k: 'mrp', label: 'M.R.P.', dec: 2 }],
      [{ k: 'sDiamondAmt', label: 'Diamond Amount', dec: 2 }, { k: 'stoneRate', label: 'Stone Rate', dec: 2 }],
      [{ k: 'sAmount', label: 'Amount', ro: true, dec: 2, cls: 'red' }, { k: 'photo', label: 'Photo', sel: ['No', 'Yes'], cls: 'small' }],
    ];

    const val = (f: F) => {
      const v = j[f.k] as unknown;
      if (f.text || f.sel) return esc(String(v ?? ''));
      const n = Number(v ?? 0);
      return f.dec === 0 ? String(n) : n.toFixed(f.dec ?? 2);
    };
    const field = (f: F | null) => {
      if (!f) return '<div></div><div></div><div></div>';
      const unit = f.unitOf ? `<select data-u="${f.unitOf}">${f.units!.map((u) => `<option${String(j[f.unitOf!]) === u ? ' selected' : ''}>${u}</option>`).join('')}</select>` : '';
      const input = f.sel
        ? `<select data-k="${f.k}" class="${f.cls ?? ''}">${f.sel.map((o) => `<option${String(j[f.k]) === o ? ' selected' : ''}>${o}</option>`).join('')}</select>`
        : `<input data-k="${f.k}" value="${val(f)}" class="${f.text ? 'txt' : 'num'}"${f.text ? '' : ` data-dec="${f.dec ?? 2}"`}${f.ro ? ' readonly tabindex="-1"' : ''} autocomplete="off">`;
      return `<div class="lbl ${f.cls ?? ''}">${f.label}</div><div class="unit">${unit}</div><div class="v">${input}</div>`;
    };
    const box = h('div', { class: 'jw-desc' });
    const rowsHtml = left.map((f, i) => `<div class="jw-row">${field(f)}${field(right[i] ?? null)}</div>`).join('');
    box.innerHTML = `<div class="jw-grid">${rowsHtml}${tail.map((f) => `<div class="jw-row wide">${field(f)}</div>`).join('')}
      ${purchase ? '' : saleExtra.map((r) => `<div class="jw-row">${field(r[0])}${field(r[1] ?? null)}</div>`).join('')}</div>
      ${purchase ? `<div class="jw-sub">SALES DESCRIPTION</div><div class="jw-grid">${purExtra.map((r) => `<div class="jw-row">${field(r[0])}${field(r[1] ?? null)}</div>`).join('')}</div>` : ''}`;
    p.body.append(box);

    // Enter order: walk the window row by row (left then right), skipping worked-out fields.
    const order = [...box.querySelectorAll('input:not([readonly]), select')] as (HTMLInputElement | HTMLSelectElement)[];
    const saleRate = Number(item.sale_rate ?? 0);
    const read = () => {
      for (const el of order) {
        const k = (el.dataset.k ?? el.dataset.u) as keyof JwLine;
        const v = el.value;
        (j as any)[k] = el.tagName === 'SELECT' || (el as HTMLInputElement).classList.contains('txt') ? (k === 'description' || k === 'tray' ? v.toUpperCase() : v) : Number(v) || 0;
      }
      j = calcJw(j, saleRate);
    };
    const paint = () => {
      for (const k of ['net', 'pure', 'makingAmt', 'polishWt', 'amount', 'sAmount'] as const) {
        const el = box.querySelector(`input[data-k="${k}"]`) as HTMLInputElement | null;
        if (el) el.value = Number(j[k]).toFixed(k === 'net' || k === 'pure' || k === 'polishWt' ? 3 : 2);
      }
    };
    box.addEventListener('input', () => { read(); paint(); });
    box.addEventListener('change', () => { read(); paint(); });
    const go = (el: Element | undefined) => { (el as HTMLInputElement | undefined)?.focus(); if (el instanceof HTMLInputElement) el.select(); };
    go(order[0]);

    let done = false;
    const accept = () => {
      if (done) return;
      read();
      if (!(j.gross > 0)) { toast('Enter the Gross Weight', true); go(box.querySelector('[data-k="gross"]') ?? undefined); return; }
      done = true; p.close(); resolve(j);
    };
    p.onKey = (e, k) => {
      const el = e.target as HTMLInputElement | HTMLSelectElement;
      const i = order.indexOf(el);
      if (k === 'End' || k === 'F10' || k === 'Ctrl+W') { accept(); return true; }
      if (k === 'Escape') { if (!done) { done = true; p.close(); resolve(null); } return true; }
      if (k === 'F3') { go(box.querySelector('[data-k="rate"]') ?? undefined); return true; }
      if (k === 'F2') {
        // Pure Weight typed straight in: the purity is worked back from it.
        read();
        const v = prompt('Pure Weight', f3(j.pure));
        if (v != null && j.net > 0) {
          const pure = Number(v) || 0;
          j.purityUnit = '%'; j.purity = r3(((pure + j.lessBy) / j.net) * 100); j.lessBy = j.lessBy || 0;
          const pu = box.querySelector('[data-k="purity"]') as HTMLInputElement; pu.value = f3(j.purity);
          (box.querySelector('[data-u="purityUnit"]') as HTMLSelectElement).value = '%';
          read(); paint();
        }
        return true;
      }
      if (k === 'Enter' || k === 'Tab') {
        read(); paint();
        // As in MARG, a typed figure is shown back with its decimals (5.3 → 5.300).
        if (el instanceof HTMLInputElement && el.dataset.dec) el.value = (Number(el.value) || 0).toFixed(Number(el.dataset.dec));
        // Stone Pcs = Yes → STONE DETAIL; its total weight and amount fill Stone / Amount.
        if (el.dataset.k === 'stonePcs' && j.stoneYes === 'Yes') {
          stoneDetail(j.stones, purchase, j.stoneUnit).then((st) => {
            if (st) {
              j.stones = st;
              j.stonePcs = st.reduce((t, s) => t + s.pcs, 0);
              j.stone = r3(st.reduce((t, s) => t + s.weight, 0));
              j.stoneAmt = r2(st.reduce((t, s) => t + (s.on === 'P' ? s.pcs : s.weight) * (purchase ? s.prate : s.srate), 0));
              if (purchase) j.stoneRate = j.stone ? r2(st.reduce((t, s) => t + (s.on === 'P' ? s.pcs : s.weight) * s.srate, 0) / j.stone) : 0;
              for (const key of ['stonePcs', 'stone', 'stoneAmt', 'stoneRate'] as const) {
                const x = box.querySelector(`[data-k="${key}"]`) as HTMLInputElement | null;
                if (x) x.value = key === 'stonePcs' ? String(j[key]) : Number(j[key]).toFixed(key === 'stone' ? 3 : 2);
              }
              read(); paint();
            }
            go(order[i + 1]);
          });
          return true;
        }
        if (i >= 0 && i < order.length - 1) go(order[i + 1]); else accept();
        return true;
      }
      if ((k === 'ArrowDown' || k === 'ArrowUp') && el.tagName === 'INPUT') {
        go(order[Math.max(0, Math.min(order.length - 1, i + (k === 'ArrowDown' ? 1 : -1)))]);
        return true;
      }
      return false;
    };
  });
}
