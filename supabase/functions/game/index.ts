// Supabase Edge Function `game` — the only writer of game state.
// POST { op, args } with the player's Supabase session (Authorization: Bearer <jwt>).
// Rules come from engine.bundle.js (= src/server/gameHandler.ts, the same code as offline mode).
// Every write runs in one Postgres transaction that locks the player's row and checks request_log,
// so retries and concurrent duplicates cannot grant rewards twice.
import postgres from 'npm:postgres@3.4.5';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { emptySave, handleRequest, OpError, toBank } from './engine.bundle.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 3 });
const allowReview = Deno.env.get('ALLOW_REVIEW_QUESTIONS') === 'true'; // dev only — never in production
const allowedStatuses = allowReview ? ['review', 'approved', 'published'] : ['approved', 'published'];

const cors = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

let bankPromise: Promise<unknown[]> | null = null;
function bank() {
  bankPromise ??= sql`select item, version from public.question_versions`
    .then((rows) => toBank(rows as never, allowedStatuses as never))
    .catch((e) => {
      bankPromise = null; // retry on the next request instead of caching the failure
      throw e;
    });
  return bankPromise;
}

const store = {
  async readSave(userId: string) {
    const rows = await sql`select save from public.player_state where user_id = ${userId}`;
    return rows[0]?.save ?? null;
  },
  transaction<T>(userId: string, fn: (tx: unknown) => Promise<T>): Promise<T> {
    return sql.begin(async (tx) => {
      // create the row if needed, then take the row lock BEFORE looking at request_log
      await tx`insert into public.player_state (user_id, save) values (${userId}, ${tx.json(emptySave())}) on conflict (user_id) do nothing`;
      await tx`select 1 from public.player_state where user_id = ${userId} for update`;
      return fn({
        loadSaveForUpdate: async () => (await tx`select save from public.player_state where user_id = ${userId}`)[0].save,
        findRequest: async (id: string) => {
          const r = await tx`select response from public.request_log where user_id = ${userId} and request_id = ${id}`;
          return r[0] ? { response: r[0].response.value } : null;
        },
        writeSave: async (save: unknown) => {
          await tx`update public.player_state set save = ${tx.json(save as never)}, revision = revision + 1, updated_at = now() where user_id = ${userId}`;
        },
        logRequest: async (id: string, op: string, response: unknown) => {
          await tx`insert into public.request_log (user_id, request_id, op, response) values (${userId}, ${id}, ${op}, ${tx.json({ value: response ?? null } as never)})`;
        },
        addReward: async (row: { characterSlot: number; xp: number; jobXp: number; items: unknown[] }, op: string, id: string | null) => {
          await tx`insert into public.reward_events (user_id, character_slot, op, request_id, xp, job_xp, items)
                   values (${userId}, ${row.characterSlot}, ${op}, ${id}, ${row.xp}, ${row.jobXp}, ${tx.json(row.items as never)})`;
        },
        upsertMastery: async (rows: { skill_id: string; subject: string; attempts: number; correct: number; correctWithHint: number; independentFamilies: string[]; level: string }[]) => {
          for (const m of rows) {
            await tx`insert into public.mastery (user_id, skill_id, subject, attempts, correct, correct_with_hint, independent_families, level, updated_at)
                     values (${userId}, ${m.skill_id}, ${m.subject}, ${m.attempts}, ${m.correct}, ${m.correctWithHint}, ${m.independentFamilies}, ${m.level}, now())
                     on conflict (user_id, skill_id) do update set attempts = excluded.attempts, correct = excluded.correct,
                       correct_with_hint = excluded.correct_with_hint, independent_families = excluded.independent_families,
                       level = excluded.level, updated_at = now()`;
          }
        },
      });
    }) as Promise<T>;
  },
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const auth = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) return json({ error: 'not signed in' }, 401);

  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > 32000) return json({ error: 'request too large' }, 413); // parseRequest then caps args per op (4000; save import 24000)
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }
  try {
    const result = await handleRequest(store as never, data.user.id, body, (await bank()) as never, { allowedStatuses: allowedStatuses as never });
    return json({ result });
  } catch (e) {
    if (e instanceof OpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: 'server error' }, 500);
  }
});
