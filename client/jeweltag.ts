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

export function jewelTagSvg(data: JewelTag): string {
  const qr = qrcode(0, 'M');
  qr.addData(encodeJewelQr(data));
  qr.make();
  return qr.createSvgTag({ cellSize: 3, margin: 0, scalable: true });
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

