import type { CombatEvent, CombatState, PlayerAction } from '../shared/combat';
import type { Appearance, EquipSlot, Progression, PublicQuestion, RewardSummary } from '../shared/types';

/** One question turn as the client sees it (no answer key). */
export interface QuestionTurn {
  turnId: string;
  question: PublicQuestion;
  /** "ทบทวน" badge: this variant family was seen before */
  isReview: boolean;
  hintsLeft: number;
  eliminated: string[];
}

export interface AnswerResult {
  correct: boolean;
  chosenOptionId: string;
  correctOptionId: string;
  explanation: string;
  rationale: string | null;
  usedHint: boolean;
}

export interface RunResult {
  outcome: 'won' | 'lost';
  rewards: RewardSummary;
  completedQuests: string[];
  readyQuests: string[];
}

export interface RunView {
  runId: string;
  enemyId: string;
  state: CombatState;
  turn: QuestionTurn | null;
  lastAnswer: AnswerResult | null;
  result: RunResult | null;
}

export interface ActionResult {
  view: RunView;
  events: CombatEvent[];
}

export interface QuestResult {
  progression: Progression;
  rewards: RewardSummary | null;
}

/**
 * Mirrors the server contract in handoff §6 (POST /runs, /runs/{id}/answer, /runs/{id}/action,
 * GET /runs/{id}, POST /quests/{id}/complete, GET /progression). `requestId` makes each write
 * idempotent: sending the same id again returns the stored result and grants nothing twice.
 */
export interface GameApi {
  getProgression(): Promise<Progression>;
  createProfile(nickname: string, appearance: Appearance): Promise<Progression>;
  talk(npc: string, requestId: string): Promise<QuestResult>;
  acceptQuest(questId: string, requestId: string): Promise<Progression>;
  completeQuest(questId: string, requestId: string): Promise<QuestResult>;
  startRun(enemyId: string, requestId: string): Promise<RunView>;
  getRun(runId: string): Promise<RunView | null>;
  answer(runId: string, turnId: string, optionId: string, requestId: string): Promise<RunView>;
  useHint(runId: string, turnId: string, requestId: string): Promise<RunView>;
  action(runId: string, turn: number, action: PlayerAction, requestId: string): Promise<ActionResult>;
  abandonRun(runId: string): Promise<Progression>;
  equip(instanceId: string): Promise<Progression>;
  unequip(slot: EquipSlot): Promise<Progression>;
  savePosition(tx: number, ty: number): Promise<void>;
  reset(): Promise<void>;
}
