// Code 128 barcode encoder — no native module, no dependency.
// Jewellery tag stickers carry the item's tag code (e.g. SI000015) in these bars; laser / CCD
// scanners and the in-app camera (code128) read it back and the app finds the item by BARCODE.

// Bar/space widths of each symbol value 0..106 (99 = Code C, 104 = Start B, 105 = Start C, 106 = Stop).
const P = ('212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 ' +
  '123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 ' +
  '111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 ' +
  '141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 ' +
  '124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 ' +
  '311141 411131 211412 211214 211232 2331112').split(' ');

/** True when `text` can be written in Code 128 (printable ASCII 32..126). */
export const canCode128 = (text: string) => text.length > 0 && /^[\x20-\x7E]+$/.test(text);

/** Symbol values: set B for letters, switching to set C for a trailing run of ≥4 digits
 *  (SI000015 → 2 letters + 3 digit pairs) so the bars stay wide enough on a 12 mm tag. */
function values(text: string): number[] {
  let run = text.match(/\d*$/)![0].length;
  if (run % 2) run--;
  if (run < 4) return [104, ...Array.from(text, (c) => c.charCodeAt(0) - 32)];
  const head = text.slice(0, text.length - run);
  const pairs = text.slice(head.length).match(/\d\d/g)!.map(Number);
  return head ? [104, ...Array.from(head, (c) => c.charCodeAt(0) - 32), 99, ...pairs] : [105, ...pairs];
}

/** Bars of `text` as modules: true = black. Includes start, checksum and stop; no quiet zone. */
export function code128(text: string): boolean[] {
  if (!canCode128(text)) throw new Error(`Code 128 cannot encode "${text}"`);
  const vals = values(text);
  const check = vals.reduce((sum, v, i) => sum + v * Math.max(i, 1), 0) % 103;
  const out: boolean[] = [];
  for (const v of [...vals, check, 106]) {
    [...P[v]].forEach((w, i) => { for (let k = 0; k < Number(w); k++) out.push(i % 2 === 0); });
  }
  return out;
}

/** Barcode as a scalable SVG (stretch it to the box it sits in), with `quiet` blank modules each side. */
export function code128Svg(text: string, quiet = 10): string {
  const m = code128(text);
  let d = '';
  for (let i = 0; i < m.length; i++) if (m[i]) d += `M${i + quiet} 0h1v10h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.length + quiet * 2} 10" preserveAspectRatio="none" shape-rendering="crispEdges"><path d="${d}" fill="#000"/></svg>`;
}
