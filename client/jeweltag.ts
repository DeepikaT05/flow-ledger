import qrcode from 'qrcode-generator';
import { esc, api } from './ui.ts';

export interface JewelTag {
  code: string;
  name: string;
  gw: number;
  less: number;
  nw: number;
  mkg: string;
  metal?: string;
}

export function encodeJewelQr(data: JewelTag): string {
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

export function qrSvg(data: string): string {
  const qr = qrcode(0, 'M');
  qr.addData(data);
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
}

export function jewelTagSvg(data: JewelTag): string {
  return qrSvg(encodeJewelQr(data));
}

// ------------------------------------------------------------------ 1D Barcode (Code 128 Set B)
// ISO/IEC 15417 Code 128 specification patterns (107 symbols).
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
];

export function barcode128Svg(rawText: string, height = 30, barScale = 1.3): string {
  const text = String(rawText || '').trim().toUpperCase();
  if (!text) return '';
  const codes: number[] = [104]; // Start Code B
  let checksum = 104;
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    const safeVal = val >= 0 && val <= 94 ? val : 0;
    codes.push(safeVal);
    checksum += (i + 1) * safeVal;
  }
  codes.push(checksum % 103);
  codes.push(106); // Stop Code

  const quiet = Math.round(10 * barScale);
  let curX = quiet;
  const bars: string[] = [];

  for (const c of codes) {
    const pat = CODE128_PATTERNS[c];
    if (!pat) continue;
    let isBar = true;
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10) * barScale;
      if (isBar) {
        bars.push(`<rect x="${curX.toFixed(1)}" y="0" width="${w.toFixed(1)}" height="${height}" fill="#000"/>`);
      }
      curX += w;
      isBar = !isBar;
    }
  }

  const totalW = curX + quiet;
  return `<svg viewBox="0 0 ${totalW.toFixed(1)} ${height}" width="100%" height="${height}" preserveAspectRatio="none" style="display:block; width:100%; height:100%;" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
    <rect width="${totalW.toFixed(1)}" height="${height}" fill="#fff"/>
    ${bars.join('')}
  </svg>`;
}

export function tagOfItem(it: any): JewelTag {
  let d: Record<string, any> = {};
  try { d = JSON.parse(it?.details || '{}'); } catch {}
  const gw = Number(d.jw_gw ?? d.jw_weight ?? 0);
  const less = Number(d.jw_less ?? 0);
  const nw = Number(d.jw_nw ?? (gw ? Math.max(0, gw - less) : (Number(it?.stock) || 0)));
  const mkg = String(d.jw_mkg ?? (d.jw_making ? `${d.jw_making} ${d.jw_making_unit || '%'}` : '5.00 %'));
  const metal = String(d.jw_metal || 'SILVER');
  const code = String(it?.barcode || d.barcode || it?.code || (it?.id ? `PA${String(it.id).padStart(6, '0')}` : 'PA000001'));
  return { code, name: it?.name || 'PRODUCT', gw, less, nw, mkg, metal };
}

export function printItemTag(it: any) {
  printJewelTagWeb(tagOfItem(it));
}

/** 1D Barcode Sticker (Screenshot 2 style: Serial No + 1D Barcode + Product Name) */
export function barcodeStickerHtml(data: JewelTag): string {
  const bSvg = barcode128Svg(data.code, 28, 1.25);
  return `
    <div class="barcode-sticker" style="display:inline-flex; flex-direction:column; align-items:center; justify-content:center; width:220px; padding:6px 10px; border:1.5px solid #000; border-radius:4px; box-sizing:border-box; background:#fff; margin:4px; page-break-inside:avoid; text-align:center;">
      <div style="font-family:monospace; font-size:14px; font-weight:800; letter-spacing:1px; color:#000; margin-bottom:2px;">${esc(data.code)}</div>
      <div style="width:100%; max-width:190px; height:28px; margin:2px 0;">${bSvg}</div>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; font-weight:800; text-transform:uppercase; color:#000; letter-spacing:0.5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:205px; margin-top:2px;">${esc(data.name)}</div>
    </div>`;
}

/** QR printed on the tag: only the tag code (CH001445). A short A–Z/0–9 code fits alphanumeric mode
 *  at ECC H in a 21×21 QR, so its cells stay big enough to scan off a 12 mm sticker; the scanner
 *  looks the item (and its weights) up by that code. */
export function tagQrSvg(code: string): string {
  const c = String(code || '').trim().toUpperCase();
  const alnum = c.length <= 10 && /^[0-9A-Z $%*+\-./:]+$/.test(c);
  const qr = qrcode(0, alnum ? 'H' : 'M');
  qr.addData(c, alnum ? 'Alphanumeric' : 'Byte');
  qr.make();
  return qr.createSvgTag({ cellSize: 1, margin: 0, scalable: true });
}

function qrSvgElements(code: string, x: number, y: number, size: number): string {
  const c = String(code || '').trim().toUpperCase();
  const alnum = c.length <= 10 && /^[0-9A-Z $%*+\-./:]+$/.test(c);
  const qr = qrcode(0, alnum ? 'H' : 'M');
  qr.addData(c, alnum ? 'Alphanumeric' : 'Byte');
  qr.make();
  const count = qr.getModuleCount();
  const cellSize = size / count;
  const rects: string[] = [];
  for (let r = 0; r < count; r++) {
    for (let col = 0; col < count; col++) {
      if (qr.isDark(r, col)) {
        rects.push(`<rect x="${(x + col * cellSize).toFixed(2)}" y="${(y + r * cellSize).toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`);
      }
    }
  }
  return rects.join('');
}

function barcode128Elements(rawText: string, xCenter: number, y: number, height: number, maxW: number): string {
  const text = String(rawText || '').trim().toUpperCase();
  if (!text) return '';
  const codes: number[] = [104];
  let checksum = 104;
  for (let i = 0; i < text.length; i++) {
    const val = text.charCodeAt(i) - 32;
    const safeVal = val >= 0 && val <= 94 ? val : 0;
    codes.push(safeVal);
    checksum += (i + 1) * safeVal;
  }
  codes.push(checksum % 103);
  codes.push(106);

  let totalModules = 0;
  for (const c of codes) {
    const pat = CODE128_PATTERNS[c] || '';
    for (let j = 0; j < pat.length; j++) totalModules += parseInt(pat[j], 10);
  }
  totalModules += 20; // quiet zones
  const moduleW = Math.min(0.15, maxW / totalModules);
  const barW = totalModules * moduleW;
  let curX = xCenter - (barW / 2) + (10 * moduleW);
  const bars: string[] = [];

  for (const c of codes) {
    const pat = CODE128_PATTERNS[c];
    if (!pat) continue;
    let isBar = true;
    for (let j = 0; j < pat.length; j++) {
      const w = parseInt(pat[j], 10) * moduleW;
      if (isBar) {
        bars.push(`<rect x="${curX.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${height.toFixed(2)}" fill="#000"/>`);
      }
      curX += w;
      isBar = !isBar;
    }
  }
  return bars.join('');
}

/** Sticker stock (die-cut roll): 84 x 12 mm overall = 60 mm printable head (two 30 mm faces,
 *  folded back-to-back) + 24 mm blank tail that wraps round the piece. */
export const TAG_STOCK = { w: 84, h: 12, face: 30, tail: 24 } as const;

/** Print CSS for the tag: each tag is one 84 x 12 mm page at 0,0 with no margins. */
export const TAG_PAGE_CSS = `@page { size: ${TAG_STOCK.w}mm ${TAG_STOCK.h}mm; margin: 0; }`;
export const TAG_PAGE_ROTATED_CSS = `@page { size: ${TAG_STOCK.h}mm ${TAG_STOCK.w}mm; margin: 0; }`;

const TAG_PRINT_CSS = `
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print { display: none !important; }
      .tags-wrap { display: block !important; margin: 0 !important; padding: 0 !important; }
      .jewel-tag-page {
        display: block !important;
        margin: 0 !important;
        padding: 0 !important;
        page-break-after: always;
        break-after: page;
        page-break-inside: avoid;
        break-inside: avoid;
        overflow: hidden !important;
      }
      .jewel-tag-page:last-child {
        page-break-after: auto;
        break-after: auto;
      }
      .screen-guide { display: none !important; }
    }`;

/** Jewellery tag laid out as a Single Atomic Vector SVG (84 x 12 mm):
 *  [ details face 30 mm: GW / LESS / NW / MKG + QR | barcode face 30 mm: code · barcode · name ] + tail 24 mm */
function tagSvgInner(data: JewelTag, guides: boolean): string {
  const fmt3 = (n: number) => (Number(n) || 0).toFixed(3);
  const qrRects = qrSvgElements(data.code, 19.5, 0.9, 8.6);
  const barcodeRects = barcode128Elements(data.code, 44.5, 3.0, 3.4, 21);

  return `
    ${guides ? `<!-- Screen Outline Guides (hidden in print) -->
    <rect x="0.2" y="0.2" width="59.6" height="11.6" rx="0.8" fill="none" stroke="#999" stroke-width="0.2" class="screen-guide"/>
    <line x1="30" y1="0.5" x2="30" y2="11.5" stroke="#bbb" stroke-width="0.2" stroke-dasharray="0.8,0.8" class="screen-guide"/>
    <path d="M 60,3.75 L 81.75,3.75 A 2.25,2.25 0 0 1 81.75,8.25 L 60,8.25" fill="none" stroke="#999" stroke-width="0.2" class="screen-guide"/>` : ''}

    <!-- DETAILS FACE (0 to 30 mm): Weights + QR -->
    <g id="face-details">
      <text x="1.5" y="2.2" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" fill="#000">GW</text>
      <text x="18.5" y="2.2" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" text-anchor="end" fill="#000">${fmt3(data.gw)}</text>

      <text x="1.5" y="4.4" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" fill="#000">LESS</text>
      <text x="18.5" y="4.4" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" text-anchor="end" fill="#000">${fmt3(data.less)}</text>

      <text x="1.5" y="6.6" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" fill="#000">NW</text>
      <text x="18.5" y="6.6" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" text-anchor="end" fill="#000">${fmt3(data.nw)}</text>

      <text x="1.5" y="8.8" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" fill="#000">MKG</text>
      <text x="18.5" y="8.8" font-family="'Courier New', Courier, monospace" font-size="2.05" font-weight="bold" text-anchor="end" fill="#000">${esc(data.mkg)}</text>

      <!-- 2D QR Code (8.6 x 8.6 mm) -->
      ${qrRects}
    </g>

    <!-- BARCODE FACE (30 to 60 mm): Tag Code · 1D Barcode · Product Name -->
    <g id="face-barcode">
      <text x="45" y="2.3" font-family="monospace" font-size="2.2" font-weight="900" letter-spacing="0.2" text-anchor="middle" fill="#000"${data.code.length > 14 ? ' textLength="25" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(data.code)}</text>
      <!-- 1D Barcode Code 128 -->
      ${barcodeRects}
      <text x="45" y="9.2" font-family="Arial, Helvetica, sans-serif" font-size="2.05" font-weight="bold" text-anchor="middle" fill="#000"${data.name.length > 16 ? ' textLength="26" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(data.name)}</text>
    </g>
    <!-- Blank Tail (60 to 84 mm) -->
  `;
}

/** Jewellery tag preview: the 84 x 12 mm SVG (with on-screen die-cut guides) in a page box. */
export function jewelTagCardHtml(data: JewelTag, rotated = false): string {
  const innerSvgContent = tagSvgInner(data, true);
  if (rotated) {
    return `
      <div class="jewel-tag-page" style="width:12mm; height:84mm; overflow:hidden; margin:0; padding:0; background:#fff;">
        <svg width="12mm" height="84mm" viewBox="0 0 12 84" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block; width:12mm; height:84mm; background:#fff;">
          <g transform="rotate(90 6 6) translate(0,-72)">
            ${innerSvgContent}
          </g>
        </svg>
      </div>`;
  }

  return `
    <div class="jewel-tag-page" style="width:84mm; height:12mm; overflow:hidden; margin:0; padding:0; background:#fff;">
      <svg width="84mm" height="12mm" viewBox="0 0 84 12" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges" style="display:block; width:84mm; height:12mm; background:#fff;">
        ${innerSvgContent}
      </svg>
    </div>`;
}

// ------------------------------------------------------------------ direct print (no dialog)
/** Label printer resolution: TSC TE244 and most desktop label printers are 203 dpi (8 dots/mm). */
const TAG_DPI = 203;
const TAG_PRINT_H_MM = 12;

/** One tag as a 1-bit PNG at the printer's own resolution (84 x 12 mm -> 671 x 96 px): every
 *  pixel is one printer dot, pure black or white, so the driver has nothing to scale or grey. */
export async function jewelTagPng(data: JewelTag): Promise<string> {
  const w = TAG_STOCK.w;
  const h = TAG_PRINT_H_MM;
  const pxW = Math.round((w / 25.4) * TAG_DPI);
  const pxH = Math.round((h / 25.4) * TAG_DPI);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pxW}" height="${pxH}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">`
    + `<rect width="${w}" height="${h}" fill="#fff"/>${tagSvgInner(data, false)}</svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await img.decode();
  const c = document.createElement('canvas');
  c.width = pxW;
  c.height = pxH;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, pxW, pxH);
  g.drawImage(img, 0, 0, pxW, pxH);
  const px = g.getImageData(0, 0, pxW, pxH);
  const a = px.data;
  for (let i = 0; i < a.length; i += 4) {
    const k = a[i] * 0.299 + a[i + 1] * 0.587 + a[i + 2] * 0.114 < 160 ? 0 : 255;
    a[i] = a[i + 1] = a[i + 2] = k;
    a[i + 3] = 255;
  }
  g.putImageData(px, 0, 0);
  return c.toDataURL('image/png');
}

/** Send tags straight to the label printer: first try local print agent on the client machine (http://127.0.0.1:3211),
 *  then fallback to server API. */
export async function printJewelTagsDirect(tags: JewelTag[]): Promise<{ printed: number; printer: string }> {
  // Same bitmap as the preview, so v2+ agents keep the on-screen layout; also pass `tags` for v1 agents.
  const pngs: string[] = [];
  for (const t of tags) pngs.push(await jewelTagPng(t));
  const body = { pngs, tags, widthMm: TAG_STOCK.w, heightMm: TAG_PRINT_H_MM };

  // 1. Local print agent on the PC the label printer is plugged into
  let res: Response | null = null;
  try {
    res = await fetch('http://127.0.0.1:3211/print-tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {}
  if (res) {
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.ok) return data;
    throw new Error(data.error || `Print agent error ${res.status}`);
  }

  // 2. No agent running: server API (works only if the server itself runs on that Windows PC)
  return api('/print-tags', { method: 'POST', body });
}

/** Wire a tag preview window's Print button: tags go straight to the label printer; the barcode
 *  sticker view (other stock) still uses the browser's print. */
function wireDirectPrint(w: Window, tags: JewelTag[]) {
  (w as any).directPrint = async (btn: HTMLButtonElement) => {
    if ((w as any).__mode === 'sticker') { w.print(); return; }
    const label = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Printing…';
    try {
      const r = await printJewelTagsDirect(tags);
      btn.textContent = `✓ ${r.printed} tag${r.printed === 1 ? '' : 's'} sent to ${r.printer}`;
      setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
    } catch (e) {
      btn.textContent = label;
      btn.disabled = false;
      if (w.confirm(`Could not print directly: ${(e as Error).message}

Print with the browser print dialog instead?`)) w.print();
    }
  };
}

export function printMultipleJewelTags(tags: JewelTag[]) {
  if (!tags.length) return;
  const dualHtml = tags.map((t) => jewelTagCardHtml(t, false)).join('');
  const rotatedHtml = tags.map((t) => jewelTagCardHtml(t, true)).join('');
  const stickerHtml = tags.map((t) => barcodeStickerHtml(t)).join('');
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Print Jewellery Tags (${tags.length})</title>
  <style id="page-size">${TAG_PAGE_CSS}</style>
  <style>
    ${TAG_PRINT_CSS}
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000; background: #f1f5f9;
    }
    .tags-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <button onclick="showMode('dual')" id="btn-dual" style="padding: 6px 14px; font-weight: bold; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🏷️ Horizontal (84 × 12 mm)</button>
    <button onclick="showMode('rotated')" id="btn-rotated" style="padding: 6px 14px; font-weight: bold; background: #fff; color: #333; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">↻ Rotated (12 × 84 mm)</button>
    <button onclick="showMode('sticker')" id="btn-sticker" style="padding: 6px 14px; font-weight: bold; background: #fff; color: #333; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Barcode Sticker</button>
    <div style="font-size: 11.5px; color: #1e3a8a; background: #dbeafe; padding: 5px 10px; border-radius: 4px; font-weight: 600;">
      Print sends tags straight to the label printer (84 × 12 mm) — no print dialog
    </div>
    <button onclick="directPrint(this)" style="margin-left: auto; padding: 6px 18px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print Now</button>
    <button onclick="window.close()" style="padding: 6px 14px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div id="view-dual" class="tags-wrap">${dualHtml}</div>
  <div id="view-rotated" class="tags-wrap" style="display:none;">${rotatedHtml}</div>
  <div id="view-sticker" class="tags-wrap" style="display:none;">${stickerHtml}</div>
  <script>
    function showMode(mode) {
      window.__mode = mode;
      const pageCss = mode === 'dual' ? ${JSON.stringify(TAG_PAGE_CSS)} : mode === 'rotated' ? ${JSON.stringify(TAG_PAGE_ROTATED_CSS)} : '@page { margin: 3mm; size: auto; }';
      document.getElementById('page-size').textContent = pageCss;
      document.getElementById('view-dual').style.display = mode === 'dual' ? 'flex' : 'none';
      document.getElementById('view-rotated').style.display = mode === 'rotated' ? 'flex' : 'none';
      document.getElementById('view-sticker').style.display = mode === 'sticker' ? 'flex' : 'none';
      ['dual', 'rotated', 'sticker'].forEach(m => {
        const b = document.getElementById('btn-' + m);
        if (b) {
          b.style.background = m === mode ? '#0284c7' : '#fff';
          b.style.color = m === mode ? '#fff' : '#333';
        }
      });
    }
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=840,height=620');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    (w as any).__mode = 'dual';
    wireDirectPrint(w, tags);
  }
}

export function printJewelTagWeb(data: JewelTag, initialMode: 'dual' | 'rotated' | 'sticker' = 'dual') {
  const dualHtml = jewelTagCardHtml(data, false);
  const rotatedHtml = jewelTagCardHtml(data, true);
  const stickerHtml = barcodeStickerHtml(data);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Jewellery Tag - ${esc(data.code)}</title>
  <style id="page-size">${initialMode === 'rotated' ? TAG_PAGE_ROTATED_CSS : initialMode === 'dual' ? TAG_PAGE_CSS : '@page { margin: 3mm; size: auto; }'}</style>
  <style>
    ${TAG_PRINT_CSS}
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000; background: #f1f5f9;
    }
    .tags-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <button onclick="showMode('dual')" id="btn-dual" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === 'dual' ? '#0284c7' : '#fff'}; color: ${initialMode === 'dual' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">🏷️ Horizontal (84 × 12 mm)</button>
    <button onclick="showMode('rotated')" id="btn-rotated" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === 'rotated' ? '#0284c7' : '#fff'}; color: ${initialMode === 'rotated' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">↻ Rotated (12 × 84 mm)</button>
    <button onclick="showMode('sticker')" id="btn-sticker" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === 'sticker' ? '#0284c7' : '#fff'}; color: ${initialMode === 'sticker' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Barcode Sticker</button>
    <div style="font-size: 11px; color: #1e3a8a; background: #dbeafe; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
      Print sends tags straight to the label printer (84 × 12 mm) — no print dialog
    </div>
    <button onclick="directPrint(this)" style="margin-left: auto; padding: 6px 16px; font-size: 12px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print</button>
    <button onclick="window.close()" style="padding: 6px 12px; font-size: 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div id="view-dual" style="${initialMode === 'dual' ? 'display:block;' : 'display:none;'}">
    ${dualHtml}
  </div>
  <div id="view-rotated" style="${initialMode === 'rotated' ? 'display:block;' : 'display:none;'}">
    ${rotatedHtml}
  </div>
  <div id="view-sticker" style="${initialMode === 'sticker' ? 'display:block;' : 'display:none;'}">
    ${stickerHtml}
  </div>
  <script>
    function showMode(mode) {
      window.__mode = mode;
      const pageCss = mode === 'dual' ? ${JSON.stringify(TAG_PAGE_CSS)} : mode === 'rotated' ? ${JSON.stringify(TAG_PAGE_ROTATED_CSS)} : '@page { margin: 3mm; size: auto; }';
      document.getElementById('page-size').textContent = pageCss;
      document.getElementById('view-dual').style.display = mode === 'dual' ? 'block' : 'none';
      document.getElementById('view-rotated').style.display = mode === 'rotated' ? 'block' : 'none';
      document.getElementById('view-sticker').style.display = mode === 'sticker' ? 'block' : 'none';
      ['dual', 'rotated', 'sticker'].forEach(m => {
        const b = document.getElementById('btn-' + m);
        if (b) {
          b.style.background = m === mode ? '#0284c7' : '#fff';
          b.style.color = m === mode ? '#fff' : '#333';
        }
      });
    }
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=580,height=340');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
    (w as any).__mode = initialMode;
    wireDirectPrint(w, [data]);
  }
}
