// Item codes for QR / barcode scanning. The code lives in the product form's BARCODE field
// (items.details.barcode): a maker's printed barcode / QR, or one we generate ("FL000012").
import qrcode from 'qrcode-generator';
import * as Print from 'expo-print';
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

/** Encode jewelry tag payload into QR string (JSON or structured). */
export function encodeJewelQr(data: JewelTagData): string {
  return JSON.stringify({
    type: 'JEWEL',
    code: data.code,
    name: data.name,
    gw: Number(data.gw) || 0,
    less: Number(data.less) || 0,
    nw: Number(data.nw) || 0,
    mkg: data.mkg || '5.00 %',
  });
}

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

  // 3. Match from local items list
  const found = findByCode(itemsList, str);
  if (found) {
    return jewelDataFromItem(found, str);
  }

  return null;
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

/**
 * 2-Side Jewelry Barbell / Butterfly Tag (matches user's photos):
 * Side A: Code (e.g. PA002332) + QR Code + Product Name (e.g. PAYAL AAGRA)
 * Side B: GW, LESS, NW, MKG in clean, bold, tabular format
 */
export function jewelTagHtml(data: JewelTagData, copies = 1) {
  const payload = encodeJewelQr(data);
  const qr = qrcode(0, 'M');
  qr.addData(payload);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });

  const fmt3 = (n: number) => (Number(n) || 0).toFixed(3);
  const tagHtml = `
    <div class="jewel-tag">
      <!-- Side A: Code, QR, Name -->
      <div class="tag-side side-a">
        <div class="tag-code">${esc(data.code)}</div>
        <div class="tag-qr">${svg}</div>
        <div class="tag-name">${esc(data.name)}</div>
      </div>
      <!-- Center Bridge / Fold line -->
      <div class="tag-bridge"></div>
      <!-- Side B: Weights & Making (GW, LESS, NW, MKG) -->
      <div class="tag-side side-b">
        <div class="w-row"><span class="w-lbl">GW</span><span class="w-val">${fmt3(data.gw)}</span></div>
        <div class="w-row"><span class="w-lbl">LESS</span><span class="w-val">${fmt3(data.less)}</span></div>
        <div class="w-row bold"><span class="w-lbl">NW</span><span class="w-val">${fmt3(data.nw)}</span></div>
        <div class="w-row"><span class="w-lbl">MKG</span><span class="w-val">${esc(data.mkg)}</span></div>
      </div>
    </div>
  `;

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
    <style>
      @page {
        margin: 4mm;
        size: auto;
      }
      body {
        margin: 0;
        padding: 8px;
        background: #fff;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
        color: #000;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
      .tag-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .jewel-tag {
        display: flex;
        flex-direction: row;
        align-items: stretch;
        width: 320px;
        min-height: 80px;
        border: 1px solid #111;
        border-radius: 4px;
        background: #fff;
        page-break-inside: avoid;
        box-sizing: border-box;
        overflow: hidden;
      }
      .tag-side {
        flex: 1;
        padding: 5px 8px;
        display: flex;
        flex-direction: column;
        justify-content: center;
        box-sizing: border-box;
      }
      .side-a {
        align-items: center;
        text-align: center;
        border-right: 1px dashed #666;
      }
      .tag-code {
        font-size: 13px;
        font-weight: 800;
        letter-spacing: 0.5px;
        margin-bottom: 2px;
        font-family: monospace;
      }
      .tag-qr {
        width: 48px;
        height: 48px;
        margin: 1px 0;
      }
      .tag-qr svg {
        width: 48px;
        height: 48px;
        display: block;
      }
      .tag-name {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        margin-top: 2px;
        max-width: 140px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .tag-bridge {
        width: 12px;
        background: repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 6px);
        border-right: 1px dashed #666;
      }
      .side-b {
        justify-content: space-around;
        padding-left: 10px;
        font-family: monospace;
      }
      .w-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 13px;
        line-height: 1.25;
        font-weight: 600;
      }
      .w-row.bold {
        font-weight: 800;
        border-top: 1px solid #ccc;
        border-bottom: 1px solid #ccc;
        padding: 1px 0;
      }
      .w-lbl {
        color: #222;
        letter-spacing: 0.5px;
      }
      .w-val {
        color: #000;
        text-align: right;
        font-weight: 800;
      }
      @media print {
        body { padding: 0; }
        .jewel-tag {
          border: 1px solid #000;
          box-shadow: none;
          margin-bottom: 6px;
        }
      }
    </style>
  </head>
  <body>
    <div class="tag-grid">
      ${tagHtml.repeat(Math.max(1, copies))}
    </div>
  </body>
  </html>`;
}

export const printLabels = (it: Item, code: string, copies: number) => Print.printAsync({ html: labelHtml(it, code, copies) });
export const printJewelTags = (data: JewelTagData, copies: number) => Print.printAsync({ html: jewelTagHtml(data, copies) });
