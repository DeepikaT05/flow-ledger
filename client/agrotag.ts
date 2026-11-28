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
  const pathParts: string[] = [];

  for (let r = 0; r < count; r++) {
    let c = 0;
    while (c < count) {
      if (qr.isDark(r, c)) {
        const startC = c;
        while (c < count && qr.isDark(r, c)) c++;
        const runLen = c - startC;
        const px = (x + startC * cellSize).toFixed(2);
        const py = (y + r * cellSize).toFixed(2);
        const w = (runLen * cellSize).toFixed(2);
        const h = cellSize.toFixed(2);
        pathParts.push(`M${px},${py}h${w}v${h}h-${w}z`);
      } else {
        c++;
      }
    }
  }

  return `<g class="qr-code">
    <rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${size.toFixed(2)}" height="${size.toFixed(2)}" fill="#fff"/>
    <path d="${pathParts.join('')}" fill="#000"/>
  </g>`;
}

/** Single 44 mm × 25 mm Agrotech Sticker content with generous space for long product names */
export function agroStickerSingleSvg(data: AgroSticker, offsetX = 3.5, offsetY = 0): string {
  const comp = (data.company || 'TAMRAKAR AGROTECH BORI').trim().toUpperCase();
  const name = (data.name || 'PRODUCT').trim().toUpperCase();
  const batch = (data.batch || '-').trim().toUpperCase();
  const exp = (data.exp || '-').trim().toUpperCase();
  const rate = String(data.rate ?? '0').trim();
  const code = (data.code || 'ZC000001').trim().toUpperCase();
  const qrText = encodeAgroQr(data);
  // Compact 13 mm QR code placed lower down at Y=9.8 mm, freeing full 41 mm width across top for product name!
  const qr = agroQrSvg(qrText, offsetX + 29.0, offsetY + 9.8, 13.0);

  // Dynamic font sizing for long product names
  let nameFontSize = '2.7';
  let nameAttrs = '';
  if (name.length > 25) {
    nameFontSize = '2.0';
    nameAttrs = 'textLength="41.0" lengthAdjust="spacingAndGlyphs"';
  } else if (name.length > 15) {
    nameFontSize = '2.35';
    nameAttrs = 'textLength="41.0" lengthAdjust="spacingAndGlyphs"';
  }

  return `
  <g class="agro-sticker" transform="translate(0, 0)">
    <!-- White background card with NO border line -->
    <rect x="${offsetX.toFixed(2)}" y="${offsetY.toFixed(2)}" width="44" height="25" fill="#fff"/>

    <!-- Line 1: Company Name (spans full top width up to 41 mm) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 3.6).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.95" font-weight="900" fill="#000" ${comp.length > 22 ? 'textLength="41.0" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(comp)}</text>

    <!-- Line 2: Product Name (FULL 41 mm WIDTH above QR code - fits long names easily!) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 7.6).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="${nameFontSize}" font-weight="900" fill="#000" ${nameAttrs}>${esc(name)}</text>

    <!-- Details below Product Name -->
    <!-- Line 3: BATCH (Separate Line) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 10.5).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.85" font-weight="bold" fill="#000">BATCH: ${esc(batch)}</text>

    <!-- Line 4: EXPIRY (Below Batch, Not Side-by-Side) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 13.6).toFixed(2)}" font-family="Arial, Helvetica, sans-serif" font-size="1.85" font-weight="bold" fill="#000">EXP: ${esc(exp)}</text>

    <!-- Line 5: RATE: ₹<amount> (Prominent Heavy Font, reduced by 0.5 to 3.5) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 17.3).toFixed(2)}" font-family="'Arial Black', Arial, Helvetica, sans-serif" font-size="3.5" font-weight="900" fill="#000">RATE: &#8377;${esc(rate)}</text>

    <!-- Line 6: Serial Code (BADA Monospace Font, prominent & clear) -->
    <text x="${(offsetX + 1.2).toFixed(2)}" y="${(offsetY + 21.8).toFixed(2)}" font-family="monospace, Courier" font-size="2.9" font-weight="900" fill="#000" letter-spacing="0.3">${esc(code)}</text>

    <!-- Right side lower: Compact 13 mm QR Code placed at Y=9.6 mm -->
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

/** Opens bulk printing popup window for multiple Agrotech Barcode & QR Stickers */
export function printMultipleAgroStickersWeb(stickers: AgroSticker[], initialMode: '2up' | '1up' = '2up') {
  if (!stickers || !stickers.length) return;

  const w = window.open('', '_blank', 'width=840,height=700');
  if (!w) {
    alert('Popup blocked by browser. Please allow popups for this site.');
    return;
  }

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Bulk Print Agrotech Stickers (${stickers.length} Items)</title>
  <style id="page-size">${AGRO_PAGE_ROLL_CSS}</style>
  <style>
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #000; background: #f1f5f9;
    }
    .top-toolbar {
      position: sticky; top: 0; z-index: 999;
      margin-bottom: 14px; display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
      background: #fff; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 6px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .stickers-list {
      display: flex; flex-direction: column; gap: 10px; align-items: center;
    }
    .sticker-card {
      background: #fff;
      padding: 8px 12px 10px;
      border: 1px solid #cbd5e1;
      border-radius: 6px;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      display: inline-block;
    }
    .sticker-header-label {
      font-size: 11px; font-weight: 700; color: #475569; margin-bottom: 4px;
      font-family: monospace;
    }
    .loading-banner {
      padding: 16px; font-weight: 700; color: #0284c7; text-align: center;
    }
    @media print {
      body { padding: 0 !important; margin: 0 !important; background: #fff !important; }
      .no-print { display: none !important; }
      .sticker-header-label { display: none !important; }
      .stickers-list { display: block !important; }
      .sticker-card {
        border: none !important;
        padding: 0 !important;
        margin: 0 !important;
        box-shadow: none !important;
        background: transparent !important;
        page-break-after: always;
        break-after: page;
      }
      .sticker-svg-wrap {
        margin: 0 !important;
        padding: 0 !important;
      }
    }
  </style>
</head>
<body>
  <div class="no-print top-toolbar">
    <button onclick="switchMode('2up')" id="btn-2up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '2up' ? '#0284c7' : '#fff'}; color: ${initialMode === '2up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">🏷️ 2-Up Stickers (Both Parts)</button>
    <button onclick="switchMode('1up')" id="btn-1up" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === '1up' ? '#0284c7' : '#fff'}; color: ${initialMode === '1up' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Single Sticker (1 Side Only)</button>
    <div id="status-badge" style="font-size: 11px; color: #1e3a8a; background: #dbeafe; padding: 4px 8px; border-radius: 4px; font-weight: 700;">
      TSC TE244 &middot; Direct Label Printer &middot; <span id="ready-count">0</span> / ${stickers.length} Ready
    </div>
    <button id="btn-print" onclick="directPrintAll(this)" style="margin-left: auto; padding: 6px 18px; font-size: 12px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer; box-shadow:0 1px 3px rgba(0,0,0,0.15);">
      🖨️ Bulk Print All (${stickers.length})
    </button>
    <button onclick="window.close()" style="padding: 6px 12px; font-size: 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>

  <div id="stickers-container" class="stickers-list"></div>
  <div id="loading-indicator" class="no-print loading-banner">Rendering stickers...</div>

  <script>
    let currentMode = '${initialMode}';
    let renderedCount = 0;
    const totalCount = ${stickers.length};
    const stickersData = ${JSON.stringify(stickers).replace(/<\/script/gi, '<\\/script')};
    const container = document.getElementById('stickers-container');
    const loadingEl = document.getElementById('loading-indicator');
    const readyCountEl = document.getElementById('ready-count');

    function renderNextChunk(chunkSize = 35) {
      if (!window.__renderCard) {
        setTimeout(() => renderNextChunk(chunkSize), 16);
        return;
      }
      const end = Math.min(renderedCount + chunkSize, totalCount);
      const frag = document.createDocumentFragment();
      for (let i = renderedCount; i < end; i++) {
        const item = stickersData[i];
        if (!item) continue;
        const div = document.createElement('div');
        div.className = 'sticker-card';
        div.dataset.idx = String(i);
        div.innerHTML = window.__renderCard(item, i, currentMode);
        frag.appendChild(div);
      }
      container.appendChild(frag);
      renderedCount = end;
      if (readyCountEl) readyCountEl.textContent = String(renderedCount);

      if (renderedCount < totalCount) {
        setTimeout(() => renderNextChunk(chunkSize), 10);
      } else {
        if (loadingEl) loadingEl.style.display = 'none';
        const badge = document.getElementById('status-badge');
        if (badge) {
          badge.style.background = '#dcfce7';
          badge.style.color = '#15803d';
          badge.innerHTML = 'TSC TE244 &middot; Direct Label Printer &middot; <strong>' + totalCount + ' / ' + totalCount + ' Ready</strong>';
        }
      }
    }

    function renderAllNow() {
      if (!window.__renderCard || renderedCount >= totalCount) return;
      const frag = document.createDocumentFragment();
      for (let i = renderedCount; i < totalCount; i++) {
        const item = stickersData[i];
        if (!item) continue;
        const div = document.createElement('div');
        div.className = 'sticker-card';
        div.dataset.idx = String(i);
        div.innerHTML = window.__renderCard(item, i, currentMode);
        frag.appendChild(div);
      }
      container.appendChild(frag);
      renderedCount = totalCount;
      if (readyCountEl) readyCountEl.textContent = String(totalCount);
      if (loadingEl) loadingEl.style.display = 'none';
      const badge = document.getElementById('status-badge');
      if (badge) {
        badge.style.background = '#dcfce7';
        badge.style.color = '#15803d';
        badge.innerHTML = 'TSC TE244 &middot; Direct Label Printer &middot; <strong>' + totalCount + ' / ' + totalCount + ' Ready</strong>';
      }
    }

    window.onbeforeprint = renderAllNow;
    setTimeout(() => renderNextChunk(35), 10);

    function switchMode(mode) {
      if (currentMode === mode) return;
      currentMode = mode;
      document.getElementById('btn-2up').style.background = mode === '2up' ? '#0284c7' : '#fff';
      document.getElementById('btn-2up').style.color = mode === '2up' ? '#fff' : '#333';
      document.getElementById('btn-1up').style.background = mode === '1up' ? '#0284c7' : '#fff';
      document.getElementById('btn-1up').style.color = mode === '1up' ? '#fff' : '#333';
      container.innerHTML = '';
      renderedCount = 0;
      if (loadingEl) loadingEl.style.display = 'block';
      const badge = document.getElementById('status-badge');
      if (badge) {
        badge.style.background = '#dbeafe';
        badge.style.color = '#1e3a8a';
        badge.innerHTML = 'TSC TE244 &middot; Direct Label Printer &middot; <span id="ready-count">0</span> / ' + totalCount + ' Ready';
      }
      renderNextChunk(35);
    }

    async function rasterizeSvgToPng(svgEl, wMm, hMm, canvas, ctx) {
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
      return canvas.toDataURL('image/png');
    }

    async function directPrintAll(btn) {
      const origText = btn.textContent;
      btn.disabled = true;
      try {
        if (renderedCount < totalCount) {
          btn.textContent = '⏳ Completing render…';
          renderAllNow();
        }

        const wMm = 104;
        const hMm = 25;
        const svgEls = Array.from(container.querySelectorAll('.sticker-svg-wrap svg'));
        if (!svgEls.length) throw new Error('No stickers found to print');

        const dpi = 203;
        const pxW = Math.round((wMm / 25.4) * dpi);
        const pxH = Math.round((hMm / 25.4) * dpi);
        const canvas = document.createElement('canvas');
        canvas.width = pxW;
        canvas.height = pxH;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const allPngs = [];
        for (let i = 0; i < svgEls.length; i++) {
          btn.textContent = '⏳ Rasterizing ' + (i + 1) + '/' + svgEls.length + '…';
          const png = await rasterizeSvgToPng(svgEls[i], wMm, hMm, canvas, ctx);
          allPngs.push(png);
        }

        const BATCH_SIZE = 50;
        let totalSent = 0;
        for (let i = 0; i < allPngs.length; i += BATCH_SIZE) {
          const chunk = allPngs.slice(i, i + BATCH_SIZE);
          btn.textContent = '⏳ Printing batch ' + (Math.floor(i / BATCH_SIZE) + 1) + '/' + Math.ceil(allPngs.length / BATCH_SIZE) + ' (' + chunk.length + ' labels)…';
          const payload = {
            type: 'agro',
            mode: currentMode,
            printer: 'TSC TE244',
            pngs: chunk,
            widthMm: wMm,
            heightMm: hMm
          };
          const res = await fetch('http://127.0.0.1:3211/print-tags', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          if (!res.ok) throw new Error('Agent HTTP ' + res.status);
          totalSent += chunk.length;
        }

        btn.textContent = '✓ Successfully printed ' + totalSent + ' labels!';
        setTimeout(() => { btn.disabled = false; btn.textContent = origText; }, 3000);
      } catch (e) {
        if (confirm('Direct Print Agent error or not running on port 3211:\\n' + (e.message || e) + '\\n\\nWould you like to print using the browser print dialog instead?')) {
          window.print();
        }
        btn.disabled = false;
        btn.textContent = origText;
      }
    }
  </script>
</body>
</html>`;

  w.document.open();
  w.document.write(html);
  w.document.close();

  (w as any).__stickers = stickers;
  (w as any).__renderCard = (s: AgroSticker, i: number, mode: '2up' | '1up') => {
    if (!s) return '';
    const svg = mode === '2up' ? agroSticker2UpSvg(s) : agroSticker1UpRollSvg(s);
    return `
      <div class="sticker-header-label">#${i + 1} &middot; ${esc(s.name || '')} &middot; ₹${esc(String(s.rate ?? '0'))} (${esc(s.code || '')})</div>
      <div class="sticker-svg-wrap">${svg}</div>
    `;
  };
  if (typeof (w as any).renderNextChunk === 'function') {
    (w as any).renderNextChunk(35);
  }
}
