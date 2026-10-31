export interface User {
  id: number;
  username: string;
  name: string;
  role: string;
}

export interface Company {
  id: number;
  name: string;
  address?: string;
  gstin?: string;
  phone?: string;
  fin_year?: string;
}

export interface RolePermissions {
  canViewSale: boolean;
  canCreateSale: boolean;
  canEditSale: boolean;
  canDeleteSale: false; // STRICTLY DISABLED

  canViewPurchase: boolean;
  canCreatePurchase: boolean;
  canEditPurchase: boolean;
  canDeletePurchase: false; // STRICTLY DISABLED

  canViewReceipt: boolean;
  canCreateReceipt: boolean;
  canEditReceipt: boolean;
  canDeleteReceipt: false; // STRICTLY DISABLED

  canViewPayment: boolean;
  canCreatePayment: boolean;
  canEditPayment: boolean;
  canDeletePayment: false; // STRICTLY DISABLED

  canViewContra: boolean;
  canCreateContra: boolean;
  canEditContra: boolean;
  canDeleteContra: false; // STRICTLY DISABLED

  canViewLedger: boolean;
  canCreateLedger: boolean;
  canEditLedger: boolean;
  canDeleteLedger: false; // STRICTLY DISABLED
}

export interface Ledger {
  id: number;
  name: string;
  group_id: number;
  group_name: string;
  city?: string;
  phone?: string;
  mobile?: string;
  gstin?: string;
  state?: string;
  opening?: number;
  opening_type?: 'Dr' | 'Cr';
  credit_limit?: number;
  balance: number;
}

export interface LedgerStatementRow {
  date: string;
  type: string;
  no: string;
  particulars: string;
  debit: number;
  credit: number;
  balance: number;
  source: 'BILL' | 'VOUCHER';
  source_id: number;
}

export interface Item {
  id: number;
  name: string;
  company?: string;
  pack?: string;
  hsn?: string;
  unit?: string;
  mrp?: number;
  sale_rate?: number;
  purchase_rate?: number;
  gst_rate?: number;
  stock?: number;
}

export interface Batch {
  id: number;
  item_id: number;
  batch: string;
  expiry: string;
  mrp: number;
  rate: number;
  stock?: number;
}

export interface BillItem {
  id?: number;
  bill_id?: number;
  item_id: number;
  item_name?: string;
  pack?: string;
  company?: string;
  batch?: string;
  expiry?: string;
  qty: number;
  free?: number;
  rate: number;
  disc_pct?: number;
  gst_rate?: number;
  taxable: number;
  tax: number;
  amount: number;
}

export interface Bill {
  id: number;
  type: 'SALE' | 'PURCHASE' | 'COUNTER_SALE' | 'SALE_RETURN' | 'PURCHASE_RETURN';
  no: string;
  date: string;
  party_id: number;
  party_name?: string;
  mode: string;
  gross: number;
  discount: number;
  taxable: number;
  tax: number;
  round_off: number;
  net: number;
  narration?: string;
  items?: BillItem[];
}

export interface VoucherLine {
  id?: number;
  voucher_id?: number;
  ledger_id: number;
  ledger_name?: string;
  debit: number;
  credit: number;
}

export interface Voucher {
  id: number;
  type: 'RECEIPT' | 'PAYMENT' | 'CONTRA' | 'JOURNAL';
  no: string;
  date: string;
  amount?: number;
  narration?: string;
  lines?: VoucherLine[];
}

