// JEWELLERY business type — the SALE / PURCHASE line windows of a MARG ERP 9+ jewellery company.
// The bill grid shows DESCRIPTION | SET | DMND | STONE | GROSS | PURE% | PURE | RATE | AMOUNT, and every
// item opens the DESCRIPTION window (Sets/Pcs, Gross Weight, Diamond, Stone, Making, Polish, Net / Pure
// Weight …). A purchase adds the SALES DESCRIPTION part (tray, sale making, M.R.P. …); a sale adds
// Order No. / Advance / Metal Advance. Stone Pcs = Yes opens STONE DETAIL. Receipt, payment and the
// reports stay as they are for every business type.
import { api, esc, h, toast } from './ui.ts';
import { margPop, popList, margAsk } from './margui.ts';
import { itemForm, type Item } from './masters.ts';
import { canAction, seeCost } from './session.ts';

/** True when the company was created with Business Type JEWELLERY. */
export const isJewellery = (business: unknown) => /JEWEL/i.test(String(business ?? ''));

/** STONE DETAIL row. @RATE is shown as "W-L": W = rate per weight / P = per piece; L = less its weight from gross / N = not. */
export interface Stone {
  desc: string; on: 'W' | 'P'; less?: boolean; pcs: number; weight: number; prate: number; srate: number;
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
  /** Ref. (tag no.) of the piece / lot — LO001137. Kept in bill_items.batch too. */
  ref: string;
  /** GOLD / SILVER / OTHER — the party's metal account (Gold / Silver in PARTY HISTORY). */
  metal: string;
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
  const gw = n('jw_gw', n('jw_weight', 0));
  const less = n('jw_less', 0);
  const nw = n('jw_nw', Math.max(0, gw - less));
  let mkgVal = n('jw_making', 0);
  let mkgUnit = d.jw_making_unit || '%';
  if (!mkgVal && d.jw_mkg) {
    const match = d.jw_mkg.match(/([\d.]+)\s*(%|GM|PCS|FIX)?/i);
    if (match) { mkgVal = Number(match[1]) || 0; if (match[2]) mkgUnit = match[2].toUpperCase(); }
  }
  const code = String((it as any).barcode || d.barcode || (it as any).code || '');
  return {
    purityUnit: (d.jw_purity_unit === 'K' ? 'K' : '%') as '%' | 'K', purity: n('jw_purity', 100),
    makingUnit: (['GM', '%', 'PCS', 'FIX'].includes(mkgUnit) ? mkgUnit : '%') as JwLine['makingUnit'], making: mkgVal,
    polishUnit: (d.jw_polish_unit === 'GWt' ? 'GWt' : d.jw_polish_unit === '%' ? '%' : '') as JwLine['polishUnit'] | '', polish: n('jw_polish', 0),
    weight: gw, less, nw, diamond: d.jw_diamond === 'Yes', stone: d.jw_stone === 'Yes' || less > 0, tray: d.jw_tray ?? '',
    metal: (d.jw_metal || 'SILVER').toUpperCase(), code,
  };
}

export function blankJw(it: Partial<Item> & { details?: string } = {}, purchase = false): JwLine {
  const rate = Number((purchase ? it.purchase_rate : it.sale_rate) ?? 0);
  const m = itemJw(it);
  // Item making / polish are what the customer is charged: on a sale they fill Making / Polish,
  // on a purchase the SALES DESCRIPTION part (the supplier's own making is typed on the bill).
  const mk = { unit: m.makingUnit || '%', v: m.making } as const;
  const pl = { unit: m.polishUnit || '%', v: m.polish } as const;
  const base: JwLine = {
    sets: 1, rate, gross: m.weight, purityUnit: m.purityUnit, purity: m.purity, testing: 0,
    diamond: m.diamond ? 'Yes' : 'No', diamondPcs: 0, diamondWt: 0, diamondAmt: 0, lessWeight: 'Both',
    stoneYes: m.stone ? 'Yes' : 'No', stonePcs: m.less > 0 ? 1 : 0, stoneUnit: 'Gm', stone: m.less, stoneAmt: 0, stones: [],
    makingUnit: purchase ? 'GM' : mk.unit, making: purchase ? 0 : mk.v,
    polishUnit: purchase ? 'GWt' : pl.unit, polish: purchase ? 0 : pl.v,
    extra: 0, discUnit: 'All', disc: 0, lessBy: 0, description: '', narration: '',
    orderNo: '', advance: 0, metalAdvance: 0, oRate: 0,
    tray: m.tray, sMakingUnit: m.makingUnit || 'GM', sMaking: m.making, sPurityUnit: m.purityUnit, sPurity: m.purity,
    sPolishUnit: m.polishUnit || '%', sPolish: m.polish, sExtra: 0,
    mrp: Number(it.mrp ?? 0), sDiamondAmt: 0, stoneRate: 0, photo: 'No',
    stoneWt: m.less, net: m.nw || Math.max(0, m.weight - m.less), pure: 0, polishWt: 0, metalAmt: 0, makingAmt: 0, amount: 0, sAmount: 0,
    ref: m.code || '', metal: m.metal,
  };
  return calcJw(base, rate);
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
  const toGm = (w: number) => (j.stoneUnit === 'Crt' ? w * CRT : w);
  const stoneWt = toGm(Number(j.stone) || 0);
  // Only the stones marked L (W-L) in STONE DETAIL are taken off the gross weight.
  const stoneLess = j.stones?.length ? toGm(j.stones.filter((x) => x.less !== false).reduce((t, x) => t + (Number(x.weight) || 0), 0)) : stoneWt;
  const diaWt = (Number(j.diamondWt) || 0) * CRT;
  const less = j.lessWeight === 'Both' ? stoneLess + diaWt : j.lessWeight === 'Stone' ? stoneLess : j.lessWeight === 'Diamond' ? diaWt : 0;
  const testing = Number(j.testing) || 0;
  const net = r3(Math.max(0, (Number(j.gross) || 0) - testing - less));
  const lessBy = Number(j.lessBy) || 0;
  const pure = r3(Math.max(0, net * purityFactor(j.purityUnit, Number(j.purity) || 0) - lessBy));
  const polish = Number(j.polish) || 0;
  const polishWt = r3(j.polishUnit === 'GWt' ? polish : (net * polish) / 100);
  const metalAmt = r2((pure + polishWt) * (Number(j.rate) || 0));
  const sets = Number(j.sets) || 1;
  const making = Number(j.making) || 0;
  const makingAmt = r2(makingAmount(j.makingUnit, making, { net, sets, metalAmt }));
  const diamondAmt = Number(j.diamondAmt) || 0;
  const stoneAmt = Number(j.stoneAmt) || 0;
  const extra = Number(j.extra) || 0;
  const before = metalAmt + makingAmt + diamondAmt + stoneAmt + extra;
  const discVal = Number(j.disc) || 0;
  const disc = j.discUnit === '%' ? (before * discVal) / 100 : discVal;
  const amount = r2(Math.max(0, before - disc));
  // Purchase: the value it will be sold at (SALES DESCRIPTION).
  const sPure = net * purityFactor(j.sPurityUnit, Number(j.sPurity) || 0);
  const sPolish = Number(j.sPolish) || 0;
  const sPolishWt = j.sPolishUnit === 'GWt' ? sPolish : (net * sPolish) / 100;
  const sMetal = (sPure + sPolishWt) * saleRate;
  const sMaking = Number(j.sMaking) || 0;
  const sExtra = Number(j.sExtra) || 0;
  const sDiamondAmt = Number(j.sDiamondAmt) || 0;
  const stoneRate = Number(j.stoneRate) || 0;
  const sAmount = r2(sMetal + makingAmount(j.sMakingUnit, sMaking, { net, sets, metalAmt: sMetal }) + sExtra + sDiamondAmt + stoneRate * (Number(j.stone) || 0));
  return { ...j, stoneWt: r3(stoneWt), net, pure, polishWt, metalAmt, makingAmt, amount, sAmount };
}

// ------------------------------------------------------------------ item window
interface JwStock { item_id: number; sets: number; dmnd: number; stone: number; gross: number; pure: number }

/** STORE:MAIN STORE for a jewellery company — DESCRIPTION, SET, DIAMOND_WT, STONE_WT, GROSS_WT, PURE_WT. */
/** Returns the item; `ref` is set when a Ref. (tag no.) was typed / scanned instead of a name. */
export async function pickJewelItem(initial: string): Promise<(Item & { ref?: JwRef }) | null> {
  const load = async () => {
    const [items, stock] = await Promise.all([api<Item[]>('/items'), api<JwStock[]>('/items/jewel-stock')]);
    const by = new Map(stock.map((s) => [s.item_id, s]));
    return items.map((i) => ({ ...i, jw: by.get(i.id) }));
  };
  type Row = Item & { jw?: JwStock };
  const rows: Row[] = await load();
  const w = (n: unknown) => (Number(n) ? f3(n) : '');
  let refHit: JwRef | null = null;
  const picked = await popList<Row>({
    title: 'STORE:MAIN STORE', rows, search: (r) => `${r.name} ${r.company}`, full: true, findLabel: 'Find Name ? >>', initial,
    detailCols: 3, showHeader: true,
    // No item by that name: a Ref. (LO001137 / a scanned tag) brings its item and piece.
    onEnterNotFound: (typed, pop) => {
      if (!typed.trim()) return false;
      let cleanCode = typed.trim();
      if (cleanCode.startsWith('{') && cleanCode.endsWith('}')) {
        try { cleanCode = JSON.parse(cleanCode).code || cleanCode; } catch {}
      }
      findRef(cleanCode).then((r) => {
        const it = r && rows.find((i) => i.id === r.item_id);
        if (r && it) { refHit = r; pop.close(it); } else toast(`No item or Ref. "${cleanCode.toUpperCase()}" in stock`, true);
      });
      return true;
    },
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
  if (!picked) return null;
  const { jw: _stock, ...item } = picked;
  return refHit ? { ...item, ref: refHit } : item;
}

// ------------------------------------------------------------------ STONE DETAIL
const onCode = (s: Stone) => `${s.on}-${s.less === false ? 'N' : 'L'}`;
function stoneDetail(init: Stone[], purchase: boolean, unit: string, item: Item): Promise<Stone[] | null> {
  return new Promise((resolve) => {
    const p = margPop('STONE DETAIL', '<span><b>Enter</b>-Next</span><span><b>Ctrl+Del</b>-Delete Row</span><span><b>End/F10</b>-Save</span><span><b>Esc</b>-Back</span>', '980px');
    const blank = (): Stone => ({ desc: '', on: 'W', less: true, pcs: 0, weight: 0, prate: 0, srate: 0, hc: '0', col: '-', clear: '', cut: '' });
    // As in MARG, the first line starts with the item itself at its rate.
    const rows: Stone[] = init.length ? init.map((s) => ({ ...s })) : [{ ...blank(), desc: item.name.toUpperCase(), srate: Number(item.sale_rate ?? 0) }];
    if (init.length) rows.push(blank());
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
        <tbody>${rows.map((s, i) => `<tr>${cols.map((c) => `<td class="${c.num ? 'n' : ''}"><input data-r="${i}" data-c="${c.k}" value="${esc(c.k === 'on' ? onCode(s) : String(s[c.k] ?? ''))}" autocomplete="off"></td>`).join('')}</tr>`).join('')}</tbody></table>
        <div class="jw-stone-tot">TOTAL PCS : <b>${pcs}</b> &nbsp; WEIGHT : <b>${f3(wt)}</b> ${esc(unit)} &nbsp; ${purchase ? `P.AMT : <b>${f2(pa)}</b> &nbsp; S.AMT` : 'SALE AMT.'} : <b>${f2(sa)}</b></div>`;
      const el = box.querySelector(`input[data-r="${fr}"][data-c="${fc}"]`) as HTMLInputElement | null;
      el?.focus(); el?.select();
    };
    const read = (el: HTMLInputElement) => {
      const s = rows[Number(el.dataset.r)], k = el.dataset.c as keyof Stone;
      const v = el.value.trim();
      if (k === 'on') { const u = v.toUpperCase(); s.on = u.startsWith('P') ? 'P' : 'W'; s.less = !/-?N$/.test(u); }
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
        if (c === 'desc' && k === 'Enter') {
          // DESC. comes from the item list (stone / diamond items, or the piece itself).
          pickJewelItem(rows[ri].desc).then((it) => {
            if (it) { rows[ri].desc = it.name.toUpperCase(); rows[ri].srate = Number(it.sale_rate ?? 0); rows[ri].prate = Number(it.purchase_rate ?? 0); }
            draw(ri, 'on');
          });
          return true;
        }
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
        margAsk('Pure Weight', f3(j.pure)).then((v) => {
          if (v != null && j.net > 0) {
            const pure = Number(v) || 0;
            j.purityUnit = '%'; j.purity = r3(((pure + j.lessBy) / j.net) * 100); j.lessBy = j.lessBy || 0;
            const pu = box.querySelector('[data-k="purity"]') as HTMLInputElement;
            if (pu) pu.value = f3(j.purity);
            const puUnit = box.querySelector('[data-u="purityUnit"]') as HTMLSelectElement;
            if (puUnit) puUnit.value = '%';
            read(); paint();
          }
        });
        return true;
      }
      if (k === 'Shift+Tab') {
        if (i > 0) go(order[i - 1]);
        return true;
      }
      if (k === 'Enter' || k === 'Tab') {
        read(); paint();
        // As in MARG, a typed figure is shown back with its decimals (5.3 → 5.300).
        if (el instanceof HTMLInputElement && el.dataset.dec) el.value = (Number(el.value) || 0).toFixed(Number(el.dataset.dec));
        // Stone Pcs = Yes → STONE DETAIL; its total weight and amount fill Stone / Amount.
        if (el.dataset.k === 'stonePcs' && j.stoneYes === 'Yes') {
          // A stone already on the line (typed, or from the tag) is the first STONE DETAIL row.
          const startRows: Stone[] = j.stones.length ? j.stones : j.stone > 0
            ? [{ desc: item.name.toUpperCase(), on: 'W', less: true, pcs: j.stonePcs || 1, weight: j.stone, prate: 0, srate: 0, hc: '0', col: '-', clear: '', cut: '' }]
            : [];
          stoneDetail(startRows, purchase, j.stoneUnit, item).then((st) => {
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

// ------------------------------------------------------------------ Ref. (tag no.)
export interface JwRef {
  item_id: number; item_name: string; ref: string; sets: number; gross: number; net: number; pure: number; jw: string | null;
  /** The purchase that brought the piece in. */
  supplier?: string; invoice?: string; inv_date?: string;
}
/** Tag prefix: the item's BARCODE PREFIX (item master), else the first two letters of its name. */
const refPrefix = (it: Item & { details?: string }) => {
  let d: Record<string, string> = {};
  try { d = JSON.parse(it.details || '{}'); } catch { /* none */ }
  return String(d.jw_prefix || '').toUpperCase().replace(/[^A-Z]/g, '') || it.name.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) || 'JW';
};

/**
 * PURCHASE: Ref. of the piece / lot being bought. Shows the item's AVAILABLE STOCKS (Refs still
 * in stock) and the next Ref. (LO001137) ready in the Ref. box; a blank Ref. is not allowed.
 */
export async function askPurchaseRef(item: Item, current = '', taken: string[] = []): Promise<string | null> {
  const [refs, next] = await Promise.all([
    api<JwRef[]>(`/items/${item.id}/jewel-refs`),
    current ? Promise.resolve({ ref: current }) : api<{ ref: string }>(`/jewel/next-ref?prefix=${encodeURIComponent(refPrefix(item))}`),
  ]);
  // Refs already typed on this (unsaved) bill are skipped: LO001137, LO001138 …
  if (!current) {
    const m = next.ref.match(/^([A-Z]+)(\d+)$/);
    while (m && taken.includes(next.ref)) next.ref = `${m[1]}${String(Number(next.ref.slice(m[1].length)) + 1).padStart(m[2].length, '0')}`;
  }
  return new Promise((resolve) => {
    const p = margPop('AVAILABLE STOCKS', '<span><b>Enter</b>-Accept Ref.</span><span><b>F3</b>-Popup List</span><span><b>Esc</b>-Back</span>', '560px');
    const box = h('div', { class: 'jw-refs' });
    const stock = (r: JwRef) => (r.gross ? String(Number(r.gross.toFixed(3))) : String(r.sets));
    box.innerHTML = `<div class="jw-refs-list"><table class="marg-grid"><thead><tr><th>REF.</th><th class="n">STOCK</th></tr></thead>
      <tbody>${refs.length ? refs.map((r) => `<tr><td>${esc(r.ref)}</td><td class="n">${esc(stock(r))}</td></tr>`).join('') : '<tr><td colspan="2" style="color:#777">No stock yet</td></tr>'}</tbody></table></div>
      <div class="jw-ref-in"><span>Store :</span><b>MAIN STORE</b><span>Ref. :</span><input value="${esc(next.ref)}" autocomplete="off" spellcheck="false"></div>
      <div class="jw-ref-msg"></div>`;
    p.body.append(box);
    const inp = box.querySelector('input') as HTMLInputElement;
    const msg = box.querySelector('.jw-ref-msg') as HTMLElement;
    inp.addEventListener('input', () => { const at = inp.selectionStart; inp.value = inp.value.toUpperCase(); inp.setSelectionRange(at, at); msg.textContent = ''; });
    setTimeout(() => { inp.focus(); inp.select(); }, 0);
    let done = false;
    const finish = (v: string | null) => { if (done) return; done = true; p.close(); resolve(v); };
    p.onKey = (_e, k) => {
      if (k === 'Enter') {
        const v = inp.value.trim().toUpperCase();
        if (!v) { msg.textContent = 'Blank Not Allowed'; inp.focus(); return true; }
        if (refs.some((r) => r.ref.toUpperCase() === v) && v !== current.toUpperCase()) { msg.textContent = `Ref. ${v} is already in stock - give a new Ref.`; inp.select(); return true; }
        finish(v);
        return true;
      }
      if (k === 'F3') {
        popList<JwRef>({
          title: 'AVAILABLE STOCKS', rows: refs, search: (r) => r.ref, width: '640px', findLabel: 'Ref ? >>', showHeader: true,
          cols: [{ title: 'REF.', get: (r) => r.ref, width: '40%' }, { title: 'SET', get: (r) => r.sets, num: true }, { title: 'GROSS', get: (r) => f3(r.gross), num: true }, { title: 'PURE', get: (r) => f3(r.pure), num: true }],
          foot: '<span><b>Enter</b>-Select</span><span><b>Esc</b>-Back</span>',
        }).then((r) => { inp.focus(); if (r) msg.textContent = `${r.ref}: Set ${r.sets}, Gross ${f3(r.gross)}, Pure ${f3(r.pure)}`; });
        return true;
      }
      if (k === 'Escape') { finish(null); return true; }
      return false;
    };
  });
}

/**
 * SALE: the BARCODE window of the item (as MARG): each tag in stock with SET, DIAMOND_WT, STONE_WT,
 * GROSS_WT, NET_WT, PURE_WT, and the piece's metal / stone / making / cost and supplier below.
 * null = Esc (sell without a tag); undefined = the item has no tags.
 */
export async function pickSaleRef(item: Item): Promise<JwRef | null | undefined> {
  const refs = await api<JwRef[]>(`/items/${item.id}/jewel-refs`);
  if (!refs.length) return undefined;
  const jwOf = (r?: JwRef): Partial<JwLine> => { try { return r?.jw ? JSON.parse(r.jw) : {}; } catch { return {}; } };
  const w = (n: unknown) => (Number(n) ? f3(n) : '');
  const dm = (iso?: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');
  const picked = await popList<JwRef>({
    title: item.name.toUpperCase(), rows: refs, search: (r) => `${r.ref} ${jwOf(r).tray ?? ''}`, full: true, findLabel: 'Find ? >>', showHeader: true,
    detailCols: 3,
    cols: [
      { title: 'BARCODE', get: (r) => r.ref, width: '22%' },
      { title: 'SET', get: (r) => (r.sets ? r.sets : ''), num: true, width: '8%' },
      { title: 'DIAMOND_WT', get: (r) => w(jwOf(r).diamondWt), num: true, width: '14%' },
      { title: 'STONE_WT', get: (r) => w(jwOf(r).stone), num: true, width: '14%' },
      { title: 'GROSS_WT', get: (r) => w(r.gross), num: true, width: '14%' },
      { title: 'NET_WT', get: (r) => f3(r.net), num: true, width: '14%' },
      { title: 'PURE_WT', get: (r) => f3(r.pure), num: true },
    ],
    detail: (r) => {
      if (!r) return '';
      const j = jwOf(r);
      const cost = Number(j.amount ?? 0), sale = Number(j.sAmount ?? 0);
      return `
        <div>Metal &nbsp;: <b>${esc(j.metal ?? '')}</b></div><div></div><div>Supp. &nbsp;: <b>${esc(r.supplier ?? '')}</b></div>
        <div>Diamond: <b>${w(j.diamondWt)}</b></div><div></div><div>Invoice: <b>${esc(r.invoice ?? '')}</b></div>
        <div>Stone &nbsp;: <b>${w(j.stone)}${j.stone ? ` ${esc(j.stoneUnit ?? '')}` : ''}</b></div><div></div><div>Date &nbsp;&nbsp;: <b>${dm(r.inv_date)}</b></div>
        <div>Making : <b>${j.sMaking ? `${f2(j.sMaking)} ${esc(j.sMakingUnit ?? '')}` : ''}</b></div><div></div><div>M.R.P. : <b>${j.mrp ? f2(j.mrp) : ''}</b></div>
        <div>Cost &nbsp;&nbsp;: <b>${seeCost() ? (cost ? f2(cost) : '') : '****'}</b></div><div></div><div>Desc. &nbsp;: <b>${esc(j.description ?? '')}</b></div>
        <div>Sale &nbsp;&nbsp;: <b>${sale ? f2(sale) : ''}</b></div><div></div><div>Pcs/Set: <b>${r.sets}</b></div>
        <div>Margin : <b>${seeCost() ? (cost && sale ? `${(((sale - cost) / cost) * 100).toFixed(2)}%` : '') : '****'}</b></div><div></div><div>Barcode: <b>${esc(r.ref)}</b></div>`;
    },
    foot: '<span><b>Enter</b>-Select</span><span><b>Shift+?</b>-Find</span><span><b>Esc</b>-Without Barcode</span>',
  });
  return picked ?? null;
}

/** The party's Gold / Silver (pure weight) without opening PARTY HISTORY — for the sale footer. */
export async function partyMetal(ledgerId: number): Promise<{ gold: number; silver: number }> {
  const hst = await api<{ gold: number; silver: number }>(`/ledgers/${ledgerId}/jewel-history?kind=SALE`).catch(() => ({ gold: 0, silver: 0 }));
  return { gold: Number(hst?.gold) || 0, silver: Number(hst?.silver) || 0 };
}

/** A Ref. typed or scanned in the DESCRIPTION column: its item and stock, or null. */
export const findRef = (ref: string) => api<JwRef | null>(`/jewel/ref/${encodeURIComponent(ref.trim())}`).catch(() => null);

/** SALE line from a Ref.: the piece's weights and its SALES DESCRIPTION (making, purity, M.R.P. ...). */
export function jwFromRef(item: Item, r: JwRef): JwLine {
  const base = blankJw(item, false);
  let p: Partial<JwLine> = {};
  try { p = r.jw ? JSON.parse(r.jw) : {}; } catch { /* no purchase detail */ }
  // Part of a lot may already be sold: stones / diamonds follow the share of gross weight left.
  const share = p.gross && r.gross < p.gross ? r.gross / p.gross : 1;
  const k = (n: unknown) => Number(n ?? 0) * share;
  return {
    ...base, ref: r.ref, sets: Math.max(0, r.sets) || base.sets, gross: r3(r.gross || base.gross),
    diamond: p.diamond ?? base.diamond, diamondPcs: p.diamondPcs ?? 0, diamondWt: r3(k(p.diamondWt)), lessWeight: p.lessWeight ?? base.lessWeight,
    stoneYes: p.stoneYes ?? base.stoneYes, stonePcs: p.stonePcs ?? 0, stoneUnit: p.stoneUnit ?? base.stoneUnit, stone: r3(k(p.stone)),
    stones: (p.stones ?? []).map((s) => ({ ...s, weight: r3(k(s.weight)) })),
    stoneAmt: Number(p.stoneRate ?? 0) > 0 ? r2(Number(p.stoneRate) * k(p.stone))
      : (p.stones?.length ? r2(p.stones.reduce((t, s) => t + (s.on === 'P' ? Number(s.pcs) || 0 : Number(s.weight) || 0) * (Number(s.srate) || 0), 0) * share)
      : r2(k(p.stoneAmt))),
    purityUnit: p.sPurityUnit ?? base.purityUnit, purity: p.sPurity ?? base.purity,
    makingUnit: p.sMakingUnit ?? base.makingUnit, making: p.sMaking ?? base.making,
    polishUnit: p.sPolishUnit ?? base.polishUnit, polish: p.sPolish ?? base.polish,
    extra: p.sExtra ?? 0, diamondAmt: r2(k(p.sDiamondAmt)), mrp: p.mrp ?? base.mrp, tray: p.tray ?? '', metal: p.metal ?? base.metal,
  };
}

// ------------------------------------------------------------------ PARTY HISTORY
interface History {
  name: string; address: string; phone: string; credit_limit: number; balance: number; annual: number; monthly: number;
  due: number; bill_count: number; bills: { ref: string; date: string; amount: number; days: number }[];
  last_pay: { amount: number; date: string; days: number } | null; last_bill: { amount: number; date: string; days: number } | null;
  gold: number; silver: number; challans: number; col_days: string;
}
/** Shown after the party is chosen on a jewellery bill; any key goes on. Resolves the party's Gold / Silver. */
export async function partyHistory(ledgerId: number, purchase: boolean): Promise<{ gold: number; silver: number } | null> {
  const hst = await api<History>(`/ledgers/${ledgerId}/jewel-history?kind=${purchase ? 'PURCHASE' : 'SALE'}`).catch(() => null);
  if (!hst) return null;
  const dm = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '');
  const tag = purchase ? 'PURC' : 'SALE';
  const row = (l: string, v: string) => `<div><span>${l}</span><b>${v}</b></div>`;
  return new Promise((resolve) => {
    const p = margPop('PARTY HISTORY', '<span><b>Any key</b>-Continue</span>', '1060px');
    const box = h('div', { class: 'jw-hist' });
    box.innerHTML = `<div class="jw-hist-l">
        ${row(`${tag}-Anu:`, `${Math.round(hst.annual)} &nbsp; B/E: &nbsp; 0 % : 0.00`)}
        ${row(`${tag}-Mon:`, `${Math.round(hst.monthly)} &nbsp; B/E: &nbsp; 0 % : 0.00`)}
        ${row('Cr Limit:', hst.credit_limit ? f2(hst.credit_limit) : '')}
        ${row('Mail to :', esc(hst.name.toUpperCase()))}
        ${row('&nbsp; &nbsp; &nbsp; &nbsp; :', esc((hst.address || '').toUpperCase()))}
        ${row('Phone &nbsp; :', esc(hst.phone || ''))}
        ${row('Gold &nbsp; &nbsp;:', `${f3(hst.gold)} &nbsp;Silver:${f3(hst.silver)}`)}
        ${row('Challan :', hst.challans ? String(hst.challans) : '-NIL-')}
        ${row('Balance :', `${Math.round(hst.balance)} &nbsp; Due: ${Math.round(purchase ? -hst.due : hst.due)} &nbsp; Bill: ${hst.bill_count}`)}
        ${row('LastPymt:', hst.last_pay ? `${Math.round(hst.last_pay.amount)} &nbsp; Dt.: ${dm(hst.last_pay.date)} &nbsp; Days: ${hst.last_pay.days}` : '&nbsp; Dt.: &nbsp; &nbsp; Days:')}
        ${row(`Last${purchase ? 'Purc' : 'Sale'}:`, hst.last_bill ? `${Math.round(hst.last_bill.amount)} &nbsp; Dt.: ${dm(hst.last_bill.date)} &nbsp; Days: ${hst.last_bill.days}` : '0')}
        ${row('P.D.C. &nbsp;:', '')}
        ${row('Col.Days:', esc(String(hst.col_days)))}
      </div>
      <div class="jw-hist-r"><table><thead><tr><th>Bill</th><th>Date</th><th class="n">Amount</th><th class="n">Days</th></tr></thead>
        <tbody>${hst.bills.slice(0, 14).map((b) => `<tr><td>${esc(b.ref)}</td><td>${dm(b.date)}</td><td class="n">${Math.round(b.amount)}</td><td class="n">${b.days}</td></tr>`).join('') || '<tr><td colspan="4">No pending bill</td></tr>'}</tbody></table>
        <div class="jw-hist-tot">Top ${Math.min(14, hst.bills.length)}/${hst.bills.length} Bills</div></div>`;
    p.body.append(box);
    let done = false;
    const close = () => { if (done) return; done = true; p.close(); resolve({ gold: hst.gold, silver: hst.silver }); };
    p.onKey = () => { close(); return true; };
    box.addEventListener('click', close);
  });
}
