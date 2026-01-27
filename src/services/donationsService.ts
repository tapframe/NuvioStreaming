import { mmkvStorage } from './mmkvStorage';

export type Donation = {
  name: string;
  amount: number;
  currency: string;
  date: string;
  message?: string;
};

const DONATIONS_API_URL = process.env.EXPO_PUBLIC_DONATIONS_API_URL || '';

export async function fetchDonations(): Promise<Donation[]> {
  if (!DONATIONS_API_URL) return [];
  const res = await fetch(`${DONATIONS_API_URL.replace(/\/$/, '')}/api/donations?limit=200`);
  if (!res.ok) throw new Error(`Donations API failed: ${res.status}`);
  const json = await res.json();
  const donations = json?.donations;
  if (!Array.isArray(donations)) return [];
  return donations;
}

export async function getDonationsWithCache(forceRefresh = false): Promise<Donation[]> {
  const CACHE_KEY = 'donations_cache_v1';
  const TS_KEY = 'donations_cache_ts_v1';
  const TTL_MS = 10 * 60 * 1000; // 10 minutes

  if (!forceRefresh) {
    try {
      const cached = await mmkvStorage.getItem(CACHE_KEY);
      const ts = await mmkvStorage.getItem(TS_KEY);
      if (cached && ts) {
        const age = Date.now() - parseInt(ts, 10);
        if (Number.isFinite(age) && age < TTL_MS) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) return parsed;
        }
      }
    } catch {
      // ignore cache failures
    }
  }

  const donations = await fetchDonations();
  try {
    await mmkvStorage.setItem(CACHE_KEY, JSON.stringify(donations));
    await mmkvStorage.setItem(TS_KEY, Date.now().toString());
  } catch {
    // ignore cache failures
  }

  return donations;
}
