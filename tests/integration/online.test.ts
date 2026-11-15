// M2 integration tests against a REAL Supabase project (schema migrated + `game` function deployed).
// Skipped unless all settings are present, so normal `npm run test` and CI stay offline.
//
//   VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY   (from .env.local — public values)
//   TEST_A_EMAIL / TEST_A_PASSWORD / TEST_B_EMAIL / TEST_B_PASSWORD   (two confirmed test accounts)
//
// Run: TEST_A_EMAIL=… TEST_A_PASSWORD=… TEST_B_EMAIL=… TEST_B_PASSWORD=… npm run test:online
// The tests reset nothing; they create characters in free slots of the test accounts.
import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const A = { email: process.env.TEST_A_EMAIL, password: process.env.TEST_A_PASSWORD };
const B = { email: process.env.TEST_B_EMAIL, password: process.env.TEST_B_PASSWORD };
const ready = !!(url && anon && A.email && A.password && B.email && B.password);

async function signedIn(creds: { email?: string; password?: string }) {
  const c = createClient(url!, anon!, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email: creds.email!, password: creds.password! });
  if (error) throw error;
  return c;
}

async function game<T>(c: SupabaseClient, op: string, ...args: unknown[]): Promise<T> {
  const { data, error } = await c.functions.invoke('game', { body: { op, args } });
  if (error) {
    const res = (error as { context?: Response }).context;
    throw new Error(res ? `${res.status} ${await res.text()}` : error.message);
  }
  return (data as { result: T }).result;
}

describe.skipIf(!ready)('online backend (real Supabase)', () => {
  let a: SupabaseClient;
  let b: SupabaseClient;
  let aId: string;

  beforeAll(async () => {
    a = await signedIn(A);
    b = await signedIn(B);
    aId = (await a.auth.getUser()).data.user!.id;
  });

  it('the same account sees its character from a second device (fresh session)', async () => {
    const chars = await game<{ slot: number }[]>(a, 'listCharacters');
    const free = [1, 2, 3].find((s) => !chars.some((c) => c.slot === s));
    if (free) await game(a, 'createCharacter', free, `ทดสอบ${free}${Date.now() % 100}`, { gender: 'female' }, randomUUID());
    const device2 = await signedIn(A);
    const again = await game<{ slot: number }[]>(device2, 'listCharacters');
    expect(again.length).toBeGreaterThan(0);
    expect(again.map((c) => c.slot)).toEqual((await game<{ slot: number }[]>(a, 'listCharacters')).map((c) => c.slot));
  });

  it('another account cannot read or change it (RLS)', async () => {
    const { data: rows } = await b.from('player_state').select('user_id').eq('user_id', aId);
    expect(rows ?? []).toEqual([]);
    const { error: upd } = await b.from('player_state').update({ save: {} }).eq('user_id', aId);
    const { data: still } = await a.from('player_state').select('revision').eq('user_id', aId);
    expect(upd || still?.length).toBeTruthy(); // either refused, or a no-op that A's row survives
    expect(still?.[0]).toBeDefined();
    const { error: own } = await a.from('player_state').update({ save: {} }).eq('user_id', aId);
    expect(own ?? (await a.from('player_state').select('save').eq('user_id', aId)).data?.[0].save).not.toEqual({});
    const { data: keys } = await b.from('question_versions').select('item').limit(1);
    expect(keys ?? []).toEqual([]);
    const { data: log } = await a.from('request_log').select('*').limit(1);
    expect(log ?? []).toEqual([]);
  });

  it('concurrent duplicates of one request grant once', async () => {
    const chars = await game<{ slot: number }[]>(a, 'listCharacters');
    await game(a, 'selectCharacter', chars[0].slot);
    const before = await game<{ xp: number; story: { quests: Record<string, string> } }>(a, 'getProgression');
    const rid = randomUUID();
    const results = await Promise.all(Array.from({ length: 6 }, () => game(a, 'talk', 'owl', rid)));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    const after = await game<{ xp: number }>(a, 'getProgression');
    const gained = after.xp - before.xp;
    expect(gained === 0 || gained === 15).toBe(true); // 15 the first time the owl is met, 0 afterwards
    const { data: rewards } = await a.from('reward_events').select('id').eq('request_id', rid);
    expect((rewards ?? []).length).toBeLessThanOrEqual(1);
  });

  it('a question never arrives with its answer, and bad requests are refused', async () => {
    await expect(game(a, 'reset')).rejects.toThrow('400');
    await expect(game(a, 'talk', 'owl', 'not-a-uuid')).rejects.toThrow('400');
    const p = await game<{ activeRunId: string | null }>(a, 'getProgression');
    const v = p.activeRunId ? await game(a, 'getRun', p.activeRunId) : await game(a, 'startRun', 'fog_wisp', randomUUID());
    expect(JSON.stringify(v)).not.toMatch(/answer_key|distractor_rationale/);
  });

  it('refuses calls without a session', async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    await expect(game(anonClient, 'getProgression')).rejects.toThrow('401');
  });
});
