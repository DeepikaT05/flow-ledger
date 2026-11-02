import AsyncStorage from '@react-native-async-storage/async-storage';
import { getApiBaseUrl } from '../config';

const TOKEN_KEY = '@flow_ledger_token';
const COOKIE_KEY = '@flow_ledger_cookie';

export async function setAuthToken(token: string) {
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function clearAuth() {
  await AsyncStorage.multiRemove([TOKEN_KEY, COOKIE_KEY]);
}

export async function request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const baseUrl = await getApiBaseUrl();
  const token = await getAuthToken();
  const savedCookie = await AsyncStorage.getItem(COOKIE_KEY);

  let cleanEndpoint = endpoint.trim();
  if (cleanEndpoint.startsWith('/api/')) cleanEndpoint = cleanEndpoint.slice(4);
  else if (cleanEndpoint.startsWith('api/')) cleanEndpoint = cleanEndpoint.slice(3);
  if (!cleanEndpoint.startsWith('/')) cleanEndpoint = `/${cleanEndpoint}`;

  const cleanBase = baseUrl.trim().replace(/\/+$/, '');
  const url = `${cleanBase}${cleanEndpoint}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (savedCookie) {
    headers['Cookie'] = savedCookie;
  }

  const res = await fetch(url, {
    ...options,
    headers,
  });

  // Extract set-cookie if returned
  const setCookie = res.headers.get('set-cookie');
  if (setCookie) {
    const rawCookie = setCookie.split(';')[0];
    await AsyncStorage.setItem(COOKIE_KEY, rawCookie);
  }

  if (res.status === 401) {
    let errMessage = 'Invalid username or password';
    try {
      const errJson = await res.json();
      if (errJson.error) errMessage = errJson.error;
      else if (errJson.message) errMessage = errJson.message;
    } catch {}

    if (cleanEndpoint.includes('/login')) {
      throw new Error(errMessage);
    }

    await clearAuth();
    throw new Error('Session expired. Please login again.');
  }

  if (!res.ok) {
    let errMessage = `Error ${res.status}: ${res.statusText}`;
    try {
      const errJson = await res.json();
      if (errJson.error) errMessage = errJson.error;
      else if (errJson.message) errMessage = errJson.message;
    } catch {}
    throw new Error(errMessage);
  }

  // Handle empty body responses
  const text = await res.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}

export const api = {
  get: <T = any>(url: string) => request<T>(url, { method: 'GET' }),
  post: <T = any>(url: string, body?: any) => request<T>(url, { method: 'POST', body: JSON.stringify(body) }),
  put: <T = any>(url: string, body?: any) => request<T>(url, { method: 'PUT', body: JSON.stringify(body) }),
  delete: <T = any>(url: string) => request<T>(url, { method: 'DELETE' }),
};

