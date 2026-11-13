import type { QuestStatus, StoryProgress } from './types';

export type QuestObjective =
  | { kind: 'talk'; npc: string }
  | { kind: 'defeat'; enemyId: string; count: number }
  | { kind: 'defeat_then_interact'; enemyId: string; target: string };

export interface QuestDef {
  id: string;
  chapter: string;
  title: string;
  summary: string;
  objective: QuestObjective;
  /** quests that must be `done` before this one becomes available */
  requires: string[];
  reward: { xp: number; items: { itemId: string; qty: number }[]; flags: string[] };
}

export const CHAPTERS = {
  prologue: { id: 'prologue', title: 'บทนำ · คืนที่ตราแตก', levelRange: [1, 5] as const },
} as const;

export const QUESTS: Record<string, QuestDef> = {
  q_meet_owl: {
    id: 'q_meet_owl', chapter: 'prologue', title: 'พบอาจารย์ฮูก',
    summary: 'คุยกับอาจารย์ฮูกข้างวงตรากลางโถง',
    objective: { kind: 'talk', npc: 'owl' }, requires: [],
    reward: { xp: 15, items: [], flags: ['met_owl'] },
  },
  q_clear_fog: {
    id: 'q_clear_fog', chapter: 'prologue', title: 'ไล่หมอกลืมเลือน',
    summary: 'ปราบหมอกลืมเลือน 1 ตัวที่ลอยอยู่ในลานกลาง',
    objective: { kind: 'defeat', enemyId: 'fog_wisp', count: 1 }, requires: ['q_meet_owl'],
    reward: { xp: 10, items: [{ itemId: 'focus_potion', qty: 1 }, { itemId: 'wind_boots', qty: 1 }], flags: [] },
  },
  q_math_door: {
    id: 'q_math_door', chapter: 'prologue', title: 'ปลุกประตูโรงกลจักร',
    summary: 'ปราบผู้พิทักษ์เฟืองหน้าประตูคณิตศาสตร์ แล้วแตะประตูเพื่อเปิด',
    objective: { kind: 'defeat_then_interact', enemyId: 'gear_warden', target: 'door_math' },
    requires: ['q_clear_fog'],
    reward: { xp: 15, items: [{ itemId: 'badge_gear_awakener', qty: 1 }], flags: ['door_math_open'] },
  },
};

export const QUEST_ORDER = ['q_meet_owl', 'q_clear_fog', 'q_math_door'];

export function initialStory(): StoryProgress {
  const quests: Record<string, QuestStatus> = {};
  for (const id of QUEST_ORDER) quests[id] = QUESTS[id].requires.length === 0 ? 'available' : 'locked';
  return { chapter: 'prologue', quests, counters: {}, flags: {} };
}

/** Unlock quests whose requirements are done. Returns a new object. */
export function refreshAvailability(story: StoryProgress): StoryProgress {
  const quests = { ...story.quests };
  for (const id of QUEST_ORDER) {
    if (quests[id] === 'locked' && QUESTS[id].requires.every((r) => quests[r] === 'done')) quests[id] = 'available';
  }
  return { ...story, quests };
}

export function activeQuest(story: StoryProgress): QuestDef | null {
  for (const id of QUEST_ORDER) {
    const s = story.quests[id];
    if (s === 'active' || s === 'ready') return QUESTS[id];
  }
  return null;
}

export function nextAvailableQuest(story: StoryProgress): QuestDef | null {
  for (const id of QUEST_ORDER) if (story.quests[id] === 'available') return QUESTS[id];
  return null;
}

export function prologueComplete(story: StoryProgress): boolean {
  return QUEST_ORDER.every((id) => story.quests[id] === 'done');
}
