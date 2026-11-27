import qrcode from 'qrcode-generator';
import { esc } from './ui.ts';

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

/** Single 44 mm × 25 mm Agrotech Sticker content with generous side safety insets */
export function agroStickerSingleSvg(data: AgroSticker, offsetX = 3.5, offsetY = 0): string {
  const comp = (data.company || 'TAMRAKAR AGROTECH BORI').trim().toUpperCase();
  const name = (data.name || 'PRODUCT').trim().toUpperCase();
  const batch = (data.batch || '-').trim().toUpperCase();
  const exp = (data.exp || '-').trim().toUpperCase();
  const rate = String(data.rate ?? '0').trim();
  const code = (data.code || 'ZC000001').trim().toUpperCase();
  const qrText = encodeAgroQr(data);
  // Compact 15 mm QR code vertically centered at Y=5.0 mm. Placed safely inside label.
  const qr = agroQrSvg(qrText, offsetX + 26.5, offsetY + 5.0, 15.0);

  return `
  <g class="agro-sticker" transform="translate(0, 0)">
    <!-- White background card with NO border line -->
    <rect x="${offsetX.toFixed(2)}" y="${offsetY.toFixed(2)}" width="44" height="25" fill="#fff"/>

    <!-- Left side details (safe 24.5 mm width so it never touches QR or cuts off at margin) -->
    <!-- Line 1: Company Name -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 4.2).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.95" font-weight="900" fill="#000" ${comp.length > 15 ? `textLength="24.5" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(comp)}</text>

    <!-- Line 2: Product Name -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 8.2).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="2.5" font-weight="900" fill="#000" ${name.length > 11 ? `textLength="24.5" lengthAdjust="spacingAndGlyphs"` : ''}>${esc(name)}</text>

    <!-- Line 3: BATCH & EXPIRY -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 12.0).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.8" font-weight="bold" fill="#000">BATCH: ${esc(batch)}  EXP: ${esc(exp)}</text>

    <!-- Line 4: RATE: ₹<amount> -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 18.2).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="4.2" font-weight="900" fill="#000">RATE: &#8377;${esc(rate)}</text>

    <!-- Line 5: Serial / Item Code -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 22.8).toFixed(2)}" font-family="monospace, Courier" font-size="2.1" font-weight="bold" fill="#000" letter-spacing="0.2">${esc(code)}</text>

    <!-- Right side: Compact QR Code (15 mm) with product details -->
    ${qr}
  </g>`;
}

/** 2-Up Side-by-Side Dual Label SVG (104 mm × 25 mm - Safe margins on both outer sides) */
export function agroSticker2UpSvg(data1: AgroSticker, data2?: AgroSticker): string {
  // If data2 not provided, duplicate or increment code
  let d2 = data2;
  if (!d2) {
    const nextCode = nextSerialCode(data1.code);
    d2 = { ...data1, code: nextCode };
  }

  // Left sticker: starts at 3.5 mm (leaves 3.5 mm margin on left, ends at 47.5 mm)
  const s1 = agroStickerSingleSvg(data1, 3.5, 0);
  // Right sticker: starts at 55.5 mm (ends at 99.5 mm, leaving 4.5 mm margin on right)
  const s2 = agroStickerSingleSvg(d2, 55.5, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 25" width="104mm" height="25mm" style="display:block; background:#fff;" shape-rendering="crispEdges">
    ${s1}
    ${s2}
  </svg>`;
}

/** Single Sticker on 104 mm Roll SVG (Prints on 1 side only: Left part printed, Right part blank) */
export function agroSticker1UpRollSvg(data: AgroSticker): string {
  // Left sticker: starts at 3.5 mm (1 side only). Right side is blank so printer driver does NOT center!
  const s1 = agroStickerSingleSvg(data, 3.5, 0);

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 104 25" width="104mm" height="25mm" style="display:block; background:#fff;" shape-rendering="crispEdges">
    ${s1}
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
  const code = it?.barcode || it?.code || d.barcode || (it?.id ? `ZC${String(it.id).padStart(6, '0')}` : 'ZC000001');

  return { company, name, pack, batch, exp, rate, code };
}

const AGRO_PAGE_ROLL_CSS = '@page { size: 104mm 25mm; margin: 0; }';

/** Opens the Agrotech Barcode & QR Sticker popup window */
export function printAgroStickerWeb(data: AgroSticker, initialMode: '2up' | '1up' = '2up') {
  const svg2Up = agroSticker2UpSvg(data);
  const svg1Up = agroSticker1UpRollSvg(data);

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Agrotech Sticker - ${esc(data.code)}</title>
  <style id="page-size">${AGRO_PAGE_ROLL_CSS}</style>
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
    <button onclick="showMode('2up')" id="btn-2up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '2up' ? '#0284c7' : '#fff'}; color: ${initialMode === '2up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">🏷️ 2-Up Stickers (Both Parts)</button>
    <button onclick="showMode('1up')" id="btn-1up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '1up' ? '#0284c7' : '#fff'}; color: ${initialMode === '1up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Single Sticker (1 Side Only)</button>
    <div style="font-size: 11px; color: #1e3a8a; background: #dbeafe; padding: 4px 8px; border-radius: 4px; font-weight: 600;">
      TSC TE244 &middot; Direct Label Printer
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
      document.getElementById('view-2up').style.display = mode === '2up' ? 'block' : 'none';
      document.getElementById('view-1up').style.display = mode === '1up' ? 'block' : 'none';
      document.getElementById('btn-2up').style.background = mode === '2up' ? '#0284c7' : '#fff';
      document.getElementById('btn-2up').style.color = mode === '2up' ? '#fff' : '#333';
      document.getElementById('btn-1up').style.background = mode === '1up' ? '#0284c7' : '#fff';
      document.getElementById('btn-1up').style.color = mode === '1up' ? '#fff' : '#333';
    }

    async function rasterizeSvgToPng(svgEl, wMm, hMm) {
      const dpi = 203;
      const pxW = Math.round((wMm / 25.4) * dpi);
      const pxH = Math.round((hMm / 25.4) * dpi);
      const xml = new XMLSerializer().serializeToString(svgEl);
      const img = new Image();
      const loadPromise = new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
      });
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
      await loadPromise;

      const c = document.createElement('canvas');
      c.width = pxW;
      c.height = pxH;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.drawImage(img, 0, 0, pxW, pxH);

      const imgData = ctx.getImageData(0, 0, pxW, pxH);
      const d = imgData.data;
      for (let i = 0; i < d.length; i += 4) {
        const lum = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
        const v = lum < 160 ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
        d[i + 3] = 255;
      }
      ctx.putImageData(imgData, 0, 0);
      return c.toDataURL('image/png');
    }

    async function directPrint(btn) {
      const origText = btn.textContent;
      btn.disabled = true;
      btn.textContent = '⏳ Printing…';
      try {
        // Always 104 mm page width so printer driver never centers onto the roll!
        const wMm = 104;
        const hMm = 25;
        const containerId = currentMode === '2up' ? 'view-2up' : 'view-1up';
        const svgEl = document.getElementById(containerId).querySelector('svg');
        const png = await rasterizeSvgToPng(svgEl, wMm, hMm);

        const payload = {
          type: 'agro',
          mode: currentMode,
          printer: 'TSC TE244',
          pngs: [png],
          widthMm: wMm,
          heightMm: hMm,
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

  const w = window.open('', '_blank', 'width=620,height=360');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
