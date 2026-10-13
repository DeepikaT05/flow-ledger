// One permission catalogue shared by the server (enforcement) and the client
// (menus, buttons, masking). SuperAdmin bypasses every check; every other role —
// the seeded ADMIN / MANAGER / CASHIER or any custom one — gets exactly the keys ticked.

export interface Perm { key: string; label: string; group: string }

export const PERMS: Perm[] = [
  // Masters
  { group: 'Masters', key: 'masters.ledger', label: 'Ledger master — add / modify parties & accounts' },
  { group: 'Masters', key: 'masters.item', label: 'Item master — add / modify items & batches' },
  { group: 'Masters', key: 'masters.group', label: 'Account groups' },
  { group: 'Masters', key: 'masters.salesman', label: 'Salesman (M.R.) master' },
  { group: 'Masters', key: 'masters.company', label: 'Company profile (F1)' },
  // Sale
  { group: 'Sale', key: 'sale.bill', label: 'Sale bill (Alt+N)' },
  { group: 'Sale', key: 'sale.challan', label: 'Sale challan (Alt+C)' },
  { group: 'Sale', key: 'sale.counter', label: 'Counter sale (Alt+A)' },
  { group: 'Sale', key: 'sale.modify', label: 'Modify / reprint sale bills & challans (Alt+M)' },
  { group: 'Sale', key: 'return.sale', label: 'Sale return / Brk-Exp receive' },
  // Purchase
  { group: 'Purchase', key: 'purchase.bill', label: 'Purchase bill (Alt+P)' },
  { group: 'Purchase', key: 'purchase.challan', label: 'Purchase challan' },
  { group: 'Purchase', key: 'purchase.modify', label: 'Modify purchase bills & challans' },
  { group: 'Purchase', key: 'return.purchase', label: 'Purchase return / Brk-Exp issue' },
  // Accounts
  { group: 'Accounts', key: 'voucher.receipt', label: 'Receipt voucher' },
  { group: 'Accounts', key: 'voucher.payment', label: 'Payment voucher' },
  { group: 'Accounts', key: 'voucher.contra', label: 'Contra voucher' },
  { group: 'Accounts', key: 'voucher.journal', label: 'Journal voucher' },
  { group: 'Accounts', key: 'voucher.debit_note', label: 'Debit note' },
  { group: 'Accounts', key: 'voucher.credit_note', label: 'Credit note' },
  { group: 'Accounts', key: 'voucher.modify', label: 'Modify vouchers / voucher books' },
  // Books & reports
  { group: 'Books & Reports', key: 'books.ledger', label: 'Ledger statements, Cash & Bank book' },
  { group: 'Books & Reports', key: 'books.daybook', label: 'Day book' },
  { group: 'Books & Reports', key: 'books.registers', label: 'Sale / purchase / return registers, GSTR-1 & 2' },
  { group: 'Books & Reports', key: 'reports.outstanding', label: 'Outstanding (receivable / payable)' },
  { group: 'Books & Reports', key: 'reports.stock', label: 'Stock, batch, expiry & re-order reports' },
  { group: 'Books & Reports', key: 'reports.daily', label: 'Daily reports — MIS, mode of payment, item-wise sale' },
  { group: 'Books & Reports', key: 'reports.profit', label: 'Gross profit reports' },
  { group: 'Books & Reports', key: 'reports.final', label: 'Trial balance, P&L, balance sheet, group summary' },
  { group: 'Books & Reports', key: 'reports.gst', label: 'GSTR-3B tax summary' },
  // Special powers
  { group: 'Special Powers', key: 'feature.view_cost', label: 'See purchase rate, cost, margin & profit' },
  { group: 'Special Powers', key: 'feature.delete', label: 'Delete bills, vouchers, ledgers & items' },
  { group: 'Special Powers', key: 'feature.backdate', label: 'Enter bills / vouchers with a back date' },
];

export const PERM_KEYS = PERMS.map((p) => p.key);
export const PERM_GROUPS = [...new Set(PERMS.map((p) => p.group))];

/** Marker for things only a SuperAdmin may do (users & roles). Never grantable. */
export const SUPER = 'super';

const BILL_CREATE: Record<string, string> = {
  SALE: 'sale.bill', SALE_CHALLAN: 'sale.challan', COUNTER_SALE: 'sale.counter',
  PURCHASE: 'purchase.bill', PURCHASE_CHALLAN: 'purchase.challan',
  SALE_RETURN: 'return.sale', PURCHASE_RETURN: 'return.purchase',
};
const BILL_MODIFY: Record<string, string> = {
  SALE: 'sale.modify', SALE_CHALLAN: 'sale.modify', COUNTER_SALE: 'sale.modify',
  PURCHASE: 'purchase.modify', PURCHASE_CHALLAN: 'purchase.modify',
  SALE_RETURN: 'return.sale', PURCHASE_RETURN: 'return.purchase',
};
export const billCreatePerm = (type: string) => BILL_CREATE[type] ?? SUPER;
export const billModifyPerm = (type: string) => BILL_MODIFY[type] ?? SUPER;
export const voucherPerm = (type: string) => `voucher.${String(type).toLowerCase()}`;
export const ANY_VOUCHER = PERMS.filter((p) => p.key.startsWith('voucher.') && p.key !== 'voucher.modify').map((p) => p.key);
export const ANY_BILL = [...new Set([...Object.values(BILL_CREATE), ...Object.values(BILL_MODIFY)])];

/**
 * Which permission a menu / hotkey action needs. Returns the keys of which ANY one
 * is enough, or null when the action is open to everybody (calculator, exit, …).
 */
export function permsForAction(action: string): string[] | null {
  const [name, arg = ''] = action.split(/:(.*)/s);
  switch (name) {
    case 'ledger.add': case 'ledger.list': case 'ledger.gst': case 'ledger.export': case 'master.stats':
      return ['masters.ledger'];
    case 'item.add': case 'item.list': return ['masters.item'];
    case 'item.register': return ['reports.stock', 'masters.item'];
    case 'group.list': case 'group.add': return ['masters.group'];
    case 'salesman.list': return ['masters.salesman'];
    case 'company.edit': return ['masters.company'];
    case 'user.manage': case 'role.manage': return [SUPER];
    case 'bill.new': return [billCreatePerm(arg)];
    case 'bill.list': return [billModifyPerm(arg.split(',')[0])];
    case 'voucher.new': return [voucherPerm(arg)];
    case 'voucher.list': return ['voucher.modify'];
    case 'voucher.menu': return ANY_VOUCHER;
    case 'party.txn': case 'report.ledger': case 'report.cashbank': return ['books.ledger'];
    case 'report.daybook': return ['books.daybook'];
    case 'report.book': case 'report.salebook': return ['books.registers'];
    case 'report.tb': case 'report.pl': case 'report.bs': case 'report.group': return ['reports.final'];
    case 'report.gstr3b': return ['reports.gst'];
    case 'report.outstanding': return ['reports.outstanding'];
    case 'report.stock': case 'report.batch': case 'report.expiry': case 'report.reorder': return ['reports.stock'];
    case 'report.gp': return ['reports.profit'];
    case 'report.mis': case 'report.mop': case 'report.itemsale': return ['reports.daily'];
    default: return null; // calculator, calendar, print, shortcuts, change user, exit, about, menus…
  }
}

/** Starting points for the seeded roles — SuperAdmin can change any of them later. */
export const DEFAULT_ROLES: { name: string; is_super: boolean; perms: string[] }[] = [
  { name: 'SUPERADMIN', is_super: true, perms: [] },
  { name: 'ADMIN', is_super: false, perms: PERM_KEYS },
  {
    name: 'MANAGER', is_super: false, perms: [
      'masters.ledger', 'masters.item', 'masters.salesman',
      'sale.bill', 'sale.challan', 'sale.counter', 'sale.modify', 'return.sale',
      'purchase.bill', 'purchase.challan', 'purchase.modify', 'return.purchase',
      'voucher.receipt', 'voucher.payment', 'voucher.contra', 'voucher.modify',
      'books.ledger', 'books.daybook', 'books.registers',
      'reports.outstanding', 'reports.stock', 'reports.daily', 'reports.profit',
      'feature.view_cost', 'feature.backdate',
    ],
  },
  { name: 'CASHIER', is_super: false, perms: ['sale.bill', 'sale.counter', 'voucher.receipt', 'reports.stock', 'reports.daily'] },
];
