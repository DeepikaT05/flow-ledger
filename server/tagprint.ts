// Direct jewellery-tag printing: no browser print dialog.
// The browser draws each tag as a 1-bit bitmap at the label printer's own resolution (84 x 12 mm at
// 203 dpi = 671 x 96 px) and posts the PNGs here. The server sends them to the label printer through
// the Windows driver on an exact 84 x 12 mm custom page, one label per page — the path that printed
// the shop's tags correctly. Printing through Chrome instead lands the tag on the driver's default
// 4x6 stock, rotated and spread over several labels.
import type { Express, Request, Response } from 'express';
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PS_SCRIPT = String.raw`
param([string]$Dir, [string]$Printer, [int]$WidthMm = 84, [int]$HeightMm = 12)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
if (-not $Printer) {
  $all = Get-CimInstance Win32_Printer
  $p = $all | Where-Object { $_.Name -match 'TSC|TE2|TTP|label' } | Select-Object -First 1
  if (-not $p) { $p = $all | Where-Object { $_.Default } | Select-Object -First 1 }
  if (-not $p) { throw 'No printer installed' }
  $Printer = $p.Name
}
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

function runPowerShell(args: string[], timeoutMs = 60_000): Promise<{ code: number; out: string; err: string }> {
  return new Promise((resolve) => {
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', ...args], { windowsHide: true });
    let out = '';
    let err = '';
    ps.stdout.on('data', (d) => { out += d; });
    ps.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { ps.kill(); err += 'Timed out talking to the printer'; }, timeoutMs);
    ps.on('error', (e) => { clearTimeout(t); resolve({ code: -1, out, err: err + e.message }); });
    ps.on('close', (code) => { clearTimeout(t); resolve({ code: code ?? -1, out, err }); });
  });
}

export function registerTagPrint(app: Express) {
  /** POST { pngs: string[] (data URLs or base64), printer?: string, widthMm?, heightMm? } */
  app.post('/api/print-tags', async (req: Request, res: Response) => {
    if (process.platform !== 'win32') {
      res.status(400).json({ error: 'Direct tag printing needs the server running on the Windows PC the label printer is attached to' });
      return;
    }
    const pngs: string[] = Array.isArray(req.body?.pngs) ? req.body.pngs : [];
    if (!pngs.length) { res.status(400).json({ error: 'No tags to print' }); return; }
    if (pngs.length > 500) { res.status(400).json({ error: 'Too many tags in one job (max 500)' }); return; }
    const printer = String(req.body?.printer ?? process.env.TAG_PRINTER ?? '').trim();
    const widthMm = Number(req.body?.widthMm) || 84;
    const heightMm = Number(req.body?.heightMm) || 12;

    const dir = mkdtempSync(join(tmpdir(), 'fl-tags-'));
    try {
      pngs.forEach((p, i) => {
        const b64 = String(p).replace(/^data:image\/png;base64,/, '');
        writeFileSync(join(dir, `tag${String(i).padStart(4, '0')}.png`), Buffer.from(b64, 'base64'));
      });
      const script = join(dir, 'print.ps1');
      writeFileSync(script, '﻿' + PS_SCRIPT, 'utf8');
      const args = ['-File', script, '-Dir', dir, '-WidthMm', String(widthMm), '-HeightMm', String(heightMm)];
      if (printer) args.push('-Printer', printer);
      const r = await runPowerShell(args);
      const ok = r.out.split(/\r?\n/).find((l) => l.startsWith('OK|'));
      if (r.code !== 0 || !ok) {
        const msg = (r.err || r.out).split(/\r?\n/).find((l) => l.trim() && !/^At |^\s*\+|CategoryInfo|FullyQualifiedErrorId/.test(l)) ?? 'Print failed';
        res.status(400).json({ error: msg.trim() });
        return;
      }
      const [, count, name] = ok.trim().split('|');
      res.json({ ok: true, printed: Number(count), printer: name });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
