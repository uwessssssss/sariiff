import AsyncStorage from '@react-native-async-storage/async-storage';

// Lightweight stale-while-revalidate cache.
// - cacheGet: instant, synchronous (in-memory) — use to seed initial state so screens paint immediately.
// - cacheHydrate: async, pulls last value from disk on cold start into memory.
// - cacheSet: store after a successful fetch (memory now, disk in background).
// - cacheClear: wipe on logout.
//
// Usage in a screen:
//   const [data, setData] = useState(cacheGet('dashboard'));
//   const [loading, setLoading] = useState(!cacheGet('dashboard'));   // skeleton only if nothing cached
//   useEffect(() => { (async () => {
//     const cached = await cacheHydrate('dashboard'); if (cached) setData(cached);
//     const res = await api.getX(); if (res.success) { setData(res.data); cacheSet('dashboard', res.data); }
//     setLoading(false);
//   })(); }, []);

const mem: Record<string, any> = {};
const PREFIX = 'sariff_cache:';

export function cacheGet<T = any>(key: string): T | undefined {
  return mem[key];
}

export async function cacheHydrate<T = any>(key: string): Promise<T | undefined> {
  if (mem[key] !== undefined) return mem[key];
  try {
    const raw = await AsyncStorage.getItem(PREFIX + key);
    if (raw) { mem[key] = JSON.parse(raw); return mem[key]; }
  } catch {}
  return undefined;
}

export function cacheSet(key: string, value: any): void {
  mem[key] = value;
  AsyncStorage.setItem(PREFIX + key, JSON.stringify(value)).catch(() => {});
}

export async function cacheClear(): Promise<void> {
  for (const k of Object.keys(mem)) delete mem[k];
  try {
    const keys = await AsyncStorage.getAllKeys();
    await AsyncStorage.multiRemove(keys.filter(k => k.startsWith(PREFIX)));
  } catch {}
}
