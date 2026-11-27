import qrcode from 'qrcode-generator';
import { esc, api } from './ui.ts';
import { isJewellery } from './jewellery.ts';

export interface AgroSticker {
  company: string;
  name: string;
  pack?: string;
  batch: string;
  exp: string;
  rate: number | string;
  code: string;
  qrData?: string;
}

/** Formats product details inside the QR code */
export function encodeAgroQr(data: AgroSticker): string {
  if (data.qrData) return data.qrData;
  return [
    data.company,
    `ITEM: ${data.name}`,
    `BATCH: ${data.batch || '-'}`,
    `EXP: ${data.exp || '-'}`,
    `RATE: Rs.${data.rate}`,
    `CODE: ${data.code}`,
  ].join('\n');
}

/** Generates clean SVG elements for QR code placed inside an SVG viewport */
export function agroQrSvg(text: string, x: number, y: number, size: number): string {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const count = qr.getModuleCount();
  const cellSize = size / count;
  const rects: string[] = [];

  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) {
        const px = x + c * cellSize;
        const py = y + r * cellSize;
        rects.push(`<rect x="${px.toFixed(2)}" y="${py.toFixed(2)}" width="${cellSize.toFixed(2)}" height="${cellSize.toFixed(2)}" fill="#000"/>`);
      }
    }
  }

  return `<g class="qr-code">
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="#fff"/>
    ${rects.join('')}
  </g>`;
}

/** Single 50 mm × 25 mm Agrotech Sticker SVG (Image 2 style) */
export function agroStickerSingleSvg(data: AgroSticker, offsetX = 0, offsetY = 0): string {
  const comp = (data.company || 'TAMRAKAR AGROTECH BORI').trim().toUpperCase();
  const name = (data.name || 'PRODUCT').trim().toUpperCase();
  const batch = (data.batch || '-').trim().toUpperCase();
  const exp = (data.exp || '-').trim().toUpperCase();
  const rate = String(data.rate ?? '0').trim();
  const code = (data.code || 'ZC000001').trim().toUpperCase();
  const qrText = encodeAgroQr(data);
  const qr = agroQrSvg(qrText, offsetX + 28.5, offsetY + 2.0, 20.5);

  return `
  <g class="agro-sticker" transform="translate(0, 0)">
    <!-- White background card with NO border line -->
    <rect x="${offsetX.toFixed(2)}" y="${offsetY.toFixed(2)}" width="50" height="25" fill="#fff"/>

    <!-- Left side details -->
    <!-- Line 1: Company Name (auto-fit width so it never touches QR) -->
    <text x="${(offsetX + 1.5).toFixed(2)}" y="${(offsetY + 3.8).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="2.0" font-weight="900" fill="#000" ${comp.length > 15 ? `textLength="25.5" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(comp)}</text>

    <!-- Line 2: Product Name (Bold Large, auto-fit width) -->
    <text x="${(offsetX + 1.5).toFixed(2)}" y="${(offsetY + 7.8).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="2.6" font-weight="900" fill="#000" ${name.length > 13 ? `textLength="25.5" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(name)}</text>

    <!-- Line 3: BATCH & EXPIRY -->
    <text x="${(offsetX + 1.5).toFixed(2)}" y="${(offsetY + 11.8).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.9" font-weight="bold" fill="#000">BATCH: ${esc(batch)}  EXP: ${esc(exp)}</text>

    <!-- Line 4: RATE: ₹<amount> (Prominent Heavy Font) -->
    <text x="${(offsetX + 1.5).toFixed(2)}" y="${(offsetY + 18.2).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="4.2" font-weight="900" fill="#000">RATE: &#8377;${esc(rate)}</text>

    <!-- Line 5: Serial / Item Code (Monospace) -->
    <text x="${(offsetX + 1.5).toFixed(2)}" y="${(offsetY + 22.8).toFixed(2)}" font-family="monospace, Courier" font-size="2.1" font-weight="bold" fill="#000" letter-spacing="0.2">${esc(code)}</text>

    <!-- Right side: QR Code with product details -->
    ${qr}
  </g>`;
}

/** 2-Up Side-by-Side Dual Label SVG (100 mm × 25 mm - Zero Gap between stickers) */
export function agroSticker2UpSvg(data1: AgroSticker, data2?: AgroSticker): string {
  // If data2 not provided, duplicate or increment code
  let d2 = data2;
  if (!d2) {
    const nextCode = nextSerialCode(data1.code);
    d2 = { ...data1, code: nextCode };
  }

  const s1 = agroStickerSingleSvg(data1, 0, 0);
  const s2 = agroStickerSingleSvg(d2, 50, 0); // No gap: second sticker starts exactly at 50mm

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 25" width="100mm" height="25mm" style="display:block; background:#fff;" shape-rendering="crispEdges">
    ${s1}
    ${s2}
  </svg>`;
}

/** Helper to generate next sequential serial code (e.g. ZC000003 -> ZC000004) */
function nextSerialCode(code: string): string {
  const m = String(code || '').match(/^(.*?)(\d+)$/);
  if (m) {
    const prefix = m[1];
    const num = parseInt(m[2], 10) + 1;
    return `${prefix}${String(num).padStart(m[2].length, '0')}`;
  }
  return `${code || 'ZC000001'}-2`;
}

/** Converts Item + Company row to an AgroSticker object */
export function agroTagOfItem(it: any, co?: any): AgroSticker {
  let d: Record<string, any> = {};
  try { d = JSON.parse(it?.details || '{}'); } catch {}

  const compName = co?.name || it?.company_name || 'TAMRAKAR AGROTECH';
  const station = co?.station || '';
  const company = station && !compName.includes(station) ? `${compName} ${station}` : compName;

  const rawName = (it?.name || 'PRODUCT').trim();
  const pack = (it?.pack || d.pack || '').trim();
  const name = pack && !rawName.toLowerCase().includes(pack.toLowerCase()) ? `${rawName} ${pack}` : rawName;

  const batch = it?.batch || it?.batch_no || d.batch || d.batch_no || '8/2';
  let exp = it?.expiry || it?.exp || d.expiry || '11/2028';
  if (/^\d{4}-\d{2}/.test(exp)) {
    const [y, m] = exp.split('-');
    exp = `${m}/${y}`;
  }

  const rate = it?.sale_rate || it?.mrp || it?.rate || d.rate || '99';
  const code = it?.barcode || it?.code || d.barcode || (it?.id ? `ZC${String(it.id).padStart(6, '0')}` : 'ZC000003');

  return { company, name, pack, batch, exp, rate, code };
}

const AGRO_PAGE_2UP_CSS = '@page { size: 100mm 25mm; margin: 0; }';
const AGRO_PAGE_1UP_CSS = '@page { size: 50mm 25mm; margin: 0; }';

/** Prints direct to local printer agent (127.0.0.1:3211) */
export async function printAgroStickersDirect(stickers: AgroSticker[]): Promise<{ printed: number; printer: string }> {
  const payload = {
    type: 'agro',
    printer: 'TSC TE244',
    stickers: stickers.map((s) => ({
      ...s,
      qrData: encodeAgroQr(s),
    })),
  };

  const res = await fetch('http://127.0.0.1:3211/print-tags', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Local print agent HTTP ${res.status}`);
  }

  return await res.json();
}

/** Opens the Agrotech Barcode & QR Sticker popup window (Image 2 style) */
export function printAgroStickerWeb(data: AgroSticker, initialMode: '2up' | '1up' = '2up') {
  const svg2Up = agroSticker2UpSvg(data);
  const svg1Up = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 50 25" width="50mm" height="25mm" style="display:block; background:#fff;" shape-rendering="crispEdges">
    ${agroStickerSingleSvg(data, 0, 0)}
  </svg>`;

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Agrotech Sticker - ${esc(data.code)}</title>
  <style id="page-size">${initialMode === '2up' ? AGRO_PAGE_2UP_CSS : AGRO_PAGE_1UP_CSS}</style>
  <style>
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #000; background: #f1f5f9;
    }
    .sticker-container {
      background: #fff;
      padding: 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      display: inline-block;
      box-shadow: 0 1px 4px rgba(0,0,0,0.1);
    }
    @media print {
      body { padding: 0; background: #fff; }
      .no-print { display: none !important; }
      .sticker-container { border: none; padding: 0; box-shadow: none; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; background: #fff; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px; box-shadow: 0 1px 3px rgba(0,0,0,0.08);">
    <button onclick="showMode('2up')" id="btn-2up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '2up' ? '#0284c7' : '#fff'}; color: ${initialMode === '2up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">🏷️ 2-Up Sticker (100 × 25 mm)</button>
    <button onclick="showMode('1up')" id="btn-1up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '1up' ? '#0284c7' : '#fff'}; color: ${initialMode === '1up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Single Sticker (50 × 25 mm)</button>
    <div style="font-size: 11px; color: #1e3a8a; background: #dbeafe; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
      Agrotech Product Sticker (QR contains details) &middot; TSC TE244
    </div>
    <button onclick="directPrint(this)" style="margin-left: auto; padding: 6px 16px; font-size: 12px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print</button>
    <button onclick="window.close()" style="padding: 6px 12px; font-size: 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>

  <div id="view-2up" class="sticker-container" style="${initialMode === '2up' ? 'display:block;' : 'display:none;'}">
    ${svg2Up}
  </div>
  <div id="view-1up" class="sticker-container" style="${initialMode === '1up' ? 'display:block;' : 'display:none;'}">
    ${svg1Up}
  </div>

  <script>
    let currentMode = '${initialMode}';
    function showMode(mode) {
      currentMode = mode;
      document.getElementById('page-size').textContent = mode === '2up' ? ${JSON.stringify(AGRO_PAGE_2UP_CSS)} : ${JSON.stringify(AGRO_PAGE_1UP_CSS)};
      document.getElementById('view-2up').style.display = mode === '2up' ? 'block' : 'none';
      document.getElementById('view-1up').style.display = mode === '1up' ? 'block' : 'none';
      document.getElementById('btn-2up').style.background = mode === '2up' ? '#0284c7' : '#fff';
      document.getElementById('btn-2up').style.color = mode === '2up' ? '#fff' : '#333';
      document.getElementById('btn-1up').style.background = mode === '1up' ? '#0284c7' : '#fff';
      document.getElementById('btn-1up').style.color = mode === '1up' ? '#fff' : '#333';
    }

    async function directPrint(btn) {
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Printing…';
      try {
        const payload = {
          type: 'agro',
          mode: currentMode,
          printer: 'TSC TE244',
          stickers: [${JSON.stringify(data)}]
        };
        const res = await fetch('http://127.0.0.1:3211/print-tags', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Agent HTTP ' + res.status);
        const json = await res.json();
        btn.textContent = '✓ Printed to ' + (json.printer || 'TSC TE244');
        setTimeout(() => { btn.disabled = false; btn.textContent = origText; }, 2000);
      } catch (e) {
        if (confirm('Local Print Agent is not running on port 3211.\\n\\nWould you like to print using the browser print dialog instead?\\n\\n(Note: To print directly to TSC TE244 without print dialog, run start_agent.bat on your Windows PC)')) {
          window.print();
        }
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=600,height=360');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
