// Flow Ledger - Local Direct Print Agent (TSC TE244 / any Windows label printer)
// Listens on 127.0.0.1:3211. The web ERP posts each tag as a 1-bit PNG drawn at the printer's own
// resolution (same picture as the on-screen preview), and this agent prints it through the Windows
// driver on an exact 84 x 12 mm page — so the printed tag keeps the preview layout.
// Same print path as server/tagprint.ts.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3211;
const VERSION = '2.0';

// Printer name and all data go in as arguments / files, never pasted into the script text.
const PS_SCRIPT = String.raw`
param([string]$Dir, [string]$Printer, [double]$WidthMm = 84, [double]$HeightMm = 12, [string]$Raw)
$ErrorActionPreference = 'Stop'
if (-not $Printer) {
  $all = Get-CimInstance Win32_Printer
  $p = $all | Where-Object { $_.Name -match 'TSC|TE2|TTP|label' } | Select-Object -First 1
  if (-not $p) { $p = $all | Where-Object { $_.Default } | Select-Object -First 1 }
  if (-not $p) { throw 'No printer installed' }
  $Printer = $p.Name
}
if ($Raw) {
  # Old ERP pages send tag fields only: print them as TSPL text straight to the printer.
  Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class RawPrinter {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)] public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType; }
  [DllImport("winspool.drv", EntryPoint="OpenPrinterA", CharSet=CharSet.Ansi, ExactSpelling=true)] public static extern bool OpenPrinter(string n, out IntPtr h, IntPtr d);
  [DllImport("winspool.drv", ExactSpelling=true)] public static extern bool ClosePrinter(IntPtr h);
  [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", CharSet=CharSet.Ansi, ExactSpelling=true)] public static extern bool StartDocPrinter(IntPtr h, int l, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.drv", ExactSpelling=true)] public static extern bool EndDocPrinter(IntPtr h);
  [DllImport("winspool.drv", ExactSpelling=true)] public static extern bool StartPagePrinter(IntPtr h);
  [DllImport("winspool.drv", ExactSpelling=true)] public static extern bool EndPagePrinter(IntPtr h);
  [DllImport("winspool.drv", ExactSpelling=true)] public static extern bool WritePrinter(IntPtr h, byte[] b, int n, out int w);
  public static bool Send(string printer, byte[] bytes) {
    IntPtr h; if (!OpenPrinter(printer, out h, IntPtr.Zero)) return false;
    DOCINFOA di = new DOCINFOA(); di.pDocName = "Jewellery Tags"; di.pDataType = "RAW";
    bool ok = false; int w;
    if (StartDocPrinter(h, 1, di)) { if (StartPagePrinter(h)) { ok = WritePrinter(h, bytes, bytes.Length, out w); EndPagePrinter(h); } EndDocPrinter(h); }
    ClosePrinter(h); return ok; }
}
'@
  if (-not [RawPrinter]::Send($Printer, [IO.File]::ReadAllBytes($Raw))) { throw "Could not send to printer: $Printer" }
  Write-Output "OK|0|$Printer"
  exit 0
}
Add-Type -AssemblyName System.Drawing
$files = Get-ChildItem -Path $Dir -Filter 'tag*.png' | Sort-Object Name
if (-not $files) { throw 'No tags to print' }
$imgs = @($files | ForEach-Object { [System.Drawing.Image]::FromFile($_.FullName) })
$doc = New-Object System.Drawing.Printing.PrintDocument
$doc.PrinterSettings.PrinterName = $Printer
if (-not $doc.PrinterSettings.IsValid) { throw "Printer not found: $Printer" }
$doc.DocumentName = 'Jewellery Tags'
$doc.OriginAtMargins = $false
$w = [int][Math]::Round($WidthMm / 25.4 * 100)
$h = [int][Math]::Round($HeightMm / 25.4 * 100)
$sz = New-Object System.Drawing.Printing.PaperSize('Tag', $w, $h)
$sz.RawKind = 256
$doc.DefaultPageSettings.PaperSize = $sz
$doc.DefaultPageSettings.Margins = New-Object System.Drawing.Printing.Margins(0,0,0,0)
$doc.DefaultPageSettings.Landscape = $false
$script:i = 0
$doc.add_PrintPage({
  param($s, $e)
  $e.Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::NearestNeighbor
  $e.Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::Half
  $e.Graphics.DrawImage($imgs[$script:i], (New-Object System.Drawing.Rectangle(0, 0, $w, $h)))
  $script:i++
  $e.HasMorePages = $script:i -lt $imgs.Count
})
try { $doc.Print() } finally { $imgs | ForEach-Object { $_.Dispose() }; $doc.Dispose() }
Write-Output "OK|$($imgs.Count)|$Printer"
`;

// TSPL for old clients that send fields only. Quotes are stripped so a value can't break the command.
function buildTspl(t) {
  const s = (v) => String(v ?? '').replace(/["\r\n]/g, '').trim().toUpperCase();
  const n = (v) => (Number(v) || 0).toFixed(3);
  const code = s(t.code);
  return `CLS
TEXT 16,10,"1",0,1,1,"GW    ${n(t.gw)}"
TEXT 16,29,"1",0,1,1,"LESS  ${n(t.less)}"
TEXT 16,48,"1",0,1,1,"NW    ${n(t.nw)}"
TEXT 16,67,"1",0,1,1,"MKG   ${s(t.mkg || '5.00 %')}"
QRCODE 152,10,H,3,A,0,"${code}"
TEXT 300,10,"1",0,1,1,"${code}"
BARCODE 252,28,"128",30,0,0,1,1,"${code}"
TEXT 280,68,"1",0,1,1,"${s(t.name)}"
PRINT 1,1
`;
}

function buildAgroTspl(t) {
  const s = (v) => String(v ?? '').replace(/["\r\n]/g, '').trim().toUpperCase();
  const comp = s(t.company || 'TAMRAKAR AGROTECH BORI');
  const name = s(t.name || 'PRODUCT');
  const batch = s(t.batch || '-');
  const exp = s(t.exp || '-');
  const rate = s(t.rate ?? '0');
  const code = s(t.code || 'ZC000001');
  const qr = t.qrData || `${comp}\nITEM:${name}\nBATCH:${batch}\nEXP:${exp}\nRATE:Rs.${rate}\nCODE:${code}`;

  return `CLS
TEXT 16,16,"2",0,1,1,"${comp}"
TEXT 16,48,"3",0,1,1,"${name}"
TEXT 16,84,"1",0,1,1,"BATCH: ${batch}  EXP: ${exp}"
TEXT 16,120,"4",0,1,1,"RATE: Rs.${rate}"
TEXT 16,160,"2",0,1,1,"${code}"
QRCODE 230,16,H,4,A,0,"${qr}"
PRINT 1,1
`;
}

function buildTsplJob(tags, isAgro = false) {
  if (isAgro) {
    return `SIZE 100 mm, 25 mm\nGAP 2 mm, 0 mm\nDIRECTION 1\nOFFSET 0 mm\n` + tags.map(buildAgroTspl).join('');
  }
  return `SIZE 84 mm, 12 mm\nGAP 3 mm, 0 mm\nDIRECTION 1\nOFFSET 0 mm\n` + tags.map(buildTspl).join('');
}

function runPrint(payload) {
  return new Promise((resolve, reject) => {
    const pngs = Array.isArray(payload.pngs) ? payload.pngs : [];
    const tags = Array.isArray(payload.tags) ? payload.tags : (Array.isArray(payload.stickers) ? payload.stickers : []);
    if (!pngs.length && !tags.length) return reject(new Error('No tags to print'));
    if (pngs.length > 500 || tags.length > 500) return reject(new Error('Too many tags in one job (max 500)'));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fl-tags-'));
    const done = (fn, v) => { fs.rmSync(dir, { recursive: true, force: true }); fn(v); };
    const script = path.join(dir, 'print.ps1');
    fs.writeFileSync(script, '﻿' + PS_SCRIPT, 'utf8');
    const isAgro = payload.type === 'agro' || (tags[0] && tags[0].type === 'agro');
    const defW = isAgro ? (payload.mode === '1up' ? 50 : 100) : 84;
    const defH = isAgro ? 25 : 12;
    const args = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Dir', dir,
      '-WidthMm', String(Number(payload.widthMm) || defW), '-HeightMm', String(Number(payload.heightMm) || defH)];
    const printer = String(payload.printer || process.env.TAG_PRINTER || '').trim();
    if (printer) args.push('-Printer', printer);

    if (pngs.length) {
      pngs.forEach((p, i) => fs.writeFileSync(path.join(dir, `tag${String(i).padStart(4, '0')}.png`),
        Buffer.from(String(p).replace(/^data:image\/png;base64,/, ''), 'base64')));
    } else {
      const raw = path.join(dir, 'job.tspl');
      fs.writeFileSync(raw, buildTsplJob(tags, isAgro), 'ascii');
      args.push('-Raw', raw);
    }

    const ps = spawn('powershell.exe', args, { windowsHide: true });
    let out = '', err = '';
    ps.stdout.on('data', (d) => { out += d; });
    ps.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { ps.kill(); err += 'Timed out talking to the printer'; }, 60000);
    ps.on('error', (e) => { clearTimeout(timer); done(reject, e); });
    ps.on('close', (code) => {
      clearTimeout(timer);
      const ok = out.split(/\r?\n/).find((l) => l.startsWith('OK|'));
      if (code !== 0 || !ok) {
        const msg = (err || out).split(/\r?\n/).find((l) => l.trim() && !/^At |^\s*\+|CategoryInfo|FullyQualifiedErrorId/.test(l));
        return done(reject, new Error((msg || 'Print failed').trim()));
      }
      const [, count, name] = ok.trim().split('|');
      done(resolve, { ok: true, printed: Number(count) || tags.length, printer: name });
    });
  });
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');
  const send = (code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method === 'GET' && req.url === '/status') { send(200, { ok: true, version: VERSION }); return; }
  if (req.method === 'POST' && req.url === '/print-tags') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      try { send(200, await runPrint(JSON.parse(body || '{}'))); }
      catch (e) { send(500, { error: e.message }); }
    });
    return;
  }
  res.writeHead(404); res.end('Not Found');
});

server.on('error', (e) => {
  // Another copy is already running: nothing to do.
  if (e.code === 'EADDRINUSE') { console.log(`Port ${PORT} already in use - agent already running.`); process.exit(0); }
  throw e;
});
server.listen(PORT, '127.0.0.1', () => console.log(`Flow Ledger Print Agent ${VERSION} running on http://127.0.0.1:${PORT}`));
