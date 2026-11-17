// Self-check for the Code 128 encoder. Run: npx tsx src/utils/code128.check.ts
// Expected bars were produced by jsbarcode 3.11.6 (same set B→C switch); a tag that prints these scans.
import { code128 } from './code128';

const bits = (t: string) => code128(t).map((b) => (b ? '1' : '0')).join('');
const cases: [string, string][] = [
  ['SI000015', '11010010000110111010001100010001010111011110110110011001101100110010111001100100110010001100011101011'],
  ['JW-12 a', '1101001000010110111000111010001101001101110010011100110110011100101101100110010010110000100111101001100011101011'],
];
for (const [text, want] of cases) if (bits(text) !== want) throw new Error(`code128("${text}") is wrong`);
console.log('code128 ok');
