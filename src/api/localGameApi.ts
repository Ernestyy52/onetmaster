// In-browser stand-in for the Supabase Edge Functions described in handoff §6.
// It keeps the same rules a real server must enforce (ownership/turn order, answer keys
// never sent before answering, idempotent request ids, rewards granted once) so the
// client code does not change when the real backend arrives. NOTE: in this local mode
// the answer keys still ship inside the JS bundle — real deployments must move this file's
// logic server-side.
import { equipmentLayers, isAppearance, normalizeAppearance } from '../shared/appearance';
import { ITEMS } from '../shared/data/catalog';
import { FIRST_JOBS, JOBS } from '../shared/data/jobs';
import { applyAction, applyAnswer, canUse, createCombat, ENEMIES, type PlayerAction } from '../shared/combat';
import { addJobXp, canChangeJob, canEquipFor, jobLevelForXp, jobProgress, jobXpToReach } from '../shared/jobs';
import { validateNickname } from '../shared/nickname';
import { combatStats, levelForXp, newMastery, questionXp, recordMastery, xpToReach } from '../shared/progression';
import { selectNextQuestion, shuffleOptions, toPublic } from '../shared/questionSelector';
import { CHAPTERS, QUEST_ORDER, QUESTS, refreshAvailability } from '../shared/story';
import type { Appearance, CharacterSummary, EquipSlot, JobId, Progression, QuestionItem, ReviewStatus, RewardSummary } from '../shared/types';
import {
  freshCharacter, loadSave, MAX_SLOTS, SAVE_KEY_V1, SAVE_KEY_V2, trimRequests,
  type CharacterRecord, type RunRecord, type SaveV2,
} from './saveFormat';
import type { ActionResult, GameApi, LocalImport, QuestResult, RunView } from './types';

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

/** Prototype: items awaiting teacher review are playable but flagged in the UI. */
export const PROTOTYPE_ALLOWED_STATUSES: ReviewStatus[] = ['review', 'approved', 'published'];
const HINTS_PER_RUN = 2;
/** Imported job levels are capped here: about what the prologue's fights can give. */
const IMPORT_MAX_JOB_LEVEL = 5;
/** Non-negative integer from untrusted input, else 0. */
const count = (v: unknown, max = 1e6): number => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(max, Math.floor(v))) : 0);

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

export class LocalGameApi implements GameApi {
  private save: SaveV2;

  constructor(
    private storage: KeyValueStorage,
    /** offline: the bundled bank (src/shared/data/questions); online server: rows from question_versions */
    private bank: QuestionItem[],
    private rng: () => number = Math.random,
    /** question statuses that may be served; the online server passes approved/published in production */
    private allowedStatuses: ReviewStatus[] = PROTOTYPE_ALLOWED_STATUSES,
  ) {
    this.save = this.load();
  }

  private load(): SaveV2 {
    const { save, migrated } = loadSave(this.storage.getItem(SAVE_KEY_V2), this.storage.getItem(SAVE_KEY_V1));
    this.save = save;
    if (migrated) this.persist(); // v1 key is kept as the rollback copy
    return save;
  }

  private persist() {
    try {
      this.storage.setItem(SAVE_KEY_V2, JSON.stringify(trimRequests(this.save)));
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

  private character(slot: number | null): CharacterRecord | undefined {
    return slot === null ? undefined : this.save.characters.find((c) => c.slot === slot);
  }

  /** The selected character. Every gameplay call requires one. */
  private get p(): CharacterRecord {
    const c = this.character(this.save.selected);
    if (!c) throw new Error('ยังไม่ได้เลือกตัวละคร');
    return c;
  }

  private get acct() {
    return this.save.account;
  }

  private requireProfile() {
    if (!this.p.profile) throw new Error('no profile');
  }

  private nextId(prefix: string) {
    this.save.counter += 1;
    return `${prefix}-${this.save.counter}`;
  }

  private viewOf(c: CharacterRecord): Progression {
    return clone({ ...c, mastery: this.acct.mastery, seenFamilies: this.acct.seenFamilies });
  }

  private syncMaxHp(fullHeal: boolean) {
    const maxHp = combatStats(this.p).maxHp;
    this.p.maxHp = maxHp;
    this.p.hp = fullHeal ? maxHp : Math.min(this.p.hp, maxHp);
  }

  // ───────── characters ─────────

  async getProgression(): Promise<Progression> {
    const c = this.character(this.save.selected);
    return this.viewOf(c ?? freshCharacter(0));
  }

  async listCharacters(): Promise<CharacterSummary[]> {
    return this.summaries();
  }

  private summaries(): CharacterSummary[] {
    return this.save.characters
      .filter((c) => c.profile)
      .sort((a, b) => a.slot - b.slot)
      .map((c) => ({
        slot: c.slot, nickname: c.profile!.nickname, appearance: c.profile!.appearance,
        level: c.level, job: c.job, jobLevel: jobProgress(c).level, layers: equipmentLayers(c),
      }));
  }

  async createCharacter(slot: number, nickname: string, appearance: Appearance, requestId: string): Promise<Progression> {
    return this.once(requestId, () => {
      if (!Number.isInteger(slot) || slot < 1 || slot > MAX_SLOTS) throw new Error('ช่องตัวละครไม่ถูกต้อง');
      if (this.character(slot)) throw new Error('ช่องนี้มีตัวละครแล้ว');
      if (!isAppearance(appearance)) throw new Error('รูปลักษณ์ไม่ถูกต้อง');
      const check = validateNickname(nickname, this.save.characters.map((c) => c.profile?.nickname ?? ''));
      if (!check.ok) throw new Error(check.reason);
      const c = freshCharacter(slot);
      c.profile = { nickname: check.value, appearance: normalizeAppearance(appearance), createdAt: new Date().toISOString() };
      this.save.characters.push(c);
      this.save.selected = slot;
      return this.viewOf(c);
    });
  }

  async selectCharacter(slot: number): Promise<Progression> {
    const c = this.character(slot);
    if (!c?.profile) throw new Error('ไม่พบตัวละครในช่องนี้');
    this.save.selected = slot;
    this.persist();
    return this.viewOf(c);
  }

  async changeJob(job: JobId, requestId: string): Promise<Progression> {
    this.requireProfile();
    return this.once(requestId, () => {
      const check = canChangeJob(this.p, job);
      if (!check.ok) throw new Error(check.reason);
      this.applyJob(job);
      return this.viewOf(this.p);
    });
  }

  private applyJob(job: JobId) {
    {
      const c = this.p;
      c.job = job;
      c.jobs[job] = c.jobs[job] ?? { level: 1, xp: 0 };
      // Take off gear the new job cannot use.
      for (const [slot, instanceId] of Object.entries(c.equipment) as [EquipSlot, string][]) {
        const inst = c.inventory.find((i) => i.instanceId === instanceId);
        if (inst && !canEquipFor(ITEMS[inst.itemId], job)) delete c.equipment[slot];
      }
      const starter = JOBS[job].starterItem;
      const flag = `starter_${job}`;
      if (starter && !c.story.flags[flag]) {
        c.story.flags[flag] = true;
        const id = this.addItem(starter, 1);
        const def = ITEMS[starter];
        if (def.slot) c.equipment[def.slot] = id;
      }
      if (!c.codex.includes(`job:${job}`)) c.codex.push(`job:${job}`);
      this.syncMaxHp(true);
    }
  }

  async importLocalSave(data: LocalImport, requestId: string): Promise<CharacterSummary[]> {
    return this.once(requestId, () => {
      if (this.save.characters.length || this.save.importedAt) throw new Error('นำเข้าได้เฉพาะบัญชีใหม่ที่ยังไม่มีตัวละคร');
      const list = Array.isArray(data?.characters) ? data.characters.slice(0, MAX_SLOTS) : [];
      if (!list.length) throw new Error('ไม่พบตัวละครในเครื่องนี้');
      // validate every character before changing anything
      const names: string[] = [];
      const slots = new Set<number>();
      const checked = list.map((pc) => {
        if (!Number.isInteger(pc?.slot) || pc.slot < 1 || pc.slot > MAX_SLOTS || slots.has(pc.slot)) throw new Error('ช่องตัวละครไม่ถูกต้อง');
        slots.add(pc.slot);
        const name = validateNickname(String(pc.nickname ?? ''), names);
        if (!name.ok) throw new Error(name.reason);
        names.push(name.value);
        return { pc, nickname: name.value };
      });
      const xpCap = xpToReach(CHAPTERS.prologue.levelRange[1]);
      const jobXpCap = jobXpToReach(IMPORT_MAX_JOB_LEVEL);
      for (const { pc, nickname } of checked) {
        const c = freshCharacter(pc.slot);
        c.profile = { nickname, appearance: normalizeAppearance(pc.appearance), createdAt: new Date().toISOString() };
        this.save.characters.push(c);
        this.save.selected = pc.slot;
        // Rebuild from the quest chain (in order) so items and flags come only from real quest rewards.
        const done = new Set(Array.isArray(pc.questsDone) ? pc.questsDone : []);
        for (const id of QUEST_ORDER) {
          if (!done.has(id) || c.story.quests[id] === 'locked') break;
          this.finishQuest(id);
        }
        // Extra XP from fights, never above the prologue's level range.
        const extra = Math.min(count(pc.xp), xpCap) - c.xp;
        if (extra > 0) this.grant(extra, []);
        const noviceXp = Math.min(count(pc.jobs?.novice?.xp), jobXpCap);
        c.jobs.novice = { xp: noviceXp, level: jobLevelForXp('novice', noviceXp) };
        if (FIRST_JOBS.includes(pc.job) && canChangeJob(c, pc.job).ok) {
          this.applyJob(pc.job);
          const jobXp = Math.min(count(pc.jobs?.[pc.job]?.xp), jobXpCap);
          c.jobs[pc.job] = { xp: jobXp, level: jobLevelForXp(pc.job, jobXp) };
        }
        for (const itemId of Array.isArray(pc.equipped) ? pc.equipped : []) {
          const inst = c.inventory.find((i) => i.itemId === itemId);
          const def = inst ? ITEMS[inst.itemId] : undefined;
          if (inst && def?.slot && canEquipFor(def, c.job)) c.equipment[def.slot] = inst.instanceId;
        }
        this.syncMaxHp(true);
      }
      // Seen families only lower future question XP, so keeping them is safe; unknown ids are dropped.
      const families = new Set(this.bank.map((q) => q.variant_family_id));
      for (const [id, n] of Object.entries(data.seenFamilies ?? {})) {
        if (families.has(id)) this.acct.seenFamilies[id] = Math.max(this.acct.seenFamilies[id] ?? 0, count(n, 1000));
      }
      // Offline mastery is a reference copy only: the teacher view counts what is answered online.
      const skills = new Set(this.bank.map((q) => q.skill_id));
      const now = new Date().toISOString();
      const reference: Record<string, { attempts: number; correct: number }> = {};
      for (const [id, m] of Object.entries(data.mastery ?? {})) {
        if (!skills.has(id)) continue;
        const attempts = count(m?.attempts, 10000);
        reference[id] = { attempts, correct: Math.min(attempts, count(m?.correct, 10000)) };
      }
      this.acct.importedReference = { at: now, mastery: reference };
      this.save.importedAt = now;
      this.save.selected = checked[0].pc.slot;
      return this.summaries();
    });
  }

  // ───────── progression ─────────

  private addItem(itemId: string, qty: number): string {
    const def = ITEMS[itemId];
    if (!def) throw new Error(`unknown item ${itemId}`);
    const stack = def.kind === 'consumable' ? this.p.inventory.find((i) => i.itemId === itemId) : undefined;
    if (!this.p.codex.includes(`item:${itemId}`)) this.p.codex.push(`item:${itemId}`);
    if (stack) {
      stack.qty += qty;
      return stack.instanceId;
    }
    const instanceId = this.nextId('item');
    this.p.inventory.push({ instanceId, itemId, qty });
    return instanceId;
  }

  private grant(xp: number, items: { itemId: string; qty: number }[]): RewardSummary {
    const levelBefore = this.p.level;
    this.p.xp += xp;
    this.p.level = levelForXp(this.p.xp);
    this.syncMaxHp(this.p.level > levelBefore);
    for (const it of items) this.addItem(it.itemId, it.qty);
    return { xp, levelBefore, levelAfter: this.p.level, items };
  }

  /** Job XP comes from combat only — never from buying or from questions alone. */
  private grantJobXp(xp: number, rewards: RewardSummary) {
    const job = this.p.job;
    const before = jobProgress(this.p);
    const after = addJobXp(job, before, xp);
    this.p.jobs[job] = after;
    rewards.jobXp = xp;
    rewards.jobLevelBefore = before.level;
    rewards.jobLevelAfter = after.level;
    if (after.level > before.level) this.syncMaxHp(true);
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
      return { progression: this.viewOf(this.p), rewards };
    });
  }

  async acceptQuest(questId: string, requestId: string) {
    this.requireProfile();
    return this.once(requestId, () => {
      if (this.p.story.quests[questId] !== 'available') throw new Error(`quest ${questId} not available`);
      this.p.story.quests[questId] = 'active';
      return this.viewOf(this.p);
    });
  }

  async completeQuest(questId: string, requestId: string): Promise<QuestResult> {
    this.requireProfile();
    return this.once(requestId, () => {
      if (this.p.story.quests[questId] !== 'ready') throw new Error(`quest ${questId} is not ready`);
      const rewards = this.finishQuest(questId);
      return { progression: this.viewOf(this.p), rewards };
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
      seenFamilies: this.acct.seenFamilies,
      remediateSkill: r.remediateSkill ?? undefined,
      targetDifficulty: enemy.kind === 'common' ? 1 : 2,
      allowedStatuses: this.allowedStatuses,
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
        runId, enemyId, slot: this.p.slot,
        state: createCombat(enemy, { ...stats, hp: this.p.hp }),
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
    if (!r || this.p.activeRunId !== runId || (r.slot ?? 1) !== this.p.slot) throw new Error('run not found or not active');
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
      const seenBefore = this.acct.seenFamilies[q.variant_family_id] ?? 0;
      this.acct.seenFamilies[q.variant_family_id] = seenBefore + 1;
      const m = this.acct.mastery[q.skill_id] ?? newMastery(q.skill_id, q.subject);
      this.acct.mastery[q.skill_id] = recordMastery(m, { correct, usedHint: r.hintUsedThisTurn, familyId: q.variant_family_id });
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
    if (won) this.grantJobXp(enemy.xp, rewards);
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
    return this.viewOf(this.p);
  }

  // ───────── equipment ─────────

  async equip(instanceId: string) {
    const inst = this.p.inventory.find((i) => i.instanceId === instanceId);
    const def = inst && ITEMS[inst.itemId];
    if (!def || def.kind !== 'equipment' || !def.slot) throw new Error('not equipment');
    if (!canEquipFor(def, this.p.job)) throw new Error(`${JOBS[this.p.job].name}ใช้${def.name}ไม่ได้`);
    this.p.equipment[def.slot] = instanceId;
    this.persist();
    return this.viewOf(this.p);
  }

  async unequip(slot: EquipSlot) {
    delete this.p.equipment[slot];
    this.persist();
    return this.viewOf(this.p);
  }

  async savePosition(tx: number, ty: number) {
    if (!this.character(this.save.selected)) return;
    this.p.lastPosition = { tx, ty };
    this.persist();
  }

  async reset() {
    this.storage.removeItem(SAVE_KEY_V2);
    this.storage.removeItem(SAVE_KEY_V1);
    this.save = this.load();
  }
}
