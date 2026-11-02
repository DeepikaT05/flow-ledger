import { api } from './client';
import {
  Bill, BillType, Voucher, VoucherType, Ledger, LedgerAccount, LedgerEntryRow, Item, Batch, Company, Group,
  PendingBill, PartyStatus, Mis,
} from '../types';

const qs = (o: Record<string, string | number | undefined | null>) => {
  const p = Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return p.length ? `?${p.join('&')}` : '';
};

export interface Session {
  token?: string;
  id: number;
  name: string;
  role: string;
  is_super?: boolean;
  access_type?: 'BOTH' | 'APP' | 'WEB';
  app_perms?: Record<string, boolean>;
  perms: string[];
  company_id?: number;
}

export const AuthService = {
  login: (username: string, password: string) =>
    api.post<Session>('/login', { name: username.trim().toUpperCase(), password, platform: 'app' }),
  getMe: () => api.get<Session>('/me'),
  getCompanies: () => api.get<Company[]>('/companies'),
  selectCompany: (companyId: number) => api.post<Company>('/session/company', { id: companyId }),
  logout: () => api.post('/logout'),
};

export const BillService = {
  /** types: one or more bill types, comma separated server-side. */
  list: (types: BillType[], from?: string, to?: string, party?: number) =>
    api.get<Bill[]>(`/bills${qs({ type: types.join(','), from, to, party })}`),
  get: (id: number) => api.get<Bill>(`/bills/${id}`),
  create: (bill: Record<string, unknown>) => api.post<{ id: number; no: string; net: number }>('/bills', bill),
  update: (id: number, bill: Record<string, unknown>) => api.put<{ id: number; no: string; net: number }>(`/bills/${id}`, bill),
  delete: (id: number) => api.delete<{ ok: boolean }>(`/bills/${id}`),
  nextNo: (type: BillType) => api.get<{ no: string }>(`/bills/next-no?type=${type}`),
};

export const VoucherService = {
  list: (type: VoucherType, from?: string, to?: string) => api.get<Voucher[]>(`/vouchers${qs({ type, from, to })}`),
  get: (id: number) => api.get<Voucher>(`/vouchers/${id}`),
  create: (v: Record<string, unknown>) => api.post<{ id: number; no: string }>('/vouchers', v),
  update: (id: number, v: Record<string, unknown>) => api.put<{ id: number; no: string }>(`/vouchers/${id}`, v),
  delete: (id: number) => api.delete<{ ok: boolean }>(`/vouchers/${id}`),
  nextNo: (type: VoucherType) => api.get<{ no: string }>(`/vouchers/next-no?type=${type}`),
};

export const LedgerService = {
  /** group: one or more account group names, comma separated. */
  list: (group?: string) => api.get<Ledger[]>(`/ledgers${qs({ group })}`),
  get: (id: number) => api.get<Ledger>(`/ledgers/${id}`),
  create: (l: Record<string, unknown>) => api.post<{ id: number }>('/ledgers', l),
  update: (id: number, l: Record<string, unknown>) => api.put<{ ok: boolean }>(`/ledgers/${id}`, l),
  delete: (id: number) => api.delete<{ ok: boolean }>(`/ledgers/${id}`),
  groups: () => api.get<Group[]>('/groups'),
  createGroup: (name: string, nature: string) => api.post<{ id: number }>('/groups', { name, nature }),
  paymentModes: () => api.get<Ledger[]>('/payment-modes'),
  statement: (id: number, from?: string, to?: string) =>
    api.get<{ ledger: Ledger; opening: number; rows: LedgerEntryRow[] }>(`/reports/ledger/${id}${qs({ from, to })}`),
  accounts: (upto?: string) => api.get<LedgerAccount[]>(`/reports/ledger-accounts${qs({ upto })}`),
  pendingBills: (id: number, kind: 'SALE' | 'PURCHASE', exclude?: number) =>
    api.get<PendingBill[]>(`/ledgers/${id}/pending-bills${qs({ kind, exclude })}`),
  status: (id: number, kind?: 'SALE' | 'PURCHASE') => api.get<PartyStatus>(`/ledgers/${id}/status${qs({ kind })}`),
};

export const ItemService = {
  list: () => api.get<Item[]>('/items'),
  batches: (itemId: number) => api.get<Batch[]>(`/items/${itemId}/batches`),
};

export const ReportService = {
  mis: (from: string, to: string) => api.get<Mis>(`/reports/mis${qs({ from, to })}`),
  get: <T = any>(path: string) => api.get<T>(path),
};
