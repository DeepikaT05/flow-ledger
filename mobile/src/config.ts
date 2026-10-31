import AsyncStorage from '@react-native-async-storage/async-storage';

export const DEFAULT_API_BASE = 'https://flowledger.stafftrack.cloud/api';

const API_STORAGE_KEY = '@flow_ledger_api_base';

export async function getApiBaseUrl(): Promise<string> {
  try {
    const custom = await AsyncStorage.getItem(API_STORAGE_KEY);
    return custom || DEFAULT_API_BASE;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export async function setApiBaseUrl(url: string): Promise<void> {
  const clean = url.trim().replace(/\/+$/, '');
  await AsyncStorage.setItem(API_STORAGE_KEY, clean);
}

