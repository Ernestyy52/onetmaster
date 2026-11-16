import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { toLocalImport, type SaveV2 } from '../../src/api/saveFormat';
import type { LocalImport, RunView } from '../../src/api/types';
import { QUESTION_BANK } from '../../src/shared/data/questions';
import type { SkillMastery } from '../../src/shared/types';
import { handleRequest, OpError, parseRequest, toBank, type OpName, type RewardRow, type ServerOptions, type StateStore, type StateTx } from '../../src/server/gameHandler';

const DEV: ServerOptions = { allowedStatuses: ['review', 'approved', 'published'], rng: () => 0.3 };
const PROD: ServerOptions = { allowedStatuses: ['approved', 'published'], rng: () => 0.3 };
const QUEST_SKILL = QUESTION_BANK[0].skill_id;
const key = (v: RunView) => QUESTION_BANK.find((q) => q.id === v.turn!.question.id)!.answer_key;

/** In-memory stand-in for Postgres: one row per user, a per-user lock, rollback on throw. */
class MemoryStore implements StateStore {
  saves = new Map<string, SaveV2>();
  requests = new Map<string, unknown>();
  rewards: (RewardRow & { user: string; op: OpName })[] = [];
  mastery = new Map<string, SkillMastery>();
  private locks = new Map<string, Promise<void>>();

  async readSave(user: string) {
    const s = this.saves.get(user);
    return s ? structuredClone(s) : null;
  }

  async transaction<T>(user: string, fn: (tx: StateTx) => Promise<T>): Promise<T> {
    const prev = this.locks.get(user) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    this.locks.set(user, prev.then(() => mine));
    await prev;
    // staged writes, applied only on commit
    let save: SaveV2 | undefined;
    const reqs: [string, unknown][] = [];
    const rewards: typeof this.rewards = [];
    const mastery: SkillMastery[] = [];
    try {
      const result = await fn({
        loadSaveForUpdate: async () => this.readSave(user),
        findRequest: async (id) => (this.requests.has(`${user}:${id}`) ? { response: this.requests.get(`${user}:${id}`) } : null),
        writeSave: async (s) => void (save = structuredClone(s)),
        logRequest: async (id, _op, response) => void reqs.push([`${user}:${id}`, structuredClone(response)]),
        addReward: async (row, op) => void rewards.push({ ...row, user, op }),
        upsertMastery: async (rows) => void mastery.push(...rows),
      });
      if (save) this.saves.set(user, save);
      for (const [k, v] of reqs) this.requests.set(k, v);
      this.rewards.push(...rewards);
      for (const m of mastery) this.mastery.set(`${user}:${m.skill_id}`, m);
      return result;
    } finally {
      release();
    }
  }
}

function client(store: MemoryStore, user: string, opts = DEV) {
  return <T,>(op: string, ...args: unknown[]) => handleRequest(store, user, { op, args }, QUESTION_BANK, opts) as Promise<T>;
}

async function fight(call: ReturnType<typeof client>, enemyId: string) {
  let v = await call<RunView>('startRun', enemyId, randomUUID());
  for (let i = 0; i < 40 && !v.result; i++) {
    if (v.state.phase === 'question') v = await call<RunView>('answer', v.runId, v.turn!.turnId, key(v), randomUUID());
    if (v.result || v.state.phase !== 'command') continue;
    const s = v.state;
    const a = s.focus > 0 && s.intent === 'beam' ? 'shield' : s.focus > 0 && s.enemyShield && !s.weakPoint ? 'pierce' : 'attack';
    v = (await call<{ view: RunView }>('action', v.runId, s.turn, a, randomUUID())).view;
  }
  return v;
}

describe('request validation', () => {
  it('rejects unknown ops, reset, bad request ids and oversized args', () => {
    expect(() => parseRequest({ op: 'reset', args: [] })).toThrow(OpError);
    expect(() => parseRequest({ op: 'constructor' })).toThrow(OpError);
    expect(() => parseRequest({ op: 'talk', args: ['owl', 'not-a-uuid'] })).toThrow('UUID');
    expect(() => parseRequest({ op: 'equip', args: ['x'.repeat(5000)] })).toThrow('too large');
    expect(parseRequest({ op: 'talk', args: ['owl', 'A0EEBC99-9C0B-4EF8-BB6D-6BB9BD380A11'] }).requestId).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
  });

  it('production bank only serves approved/published questions', () => {
    const rows = QUESTION_BANK.map((q) => ({ item: q, version: q.version }));
    expect(toBank(rows, ['approved', 'published'])).toHaveLength(0); // all 24 are still 'review'
    expect(toBank(rows, DEV.allowedStatuses)).toHaveLength(QUESTION_BANK.length);
  });
});

describe('server-authoritative game (in-memory store)', () => {
  it('plays create → prologue → job change through the server path and survives "another device"', async () => {
    const store = new MemoryStore();
    const call = client(store, 'user-a');
    await call('createCharacter', 1, 'ต้นกล้า', { gender: 'female' }, randomUUID());
    await call('talk', 'owl', randomUUID());
    await call('acceptQuest', 'q_clear_fog', randomUUID());
    expect((await fight(call, 'fog_wisp')).result?.outcome).toBe('won');
    await call('acceptQuest', 'q_math_door', randomUUID());
    expect((await fight(call, 'gear_warden')).result?.outcome).toBe('won');
    await call('completeQuest', 'q_math_door', randomUUID());
    await call('changeJob', 'mage', randomUUID());

    // a second device = a fresh client with only the user id
    const other = client(store, 'user-a');
    const p = await other<{ level: number; job: string; story: { flags: Record<string, boolean> } }>('getProgression');
    expect(p.level).toBeGreaterThanOrEqual(3);
    expect(p.job).toBe('mage');
    expect(p.story.flags.door_math_open).toBe(true);
    expect(store.rewards.length).toBeGreaterThan(0);
    expect(store.mastery.size).toBeGreaterThan(0);
  });

  it('accounts are isolated', async () => {
    const store = new MemoryStore();
    await client(store, 'user-a')('createCharacter', 1, 'ต้นกล้า', { gender: 'male' }, randomUUID());
    const b = client(store, 'user-b');
    expect(await b('listCharacters')).toEqual([]);
    const run = await client(store, 'user-a')<RunView>('startRun', 'fog_wisp', randomUUID());
    await expect(b('answer', run.runId, run.turn!.turnId, 'a', randomUUID())).rejects.toThrow();
  });

  it('replaying or racing the same request never grants twice', async () => {
    const store = new MemoryStore();
    const call = client(store, 'user-a');
    await call('createCharacter', 1, 'ต้นกล้า', { gender: 'male' }, randomUUID());
    const rid = randomUUID();
    const results = await Promise.all(Array.from({ length: 10 }, () => call<{ rewards: { xp: number } | null }>('talk', 'owl', rid)));
    expect(new Set(results.map((r) => JSON.stringify(r))).size).toBe(1);
    // different request ids racing on an already-finished quest grant nothing either
    await Promise.all(Array.from({ length: 10 }, () => call('talk', 'owl', randomUUID())));
    expect((await call<{ xp: number }>('getProgression')).xp).toBe(15);
    expect(store.rewards.filter((r) => r.op === 'talk')).toHaveLength(1);
  });

  it('an invalid move rolls back and leaves the save untouched', async () => {
    const store = new MemoryStore();
    const call = client(store, 'user-a');
    await call('createCharacter', 1, 'ต้นกล้า', { gender: 'male' }, randomUUID());
    const before = JSON.stringify(store.saves.get('user-a'));
    await expect(call('startRun', 'gear_warden', randomUUID())).rejects.toMatchObject({ status: 409 });
    await expect(call('changeJob', 'mage', randomUUID())).rejects.toThrow();
    expect(JSON.stringify(store.saves.get('user-a'))).toBe(before);
  });

  it('never sends an answer key before the answer, and production refuses draft questions', async () => {
    const store = new MemoryStore();
    const call = client(store, 'user-a');
    await call('createCharacter', 1, 'ต้นกล้า', { gender: 'male' }, randomUUID());
    const v = await call<RunView>('startRun', 'fog_wisp', randomUUID());
    expect(JSON.stringify(v)).not.toMatch(/answer_key|distractor_rationale|explanation/);

    const prod = client(new MemoryStore(), 'user-p', PROD);
    await prod('createCharacter', 1, 'ใบไม้', { gender: 'male' }, randomUUID());
    const pv = await prod<RunView>('startRun', 'fog_wisp', randomUUID());
    expect(pv.turn).toBeNull(); // no approved questions → no question shown, combat continues
  });
});

describe('importing offline progress into a new account (ADR D5.3)', () => {
  async function playedOffline(store: MemoryStore) {
    const call = client(store, 'device');
    await call('createCharacter', 1, 'ต้นกล้า', { gender: 'female' }, randomUUID());
    await call('talk', 'owl', randomUUID());
    await call('acceptQuest', 'q_clear_fog', randomUUID());
    await fight(call, 'fog_wisp');
    await call('acceptQuest', 'q_math_door', randomUUID());
    await fight(call, 'gear_warden');
    await call('completeQuest', 'q_math_door', randomUUID());
    await call('changeJob', 'mage', randomUUID());
    return store.saves.get('device')!;
  }

  it('moves an honest offline character over with its quests, job and gear', async () => {
    const store = new MemoryStore();
    const local = await playedOffline(store);
    const call = client(store, 'user-a');
    const list = await call<{ nickname: string; level: number; job: string }[]>('importLocalSave', toLocalImport(local), randomUUID());
    const before = local.characters[0];
    expect(list).toEqual([expect.objectContaining({ nickname: 'ต้นกล้า', level: before.level, job: 'mage' })]);
    const p = await call<{ story: { flags: Record<string, boolean>; quests: Record<string, string> }; inventory: { itemId: string }[] }>('getProgression');
    expect(p.story.flags.door_math_open).toBe(true);
    expect(Object.values(p.story.quests).every((s) => s === 'done')).toBe(true);
    expect(p.inventory.map((i) => i.itemId)).toEqual(expect.arrayContaining(['wind_boots', 'badge_gear_awakener']));
    const saved = store.saves.get('user-a')!;
    expect(saved.account.mastery).toEqual({}); // offline answers are not measured mastery
    expect(Object.keys(saved.account.importedReference!.mastery).length).toBeGreaterThan(0);
  });

  it('clamps a forged save: no skipped quests, no level or job beyond the prologue, no unknown items', async () => {
    const store = new MemoryStore();
    const call = client(store, 'user-a');
    const forged: LocalImport = {
      characters: [{
        slot: 1, nickname: 'แฮกเกอร์', appearance: { gender: 'male' }, xp: 1e12, job: 'mage',
        jobs: { novice: { xp: 1e9 }, mage: { xp: 1e9 } }, questsDone: ['q_math_door'], equipped: ['legend_blade', 'wooden_sword'],
      }],
      seenFamilies: { not_a_family: 1 },
      mastery: { fake_skill: { attempts: 5, correct: 5 }, [QUEST_SKILL]: { attempts: 3, correct: 99 } },
    };
    await call('importLocalSave', forged, randomUUID());
    const c = store.saves.get('user-a')!.characters[0];
    expect(c.level).toBeLessThanOrEqual(5);
    expect(c.job).toBe('novice'); // prologue not really finished, so no job change
    expect(c.jobs.novice!.level).toBeLessThanOrEqual(5);
    expect(c.jobs.mage).toBeUndefined();
    expect(Object.values(c.story.quests).includes('done')).toBe(false); // q_math_door alone skips the chain
    expect(c.inventory.map((i) => i.itemId).sort()).toEqual(['apprentice_robe', 'focus_potion', 'wooden_sword']);
    const acct = store.saves.get('user-a')!.account;
    expect(acct.seenFamilies).toEqual({});
    expect(acct.importedReference!.mastery).toEqual({ [QUEST_SKILL]: { attempts: 3, correct: 3 } });
  });

  it('runs once per account, never into an account that already plays, and rejects bad names', async () => {
    const store = new MemoryStore();
    const local = toLocalImport(await playedOffline(store))!;
    const call = client(store, 'user-a');
    const rid = randomUUID();
    const first = await call('importLocalSave', local, rid);
    expect(await call('importLocalSave', local, rid)).toEqual(first); // retry = same answer
    await expect(call('importLocalSave', local, randomUUID())).rejects.toMatchObject({ status: 409 });

    const b = client(store, 'user-b');
    await b('createCharacter', 1, 'ใบไม้', { gender: 'male' }, randomUUID());
    await expect(b('importLocalSave', local, randomUUID())).rejects.toMatchObject({ status: 409 });

    const c = client(store, 'user-c');
    const bad = { ...local, characters: [{ ...local.characters[0], nickname: 'x' }] };
    await expect(c('importLocalSave', bad, randomUUID())).rejects.toMatchObject({ status: 409 });
    expect(store.saves.get('user-c')).toBeUndefined(); // nothing half-imported
  });

  it('only the import op may carry a large argument', () => {
    const big = { characters: [], seenFamilies: Object.fromEntries(Array.from({ length: 400 }, (_, i) => [`f${i}`, 1])), mastery: {} };
    expect(() => parseRequest({ op: 'importLocalSave', args: [big, randomUUID()] })).not.toThrow();
    expect(() => parseRequest({ op: 'talk', args: [JSON.stringify(big), randomUUID()] })).toThrow('too large');
  });
});

describe('online bundle hygiene', () => {
  it('the generated seed migration matches the question bank', () => {
    const sql = readFileSync('supabase/migrations/0002_seed_questions.sql', 'utf8');
    for (const q of QUESTION_BANK) expect(sql).toContain(`('${q.id}', ${q.version},`);
  });
});
