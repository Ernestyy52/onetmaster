// Local save format + versioned migrations. Pure functions so they can be unit-tested with real
// old saves (tests/unit/fixtures). Rule: never drop a player's progress when the format changes,
// and never delete the previous version's key (it is the rollback path).
import type { AnswerResult, LocalImport, RunResult } from './types';
import { ENEMIES, type CombatState } from '../shared/combat';
import { normalizeAppearance } from '../shared/appearance';
import { BASE_STATS } from '../shared/data/catalog';
import { jobLevelForXp } from '../shared/jobs';
import { initialStory } from '../shared/story';
import type { Progression, SkillMastery } from '../shared/types';

export const SAVE_KEY_V1 = 'onet-rpg-save-v1';
export const SAVE_KEY_V2 = 'onet-rpg-save-v2';
export const MAX_SLOTS = 3;
/** Idempotency records kept; older ones are dropped (their effects are already saved). */
export const MAX_REQUEST_RECORDS = 400;

export interface RunRecord {
  runId: string;
  enemyId: string;
  /** character slot that owns this run (missing on v1 runs = slot 1) */
  slot?: number;
  state: CombatState;
  usedIds: string[];
  usedFamilies: string[];
  questionId: string | null;
  turnId: string | null;
  optionOrder: string[];
  isReview: boolean;
  hintsLeft: number;
  hintUsedThisTurn: boolean;
  eliminated: string[];
  lastAnswer: AnswerResult | null;
  remediateSkill: string | null;
  pendingXp: number;
  result: RunResult | null;
}

/** A character as stored: progression minus the account-wide learning record. */
export type CharacterRecord = Omit<Progression, 'mastery' | 'seenFamilies'>;

export interface AccountRecord {
  mastery: Record<string, SkillMastery>;
  seenFamilies: Record<string, number>;
  /** offline mastery copied in by importLocalSave: shown for reference, never a measured result */
  importedReference?: { at: string; mastery: Record<string, { attempts: number; correct: number }> };
}

export interface SaveV1 {
  version: 1;
  progression: Omit<Progression, 'slot' | 'job' | 'jobs'>;
  runs: Record<string, RunRecord>;
  requests: Record<string, unknown>;
  counter: number;
}

export interface SaveV2 {
  version: 2;
  account: AccountRecord;
  characters: CharacterRecord[];
  /** selected slot, or null on the character-select screen */
  selected: number | null;
  runs: Record<string, RunRecord>;
  requests: Record<string, unknown>;
  counter: number;
  /** when/what this save was migrated from (diagnostics only) */
  migratedFrom?: { version: number; at: string };
  /** set when offline progress was imported (online accounts accept it only once) */
  importedAt?: string;
}

export function freshCharacter(slot: number): CharacterRecord {
  return {
    profile: null,
    slot,
    job: 'novice',
    jobs: { novice: { level: 1, xp: 0 } },
    level: 1,
    xp: 0,
    hp: BASE_STATS.maxHp,
    maxHp: BASE_STATS.maxHp,
    inventory: [
      { instanceId: `s${slot}-inv-1`, itemId: 'wooden_sword', qty: 1 },
      { instanceId: `s${slot}-inv-2`, itemId: 'apprentice_robe', qty: 1 },
      { instanceId: `s${slot}-inv-3`, itemId: 'focus_potion', qty: 2 },
    ],
    equipment: { weapon: `s${slot}-inv-1`, armor: `s${slot}-inv-2` },
    story: initialStory(),
    codex: [],
    activeRunId: null,
    lastPosition: null,
  };
}

export function emptySave(): SaveV2 {
  return { version: 2, account: { mastery: {}, seenFamilies: {} }, characters: [], selected: null, runs: {}, requests: {}, counter: 0 };
}

/** Novice job XP earned retroactively from enemies already defeated, so old saves keep credit. */
function noviceXpFromKills(counters: Record<string, number>): number {
  let xp = 0;
  for (const [key, n] of Object.entries(counters)) {
    const enemy = key.startsWith('kills.') ? ENEMIES[key.slice(6)] : undefined;
    if (enemy) xp += enemy.xp * n;
  }
  return xp;
}

export function migrateV1(v1: SaveV1, now = new Date()): SaveV2 {
  const { mastery, seenFamilies, ...rest } = v1.progression as SaveV1['progression'] & AccountRecord;
  const save: SaveV2 = {
    ...emptySave(),
    account: { mastery: mastery ?? {}, seenFamilies: seenFamilies ?? {} },
    runs: Object.fromEntries(Object.entries(v1.runs ?? {}).map(([id, r]) => [id, { ...r, slot: 1 }])),
    requests: v1.requests ?? {},
    counter: v1.counter ?? 0,
    migratedFrom: { version: 1, at: now.toISOString() },
  };
  if (rest.profile) {
    rest.profile = { ...rest.profile, appearance: normalizeAppearance(rest.profile.appearance) };
    const xp = noviceXpFromKills(rest.story?.counters ?? {});
    save.characters.push({
      ...rest,
      story: rest.story ?? initialStory(),
      slot: 1,
      job: 'novice',
      jobs: { novice: { xp, level: jobLevelForXp('novice', xp) } },
    });
    save.selected = 1;
  }
  return trimRequests(save);
}

export function trimRequests(save: SaveV2): SaveV2 {
  const keys = Object.keys(save.requests);
  if (keys.length > MAX_REQUEST_RECORDS) {
    for (const k of keys.slice(0, keys.length - MAX_REQUEST_RECORDS)) delete save.requests[k];
  }
  return save;
}

function parse(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Pick the newest readable save. v2 wins; otherwise a v1 save is migrated (the caller persists
 * it under the v2 key and leaves the v1 key untouched). Unreadable data → empty save.
 */
export function loadSave(rawV2: string | null, rawV1: string | null): { save: SaveV2; migrated: boolean } {
  const v2 = parse(rawV2) as SaveV2 | null;
  if (v2 && v2.version === 2 && Array.isArray(v2.characters)) {
    // early v2 saves stored appearance as 'swordsman' | 'mage'
    for (const c of v2.characters) if (c.profile) c.profile.appearance = normalizeAppearance(c.profile.appearance);
    return { save: v2, migrated: false };
  }
  const v1 = parse(rawV1) as SaveV1 | null;
  if (v1 && v1.version === 1 && v1.progression) return { save: migrateV1(v1), migrated: true };
  return { save: emptySave(), migrated: false };
}

/** The part of an offline save that is offered to a new online account; null if there is nothing to move. */
export function toLocalImport(save: SaveV2): LocalImport | null {
  const characters = save.characters
    .filter((c) => c.profile)
    .map((c) => ({
      slot: c.slot,
      nickname: c.profile!.nickname,
      appearance: c.profile!.appearance,
      xp: c.xp,
      job: c.job,
      jobs: Object.fromEntries(Object.entries(c.jobs).map(([j, p]) => [j, { xp: p?.xp ?? 0 }])),
      questsDone: Object.entries(c.story.quests).filter(([, st]) => st === 'done').map(([id]) => id),
      equipped: Object.values(c.equipment).map((id) => c.inventory.find((i) => i.instanceId === id)?.itemId).filter((x): x is string => !!x),
    }));
  if (!characters.length) return null;
  const mastery = Object.fromEntries(Object.values(save.account.mastery).map((m) => [m.skill_id, { attempts: m.attempts, correct: m.correct }]));
  return { characters, seenFamilies: { ...save.account.seenFamilies }, mastery };
}
