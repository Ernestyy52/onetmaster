// Pure turn-based combat rules. The (local) API runs these; the client only renders results.
import type { SubjectId } from './types';

export type IntentId = 'strike' | 'charge' | 'beam' | 'guard';
export type PlayerAction = 'attack' | 'defend' | 'pierce' | 'shield' | 'potion';

export interface EnemyDef {
  id: string;
  name: string;
  kind: 'common' | 'elite' | 'boss';
  sprite: string;
  maxHp: number;
  atk: number;
  intents: IntentId[];
  /** turns on which the enemy raises a shield and a question appears (handoff: common 0–1, elite 1–2, boss 3–5) */
  questionTurns: number[];
  subjects: SubjectId[];
  xp: number;
  /** XP per correct question (before repeat decay) */
  questionXp: number;
}

export const ENEMIES: Record<string, EnemyDef> = {
  fog_wisp: {
    id: 'fog_wisp', name: 'หมอกลืมเลือน', kind: 'common', sprite: 'wisp',
    maxHp: 24, atk: 5, intents: ['strike', 'strike', 'guard'], questionTurns: [1],
    subjects: ['thai', 'english', 'science', 'math'], xp: 35, questionXp: 10,
  },
  gear_warden: {
    id: 'gear_warden', name: 'ผู้พิทักษ์เฟือง', kind: 'boss', sprite: 'warden',
    maxHp: 45, atk: 8, intents: ['charge', 'beam', 'strike'], questionTurns: [1, 2, 3, 5],
    subjects: ['math'], xp: 40, questionXp: 5,
  },
};

export const INTENT_INFO: Record<IntentId, { label: string; hint: string }> = {
  strike: { label: 'โจมตีธรรมดา', hint: 'ความเสียหายปกติ' },
  charge: { label: 'กำลังชาร์จพลัง', hint: 'เทิร์นหน้าจะยิงลำแสงแรง!' },
  beam: { label: 'ยิงลำแสง', hint: 'แรงมาก ควรตั้งโล่' },
  guard: { label: 'ตั้งการ์ด', hint: 'ไม่โจมตีเทิร์นนี้' },
};

export const ACTION_INFO: Record<PlayerAction, { label: string; key: string; cost: number; desc: string }> = {
  attack: { label: 'โจมตี', key: 'Q', cost: 0, desc: 'โจมตีปกติ แรงขึ้น 2 เท่าถ้าเปิดจุดอ่อนแล้ว' },
  defend: { label: 'ป้องกัน', key: 'W', cost: 0, desc: 'ลดความเสียหายเทิร์นนี้ครึ่งหนึ่ง' },
  pierce: { label: 'เจาะเกราะ', key: 'E', cost: 1, desc: 'ใช้ 1 แต้มพลัง ทำลายโล่และเปิดจุดอ่อน' },
  shield: { label: 'ตั้งโล่', key: 'R', cost: 1, desc: 'ใช้ 1 แต้มพลัง กันการโจมตีเทิร์นนี้ทั้งหมด' },
  potion: { label: 'ยาฟื้นพลัง', key: 'F', cost: 0, desc: 'ฟื้น HP 25' },
};

export type CombatPhase = 'question' | 'command' | 'won' | 'lost';

export interface CombatState {
  enemyId: string;
  turn: number;
  phase: CombatPhase;
  playerHp: number;
  playerMaxHp: number;
  focus: number;
  maxFocus: number;
  enemyHp: number;
  enemyMaxHp: number;
  enemyShield: boolean;
  weakPoint: boolean;
  intentIndex: number;
  intent: IntentId;
  correctAnswers: number;
  questionsAsked: number;
}

export type CombatEvent =
  | { type: 'player_attack'; damage: number; doubled: boolean; blockedByShield: boolean }
  | { type: 'pierce'; damage: number }
  | { type: 'guard'; mode: 'half' | 'full' }
  | { type: 'heal'; amount: number }
  | { type: 'enemy_attack'; intent: IntentId; damage: number; blocked: 'none' | 'half' | 'full' }
  | { type: 'enemy_charge' }
  | { type: 'enemy_guard' }
  | { type: 'shield_up' }
  | { type: 'focus_gain' }
  | { type: 'victory' }
  | { type: 'defeat' };

export interface PlayerCombatStats {
  maxHp: number;
  hp: number;
  atk: number;
  def: number;
  maxFocus: number;
}

export function createCombat(enemy: EnemyDef, player: PlayerCombatStats): CombatState {
  const questionNow = enemy.questionTurns.includes(1);
  return {
    enemyId: enemy.id,
    turn: 1,
    phase: questionNow ? 'question' : 'command',
    playerHp: Math.max(1, player.hp),
    playerMaxHp: player.maxHp,
    focus: 0,
    maxFocus: player.maxFocus,
    enemyHp: enemy.maxHp,
    enemyMaxHp: enemy.maxHp,
    enemyShield: questionNow,
    weakPoint: false,
    intentIndex: 0,
    intent: enemy.intents[0],
    correctAnswers: 0,
    questionsAsked: questionNow ? 1 : 0,
  };
}

/** Answering never blocks progress: wrong answers simply give no focus point. */
export function applyAnswer(s: CombatState, correct: boolean): { state: CombatState; events: CombatEvent[] } {
  if (s.phase !== 'question') throw new Error('not in question phase');
  const events: CombatEvent[] = [];
  const next = { ...s, phase: 'command' as CombatPhase };
  if (correct) {
    next.correctAnswers++;
    if (next.focus < next.maxFocus) {
      next.focus++;
      events.push({ type: 'focus_gain' });
    }
  }
  return { state: next, events };
}

export function canUse(s: CombatState, action: PlayerAction, potions: number): boolean {
  if (s.phase !== 'command') return false;
  if (action === 'potion') return potions > 0 && s.playerHp < s.playerMaxHp;
  return s.focus >= ACTION_INFO[action].cost;
}

export function applyAction(
  s: CombatState,
  action: PlayerAction,
  enemy: EnemyDef,
  player: Pick<PlayerCombatStats, 'atk' | 'def'>,
  potions: number,
): { state: CombatState; events: CombatEvent[]; potionUsed: boolean } {
  if (!canUse(s, action, potions)) throw new Error(`action ${action} not allowed`);
  const n: CombatState = { ...s };
  const events: CombatEvent[] = [];
  let guard: 'none' | 'half' | 'full' = 'none';
  let potionUsed = false;

  switch (action) {
    case 'attack': {
      let damage = player.atk;
      let doubled = false;
      const blockedByShield = n.enemyShield && !n.weakPoint;
      if (n.weakPoint) {
        damage *= 2;
        doubled = true;
        n.weakPoint = false;
      } else if (n.enemyShield) {
        damage = Math.ceil(damage * 0.3);
      }
      n.enemyHp = Math.max(0, n.enemyHp - damage);
      events.push({ type: 'player_attack', damage, doubled, blockedByShield });
      break;
    }
    case 'pierce': {
      n.focus -= 1;
      const damage = Math.ceil(player.atk * 0.5);
      n.enemyShield = false;
      n.weakPoint = true;
      n.enemyHp = Math.max(0, n.enemyHp - damage);
      events.push({ type: 'pierce', damage });
      break;
    }
    case 'shield':
      n.focus -= 1;
      guard = 'full';
      events.push({ type: 'guard', mode: 'full' });
      break;
    case 'defend':
      guard = 'half';
      events.push({ type: 'guard', mode: 'half' });
      break;
    case 'potion': {
      const amount = Math.min(25, n.playerMaxHp - n.playerHp);
      n.playerHp += amount;
      potionUsed = true;
      events.push({ type: 'heal', amount });
      break;
    }
  }

  if (n.enemyHp <= 0) {
    n.phase = 'won';
    events.push({ type: 'victory' });
    return { state: n, events, potionUsed };
  }

  // Enemy acts on its announced intent.
  const intent = n.intent;
  if (intent === 'strike' || intent === 'beam') {
    const raw = intent === 'beam' ? Math.round(enemy.atk * 2.2) : enemy.atk;
    const afterGuard = guard === 'full' ? 0 : guard === 'half' ? Math.ceil(raw / 2) : raw;
    const damage = afterGuard === 0 ? 0 : Math.max(1, afterGuard - player.def);
    n.playerHp = Math.max(0, n.playerHp - damage);
    events.push({ type: 'enemy_attack', intent, damage, blocked: guard });
  } else if (intent === 'charge') {
    events.push({ type: 'enemy_charge' });
  } else {
    n.enemyShield = true;
    events.push({ type: 'enemy_guard' });
  }

  if (n.playerHp <= 0) {
    n.phase = 'lost';
    events.push({ type: 'defeat' });
    return { state: n, events, potionUsed };
  }

  // Next turn.
  n.turn += 1;
  n.intentIndex = (n.intentIndex + 1) % enemy.intents.length;
  n.intent = enemy.intents[n.intentIndex];
  if (enemy.questionTurns.includes(n.turn)) {
    n.phase = 'question';
    n.questionsAsked++;
    if (!n.enemyShield) {
      n.enemyShield = true;
      events.push({ type: 'shield_up' });
    }
  } else {
    n.phase = 'command';
  }
  return { state: n, events, potionUsed };
}
