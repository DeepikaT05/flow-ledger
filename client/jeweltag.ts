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

export function jewelTagCardHtml(data: JewelTag): string {
  const svg = jewelTagSvg(data);
  const fmt3 = (n: number) => (Number(n) || 0).toFixed(3);
  return `
    <div class="jewel-tag" style="display:inline-flex; flex-direction:row; align-items:stretch; width:330px; min-height:85px; border:1.5px solid #000; border-radius:4px; box-sizing:border-box; overflow:hidden; page-break-inside:avoid; margin:4px; background:#fff;">
      <div class="side-a" style="flex:1; padding:6px 8px; display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; border-right:1px dashed #444;">
        <div class="tag-code" style="font-size:13px; font-weight:800; font-family:monospace; letter-spacing:0.5px;">${esc(data.code)}</div>
        <div class="tag-qr" style="width:50px; height:50px; margin:2px 0;">${svg}</div>
        <div class="tag-name" style="font-size:11px; font-weight:700; text-transform:uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:145px;">${esc(data.name)}</div>
      </div>
      <div class="tag-bridge" style="width:12px; background:repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 6px); border-right:1px dashed #444;"></div>
      <div class="side-b" style="flex:1.1; padding:6px 10px; display:flex; flex-direction:column; justify-content:space-around; font-family:monospace;">
        <div class="w-row" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; line-height:1.3;"><span>GW</span><span class="w-val" style="font-weight:800;">${fmt3(data.gw)}</span></div>
        <div class="w-row" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; line-height:1.3;"><span>LESS</span><span class="w-val" style="font-weight:800;">${fmt3(data.less)}</span></div>
        <div class="w-row bold" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:800; border-top:1px solid #aaa; border-bottom:1px solid #aaa; padding:1px 0;"><span>NW</span><span class="w-val" style="font-weight:800;">${fmt3(data.nw)}</span></div>
        <div class="w-row" style="display:flex; justify-content:space-between; align-items:center; font-size:13px; font-weight:600; line-height:1.3;"><span>MKG</span><span class="w-val" style="font-weight:800;">${esc(data.mkg)}</span></div>
      </div>
    </div>`;
}

export function printMultipleJewelTags(tags: JewelTag[]) {
  if (!tags.length) return;
  const cardsHtml = tags.map((t) => jewelTagCardHtml(t)).join('');
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
  <div class="no-print" style="margin-bottom: 14px;">
    <button onclick="window.print()" style="padding: 6px 16px; font-weight: bold; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer;">🖨️ Print All Tags (${tags.length})</button>
    <button onclick="window.close()" style="padding: 6px 16px; margin-left: 8px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div class="tags-wrap">
    ${cardsHtml}
  </div>
  <script>
    window.onload = () => { setTimeout(() => window.print(), 350); };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=750,height=600');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

export function printJewelTagWeb(data: JewelTag) {
  const svg = jewelTagSvg(data);
  const fmt3 = (n: number) => (Number(n) || 0).toFixed(3);
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Jewellery Tag - ${esc(data.code)}</title>
  <style>
    @page { margin: 4mm; size: auto; }
    body {
      margin: 0; padding: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Courier New", monospace;
      color: #000; background: #fff;
    }
    .jewel-tag {
      display: flex; flex-direction: row; align-items: stretch;
      width: 330px; min-height: 85px; border: 1.5px solid #000; border-radius: 4px;
      box-sizing: border-box; overflow: hidden; page-break-inside: avoid;
    }
    .side-a {
      flex: 1; padding: 6px 8px; display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center;
      border-right: 1px dashed #444;
    }
    .tag-code { font-size: 13px; font-weight: 800; font-family: monospace; letter-spacing: 0.5px; }
    .tag-qr { width: 50px; height: 50px; margin: 2px 0; }
    .tag-qr svg { width: 50px; height: 50px; display: block; }
    .tag-name { font-size: 11px; font-weight: 700; text-transform: uppercase; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 145px; }
    .tag-bridge { width: 12px; background: repeating-linear-gradient(45deg, #eee, #eee 2px, #fff 2px, #fff 6px); border-right: 1px dashed #444; }
    .side-b {
      flex: 1.1; padding: 6px 10px; display: flex; flex-direction: column;
      justify-content: space-around; font-family: monospace;
    }
    .w-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; line-height: 1.3; }
    .w-row.bold { font-weight: 800; border-top: 1px solid #aaa; border-bottom: 1px solid #aaa; padding: 1px 0; }
    .w-val { font-weight: 800; }
    @media print {
      body { padding: 0; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom: 14px;">
    <button onclick="window.print()" style="padding: 6px 14px; font-weight: bold; background: #0284c7; color: #fff; border: none; border-radius: 4px; cursor: pointer;">Print Tag</button>
    <button onclick="window.close()" style="padding: 6px 14px; margin-left: 8px; border: 1px solid #ccc; background: #fff; border-radius: 4px; cursor: pointer;">Close</button>
  </div>
  <div class="jewel-tag">
    <div class="side-a">
      <div class="tag-code">${esc(data.code)}</div>
      <div class="tag-qr">${svg}</div>
      <div class="tag-name">${esc(data.name)}</div>
    </div>
    <div class="tag-bridge"></div>
    <div class="side-b">
      <div class="w-row"><span>GW</span><span class="w-val">${fmt3(data.gw)}</span></div>
      <div class="w-row"><span>LESS</span><span class="w-val">${fmt3(data.less)}</span></div>
      <div class="w-row bold"><span>NW</span><span class="w-val">${fmt3(data.nw)}</span></div>
      <div class="w-row"><span>MKG</span><span class="w-val">${esc(data.mkg)}</span></div>
    </div>
  </div>
  <script>
    window.onload = () => { setTimeout(() => window.print(), 250); };
  </script>
</body>
</html>`;

  const w = window.open('', '_blank', 'width=450,height=300');
  if (w) {
    w.document.open();
    w.document.write(html);
    w.document.close();
  }
}

