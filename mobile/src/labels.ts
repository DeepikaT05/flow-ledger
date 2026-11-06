// How each bill / voucher type behaves and looks — one table instead of if/else in every screen.
import { BillType, VoucherType, ModuleKey } from './types';
import { MODULE } from './theme';

export interface BillKind {
  title: string;
  short: string;
  module: ModuleKey;
  /** Goods come in (purchase side): batch / expiry / M.R.P. are typed, not picked from stock. */
  inward: boolean;
  partyGroup: string;
  partyLabel: string;
  /** Party's invoice no. / date (purchase side). */
  hasRef: boolean;
  /** A return needs a reason (server rejects SALE_RETURN without one). */
  needsReason: boolean;
  /** Can take money on the bill (cash / UPI / bank). */
  takesPayment: boolean;
}

export const BILL: Record<BillType, BillKind> = {
  SALE: { title: 'Sale Bill', short: 'Sale', module: 'sale', inward: false, partyGroup: 'Sundry Debtors', partyLabel: 'Ledger', hasRef: false, needsReason: false, takesPayment: true },
  SALE_CHALLAN: { title: 'Sale Challan', short: 'S.Chln', module: 'sale', inward: false, partyGroup: 'Sundry Debtors', partyLabel: 'Ledger', hasRef: false, needsReason: false, takesPayment: false },
  COUNTER_SALE: { title: 'Counter Sale', short: 'Cntr', module: 'sale', inward: false, partyGroup: 'Cash-in-hand,Sundry Debtors', partyLabel: 'Ledger', hasRef: false, needsReason: false, takesPayment: true },
  SALE_RETURN: { title: 'Sale Return (Cr.Note)', short: 'S.Rtn', module: 'sale', inward: true, partyGroup: 'Sundry Debtors', partyLabel: 'Ledger', hasRef: false, needsReason: true, takesPayment: false },
  PURCHASE: { title: 'Purchase Bill', short: 'Purc', module: 'purchase', inward: true, partyGroup: 'Sundry Creditors', partyLabel: 'Supplier', hasRef: true, needsReason: false, takesPayment: true },
  PURCHASE_CHALLAN: { title: 'Purchase Challan', short: 'P.Chln', module: 'purchase', inward: true, partyGroup: 'Sundry Creditors', partyLabel: 'Supplier', hasRef: true, needsReason: false, takesPayment: false },
  PURCHASE_RETURN: { title: 'Purchase Return (Dr.Note)', short: 'P.Rtn', module: 'purchase', inward: false, partyGroup: 'Sundry Creditors', partyLabel: 'Supplier', hasRef: false, needsReason: false, takesPayment: false },
};

export interface VoucherKind {
  title: string;
  module: ModuleKey;
  /** simple = one party/account against one cash-bank account (Receipt, Payment, Contra). */
  simple: boolean;
  /** For simple vouchers: the cash/bank side is Dr (money comes in). */
  bankDr?: boolean;
  partyLabel?: string;
  bankLabel?: string;
  /** Pending bills of the party to adjust against (Receipt: sale bills, Payment: purchase bills). */
  billKind?: 'SALE' | 'PURCHASE';
}

export const VOUCHER: Record<VoucherType, VoucherKind> = {
  RECEIPT: { title: 'Receipt', module: 'receipt', simple: true, bankDr: true, partyLabel: 'Received From', bankLabel: 'Deposited In (Cash / Bank)', billKind: 'SALE' },
  PAYMENT: { title: 'Payment', module: 'payment', simple: true, bankDr: false, partyLabel: 'Paid To', bankLabel: 'Paid From (Cash / Bank)', billKind: 'PURCHASE' },
  CONTRA: { title: 'Contra', module: 'contra', simple: true, bankDr: true, partyLabel: 'Transfer From (Cr)', bankLabel: 'Transfer To (Dr)' },
  JOURNAL: { title: 'Journal', module: 'contra', simple: false },
  DEBIT_NOTE: { title: 'Debit Note', module: 'payment', simple: false },
  CREDIT_NOTE: { title: 'Credit Note', module: 'receipt', simple: false },
};

export const accentOf = (m: ModuleKey) => MODULE[m];
