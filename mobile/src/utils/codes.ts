// Item codes for QR / barcode scanning. The code lives in the product form's BARCODE field
// (items.details.barcode): a maker's printed barcode / QR, or one we generate ("FL000012").
import qrcode from 'qrcode-generator';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { canCode128, code128, code128Svg } from './code128';
import { Item } from '../types';
import { amt } from './format';

export interface JewelTagData {
  type?: 'JEWEL';
  code: string;
  name: string;
  gw: number;     // Gross Weight
  less: number;   // Less Weight (Stone / Lac / Wax / Diamond)
  nw: number;     // Net Weight = gw - less
  mkg: string;    // Making Charges (e.g. "5.00 %" or "350/gm")
  metal?: string; // GOLD, SILVER, OTHER
  purity?: string;
  mrp?: number;
}

export const codeOf = (it: Pick<Item, 'details'>): string => {
  try { return String(JSON.parse(it.details || '{}').barcode ?? '').trim(); } catch { return ''; }
};

/** Our own code for an item that has none printed on it. */
export const newCode = (id: number, prefix = 'FL') => `${prefix}${String(id).padStart(6, '0')}`;

/** The item a scanned code belongs to (exact BARCODE match, case-insensitive). */
export const findByCode = (items: Item[], raw: string) => {
  const code = raw.trim().toUpperCase();
  if (!code) return undefined;
  return items.find((i) => codeOf(i).toUpperCase() === code);
};

export const qrMatrix = (text: string) => {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

/** Parse scanned string into JewelTagData if it contains jewelry weights / format. */
export function parseJewelCode(raw: string, itemsList: Item[] = []): JewelTagData | null {
  if (!raw) return null;
  const str = raw.trim();

  // 1. JSON payload
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const obj = JSON.parse(str);
      if (obj.type === 'JEWEL' || obj.gw !== undefined || obj.nw !== undefined) {
        const gw = Number(obj.gw) || 0;
        const less = Number(obj.less) || 0;
        const nw = obj.nw !== undefined ? Number(obj.nw) : Math.max(0, gw - less);
        return {
          type: 'JEWEL',
          code: String(obj.code ?? '').trim(),
          name: String(obj.name ?? '').trim(),
          gw,
          less,
          nw,
          mkg: String(obj.mkg ?? '5.00 %').trim(),
          metal: obj.metal ? String(obj.metal) : undefined,
          purity: obj.purity ? String(obj.purity) : undefined,
        };
      }
    } catch { /* ignore parse error */ }
  }

  // 2. Structured text (GW: 185.200 LESS: 24.300 NW: 160.900 MKG: 5.00%)
  const gwM = str.match(/GW[:\s]+([\d.]+)/i);
  const lessM = str.match(/LESS[:\s]+([\d.]+)/i);
  const nwM = str.match(/NW[:\s]+([\d.]+)/i);
  const mkgM = str.match(/MKG[:\s]+([^\n\r,|]+)/i);
  const codeM = str.match(/(?:CODE|TAG|REF)[:\s]+([A-Za-z0-9]+)/i);

  if (gwM || nwM) {
    const gw = gwM ? Number(gwM[1]) : 0;
    const less = lessM ? Number(lessM[1]) : 0;
    const nw = nwM ? Number(nwM[1]) : Math.max(0, gw - less);
    const mkg = mkgM ? mkgM[1].trim() : '5.00 %';
    const code = codeM ? codeM[1].trim() : str.split(/[\s|]+/)[0];
    return {
      type: 'JEWEL',
      code,
      name: '',
      gw,
      less,
      nw,
      mkg,
    };
  }

  // 3. A plain tag code (barcode / QR on our tags) of a jewellery item in the item list
  const found = findByCode(itemsList, str);
  if (found && isJewelItem(found)) {
    return jewelDataFromItem(found, str);
  }

  return null;
}

/** Item saved from a jewellery item form (any jw_* field), so a scan of its code opens the tag window;
 *  other companies' items keep the plain scan-to-cart. */
export function isJewelItem(it: Pick<Item, 'details'>) {
  try { return Object.keys(JSON.parse(it.details || '{}')).some((k) => k.startsWith('jw_')); } catch { return false; }
}

/** Extract jewelry details from stored Item master. */
export function jewelDataFromItem(it: Item, defaultCode?: string): JewelTagData {
  let d: Record<string, any> = {};
  try { d = JSON.parse(it.details || '{}'); } catch {}
  const gw = Number(d.jw_gw ?? d.jw_weight ?? 0) || 0;
  const less = Number(d.jw_less ?? 0) || 0;
  const nw = Number(d.jw_nw ?? (gw - less)) || Math.max(0, gw - less);
  const mkg = String(d.jw_mkg ?? (d.jw_making ? `${d.jw_making} ${d.jw_making_unit || '%'}` : '5.00 %')).trim();
  const code = codeOf(it) || defaultCode || `PA${String(it.id).padStart(6, '0')}`;
  return {
    type: 'JEWEL',
    code,
    name: it.name,
    gw,
    less,
    nw,
    mkg,
    metal: d.jw_metal,
    purity: d.jw_purity ? `${d.jw_purity}${d.jw_purity_unit || '%'}` : undefined,
    mrp: Number(it.mrp) || undefined,
  };
}

/** Standard barcode/QR sticker sheet: `copies` labels (name, pack, MRP, code). */
export function labelHtml(it: Item, code: string, copies: number) {
  const qr = qrcode(0, 'M');
  qr.addData(code);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  const label = `<div class="l"><div class="q">${svg}</div><div class="t"><b>${esc(it.name)}</b><br/>${esc(it.pack ?? '')}<br/>MRP ₹${amt(it.mrp)}<br/><small>${esc(code)}</small></div></div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    body { font-family: Arial, sans-serif; margin: 10px; }
    .grid { display: flex; flex-wrap: wrap; gap: 8px; }
    .l { width: 230px; border: 1px dashed #999; padding: 6px; display: flex; gap: 6px; align-items: center; page-break-inside: avoid; }
    .q { width: 90px; height: 90px; } .q svg { width: 90px; height: 90px; }
    .t { font-size: 11px; line-height: 1.35; } small { color: #444; }
  </style></head><body><div class="grid">${label.repeat(Math.max(1, copies))}</div></body></html>`;
}

/** Jewellery sticker stock. `head` = width of each printable end (side A left, side B right);
 *  the barbell tag's thin middle tail is left blank. */
export const STICKERS = {
  B95x12: { label: '95×12', w: 95, h: 12, head: 30 },
  B100x15: { label: '100×15', w: 100, h: 15, head: 33 },
  B90x12: { label: '90×12', w: 90, h: 12, head: 28 },
} as const;
export type StickerSize = keyof typeof STICKERS;

/** Printer setup kept on the phone: sticker stock, printer resolution, and a nudge (mm) to line
 *  the print up with the die-cut. */
export interface StickerSetup { size: StickerSize; dpi: 203 | 300; offX: number; offY: number }
export const DEFAULT_SETUP: StickerSetup = { size: 'B95x12', dpi: 203, offX: 0, offY: 0 };

/** Printer dots per bar the tag barcode gets; under 2 a thermal printer's bars won't scan. */
export function tagBarDots(code: string, setup: StickerSetup) {
  const mods = canCode128(code) ? code128(code).length : 0;
  const { head } = STICKERS[setup.size] ?? STICKERS.B95x12;
  return mods ? Math.floor(Math.floor(((head - 2) * setup.dpi) / 25.4) / mods) : 0; // ≥1 mm quiet zone each side
}

/**
 * Jewellery barbell tag, as on the shop's tags:
 *   Side A: NAME · barcode · CODE (₹ MRP)        Side B: GW / LESS / NW / MKG · QR
 * Barcode (Code 128) and QR both carry only the tag code (SI000015): short codes give wide bars /
 * big QR cells that still scan off a 12 mm tag, and the app looks the item up by that code.
 * Each tag is one PDF page of the exact sticker size.
 */
export function jewelTagHtml(data: JewelTagData, copies = 1, setup: StickerSetup = DEFAULT_SETUP) {
  const { w, h, head } = STICKERS[setup.size] ?? STICKERS.B95x12;
  const code = data.code.trim();
  const f = (k: number) => `${(h * k).toFixed(2)}mm`;
  // Bars and QR cells must be whole printer dots wide, or a thermal printer smears them and the
  // scan fails (checked: 203 dpi, 1.8-dot bars don't decode, 2-dot bars do).
  const dots = (mm: number) => Math.floor((mm * setup.dpi) / 25.4);
  const mm = (d: number) => `${((d * 25.4) / setup.dpi).toFixed(4)}mm`;
  const mods = canCode128(code) ? code128(code).length : 0;
  const barDot = Math.max(1, tagBarDots(code, setup));
  const bars = mods ? `<div class="bc" style="width:${mm(mods * barDot)};margin-left:${mm(Math.floor((dots(head) - mods * barDot) / 2))}">${code128Svg(code, 0)}</div>` : '';
  // Tag codes are A–Z / 0–9 (≤10 chars): alphanumeric mode fits ECC H (recovers 30 %) in the same 21×21 QR
  // that byte mode needs for ECC M (15 %). Smudge test: 50 % → 96 % of damaged tags still read.
  const alnum = code.length <= 10 && /^[0-9A-Z $%*+\-./:]+$/.test(code);
  const qr = qrcode(0, alnum ? 'H' : 'M');
  qr.addData(code, alnum ? 'Alphanumeric' : 'Byte');
  qr.make();
  const qrMods = qr.getModuleCount() + 4; // 2-cell quiet zone each side
  const qrSize = mm(qrMods * Math.max(1, Math.floor(dots(h * 0.88) / qrMods)));
  const fmt3 = (x: number) => (Number(x) || 0).toFixed(3);
  const mrp = Number(data.mrp) > 0 ? ` ₹${amt(Number(data.mrp))}` : '';
  const tag = `<div class="t">
    <div class="s a">
      <div class="ln">${esc(data.name)}</div>
      ${bars}
      <div class="ln">${esc(code)}${esc(mrp)}</div>
    </div>
    <div class="s b">
      <div class="w">
        <div><span>GW</span><span>${fmt3(data.gw)}</span></div>
        <div><span>LESS</span><span>${fmt3(data.less)}</span></div>
        <div><span>NW</span><span>${fmt3(data.nw)}</span></div>
        <div><span>MKG</span><span>${esc(data.mkg)}</span></div>
      </div>
      <div class="q">${qr.createSvgTag({ cellSize: 1, margin: 2, scalable: true })}</div>
    </div>
  </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"/><style>
    @page { size: ${w}mm ${h}mm; margin: 0; }
    html, body { margin: 0; padding: 0; background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .t { position: relative; width: ${w}mm; height: ${h}mm; overflow: hidden; page-break-after: always; break-after: page;
         font-family: "Courier New", Courier, monospace; font-weight: 700; color: #000; }
    .t:last-child { page-break-after: auto; break-after: auto; }
    .s { position: absolute; top: 0; width: ${head}mm; height: ${h}mm; box-sizing: border-box; padding: ${f(0.05)} 1mm;
         transform: translate(${setup.offX}mm, ${setup.offY}mm); }
    .a { left: 0; display: flex; flex-direction: column; justify-content: center; padding-left: 0; padding-right: 0; }
    .a .ln { padding: 0 1mm; }
    .b { right: 0; display: flex; align-items: center; gap: 1mm; }
    .ln { font-size: ${f(0.2)}; line-height: 1.1; white-space: nowrap; overflow: hidden; text-transform: uppercase; }
    .bc { height: ${f(0.42)}; margin: ${f(0.02)} 0; }
    .bc svg, .q svg { width: 100%; height: 100%; display: block; }
    .w { flex: 1; font-size: ${f(0.19)}; line-height: ${f(0.235)}; }
    .w div { display: flex; justify-content: space-between; white-space: nowrap; }
    .q { flex: none; width: ${qrSize}; height: ${qrSize}; }
  </style></head><body>${tag.repeat(Math.max(1, copies))}</body></html>`;
}

export const printLabels = (it: Item, code: string, copies: number) => Print.printAsync({ html: labelHtml(it, code, copies) });

const MM = 72 / 25.4; // PDF points per mm

/** The tags as a PDF whose page is exactly the sticker, so the printer never rescales them. */
export async function jewelTagPdf(data: JewelTagData, copies: number, setup: StickerSetup) {
  const { w, h } = STICKERS[setup.size] ?? STICKERS.B95x12;
  const { uri } = await Print.printToFileAsync({ html: jewelTagHtml(data, copies, setup), width: Math.round(w * MM), height: Math.round(h * MM) });
  return uri;
}

/** Print through the phone's print service (printer plugin / Wi-Fi / Bluetooth label printer). */
export const printJewelTags = async (data: JewelTagData, copies: number, setup: StickerSetup) =>
  Print.printAsync({ uri: await jewelTagPdf(data, copies, setup) });

/** Send the tag PDF to a printer app that has no Android print service (TSC / Bluetooth label apps). */
export const shareJewelTags = async (data: JewelTagData, copies: number, setup: StickerSetup) =>
  Sharing.shareAsync(await jewelTagPdf(data, copies, setup), { mimeType: 'application/pdf', dialogTitle: 'Send tags to printer app' });
