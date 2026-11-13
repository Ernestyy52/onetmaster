// Types shared by Phaser, React and the (local) game API.

export type SubjectId = 'thai' | 'english' | 'math' | 'science';

export interface SubjectInfo {
  id: SubjectId;
  nameTh: string;
  roomName: string;
  /** CSS colour used together with the icon and name (never colour alone). */
  color: string;
  icon: string;
}

export type ReviewStatus = 'draft' | 'review' | 'approved' | 'published' | 'retired';

export interface QuestionOption {
  /** Stable option id so options can be shuffled without breaking the key. */
  id: string;
  text: string;
}

export type Stimulus =
  | { kind: 'table'; caption: string; headers: string[]; rows: string[][] }
  | { kind: 'text'; title: string; lines: string[] };

export interface QuestionItem {
  id: string;
  subject: SubjectId;
  blueprint_version: string;
  indicator: string;
  skill_id: string;
  difficulty: 1 | 2 | 3;
  item_type: 'single_choice';
  stem: string;
  stimulus?: Stimulus;
  options: QuestionOption[];
  answer_key: string;
  explanation: string;
  distractor_rationale: Record<string, string>;
  variant_family_id: string;
  source_refs: string[];
  review_status: ReviewStatus;
  version: number;
}

/** What the client is allowed to see before answering (no key, no rationale). */
export type PublicQuestion = Omit<QuestionItem, 'answer_key' | 'explanation' | 'distractor_rationale' | 'source_refs'>;

export type MasteryLevel = 'practising' | 'with_hint' | 'independent';

export interface SkillMastery {
  skill_id: string;
  subject: SubjectId;
  attempts: number;
  correct: number;
  correctWithHint: number;
  /** variant families answered correctly without a hint */
  independentFamilies: string[];
  missedFamilies: string[];
  level: MasteryLevel;
}

export type EquipSlot = 'weapon' | 'armor' | 'shoes' | 'charm';

export interface ItemDef {
  id: string;
  name: string;
  description: string;
  kind: 'equipment' | 'consumable' | 'badge';
  slot?: EquipSlot;
  atk?: number;
  def?: number;
  heal?: number;
  icon: string;
}

export interface ItemInstance {
  instanceId: string;
  itemId: string;
  qty: number;
}

export type QuestStatus = 'locked' | 'available' | 'active' | 'ready' | 'done';

export interface StoryProgress {
  chapter: string;
  quests: Record<string, QuestStatus>;
  /** objective counters per quest, e.g. defeated enemies */
  counters: Record<string, number>;
  flags: Record<string, boolean>;
}

export type Appearance = 'swordsman' | 'mage';

export interface Profile {
  nickname: string;
  appearance: Appearance;
  createdAt: string;
}

export interface Progression {
  profile: Profile | null;
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  inventory: ItemInstance[];
  equipment: Partial<Record<EquipSlot, string>>; // slot -> instanceId
  mastery: Record<string, SkillMastery>;
  seenFamilies: Record<string, number>;
  story: StoryProgress;
  codex: string[];
  activeRunId: string | null;
  /** client-side convenience only, never trusted for rewards */
  lastPosition: { tx: number; ty: number } | null;
}

export interface RewardSummary {
  xp: number;
  levelBefore: number;
  levelAfter: number;
  items: { itemId: string; qty: number }[];
}
