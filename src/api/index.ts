import type { GameApi } from './types';

let api: GameApi | null = null;

/**
 * Online when the build has Supabase settings (VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY).
 * The check uses import.meta.env directly so Vite can constant-fold it: an online build drops the
 * offline branch entirely, which keeps the answer-key question bank out of the shipped JavaScript.
 */
export const ONLINE = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

function browserStorage(fallback: () => import('./localGameApi').KeyValueStorage) {
  try {
    const k = '__probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return fallback();
  }
}

/** Create the API once (lazy-loads the online client or the offline engine). */
export async function initApi(): Promise<GameApi> {
  if (api) return api;
  if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
    const { SupabaseGameApi } = await import('./supabaseGameApi');
    api = new SupabaseGameApi();
  } else {
    const [{ LocalGameApi, MemoryStorage }, { QUESTION_BANK }] = await Promise.all([import('./localGameApi'), import('../shared/data/questions')]);
    const storage = typeof window === 'undefined' ? new MemoryStorage() : browserStorage(() => new MemoryStorage());
    api = new LocalGameApi(storage, QUESTION_BANK);
  }
  return api;
}

/** The API created by initApi(); boot() awaits initApi() before anything else runs. */
export function getApi(): GameApi {
  if (!api) throw new Error('API not initialised — call initApi() first');
  return api;
}

export function requestId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  // RFC 4122 v4 fallback (the server requires UUIDs)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
