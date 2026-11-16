// Pure job rules shared by the client and the (local) server.
import { ACTIVE_SKILLS, FIRST_JOBS, JOBS, type ActiveSkillId } from './data/jobs';
import { prologueComplete } from './story';
import type { ItemDef, JobId, JobProgress, Progression } from './types';

/** Job levels grow linearly up to here, then flatten (soft cap). */
export const JOB_SOFT_CAP = 30;

/** Cumulative job XP needed to reach `level` (level 1 = 0). */
export function jobXpToReach(level: number): number {
  if (level <= 1) return 0;
  const n = level - 1;
  return 25 * n + 6 * n * n;
}

export function jobLevelForXp(job: JobId, xp: number): number {
  const max = JOBS[job].maxJobLevel;
  let level = 1;
  while (level < max && jobXpToReach(level + 1) <= xp) level++;
  return level;
}

export function jobProgress(p: Pick<Progression, 'job' | 'jobs'>): JobProgress {
  return p.jobs[p.job] ?? { level: 1, xp: 0 };
}

export function jobLevelBar(p: Pick<Progression, 'job' | 'jobs'>): { level: number; into: number; needed: number; max: boolean } {
  const { level, xp } = jobProgress(p);
  const max = level >= JOBS[p.job].maxJobLevel;
  const base = jobXpToReach(level);
  return { level, into: xp - base, needed: max ? 0 : jobXpToReach(level + 1) - base, max };
}

/** Add job XP to the current job; returns the new progress (does not mutate). */
export function addJobXp(job: JobId, current: JobProgress, xp: number): JobProgress {
  const total = current.xp + Math.max(0, xp);
  return { xp: total, level: jobLevelForXp(job, total) };
}

export interface JobCombatBonus {
  atk: number;
  def: number;
  maxHp: number;
  maxFocus: number;
  weakMult: number;
  skills: ActiveSkillId[];
}

/** Passive + job-level bonuses. Never touches questions, hints or mastery. */
export function jobBonus(p: Pick<Progression, 'job' | 'jobs'>): JobCombatBonus {
  const def = JOBS[p.job];
  const lv = jobProgress(p).level;
  const eff = lv <= JOB_SOFT_CAP ? lv - 1 : JOB_SOFT_CAP - 1 + Math.log2(1 + lv - JOB_SOFT_CAP);
  const pas = def.passive ?? { name: '', desc: '' };
  return {
    atk: Math.floor(def.growth.atk * eff) + (pas.atk ?? 0),
    def: Math.floor(def.growth.def * eff) + (pas.def ?? 0),
    maxHp: Math.floor(def.growth.maxHp * eff) + (pas.maxHp ?? 0),
    maxFocus: pas.maxFocus ?? 0,
    weakMult: pas.weakMult ?? 2,
    skills: def.active ? [def.active] : [],
  };
}

export type JobChangeCheck = { ok: true } | { ok: false; reason: string };

export function canChangeJob(p: Pick<Progression, 'job' | 'story' | 'activeRunId'>, target: JobId): JobChangeCheck {
  if (!FIRST_JOBS.includes(target)) return { ok: false, reason: 'เลือกได้เฉพาะอาชีพแรกทั้งสี่ในรุ่นนี้' };
  if (p.job === target) return { ok: false, reason: 'เป็นอาชีพนี้อยู่แล้ว' };
  if (!prologueComplete(p.story)) return { ok: false, reason: 'เปลี่ยนอาชีพได้หลังจบบทนำ' };
  if (p.activeRunId) return { ok: false, reason: 'เปลี่ยนอาชีพระหว่างต่อสู้ไม่ได้' };
  return { ok: true };
}

export function canEquipFor(item: ItemDef, job: JobId): boolean {
  return item.kind === 'equipment' && !!item.slot && (!item.jobs || item.jobs.includes(job));
}

export function skillsFor(job: JobId) {
  const a = JOBS[job].active;
  return a ? [ACTIVE_SKILLS[a]] : [];
}
