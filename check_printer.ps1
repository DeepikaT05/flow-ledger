$csharp = @'
using System;
using System.IO;
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
        di.pDocName = "JewelTag TSPL";
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

Add-Type -TypeDefinition $csharp

$tspl = @"
SIZE 84 mm, 12 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 16,8,""1"",0,1,1,""GW    22.700""
TEXT 16,28,""1"",0,1,1,""LESS   1.900""
TEXT 16,48,""1"",0,1,1,""NW    20.800""
TEXT 16,68,""1"",0,1,1,""MKG   10.00 %""
QRCODE 152,8,H,3,A,0,""CH001445""
TEXT 300,8,""1"",0,1,1,""CH001445""
BARCODE 260,26,""128"",32,0,0,2,2,""CH001445""
TEXT 280,68,""1"",0,1,1,""CHAIN KADA""
PRINT 1,1
"@

$ok = [RawPrinter]::SendString("TSC TE244", $tspl)
Write-Host "Send to TSC TE244 result: $ok"
