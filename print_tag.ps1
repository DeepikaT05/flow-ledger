param(
    [string]$Code = "CH001445",
    [string]$Name = "CHAIN KADA",
    [double]$GW = 22.700,
    [double]$LESS = 1.900,
    [double]$NW = 20.800,
    [string]$MKG = "10.00 %",
    [int]$Copies = 1,
    [string]$PrinterName = "TSC TE244"
)

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

$gwStr = $GW.ToString("0.000")
$lessStr = $LESS.ToString("0.000")
$nwStr = $NW.ToString("0.000")

# TSPL code for 84mm x 12mm barbell tag
# 203 DPI: 8 dots/mm. 84mm = 672 dots, 12mm = 96 dots.
# Details Face (0-240 dots) | Barcode Face (240-480 dots) | Blank Tail (480-672 dots)
$tspl = @"
SIZE 84 mm, 12 mm
GAP 2 mm, 0 mm
DIRECTION 1
CLS
TEXT 16,8,"1",0,1,1,"GW    $gwStr"
TEXT 16,28,"1",0,1,1,"LESS   $lessStr"
TEXT 16,48,"1",0,1,1,"NW    $nwStr"
TEXT 16,68,"1",0,1,1,"MKG   $MKG"
QRCODE 152,8,H,3,A,0,"$Code"
TEXT 300,8,"1",0,1,1,"$Code"
BARCODE 260,26,"128",32,0,0,2,2,"$Code"
TEXT 280,68,"1",0,1,1,"$Name"
PRINT $Copies,1
"@

$ok = [RawPrinter]::SendString($PrinterName, $tspl)
if ($ok) {
    Write-Host "Printed successfully to $PrinterName: $Code ($Name)" -ForegroundColor Green
} else {
    Write-Host "Failed to send print job to $PrinterName" -ForegroundColor Red
}
