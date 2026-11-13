import { LocalGameApi, MemoryStorage } from './localGameApi';
import type { GameApi } from './types';

let api: GameApi | null = null;

function browserStorage() {
  try {
    const k = '__probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return localStorage;
  } catch {
    return new MemoryStorage();
  }
}

/** Single API instance. Swap LocalGameApi for a Supabase-backed implementation later. */
export function getApi(): GameApi {
  if (!api) api = new LocalGameApi(typeof window === 'undefined' ? new MemoryStorage() : browserStorage());
  return api;
}

export function requestId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
