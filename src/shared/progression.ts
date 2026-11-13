import { BASE_STATS, ITEMS } from './data/catalog';
import type { MasteryLevel, Progression, SkillMastery, SubjectId } from './types';

/** Main Story runs to 40, Endgame 41–60; levels keep counting after 60 with a stat soft cap. */
export const STORY_LEVEL_CAP = 40;
export const SOFT_CAP_LEVEL = 60;

/** Cumulative XP needed to *reach* `level` (level 1 = 0 XP). */
export function xpToReach(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 40 * n + 10 * n * n;
}

export function levelForXp(xp: number): number {
  let level = 1;
  while (xpToReach(level + 1) <= xp) level++;
  return level;
}

export function levelProgress(xp: number): { level: number; into: number; needed: number } {
  const level = levelForXp(xp);
  const base = xpToReach(level);
  return { level, into: xp - base, needed: xpToReach(level + 1) - base };
}

/**
 * XP for answering a question. Repeating the same variant family pays less each time
 * so that farming easy questions is not worth it (floor 25%).
 */
export function questionXp(base: number, timesSeenFamily: number, usedHint: boolean): number {
  const decay = Math.max(0.25, 1 - 0.25 * timesSeenFamily);
  const hintFactor = usedHint ? 0.5 : 1;
  return Math.round(base * decay * hintFactor);
}

/** Combat stat growth flattens after the soft cap. */
export function statsForLevel(level: number): { maxHp: number; atk: number } {
  const effective = level <= SOFT_CAP_LEVEL ? level : SOFT_CAP_LEVEL + Math.log2(1 + level - SOFT_CAP_LEVEL);
  return {
    maxHp: Math.round(BASE_STATS.maxHp + (effective - 1) * 6),
    atk: Math.round(BASE_STATS.atk + (effective - 1) * 1.5),
  };
}

export function equippedBonus(p: Pick<Progression, 'equipment' | 'inventory'>): { atk: number; def: number } {
  let atk = 0;
  let def = 0;
  for (const instanceId of Object.values(p.equipment)) {
    const inst = p.inventory.find((i) => i.instanceId === instanceId);
    const def_ = inst ? ITEMS[inst.itemId] : undefined;
    if (!def_) continue;
    atk += def_.atk ?? 0;
    def += def_.def ?? 0;
  }
  return { atk, def };
}

export function combatStats(p: Progression): { maxHp: number; atk: number; def: number } {
  const base = statsForLevel(p.level);
  const bonus = equippedBonus(p);
  return { maxHp: base.maxHp, atk: base.atk + bonus.atk, def: BASE_STATS.def + bonus.def };
}

export function newMastery(skill_id: string, subject: SubjectId): SkillMastery {
  return {
    skill_id, subject, attempts: 0, correct: 0, correctWithHint: 0,
    independentFamilies: [], missedFamilies: [], level: 'practising',
  };
}

/**
 * Mastery is separate from character XP:
 * practising → with_hint (got it right with a hint) → independent (right without a hint
 * in at least two different variant families).
 */
export function recordMastery(
  m: SkillMastery,
  result: { correct: boolean; usedHint: boolean; familyId: string },
): SkillMastery {
  const next: SkillMastery = {
    ...m,
    attempts: m.attempts + 1,
    independentFamilies: [...m.independentFamilies],
    missedFamilies: [...m.missedFamilies],
  };
  if (result.correct) {
    next.correct++;
    if (result.usedHint) next.correctWithHint++;
    else if (!next.independentFamilies.includes(result.familyId)) next.independentFamilies.push(result.familyId);
  } else if (!next.missedFamilies.includes(result.familyId)) {
    next.missedFamilies.push(result.familyId);
  }
  next.level = masteryLevel(next);
  return next;
}

export function masteryLevel(m: SkillMastery): MasteryLevel {
  if (m.independentFamilies.length >= 2) return 'independent';
  if (m.correct > 0) return 'with_hint';
  return 'practising';
}

export const MASTERY_LABEL: Record<MasteryLevel, string> = {
  practising: 'ฝึกอยู่',
  with_hint: 'ทำได้ด้วยคำใบ้',
  independent: 'ทำได้ด้วยตนเอง',
};
