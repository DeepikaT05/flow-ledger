// Flow Ledger - Local Direct Print Agent for TSC TE244 / Windows Label Printers
// Runs locally on 127.0.0.1:3211 to accept direct 1-click print commands from the web ERP.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = 3211;
const DEFAULT_PRINTER = 'TSC TE244';

// C# helper for raw printing to winspool.drv
const PS_RAW_PRINTER = `
$csharp = @'
using System;
using System.Runtime.InteropServices;
public class RawPrinter {
    [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
    public class DOCINFOA {
        [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
    }
    [DllImport("winspool.drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool OpenPrinter([MarshalAs(UnmanagedType.LPStr)] string szPrinter, out IntPtr hPrinter, IntPtr pd);
    [DllImport("winspool.drv", EntryPoint="ClosePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool ClosePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
    [DllImport("winspool.drv", EntryPoint="EndDocPrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="StartPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="EndPagePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);
    [DllImport("winspool.drv", EntryPoint="WritePrinter", SetLastError=true, ExactSpelling=true, CallingConvention=CallingConvention.StdCall)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);
    public static bool SendString(string printerName, string data) {
        byte[] bytes = System.Text.Encoding.ASCII.GetBytes(data);
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero)) return false;
        DOCINFOA di = new DOCINFOA();
        di.pDocName = "Jewellery Dumbbell Tag";
        di.pDataType = "RAW";
        bool success = false;
        if (StartDocPrinter(hPrinter, 1, di)) {
            if (StartPagePrinter(hPrinter)) {
                IntPtr pBytes = Marshal.AllocHGlobal(bytes.Length);
                Marshal.Copy(bytes, 0, pBytes, bytes.Length);
                int written = 0;
                success = WritePrinter(hPrinter, pBytes, bytes.Length, out written);
                Marshal.FreeHGlobal(pBytes);
                EndPagePrinter(hPrinter);
            }
            EndDocPrinter(hPrinter);
        }
        ClosePrinter(hPrinter);
        return success;
    }
}
'@
if (-not ([System.Management.Automation.PSTypeName]'RawPrinter').Type) {
    Add-Type -TypeDefinition $csharp
}
`;

function buildTspl(t) {
  const code = String(t.code || '').trim().toUpperCase();
  const name = String(t.name || '').trim().toUpperCase();
  const gw = (Number(t.gw) || 0).toFixed(3);
  const less = (Number(t.less) || 0).toFixed(3);
  const nw = (Number(t.nw) || 0).toFixed(3);
  const mkg = String(t.mkg || '5.00 %').trim();

  return `SIZE 84 mm, 12 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 16,8,"1",0,1,1,"GW    ${gw}"
TEXT 16,28,"1",0,1,1,"LESS   ${less}"
TEXT 16,48,"1",0,1,1,"NW    ${nw}"
TEXT 16,68,"1",0,1,1,"MKG   ${mkg}"
QRCODE 152,8,H,3,A,0,"${code}"
TEXT 300,8,"1",0,1,1,"${code}"
BARCODE 260,26,"128",32,0,0,2,2,"${code}"
TEXT 280,68,"1",0,1,1,"${name}"
PRINT 1,1
`;
}

function sendRawToPrinter(printerName, rawData) {
  return new Promise((resolve, reject) => {
    const tmp = path.join(os.tmpdir(), `tag_${Date.now()}_${Math.random().toString(36).slice(2)}.ps1`);
    const script = `${PS_RAW_PRINTER}
$data = @'
${rawData}
'@
$res = [RawPrinter]::SendString("${printerName}", $data)
if ($res) { Write-Output "OK" } else { Write-Output "FAIL" }
`;
    fs.writeFileSync(tmp, script, 'utf8');

    const ps = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    ps.stdout.on('data', d => stdout += d);
    ps.stderr.on('data', d => stderr += d);
    ps.on('close', code => {
      try { fs.unlinkSync(tmp); } catch {}
      if (code === 0 && stdout.includes('OK')) {
        resolve(true);
      } else {
        reject(new Error(stderr || stdout || `Failed to print to ${printerName}`));
      }
    });
    ps.on('error', err => {
      try { fs.unlinkSync(tmp); } catch {}
      reject(err);
    });
  });
}

const server = http.createServer(async (req, res) => {
  // CORS & Private Network Access headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, printer: DEFAULT_PRINTER, version: '1.0' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/print-tags') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const tags = Array.isArray(payload.tags) ? payload.tags : [];
        const printer = payload.printer || DEFAULT_PRINTER;

        if (!tags.length) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'No tags provided' }));
          return;
        }

        // Combine all tags into one TSPL job
        const fullTspl = tags.map(t => buildTspl(t)).join('\n');
        await sendRawToPrinter(printer, fullTspl);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, printed: tags.length, printer }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Flow Ledger Print Agent running on http://127.0.0.1:${PORT}`);
});
