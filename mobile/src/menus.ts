// The six app modules and their submenus, taken from the web menus (client/menu.ts):
// Transactions ▸ Sale / Purchase / Returns, Accounts ▸ Voucher Entry, Books, Outstandings
// and Masters ▸ Ledger Master. `perm` = server permission keys (any one opens it, see
// shared/perms.ts permsForAction). `soon` = present in the web menu but not built there yet either.
import { ModuleKey } from './types';

export interface Go { screen: string; params?: Record<string, unknown> }
export interface MenuNode {
  label: string;
  icon: string;
  hint?: string;
  go?: Go;
  children?: MenuNode[];
  perm?: string[];
  soon?: boolean;
}

const bill = (type: string) => ({ screen: 'BillEntry', params: { type } });
const bills = (types: string[], title: string) => ({ screen: 'BillList', params: { types, title } });
const vnew = (type: string) => ({ screen: 'VoucherEntry', params: { type } });
const vlist = (type: string, title: string) => ({ screen: 'VoucherList', params: { type, title } });
const report = (key: string) => ({ screen: 'Report', params: { key } });
const parties = (title: string, group: string | undefined, pick: string, kind?: string) =>
  ({ screen: 'LedgerList', params: { title, group, pick, kind } });

export const MENUS: Record<ModuleKey, MenuNode[]> = {
  sale: [
    { label: 'Sale Bill', icon: '🧾', hint: 'New GST invoice · Alt+N', go: bill('SALE'), perm: ['sale.bill'] },
    { label: 'Challan', icon: '📄', hint: 'Delivery challan · Alt+C', go: bill('SALE_CHALLAN'), perm: ['sale.challan'] },
    { label: 'Counter Sale', icon: '🛍️', hint: 'Walk-in cash sale · Alt+A', go: bill('COUNTER_SALE'), perm: ['sale.counter'] },
    {
      label: 'Modify', icon: '✏️', hint: 'Open & alter saved entries', children: [
        { label: 'Modify Bill', icon: '🧾', go: bills(['SALE'], 'Sale Bills'), perm: ['sale.modify'] },
        { label: 'Modify Challan', icon: '📄', go: bills(['SALE_CHALLAN'], 'Sale Challans'), perm: ['sale.modify'] },
        { label: 'Modify Counter Sale', icon: '🛍️', go: bills(['COUNTER_SALE'], 'Counter Sales'), perm: ['sale.modify'] },
      ],
    },
    {
      label: 'Sale Return', icon: '↩️', hint: 'Credit note against sale', children: [
        { label: 'Credit Note', icon: '➕', hint: 'New sale return', go: bill('SALE_RETURN'), perm: ['return.sale'] },
        { label: 'Modify Cr.Note', icon: '✏️', go: bills(['SALE_RETURN'], 'Sale Returns'), perm: ['return.sale'] },
        { label: 'Return Challan', icon: '📄', soon: true },
      ],
    },
    { label: 'Items & Stock', icon: '📋', hint: 'All items · QR code · add item / stock', go: { screen: 'Stock' } },
    { label: 'Party Transaction', icon: '👥', hint: 'All bills of one party', go: parties('Party Transaction', 'Sundry Debtors', 'txn'), perm: ['books.ledger'] },
    {
      label: 'Sale Reports', icon: '📊', hint: 'Books, registers & profit', children: [
        { label: 'Sale Register', icon: '📚', go: bills(['SALE', 'COUNTER_SALE'], 'Sale Register'), perm: ['books.registers'] },
        { label: 'Sale Book', icon: '📗', hint: 'Sales whose money is in', go: report('salebook'), perm: ['books.registers'] },
        { label: 'Bill wise Sale & Cost', icon: '📈', hint: 'Loss on bills / G.P.', go: report('gp'), perm: ['reports.profit'] },
        { label: 'Sale/Collection O/s', icon: '⏳', go: report('outstanding:receivable'), perm: ['reports.outstanding'] },
        { label: 'Bill Collection Ageing', icon: '🗓️', go: report('ageing'), perm: ['reports.outstanding'] },
        { label: "Live Credit Limit's", icon: '🚦', go: report('creditlimits'), perm: ['reports.outstanding'] },
      ],
    },
    {
      label: 'Hold Items on Billing', icon: '⏸️', children: [
        { label: 'Hold Issue Pending', icon: '•', soon: true },
        { label: 'Hold Issue Release', icon: '•', soon: true },
        { label: 'Hold Receive Pending', icon: '•', soon: true },
        { label: 'Hold Receive Release', icon: '•', soon: true },
      ],
    },
    { label: 'Promised Order', icon: '🤝', soon: true },
  ],

  purchase: [
    { label: 'Purchase Bill', icon: '📦', hint: 'Supplier invoice · Alt+P', go: bill('PURCHASE'), perm: ['purchase.bill'] },
    { label: 'Challan', icon: '📄', hint: 'Inward challan', go: bill('PURCHASE_CHALLAN'), perm: ['purchase.challan'] },
    {
      label: 'Modify', icon: '✏️', hint: 'Open & alter saved entries', children: [
        { label: 'Modify Bill', icon: '📦', go: bills(['PURCHASE'], 'Purchase Bills'), perm: ['purchase.modify'] },
        { label: 'Modify Challan', icon: '📄', go: bills(['PURCHASE_CHALLAN'], 'Purchase Challans'), perm: ['purchase.modify'] },
      ],
    },
    {
      label: 'Purchase Return', icon: '↪️', hint: 'Debit note to supplier', children: [
        { label: 'Debit Note', icon: '➖', hint: 'New purchase return', go: bill('PURCHASE_RETURN'), perm: ['return.purchase'] },
        { label: 'Modify Dr.Note', icon: '✏️', go: bills(['PURCHASE_RETURN'], 'Purchase Returns'), perm: ['return.purchase'] },
        {
          label: 'Quick Issue', icon: '⚡', children: [
            { label: 'Quick D/Note', icon: '➖', go: bill('PURCHASE_RETURN'), perm: ['return.purchase'] },
            { label: 'Expiry Return', icon: '•', soon: true },
            { label: 'Near Expiry', icon: '•', soon: true },
            { label: 'Dump Return', icon: '•', soon: true },
          ],
        },
      ],
    },
    { label: 'Items & Stock', icon: '📋', hint: 'All items · QR code · add item / stock', go: { screen: 'Stock' } },
    { label: 'Supplier Transaction', icon: '🏭', hint: 'All bills of one supplier', go: parties('Supplier Transaction', 'Sundry Creditors', 'txn'), perm: ['books.ledger'] },
    {
      label: 'Purchase Reports', icon: '📊', children: [
        { label: 'Purchase Register', icon: '📚', go: bills(['PURCHASE'], 'Purchase Register'), perm: ['books.registers'] },
        { label: 'Purchase Return Register', icon: '📕', go: bills(['PURCHASE_RETURN'], 'Purchase Return Register'), perm: ['books.registers'] },
        { label: 'Payable O/s', icon: '⏳', go: report('outstanding:payable'), perm: ['reports.outstanding'] },
        { label: 'Supplier Status', icon: '📋', go: parties('Supplier Status', 'Sundry Creditors', 'status', 'PURCHASE'), perm: ['reports.outstanding', 'books.ledger'] },
      ],
    },
    { label: 'Temporary Purchase', icon: '🕒', soon: true },
    { label: 'Inserted Stock', icon: '📥', soon: true },
  ],

  receipt: [
    { label: 'Receipt', icon: '💰', hint: 'Money in · with bill adjustment', go: vnew('RECEIPT'), perm: ['voucher.receipt'] },
    { label: 'Modify Receipt', icon: '✏️', hint: 'Receipt Book', go: vlist('RECEIPT', 'Receipt Book'), perm: ['voucher.modify'] },
    { label: 'Customer Status', icon: '📋', hint: 'Balance, pending bills, last receipts', go: parties('Customer Status', 'Sundry Debtors', 'status', 'SALE'), perm: ['reports.outstanding', 'books.ledger'] },
    {
      label: 'Outstandings', icon: '⏳', children: [
        { label: 'Receivable', icon: '📥', go: report('outstanding:receivable'), perm: ['reports.outstanding'] },
        { label: 'Bill Ageing', icon: '🗓️', go: report('ageing'), perm: ['reports.outstanding'] },
        { label: 'Bill Taging', icon: '🏷️', go: report('outstanding:receivable'), perm: ['reports.outstanding'] },
      ],
    },
    {
      label: 'Credit Note', icon: '🧮', hint: 'Price difference · voucher', children: [
        { label: 'Credit Note', icon: '➕', go: vnew('CREDIT_NOTE'), perm: ['voucher.credit_note'] },
        { label: 'Modify Credit Note', icon: '✏️', go: vlist('CREDIT_NOTE', 'Credit Notes'), perm: ['voucher.modify'] },
      ],
    },
    { label: 'P.D.Cheques/Cash', icon: '🏦', go: vlist('RECEIPT', 'P.D. Cheques / Cash'), perm: ['voucher.modify'] },
    { label: 'GST Advance', icon: '•', soon: true },
    { label: 'GST Refund', icon: '•', soon: true },
  ],

  payment: [
    { label: 'Payment', icon: '💸', hint: 'Money out · with bill adjustment', go: vnew('PAYMENT'), perm: ['voucher.payment'] },
    { label: 'Modify Payment', icon: '✏️', hint: 'Payment Book', go: vlist('PAYMENT', 'Payment Book'), perm: ['voucher.modify'] },
    { label: 'Supplier Status', icon: '📋', hint: 'Balance, pending bills, last payments', go: parties('Supplier Status', 'Sundry Creditors', 'status', 'PURCHASE'), perm: ['reports.outstanding', 'books.ledger'] },
    { label: 'Payable O/s', icon: '⏳', go: report('outstanding:payable'), perm: ['reports.outstanding'] },
    {
      label: 'Debit Note', icon: '🧮', hint: 'Price difference · voucher', children: [
        { label: 'Debit Note', icon: '➖', go: vnew('DEBIT_NOTE'), perm: ['voucher.debit_note'] },
        { label: 'Modify Debit Note', icon: '✏️', go: vlist('DEBIT_NOTE', 'Debit Notes'), perm: ['voucher.modify'] },
      ],
    },
    { label: 'P.D.Cheques Payment', icon: '🏦', go: vlist('PAYMENT', 'P.D. Cheques Payment'), perm: ['voucher.modify'] },
    { label: 'Connected Banking', icon: '•', soon: true },
    { label: 'GST Payment', icon: '•', soon: true },
  ],

  contra: [
    { label: 'Contra', icon: '🔁', hint: 'Cash ⇄ Bank transfer', go: vnew('CONTRA'), perm: ['voucher.contra'] },
    { label: 'Modify Contra', icon: '✏️', hint: 'Contra Book', go: vlist('CONTRA', 'Contra Book'), perm: ['voucher.modify'] },
    { label: 'Cash & Bank Book', icon: '🏦', hint: 'Pick cash / bank account', go: parties('Cash & Bank Book', 'Cash-in-hand,Bank Accounts', 'statement'), perm: ['books.ledger'] },
    {
      label: 'Journal', icon: '📓', hint: 'Any Dr / Cr adjustment', children: [
        { label: 'Journal', icon: '➕', go: vnew('JOURNAL'), perm: ['voucher.journal'] },
        { label: 'Journal Book', icon: '📘', go: vlist('JOURNAL', 'Journal Book'), perm: ['voucher.modify'] },
        { label: 'Interest Journal', icon: '•', soon: true },
      ],
    },
    { label: 'Mode of Payment', icon: '💳', hint: 'Cash & bank accounts', go: { screen: 'LedgerList', params: { title: 'Mode of Payment', group: 'Cash-in-hand,Bank Accounts', pick: 'statement' } }, perm: ['masters.ledger', 'books.ledger'] },
  ],

  ledger: [
    {
      label: 'Ledger Master', icon: '🗂️', hint: 'Create & modify accounts', children: [
        {
          label: 'Ledger', icon: '📒', children: [
            { label: 'New Ledger', icon: '➕', go: { screen: 'LedgerEntry', params: {} }, perm: ['masters.ledger'] },
            { label: 'Modify Ledger', icon: '✏️', go: { screen: 'LedgerList', params: { title: 'Modify Ledger', pick: 'edit' } }, perm: ['masters.ledger'] },
          ],
        },
        {
          label: 'Sale (Customers)', icon: '🧑‍💼', children: [
            { label: 'New Customer', icon: '➕', go: { screen: 'LedgerEntry', params: { group: 'Sundry Debtors' } }, perm: ['masters.ledger'] },
            { label: 'Modify Customer', icon: '✏️', go: { screen: 'LedgerList', params: { title: 'Customers', group: 'Sundry Debtors', pick: 'edit' } }, perm: ['masters.ledger'] },
          ],
        },
        {
          label: 'Purchase (Suppliers)', icon: '🏭', children: [
            { label: 'New Supplier', icon: '➕', go: { screen: 'LedgerEntry', params: { group: 'Sundry Creditors' } }, perm: ['masters.ledger'] },
            { label: 'Modify Supplier', icon: '✏️', go: { screen: 'LedgerList', params: { title: 'Suppliers', group: 'Sundry Creditors', pick: 'edit' } }, perm: ['masters.ledger'] },
          ],
        },
        {
          label: 'Account Groups', icon: '🧩', children: [
            { label: 'List of Groups', icon: '📃', go: report('groups'), perm: ['masters.group'] },
            { label: 'New Group', icon: '➕', go: { screen: 'GroupEntry' }, perm: ['masters.group'] },
          ],
        },
        { label: 'List of Account', icon: '📃', go: { screen: 'LedgerList', params: { title: 'List of Account', pick: 'statement' } }, perm: ['masters.ledger', 'books.ledger'] },
      ],
    },
    { label: 'All Ledgers', icon: '📚', hint: 'Opening · Dr · Cr · Balance · Alt+L', go: report('allledgers'), perm: ['books.ledger', 'reports.outstanding'] },
    { label: 'Debtors Ledgers', icon: '🧑‍💼', go: { screen: 'LedgerList', params: { title: 'Debtors Ledgers', group: 'Sundry Debtors', pick: 'statement' } }, perm: ['books.ledger'] },
    { label: 'Creditors Ledgers', icon: '🏭', go: { screen: 'LedgerList', params: { title: 'Creditors Ledgers', group: 'Sundry Creditors', pick: 'statement' } }, perm: ['books.ledger'] },
    {
      label: 'Books', icon: '📖', hint: 'Day, cash & entry books', children: [
        { label: 'Day Book', icon: '📅', go: report('daybook'), perm: ['books.daybook'] },
        { label: 'Cash & Bank Book', icon: '🏦', go: parties('Cash & Bank Book', 'Cash-in-hand,Bank Accounts', 'statement'), perm: ['books.ledger'] },
        {
          label: 'Entry Books', icon: '🗃️', children: [
            { label: 'Receipt Book', icon: '💰', go: vlist('RECEIPT', 'Receipt Book'), perm: ['voucher.modify'] },
            { label: 'Payment Book', icon: '💸', go: vlist('PAYMENT', 'Payment Book'), perm: ['voucher.modify'] },
            { label: 'Contra Book', icon: '🔁', go: vlist('CONTRA', 'Contra Book'), perm: ['voucher.modify'] },
            { label: 'Journal Book', icon: '📓', go: vlist('JOURNAL', 'Journal Book'), perm: ['voucher.modify'] },
            { label: 'Debit Note', icon: '➖', go: vlist('DEBIT_NOTE', 'Debit Notes'), perm: ['voucher.modify'] },
            { label: 'Credit Note', icon: '➕', go: vlist('CREDIT_NOTE', 'Credit Notes'), perm: ['voucher.modify'] },
            { label: 'Sale Book', icon: '📗', go: report('salebook'), perm: ['books.registers'] },
            { label: 'Purchase Book', icon: '📘', go: bills(['PURCHASE'], 'Purchase Book'), perm: ['books.registers'] },
          ],
        },
        { label: 'Duties & Taxes', icon: '🏛️', go: { screen: 'LedgerList', params: { title: 'Duties & Taxes', group: 'Duties & Taxes', pick: 'statement' } }, perm: ['books.ledger'] },
      ],
    },
    {
      label: 'Outstandings', icon: '⏳', hint: 'Receivable · Payable · Ageing', children: [
        { label: 'Receivable', icon: '📥', go: report('outstanding:receivable'), perm: ['reports.outstanding'] },
        { label: 'Payable', icon: '📤', go: report('outstanding:payable'), perm: ['reports.outstanding'] },
        { label: 'Bill Ageing', icon: '🗓️', go: report('ageing'), perm: ['reports.outstanding'] },
        { label: 'Credit Limits', icon: '🚦', go: report('creditlimits'), perm: ['reports.outstanding'] },
      ],
    },
    { label: 'Trial Balance', icon: '⚖️', go: report('trial'), perm: ['reports.final'] },
  ],
};

/** Hide what the user's role can't open, and submenus left empty by that. */
export function visibleMenu(nodes: MenuNode[], can: (perm: string[]) => boolean, canEdit = true): MenuNode[] {
  return nodes.flatMap((n) => {
    if (!canEdit && (n.label.includes('Modify') || n.label.startsWith('Edit'))) return [];
    if (n.children) {
      const kids = visibleMenu(n.children, can, canEdit);
      return kids.length ? [{ ...n, children: kids }] : [];
    }
    return !n.perm || can(n.perm) ? [n] : [];
  });
}
