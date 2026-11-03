// Item codes for QR / barcode scanning. The code lives in the product form's BARCODE field
// (items.details.barcode): a maker's printed barcode / QR, or one we generate ("FL000012").
import qrcode from 'qrcode-generator';
import * as Print from 'expo-print';
import { Item } from '../types';
import { amt } from './format';

export const codeOf = (it: Pick<Item, 'details'>): string => {
  try { return String(JSON.parse(it.details || '{}').barcode ?? '').trim(); } catch { return ''; }
};

/** Our own code for an item that has none printed on it. */
export const newCode = (id: number) => `FL${String(id).padStart(6, '0')}`;

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

/** Sticker sheet: `copies` QR labels (name, pack, MRP, code) to print and stick on the product. */
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

export const printLabels = (it: Item, code: string, copies: number) => Print.printAsync({ html: labelHtml(it, code, copies) });
