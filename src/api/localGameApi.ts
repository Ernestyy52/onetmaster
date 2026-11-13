// In-browser stand-in for the Supabase Edge Functions described in handoff §6.
// It keeps the same rules a real server must enforce (ownership/turn order, answer keys
// never sent before answering, idempotent request ids, rewards granted once) so the
// client code does not change when the real backend arrives. NOTE: in this local mode
// the answer keys still ship inside the JS bundle — real deployments must move this file's
// logic server-side.
import { ITEMS, BASE_STATS } from '../shared/data/catalog';
import { QUESTION_BANK } from '../shared/data/questions';
import { applyAction, applyAnswer, canUse, createCombat, ENEMIES, type CombatState, type PlayerAction } from '../shared/combat';
import { combatStats, levelForXp, newMastery, questionXp, recordMastery, statsForLevel } from '../shared/progression';
import { selectNextQuestion, shuffleOptions, toPublic } from '../shared/questionSelector';
import { initialStory, QUESTS, refreshAvailability } from '../shared/story';
import type { Appearance, EquipSlot, Progression, QuestionItem, ReviewStatus, RewardSummary } from '../shared/types';
import type { ActionResult, AnswerResult, GameApi, QuestResult, RunResult, RunView } from './types';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export class MemoryStorage implements KeyValueStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

interface RunRecord {
  runId: string;
  enemyId: string;
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

interface SaveFile {
  version: 1;
  progression: Progression;
  runs: Record<string, RunRecord>;
  requests: Record<string, unknown>;
  counter: number;
}

const SAVE_KEY = 'onet-rpg-save-v1';
/** Prototype: items awaiting teacher review are playable but flagged in the UI. */
export const PROTOTYPE_ALLOWED_STATUSES: ReviewStatus[] = ['review', 'approved', 'published'];
const HINTS_PER_RUN = 2;

function freshProgression(): Progression {
  return {
    profile: null,
    level: 1,
    xp: 0,
    hp: BASE_STATS.maxHp,
    maxHp: BASE_STATS.maxHp,
    inventory: [
      { instanceId: 'inv-1', itemId: 'wooden_sword', qty: 1 },
      { instanceId: 'inv-2', itemId: 'apprentice_robe', qty: 1 },
      { instanceId: 'inv-3', itemId: 'focus_potion', qty: 2 },
    ],
    equipment: { weapon: 'inv-1', armor: 'inv-2' },
    mastery: {},
    seenFamilies: {},
    story: initialStory(),
    codex: [],
    activeRunId: null,
    lastPosition: null,
  };
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class LocalGameApi implements GameApi {
  private save: SaveFile;

  constructor(
    private storage: KeyValueStorage,
    private bank: QuestionItem[] = QUESTION_BANK,
    private rng: () => number = Math.random,
  ) {
    this.save = this.load();
  }

  private load(): SaveFile {
    try {
      const raw = this.storage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SaveFile;
        if (parsed.version === 1) return parsed;
      }
    } catch {
      /* corrupted save → start fresh */
    }
    return { version: 1, progression: freshProgression(), runs: {}, requests: {}, counter: 0 };
  }

  private persist() {
    try {
      this.storage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* storage full or blocked — keep playing in memory */
    }
  }

  /** Idempotency: same requestId → same stored response, no second side effect. */
  private once<T>(requestId: string, fn: () => T): T {
    if (requestId in this.save.requests) return clone(this.save.requests[requestId] as T);
    const result = fn();
    this.save.requests[requestId] = clone(result);
    this.persist();
    return clone(result);
  }

  private get p() {
    return this.save.progression;
  }

  private requireProfile() {
    if (!this.p.profile) throw new Error('no profile');
  }

  private nextId(prefix: string) {
    this.save.counter += 1;
    return `${prefix}-${this.save.counter}`;
  }

  // ───────── progression ─────────

  async getProgression() {
    return clone(this.p);
  }

  async createProfile(nickname: string, appearance: Appearance) {
    const name = nickname.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (!name) throw new Error('nickname required');
    this.p.profile = { nickname: name, appearance, createdAt: new Date().toISOString() };
    this.persist();
    return clone(this.p);
  }

  private addItem(itemId: string, qty: number) {
    const def = ITEMS[itemId];
    if (!def) throw new Error(`unknown item ${itemId}`);
    const stack = def.kind === 'consumable' ? this.p.inventory.find((i) => i.itemId === itemId) : undefined;
    if (stack) stack.qty += qty;
    else this.p.inventory.push({ instanceId: this.nextId('item'), itemId, qty });
    if (!this.p.codex.includes(`item:${itemId}`)) this.p.codex.push(`item:${itemId}`);
  }

  private grant(xp: number, items: { itemId: string; qty: number }[]): RewardSummary {
    const levelBefore = this.p.level;
    this.p.xp += xp;
    this.p.level = levelForXp(this.p.xp);
    const stats = statsForLevel(this.p.level);
    this.p.maxHp = stats.maxHp;
    if (this.p.level > levelBefore) this.p.hp = stats.maxHp;
    for (const it of items) this.addItem(it.itemId, it.qty);
    return { xp, levelBefore, levelAfter: this.p.level, items };
  }

  private finishQuest(questId: string): RewardSummary {
    const def = QUESTS[questId];
    this.p.story.quests[questId] = 'done';
    for (const f of def.reward.flags) this.p.story.flags[f] = true;
    const rewards = this.grant(def.reward.xp, def.reward.items);
    this.p.story = refreshAvailability(this.p.story);
    return rewards;
  }

  async talk(npc: string, requestId: string): Promise<QuestResult> {
    this.requireProfile();
    return this.once(requestId, () => {
      let rewards: RewardSummary | null = null;
      for (const [id, def] of Object.entries(QUESTS)) {
        const st = this.p.story.quests[id];
        if (def.objective.kind === 'talk' && def.objective.npc === npc && (st === 'available' || st === 'active')) {
          rewards = this.finishQuest(id);
        }
      }
      if (!this.p.codex.includes(`npc:${npc}`)) this.p.codex.push(`npc:${npc}`);
      return { progression: clone(this.p), rewards };
    });
  }

  async acceptQuest(questId: string, requestId: string) {
    this.requireProfile();
    return this.once(requestId, () => {
      if (this.p.story.quests[questId] !== 'available') throw new Error(`quest ${questId} not available`);
      this.p.story.quests[questId] = 'active';
      return clone(this.p);
    });
  }

  async completeQuest(questId: string, requestId: string): Promise<QuestResult> {
    this.requireProfile();
    return this.once(requestId, () => {
      if (this.p.story.quests[questId] !== 'ready') throw new Error(`quest ${questId} is not ready`);
      const rewards = this.finishQuest(questId);
      return { progression: clone(this.p), rewards };
    });
  }

  // ───────── runs (combat) ─────────

  private view(r: RunRecord): RunView {
    let turn: RunView['turn'] = null;
    if (r.state.phase === 'question' && r.questionId && r.turnId) {
      const q = this.bank.find((b) => b.id === r.questionId)!;
      const pub = toPublic(q);
      const byId = new Map(pub.options.map((o) => [o.id, o]));
      turn = {
        turnId: r.turnId,
        question: { ...pub, options: r.optionOrder.map((id) => byId.get(id)!) },
        isReview: r.isReview,
        hintsLeft: r.hintsLeft,
        eliminated: [...r.eliminated],
      };
    }
    return { runId: r.runId, enemyId: r.enemyId, state: clone(r.state), turn, lastAnswer: r.lastAnswer, result: r.result };
  }

  private pickQuestion(r: RunRecord) {
    const enemy = ENEMIES[r.enemyId];
    const sel = selectNextQuestion(this.bank, {
      subjects: enemy.subjects,
      usedIds: new Set(r.usedIds),
      usedFamilies: new Set(r.usedFamilies),
      seenFamilies: this.p.seenFamilies,
      remediateSkill: r.remediateSkill ?? undefined,
      targetDifficulty: enemy.kind === 'common' ? 1 : 2,
      allowedStatuses: PROTOTYPE_ALLOWED_STATUSES,
      rng: this.rng,
    });
    r.hintUsedThisTurn = false;
    r.eliminated = [];
    r.lastAnswer = null;
    if (!sel) {
      // Bank exhausted for this run: skip the question, keep combat going.
      r.questionId = null;
      r.turnId = null;
      r.state = { ...r.state, phase: 'command' };
      return;
    }
    r.questionId = sel.question.id;
    r.turnId = `${r.runId}:t${r.state.turn}`;
    r.isReview = sel.isReview;
    r.optionOrder = shuffleOptions(sel.question, this.rng).options.map((o) => o.id);
    r.usedIds.push(sel.question.id);
    r.usedFamilies.push(sel.question.variant_family_id);
  }

  async startRun(enemyId: string, requestId: string): Promise<RunView> {
    this.requireProfile();
    return this.once(requestId, () => {
      const enemy = ENEMIES[enemyId];
      if (!enemy) throw new Error(`unknown enemy ${enemyId}`);
      if (enemyId === 'gear_warden' && this.p.story.quests.q_math_door !== 'active')
        throw new Error('ผู้พิทักษ์เฟืองยังไม่ปรากฏ');
      if (this.p.activeRunId && this.save.runs[this.p.activeRunId]?.result === null) {
        return this.view(this.save.runs[this.p.activeRunId]);
      }
      const stats = combatStats(this.p);
      const runId = this.nextId('run');
      const r: RunRecord = {
        runId, enemyId,
        state: createCombat(enemy, { ...stats, hp: this.p.hp, maxFocus: BASE_STATS.maxFocus }),
        usedIds: [], usedFamilies: [], questionId: null, turnId: null, optionOrder: [], isReview: false,
        hintsLeft: HINTS_PER_RUN, hintUsedThisTurn: false, eliminated: [], lastAnswer: null,
        remediateSkill: null, pendingXp: 0, result: null,
      };
      if (r.state.phase === 'question') this.pickQuestion(r);
      this.save.runs[runId] = r;
      this.p.activeRunId = runId;
      if (!this.p.codex.includes(`monster:${enemyId}`)) this.p.codex.push(`monster:${enemyId}`);
      return this.view(r);
    });
  }

  async getRun(runId: string) {
    const r = this.save.runs[runId];
    return r ? this.view(r) : null;
  }

  private ownRun(runId: string): RunRecord {
    const r = this.save.runs[runId];
    if (!r || this.p.activeRunId !== runId) throw new Error('run not found or not active');
    return r;
  }

  async useHint(runId: string, turnId: string, requestId: string) {
    return this.once(requestId, () => {
      const r = this.ownRun(runId);
      if (r.turnId !== turnId || r.state.phase !== 'question' || r.lastAnswer) throw new Error('stale turn');
      if (r.hintsLeft <= 0 || r.hintUsedThisTurn) return this.view(r);
      const q = this.bank.find((b) => b.id === r.questionId)!;
      const wrong = r.optionOrder.filter((id) => id !== q.answer_key);
      r.eliminated = [wrong[Math.floor(this.rng() * wrong.length) % wrong.length]];
      r.hintsLeft -= 1;
      r.hintUsedThisTurn = true;
      return this.view(r);
    });
  }

  async answer(runId: string, turnId: string, optionId: string, requestId: string) {
    return this.once(requestId, () => {
      const r = this.ownRun(runId);
      if (r.turnId !== turnId || r.state.phase !== 'question') throw new Error('stale turn');
      const q = this.bank.find((b) => b.id === r.questionId)!;
      if (!q.options.some((o) => o.id === optionId)) throw new Error('unknown option');
      const correct = optionId === q.answer_key;
      const seenBefore = this.p.seenFamilies[q.variant_family_id] ?? 0;
      this.p.seenFamilies[q.variant_family_id] = seenBefore + 1;
      const m = this.p.mastery[q.skill_id] ?? newMastery(q.skill_id, q.subject);
      this.p.mastery[q.skill_id] = recordMastery(m, { correct, usedHint: r.hintUsedThisTurn, familyId: q.variant_family_id });
      if (correct) r.pendingXp += questionXp(ENEMIES[r.enemyId].questionXp, seenBefore, r.hintUsedThisTurn);
      r.remediateSkill = correct ? null : q.skill_id;
      r.lastAnswer = {
        correct, chosenOptionId: optionId, correctOptionId: q.answer_key, explanation: q.explanation,
        rationale: correct ? null : (q.distractor_rationale[optionId] ?? null), usedHint: r.hintUsedThisTurn,
      };
      r.state = applyAnswer(r.state, correct).state;
      return this.view(r);
    });
  }

  private potionStack() {
    return this.p.inventory.find((i) => i.itemId === 'focus_potion' && i.qty > 0);
  }

  async action(runId: string, turn: number, action: PlayerAction, requestId: string): Promise<ActionResult> {
    return this.once(requestId, () => {
      const r = this.ownRun(runId);
      if (r.state.turn !== turn) throw new Error('stale turn');
      const enemy = ENEMIES[r.enemyId];
      const potions = this.potionStack()?.qty ?? 0;
      if (!canUse(r.state, action, potions)) throw new Error('action not allowed');
      const stats = combatStats(this.p);
      const out = applyAction(r.state, action, enemy, stats, potions);
      r.state = out.state;
      if (out.potionUsed) {
        const stack = this.potionStack()!;
        stack.qty -= 1;
        if (stack.qty <= 0) this.p.inventory = this.p.inventory.filter((i) => i !== stack);
      }
      r.lastAnswer = null;
      if (r.state.phase === 'question') this.pickQuestion(r);
      else if (r.state.phase === 'won' || r.state.phase === 'lost') this.finishRun(r);
      return { view: this.view(r), events: out.events };
    });
  }

  /** Rewards + quest progress in one step (a DB transaction on the real server). */
  private finishRun(r: RunRecord) {
    if (r.result) return;
    const enemy = ENEMIES[r.enemyId];
    const won = r.state.phase === 'won';
    const items: { itemId: string; qty: number }[] = [];
    const completedQuests: string[] = [];
    const readyQuests: string[] = [];
    let xp = r.pendingXp;
    if (won) {
      xp += enemy.xp;
      const killKey = `kills.${enemy.id}`;
      this.p.story.counters[killKey] = (this.p.story.counters[killKey] ?? 0) + 1;
      if (enemy.id === 'gear_warden' && !this.p.story.flags.loot_gear_warden) {
        this.p.story.flags.loot_gear_warden = true;
        items.push({ itemId: 'copper_gear_wrench', qty: 1 });
      }
      if (enemy.id === 'fog_wisp' && this.p.story.counters[killKey] % 3 === 0) items.push({ itemId: 'focus_potion', qty: 1 });
    }
    const rewards = this.grant(xp, items);
    if (won) {
      for (const [id, def] of Object.entries(QUESTS)) {
        if (this.p.story.quests[id] !== 'active') continue;
        const o = def.objective;
        if (o.kind === 'defeat' && o.enemyId === enemy.id) {
          const key = `quest.${id}`;
          this.p.story.counters[key] = (this.p.story.counters[key] ?? 0) + 1;
          if (this.p.story.counters[key] >= o.count) {
            const qr = this.finishQuest(id);
            rewards.xp += qr.xp;
            rewards.items.push(...qr.items);
            rewards.levelAfter = qr.levelAfter;
            completedQuests.push(id);
          }
        } else if (o.kind === 'defeat_then_interact' && o.enemyId === enemy.id) {
          this.p.story.quests[id] = 'ready';
          readyQuests.push(id);
        }
      }
    }
    // Back in the hub the character rests to full HP (prototype rule).
    this.p.hp = this.p.maxHp;
    this.p.activeRunId = null;
    r.result = { outcome: won ? 'won' : 'lost', rewards, completedQuests, readyQuests };
  }

  async abandonRun(runId: string) {
    const r = this.save.runs[runId];
    if (r && !r.result) {
      r.state = { ...r.state, phase: 'lost' };
      this.finishRun(r);
      this.persist();
    }
    return clone(this.p);
  }

  // ───────── equipment ─────────

  async equip(instanceId: string) {
    const inst = this.p.inventory.find((i) => i.instanceId === instanceId);
    const def = inst && ITEMS[inst.itemId];
    if (!def || def.kind !== 'equipment' || !def.slot) throw new Error('not equipment');
    this.p.equipment[def.slot] = instanceId;
    this.persist();
    return clone(this.p);
  }

  async unequip(slot: EquipSlot) {
    delete this.p.equipment[slot];
    this.persist();
    return clone(this.p);
  }

  async savePosition(tx: number, ty: number) {
    this.p.lastPosition = { tx, ty };
    this.persist();
  }

  async reset() {
    this.storage.removeItem(SAVE_KEY);
    this.save = this.load();
  }
}
