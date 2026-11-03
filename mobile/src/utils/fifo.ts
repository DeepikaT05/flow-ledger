// Mobile billing takes stock First-In-First-Out: no batch window, the oldest stock goes first
// and a quantity bigger than one batch spills into the next.
import { Batch } from '../types';

/** Batches with stock, oldest first (opening stock, then by purchase date, then as created). */
export const fifoOrder = (bs: Batch[]) => bs
  .filter((b) => Number(b.stock) > 0)
  .sort((a, b) => (a.id === 0 ? -1 : b.id === 0 ? 1 : 0)
    || String(a.invoice_date ?? '').localeCompare(String(b.invoice_date ?? ''))
    || a.id - b.id);

export interface Alloc { batch_id?: number; batch: string; expiry: string; mrp: number; qty: number; free: number }

/** Splits qty + free over the item's batches FIFO. Short stock stays on the last batch (as the web allows). */
export function allocate(qty: number, free: number, batches: Batch[]): Alloc[] {
  const order = fifoOrder(batches);
  const pick = (b?: Batch): Omit<Alloc, 'qty' | 'free'> => ({
    batch_id: b && b.id ? b.id : undefined,
    batch: !b || b.batch === 'OPENING' ? '' : b.batch,
    expiry: b?.expiry ?? '',
    mrp: Number(b?.mrp ?? 0),
  });
  if (!order.length) return [{ ...pick(batches[0]), qty, free }];
  const out: Alloc[] = [];
  let q = qty, f = free;
  for (const b of order) {
    if (q <= 0 && f <= 0) break;
    let room = Number(b.stock);
    const tq = Math.min(q, room); room -= tq;
    const tf = Math.min(f, room);
    if (tq || tf) out.push({ ...pick(b), qty: tq, free: tf });
    q -= tq; f -= tf;
  }
  if (q > 0 || f > 0) {
    const last = out[out.length - 1];
    if (last) { last.qty += q; last.free += f; } else out.push({ ...pick(order[0]), qty: q, free: f });
  }
  return out;
}
