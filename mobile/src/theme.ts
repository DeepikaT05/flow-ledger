// Design tokens for the whole app. Each module has its own accent so the user always
// knows where they are (Sale = teal, Purchase = blue, …), on a deep navy base.

export const C = {
  navy: '#0B1F3A',
  navy2: '#13305A',
  navy3: '#1D4378',
  gold: '#FFC93C',
  bg: '#F2F5FA',
  card: '#FFFFFF',
  text: '#14213D',
  sub: '#5B6B82',
  faint: '#98A6BA',
  line: '#E3E9F2',
  dr: '#C62828',   // debit / receivable side
  cr: '#1B7F3B',   // credit / received side
  danger: '#D32F2F',
  white: '#FFFFFF',
};

export interface Accent { main: string; soft: string; dark: string }

export const MODULE: Record<string, Accent & { icon: string; title: string; tag: string }> = {
  sale: { main: '#0E9F8E', soft: '#E0F5F2', dark: '#08695E', icon: '🧾', title: 'Sale', tag: 'Bills · Challans · Returns' },
  purchase: { main: '#2F6FED', soft: '#E4ECFD', dark: '#1D4BB0', icon: '📦', title: 'Purchase', tag: 'Inward · Challans · D/Notes' },
  receipt: { main: '#2E9E4F', soft: '#E3F4E8', dark: '#1D6B34', icon: '💰', title: 'Receipt', tag: 'Collections · Bill adjust' },
  payment: { main: '#E0465E', soft: '#FCE6EA', dark: '#A12A3E', icon: '💸', title: 'Payment', tag: 'Supplier · Expenses' },
  contra: { main: '#F08A24', soft: '#FDEEDD', dark: '#B0600F', icon: '🔁', title: 'Contra', tag: 'Cash ⇄ Bank · Journal' },
  ledger: { main: '#7B4FD6', soft: '#EEE7FB', dark: '#5531A3', icon: '📒', title: 'Ledger', tag: 'Accounts · Books · O/s' },
};

export const R = { sm: 8, md: 12, lg: 18, xl: 24 };

export const shadow = {
  elevation: 3,
  shadowColor: '#0B1F3A',
  shadowOpacity: 0.08,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 4 },
};
