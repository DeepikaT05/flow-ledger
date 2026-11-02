// Money, dates and periods. The server stores ISO dates (YYYY-MM-DD); the app shows DD-MM-YYYY like the web.

export const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;

const inr = (n: number) => {
  const [int, dec] = Math.abs(n).toFixed(2).split('.');
  // Indian grouping: 12,34,567.89
  const last3 = int.slice(-3);
  const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  return `${rest ? rest + ',' : ''}${last3}.${dec}`;
};

export const money = (n: number | null | undefined) => `${Number(n) < 0 ? '-' : ''}₹${inr(Number(n) || 0)}`;
export const amt = (n: number | null | undefined) => inr(Number(n) || 0);
/** Balance with Dr / Cr suffix (positive = Dr). */
export const drcr = (n: number | null | undefined) => `₹${inr(Number(n) || 0)} ${Number(n) < 0 ? 'Cr' : 'Dr'}`;

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => isoOf(new Date());

/** 2026-11-02 → 02-11-2026 */
export const dmy = (iso?: string | null) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return d ? `${d}-${m}-${y}` : iso;
};
/** 02-11-2026 or 2/11/26 → 2026-11-02 (null when not a date). */
export const parseDmy = (s: string): string | null => {
  const m = s.trim().match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/);
  if (!m) return /^\d{4}-\d{2}-\d{2}$/.test(s.trim()) ? s.trim() : null;
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  const d = new Date(Number(y), Number(m[2]) - 1, Number(m[1]));
  if (d.getMonth() !== Number(m[2]) - 1) return null;
  return isoOf(d);
};

export interface Period { key: string; label: string; from: string; to: string }

/** Financial year containing `d` (April–March). */
export const fyOf = (d = new Date()) => {
  const y = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1;
  return { from: `${y}-04-01`, to: `${y + 1}-03-31` };
};

export function presetPeriods(): Period[] {
  const now = new Date();
  const t = isoOf(now);
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  const week = new Date(now); week.setDate(now.getDate() - 6);
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lmStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lmEnd = new Date(now.getFullYear(), now.getMonth(), 0);
  const fy = fyOf(now);
  return [
    { key: 'today', label: 'Today', from: t, to: t },
    { key: 'yest', label: 'Yesterday', from: isoOf(yest), to: isoOf(yest) },
    { key: 'week', label: 'Last 7 Days', from: isoOf(week), to: t },
    { key: 'month', label: 'This Month', from: isoOf(mStart), to: t },
    { key: 'lmonth', label: 'Last Month', from: isoOf(lmStart), to: isoOf(lmEnd) },
    { key: 'fy', label: 'This F.Y.', from: fy.from, to: fy.to },
    { key: 'all', label: 'All', from: '2000-01-01', to: '2099-12-31' },
  ];
}
export const periodByKey = (k: string) => presetPeriods().find((p) => p.key === k) ?? presetPeriods()[5];

export const daysAgo = (iso: string) => Math.max(0, Math.round((Date.parse(today()) - Date.parse(iso)) / 864e5));
