// Shapes exactly as the Flow Ledger server (server/index.ts) returns them.

export interface User {
  id: number;
  username: string;
  name: string;
  role: string;
  is_super?: boolean;
  access_type?: 'BOTH' | 'APP' | 'WEB';
  app_perms?: Record<string, boolean>;
  perms?: string[];
}

export interface Company {
  id: number;
  name: string;
  station?: string;
  address1?: string;
  address2?: string;
  gstin?: string;
  state?: string;
  business_type?: string;
  /** JSON: phone, email, dl_no … from COMPANY CREATION */
  details?: string;
}

export type ModuleKey = 'sale' | 'purchase' | 'receipt' | 'payment' | 'contra' | 'ledger';

export type BillType =  
  | 'SALE' | 'SALE_CHALLAN' | 'COUNTER_SALE' | 'SALE_RETURN'
  | 'PURCHASE' | 'PURCHASE_CHALLAN' | 'PURCHASE_RETURN';

export type VoucherType = 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL' | 'DEBIT_NOTE' | 'CREDIT_NOTE';

export interface Group { id: number; name: string; nature: string; is_system?: number }

export interface Ledger {
  id: number;
  name: string;
  group_id: number;
  group_name: string;
  nature?: string;
  address?: string;
  city?: string;
  phone?: string;
  gstin?: string;
  state?: string;
  opening?: number;
  opening_type?: 'Dr' | 'Cr';
  credit_limit?: number;
  details?: string;
  is_system?: number;
  balance: number;
}

/** /reports/ledger-accounts row */
export interface LedgerAccount {
  id: number; name: string; city?: string; phone?: string; group_name: string;
  opening: number; debit: number; credit: number; balance: number; has_due: boolean; credit_limit: number;
}

/** /reports/ledger/:id row (a ledger_entries row) */
export interface LedgerEntryRow {
  id: number;
  source: 'BILL' | 'VOUCHER';
  source_id: number;
  date: string;
  vtype: string;
  vno: string;
  debit: number;
  credit: number;
  narration?: string;
  against?: string;
}

export interface Item {
  id: number;
  name: string;
  company?: string;
  pack?: string;
  unit?: string;
  hsn?: string;
  mrp?: number;
  sale_rate?: number;
  purchase_rate?: number | null;
  gst_rate?: number;
  stock?: number;
  opening_stock?: number;
  min_stock?: number;
  /** JSON from the product form; `barcode` = the code its QR / barcode carries */
  details?: string;
}

export interface Batch {
  id: number;           // 0 = item's opening stock (no batch rows)
  item_id: number;
  batch: string;
  expiry: string;
  mrp: number;
  rate: number;
  purchase_rate?: number | null;
  stock: number;
  invoice_date?: string;
}

export interface BillLine {
  id?: number;
  item_id: number;
  item_name?: string;
  pack?: string;
  unit?: string;
  batch_id?: number | null;
  batch?: string;
  expiry?: string;
  qty: number;
  free: number;
  rate: number;
  disc_pct: number;
  gst_rate: number;
  mrp?: number;
  taxable?: number;
  tax?: number;
  amount?: number;
  jw?: any;
}

export interface BillPayment { ledger_id: number; ledger?: string; amount: number; remark?: string; detail?: string }

export interface Bill {
  id: number;
  type: BillType;
  no: string;
  date: string;
  party_id: number;
  party?: string;
  mode: 'CASH' | 'CREDIT';
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  cd_amt?: number;
  freight?: number;
  other_charges?: number;
  round_off: number;
  net: number;
  narration?: string;
  ref_no?: string;
  ref_date?: string;
  reason?: string;
  against_bill_id?: number | null;
  walkin_name?: string;
  walkin_mobile?: string;
  walkin_gstin?: string;
  walkin_address?: string;
  mr_name?: string | null;
  lines?: BillLine[];
  payments?: BillPayment[];
  received?: number;
}

export interface VoucherLine { id?: number; ledger_id: number; ledger?: string; debit: number; credit: number }
export interface VoucherAdj { bill_id: number | null; amount: number; remark?: string; bill_no?: string; bill_date?: string; bill_net?: number }

export interface Voucher {
  id: number;
  type: VoucherType;
  no: string;
  date: string;
  narration?: string;
  amount?: number;      // list only: sum of debits
  ledgers?: string;     // list only: every ledger on the voucher
  lines?: VoucherLine[];
  adjustments?: VoucherAdj[];
}

export interface PendingBill { id: number; no: string; ref: string; date: string; net: number; balance: number; days: number }

export interface PartyStatus {
  name: string; phone: string; mobile: string; balance: number; is_supplier: boolean;
  credit_limit: number; credit_days: number; bills: number; days: number;
  avg_pm: number; avg_coll_days: number; turnover_ratio: string;
  last_sale: { net: number; date: string; days: number } | null;
  last_receipt: { amount: number; date: string; mode: string; days: number } | null;
  receipts: { amount: number; date: string; mode: string; days: number }[];
  os_bills: PendingBill[];
}

export interface Mis {
  sales: { s: number; c: number }; purchase: { s: number; c: number };
  saleReturn: { s: number; c: number }; purchaseReturn: { s: number; c: number };
  receipt: { s: number; c: number }; payment: { s: number; c: number };
  cash: number; bank: number; receivable: number; payable: number;
}
