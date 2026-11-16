// Server-side game handler: runs ONE GameApi operation against an account's save document using the
// exact same rules as the offline LocalGameApi. Pure (no DB, no network) so it is unit-tested in
// Node and bundled into the Supabase Edge Function (supabase/functions/game), which adds auth, the
// row lock and the permanent request log.
import { LocalGameApi, MemoryStorage } from '../api/localGameApi';
import { emptySave, SAVE_KEY_V2, type SaveV2 } from '../api/saveFormat';
import type { QuestionItem, ReviewStatus, SkillMastery } from '../shared/types';

/**
 * Operations the client may call, and where the request id sits in their argument list (null = none).
 * `maxChars` raises the default 4000-character argument limit for the one op that carries a save.
 */
export const OPS = {
  getProgression: { write: false, rid: null },
  listCharacters: { write: false, rid: null },
  getRun: { write: false, rid: null },
  createCharacter: { write: true, rid: 3 },
  selectCharacter: { write: true, rid: null },
  changeJob: { write: true, rid: 1 },
  importLocalSave: { write: true, rid: 1, maxChars: 24000 },
  talk: { write: true, rid: 1 },
  acceptQuest: { write: true, rid: 1 },
  completeQuest: { write: true, rid: 1 },
  startRun: { write: true, rid: 1 },
  answer: { write: true, rid: 3 },
  useHint: { write: true, rid: 2 },
  action: { write: true, rid: 3 },
  abandonRun: { write: true, rid: null },
  equip: { write: true, rid: null },
  unequip: { write: true, rid: null },
  savePosition: { write: true, rid: null },
} as const satisfies Record<string, { write: boolean; rid: number | null; maxChars?: number }>;
// `reset` is intentionally not available online (a child must not wipe a classroom account).

export type OpName = keyof typeof OPS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class OpError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export interface ParsedRequest {
  op: OpName;
  args: unknown[];
  write: boolean;
  /** UUID request id for ops that carry one */
  requestId: string | null;
}

/** Validate the request body shape before touching any data. */
export function parseRequest(body: unknown): ParsedRequest {
  const b = body as { op?: unknown; args?: unknown } | null;
  if (!b || typeof b.op !== 'string' || !(b.op in OPS)) throw new OpError('unknown operation');
  const args = b.args === undefined ? [] : b.args;
  if (!Array.isArray(args) || args.length > 6) throw new OpError('bad arguments');
  const spec: { write: boolean; rid: number | null; maxChars?: number } = OPS[b.op as OpName];
  if (JSON.stringify(args).length > (spec.maxChars ?? 4000)) throw new OpError('arguments too large');
  let requestId: string | null = null;
  if (spec.rid !== null) {
    const rid = args[spec.rid];
    if (typeof rid !== 'string' || !UUID.test(rid)) throw new OpError('request id must be a UUID');
    requestId = rid.toLowerCase();
  }
  return { op: b.op as OpName, args, write: spec.write, requestId };
}

export interface ServerOptions {
  /** statuses the bank may serve; production = approved/published only */
  allowedStatuses: ReviewStatus[];
  rng?: () => number;
}

/** Latest allowed version of each question from DB rows. */
export function toBank(rows: { item: QuestionItem; version: number }[], allowed: ReviewStatus[]): QuestionItem[] {
  const latest = new Map<string, QuestionItem>();
  for (const r of rows) {
    const q = r.item;
    if (!allowed.includes(q.review_status)) continue;
    const prev = latest.get(q.id);
    if (!prev || prev.version < q.version) latest.set(q.id, q);
  }
  return [...latest.values()];
}

export interface RewardRow {
  characterSlot: number;
  xp: number;
  jobXp: number;
  items: { itemId: string; qty: number }[];
}

export interface OpOutcome {
  result: unknown;
  save: SaveV2;
  changed: boolean;
  reward: RewardRow | null;
  mastery: SkillMastery[];
}

function rewardDelta(before: SaveV2, after: SaveV2): RewardRow | null {
  const slot = after.selected;
  const a = after.characters.find((c) => c.slot === slot);
  if (!a) return null;
  const b = before.characters.find((c) => c.slot === slot);
  const jobXp = (c: typeof a | undefined) => Object.values(c?.jobs ?? {}).reduce((n, j) => n + (j?.xp ?? 0), 0);
  const qty = (c: typeof a | undefined) => {
    const m = new Map<string, number>();
    for (const i of c?.inventory ?? []) m.set(i.itemId, (m.get(i.itemId) ?? 0) + i.qty);
    return m;
  };
  const xp = a.xp - (b?.xp ?? 0);
  const jx = jobXp(a) - jobXp(b);
  const qa = qty(a);
  const qb = qty(b);
  const items = [...qa].filter(([id, n]) => n > (qb.get(id) ?? 0)).map(([itemId, n]) => ({ itemId, qty: n - (qb.get(itemId) ?? 0) }));
  if (!b || (xp <= 0 && jx <= 0 && items.length === 0)) return null; // new characters' starter kit is not a reward
  return { characterSlot: a.slot, xp: Math.max(0, xp), jobXp: Math.max(0, jx), items };
}

/**
 * Run one operation. Throws OpError (or the engine's Error) on invalid moves; the caller must then
 * roll back and keep the previous save.
 */
export async function runOp(save: SaveV2 | null, req: ParsedRequest, bank: QuestionItem[], opts: ServerOptions): Promise<OpOutcome> {
  const before = save ?? emptySave();
  const storage = new MemoryStorage();
  storage.setItem(SAVE_KEY_V2, JSON.stringify(before));
  const engine = new LocalGameApi(storage, bank, opts.rng ?? Math.random, opts.allowedStatuses);
  const fn = (engine as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>)[req.op];
  let result: unknown;
  try {
    result = await fn.apply(engine, req.args);
  } catch (e) {
    throw e instanceof OpError ? e : new OpError(e instanceof Error ? e.message : 'invalid move', 409);
  }
  const raw = storage.getItem(SAVE_KEY_V2);
  const after = raw ? (JSON.parse(raw) as SaveV2) : before;
  const changed = req.write && raw !== JSON.stringify(before);
  return {
    result: result ?? null,
    save: after,
    changed,
    reward: changed ? rewardDelta(before, after) : null,
    mastery: changed ? Object.values(after.account.mastery) : [],
  };
}

// ───────── transaction orchestration (DB-agnostic) ─────────

/** One database transaction that holds the account's row lock until it returns. */
export interface StateTx {
  loadSaveForUpdate(): Promise<SaveV2 | null>;
  findRequest(requestId: string): Promise<{ response: unknown } | null>;
  writeSave(save: SaveV2): Promise<void>;
  logRequest(requestId: string, op: OpName, response: unknown): Promise<void>;
  addReward(row: RewardRow, op: OpName, requestId: string | null): Promise<void>;
  upsertMastery(rows: SkillMastery[]): Promise<void>;
}

export interface StateStore {
  readSave(userId: string): Promise<SaveV2 | null>;
  /** Run `fn` in a transaction with the user's state row locked; roll back if it throws. */
  transaction<T>(userId: string, fn: (tx: StateTx) => Promise<T>): Promise<T>;
}

/**
 * Handle one authenticated request. Writes are serialised per account by the row lock, and a
 * request id that was already processed returns its stored response without running again — so
 * retries after a dropped connection and concurrent duplicates never grant rewards twice.
 */
export async function handleRequest(store: StateStore, userId: string, body: unknown, bank: QuestionItem[], opts: ServerOptions): Promise<unknown> {
  const req = parseRequest(body);
  if (!req.write) return (await runOp(await store.readSave(userId), req, bank, opts)).result;
  return store.transaction(userId, async (tx) => {
    if (req.requestId) {
      const prev = await tx.findRequest(req.requestId);
      if (prev) return prev.response;
    }
    const out = await runOp(await tx.loadSaveForUpdate(), req, bank, opts);
    if (out.changed) {
      await tx.writeSave(out.save);
      if (out.reward) await tx.addReward(out.reward, req.op, req.requestId);
      if (out.mastery.length) await tx.upsertMastery(out.mastery);
    }
    if (req.requestId) await tx.logRequest(req.requestId, req.op, out.result);
    return out.result;
  });
}
export { emptySave } from '../api/saveFormat';
