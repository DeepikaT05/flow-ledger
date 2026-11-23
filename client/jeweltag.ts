import qrcode from 'qrcode-generator';
import { esc } from './ui.ts';

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
  return `<svg viewBox="0 0 ${totalW.toFixed(1)} ${height}" width="100%" height="${height}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">
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

/** Dual Jewellery Dumbbell Tag: 1D Barcode (Screenshot 2) on Side A, 2D QR + Weights on Side B */
export function jewelTagCardHtml(data: JewelTag): string {
  const qSvg = jewelTagSvg(data);
  const bSvg = barcode128Svg(data.code, 24, 1.15);
  const fmt3 = (n: number) => (Number(n) || 0).toFixed(3);
  return `
    <div class="jewel-tag" style="display:inline-flex; flex-direction:row; align-items:stretch; width:360px; min-height:92px; border:1.5px solid #000; border-radius:4px; box-sizing:border-box; overflow:hidden; page-break-inside:avoid; margin:4px; background:#fff;">
      <!-- SIDE A: 1D Barcode Sticker Style (Screenshot 2) -->
      <div class="side-a" style="flex:1.2; padding:6px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; border-right:1px dashed #444;">
        <div class="tag-code" style="font-size:13px; font-weight:800; font-family:monospace; letter-spacing:0.8px; color:#000;">${esc(data.code)}</div>
        <div class="tag-barcode" style="width:100%; height:24px; margin:2px 0;">${bSvg}</div>
        <div class="tag-name" style="font-size:11px; font-weight:800; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px; color:#000;">${esc(data.name)}</div>
      </div>
      <!-- DUMBBELL FOLD / BRIDGE -->
      <div class="tag-bridge" style="width:12px; background:repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 6px); border-right:1px dashed #444;"></div>
      <!-- SIDE B: 2D QR Code + Weights -->
      <div class="side-b" style="flex:1.3; padding:6px 8px; display:flex; flex-direction:row; align-items:center; gap:6px; font-family:monospace;">
        <div class="tag-qr" style="width:52px; height:52px; flex-shrink:0;">${qSvg}</div>
        <div class="w-table" style="flex:1; display:flex; flex-direction:column; justify-content:space-between; font-size:11.5px; line-height:1.25;">
          <div style="display:flex; justify-content:space-between;"><span>GW:</span><b style="font-weight:800;">${fmt3(data.gw)}</b></div>
          <div style="display:flex; justify-content:space-between;"><span>LESS:</span><b style="font-weight:800;">${fmt3(data.less)}</b></div>
          <div style="display:flex; justify-content:space-between; border-top:1px solid #aaa; border-bottom:1px solid #aaa; padding:1px 0; color:#15803d;"><span style="font-weight:800;">NW:</span><b style="font-weight:800;">${fmt3(data.nw)}</b></div>
          <div style="display:flex; justify-content:space-between;"><span>MKG:</span><b>${esc(data.mkg)}</b></div>
        </div>
      </div>
    </div>`;
}

export function printMultipleJewelTags(tags: JewelTag[]) {
  if (!tags.length) return;
  const dualHtml = tags.map((t) => jewelTagCardHtml(t)).join('');
  const stickerHtml = tags.map((t) => barcodeStickerHtml(t)).join('');
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Print Jewellery Tags (${tags.length})</title>
  <style>
    @page { margin: 4mm; size: auto; }
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000; background: #fff;
    }
    .tags-wrap { display: flex; flex-wrap: wrap; gap: 8px; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 14px; display: flex; gap: 8px; align-items: center; background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 6px;">
    <button onclick="showMode('dual')" id="btn-dual" style="padding: 6px 14px; font-weight: bold; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🏷️ Dual Tag (Barcode + QR)</button>
    <button onclick="showMode('sticker')" id="btn-sticker" style="padding: 6px 14px; font-weight: bold; background: #fff; color: #333; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Barcode Sticker (Screenshot Style)</button>
    <button onclick="window.print()" style="margin-left: auto; padding: 6px 18px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print Now</button>
    <button onclick="window.close()" style="padding: 6px 14px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div id="view-dual" class="tags-wrap">${dualHtml}</div>
  <div id="view-sticker" class="tags-wrap" style="display:none;">${stickerHtml}</div>
  <script>
    function showMode(mode) {
      document.getElementById('view-dual').style.display = mode === 'dual' ? 'flex' : 'none';
      document.getElementById('view-sticker').style.display = mode === 'sticker' ? 'flex' : 'none';
      document.getElementById('btn-dual').style.background = mode === 'dual' ? '#0284c7' : '#fff';
      document.getElementById('btn-dual').style.color = mode === 'dual' ? '#fff' : '#333';
      document.getElementById('btn-sticker').style.background = mode === 'sticker' ? '#0284c7' : '#fff';
      document.getElementById('btn-sticker').style.color = mode === 'sticker' ? '#fff' : '#333';
    }
    window.onload = () => { setTimeout(() => window.print(), 350); };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=800,height=600');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

export function printJewelTagWeb(data: JewelTag, initialMode: 'dual' | 'sticker' = 'dual') {
  const dualHtml = jewelTagCardHtml(data);
  const stickerHtml = barcodeStickerHtml(data);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Jewellery Tag - ${esc(data.code)}</title>
  <style>
    @page { margin: 3mm; size: auto; }
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000; background: #fff;
    }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 12px; display: flex; gap: 8px; align-items: center; background: #f8fafc; padding: 8px; border: 1px solid #e2e8f0; border-radius: 6px;">
    <button onclick="showMode('dual')" id="btn-dual" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === 'dual' ? '#0284c7' : '#fff'}; color: ${initialMode === 'dual' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">🏷️ Dual (Barcode + QR)</button>
    <button onclick="showMode('sticker')" id="btn-sticker" style="padding: 6px 12px; font-size: 12px; font-weight: bold; background: ${initialMode === 'sticker' ? '#0284c7' : '#fff'}; color: ${initialMode === 'sticker' ? '#fff' : '#333'}; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer;">📦 Barcode Sticker (Screenshot Style)</button>
    <button onclick="window.print()" style="margin-left: auto; padding: 6px 16px; font-size: 12px; font-weight: 800; background: #15803d; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print</button>
    <button onclick="window.close()" style="padding: 6px 12px; font-size: 12px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div id="view-dual" style="${initialMode === 'dual' ? 'display:block;' : 'display:none;'}">
    ${dualHtml}
  </div>
  <div id="view-sticker" style="${initialMode === 'sticker' ? 'display:block;' : 'display:none;'}">
    ${stickerHtml}
  </div>
  <script>
    function showMode(mode) {
      document.getElementById('view-dual').style.display = mode === 'dual' ? 'block' : 'none';
      document.getElementById('view-sticker').style.display = mode === 'sticker' ? 'block' : 'none';
      document.getElementById('btn-dual').style.background = mode === 'dual' ? '#0284c7' : '#fff';
      document.getElementById('btn-dual').style.color = mode === 'dual' ? '#fff' : '#333';
      document.getElementById('btn-sticker').style.background = mode === 'sticker' ? '#0284c7' : '#fff';
      document.getElementById('btn-sticker').style.color = mode === 'sticker' ? '#fff' : '#333';
    }
    window.onload = () => { setTimeout(() => window.print(), 250); };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=500,height=320');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}
