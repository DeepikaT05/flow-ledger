// Central export utilities for Excel (CSV formatted with UTF-8 BOM) and PDF/Print
import { h, toast } from './ui.ts';

/**
 * Download tabular data as an Excel-compatible CSV file with UTF-8 BOM.
 * Excel, Google Sheets, LibreOffice, and mobile apps open this seamlessly.
 */
export function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]): void {
  const sanitize = (v: unknown) => {
    if (v == null) return '""';
    const s = String(v).replace(/"/g, '""');
    return `"${s}"`;
  };

  const lines = [
    headers.map(sanitize).join(','),
    ...rows.map((row) => row.map(sanitize).join(',')),
  ];

  // Prepend UTF-8 BOM so Excel opens Hindi, special characters, and numbers without encoding problems
  const blob = new Blob(['\ufeff' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  toast(`Excel file downloaded: ${a.download}`);
}

/**
 * Creates Excel and PDF action icon buttons.
 */
export function createExportButtons(opts: { onExcel: () => void; onPdf: () => void }): HTMLElement {
  const container = h('div', { class: 'export-btn-group' });

  // SVG Icons
  const excelSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:3px"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>`;
  const pdfSvg = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style="vertical-align:-1px;margin-right:3px"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zm4.5 1.5h1v-2.5h-1V11zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6z"/></svg>`;

  container.innerHTML = `
    <button type="button" class="btn-export-excel" title="Download Excel [Alt+X]" tabindex="-1">
      ${excelSvg}<span>Excel</span>
    </button>
    <button type="button" class="btn-export-pdf" title="Save as PDF / Print [Alt+P]" tabindex="-1">
      ${pdfSvg}<span>PDF</span>
    </button>
  `;

  const excelBtn = container.querySelector('.btn-export-excel') as HTMLElement;
  const pdfBtn = container.querySelector('.btn-export-pdf') as HTMLElement;

  excelBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onExcel();
  });

  pdfBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    opts.onPdf();
  });

  return container;
}

/**
 * Injects Excel and PDF buttons into the right side of a Marg header bar (.marg-bar).
 */
export function addExportToMargBar(bar: HTMLElement, opts: { onExcel: () => void; onPdf: () => void }): void {
  const right = bar.querySelector('.marg-bar-right');
  if (!right) return;
  const btns = createExportButtons(opts);
  // Insert before the clock so it looks balanced and prominent
  const clockEl = right.querySelector('.clock');
  if (clockEl) {
    right.insertBefore(btns, clockEl);
  } else {
    right.prepend(btns);
  }
}
