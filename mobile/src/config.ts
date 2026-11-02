import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_API_BASE = 'https://flowledger.stafftrack.cloud/api';

const API_STORAGE_KEY = '@flow_ledger_api_base';

export async function getApiBaseUrl(): Promise<string> {
  try {
    const custom = await AsyncStorage.getItem(API_STORAGE_KEY);
    // Only allow custom URL if it is a valid reachable HTTP(S) URL and not localhost/10.0.2.2 on phone
    if (custom && custom.startsWith('http') && !custom.includes('localhost') && !custom.includes('10.0.2.2') && !custom.includes('127.0.0.1')) {
      return custom.replace(/\/+$/, '');
    }
    // Clean up stale local storage key
    if (custom) {
      await AsyncStorage.removeItem(API_STORAGE_KEY).catch(() => {});
    }
    return DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(API_STORAGE_KEY, clean);
}

