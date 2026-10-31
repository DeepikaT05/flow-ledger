import { api } from './client';
import { Bill, Voucher, Ledger, LedgerStatementRow, Item, Batch, Company } from '../types';

export const AuthService = {
  login: async (username: string, password: string) => {
    return api.post<{ ok: boolean; user?: any; company?: any; token?: string }>('/login', { username, password });
  },
  getMe: async () => {
    return api.get<{ user: any; company: Company; perms: string[] }>('/me');
  },
  getCompanies: async () => {
    return api.get<Company[]>('/companies');
  },
  selectCompany: async (companyId: number) => {
    return api.post('/session', { company_id: companyId });
  },
  logout: async () => {
    return api.post('/logout');
  },
};

export const BillService = {
  list: async (type: 'SALE' | 'PURCHASE', from?: string, to?: string, partyId?: number) => {
    const params = new URLSearchParams({ type });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    if (partyId) params.set('party_id', String(partyId));
    return api.get<Bill[]>(`/bills?${params.toString()}`);
  },
  get: async (id: number) => {
    return api.get<Bill>(`/bills/${id}`);
  },
  create: async (bill: Partial<Bill>) => {
    return api.post<{ id: number; no: string }>('/bills', bill);
  },
  update: async (id: number, bill: Partial<Bill>) => {
    return api.put<{ ok: boolean }>(`/bills/${id}`, bill);
  },
  getNextNo: async (type: string) => {
    return api.get<{ no: string }>(`/bills/next-no?type=${type}`);
  },
};

export const VoucherService = {
  list: async (type: 'RECEIPT' | 'PAYMENT' | 'CONTRA', from?: string, to?: string) => {
    const params = new URLSearchParams({ type });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return api.get<Voucher[]>(`/vouchers?${params.toString()}`);
  },
  get: async (id: number) => {
    return api.get<Voucher>(`/vouchers/${id}`);
  },
  create: async (voucher: Partial<Voucher>) => {
    return api.post<{ id: number; no: string }>('/vouchers', voucher);
  },
  update: async (id: number, voucher: Partial<Voucher>) => {
    return api.put<{ ok: boolean }>(`/vouchers/${id}`, voucher);
  },
  getNextNo: async (type: string) => {
    return api.get<{ no: string }>(`/vouchers/next-no?type=${type}`);
  },
};

export const LedgerService = {
  list: async (group?: string) => {
    const param = group ? `?group=${encodeURIComponent(group)}` : '';
    return api.get<Ledger[]>(`/ledgers${param}`);
  },
  get: async (id: number) => {
    return api.get<Ledger>(`/ledgers/${id}`);
  },
  statement: async (id: number, from?: string, to?: string) => {
    const params = new URLSearchParams({ id: String(id) });
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    return api.get<{ rows: LedgerStatementRow[]; opening: number; opening_type: string; closing: number }>(`/reports/ledger?${params.toString()}`);
  },
  create: async (ledger: Partial<Ledger>) => {
    return api.post<{ id: number }>('/ledgers', ledger);
  },
  update: async (id: number, ledger: Partial<Ledger>) => {
    return api.put<{ ok: boolean }>(`/ledgers/${id}`, ledger);
  },
};

export const ItemService = {
  list: async () => {
    return api.get<Item[]>('/items');
  },
  getBatches: async (itemId: number) => {
    return api.get<Batch[]>(`/batches?item_id=${itemId}`);
  },
};

