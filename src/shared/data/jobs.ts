// Job (class) and job-skill data. Add advanced jobs by adding rows with `tier: 2` and a `parent`.
// Rules that use this data live in ../jobs.ts and ../combat.ts.
import type { JobId } from '../types';

export type ActiveSkillId = 'twin_slash' | 'bastion' | 'insight_bolt' | 'marked_shot';

export interface ActiveSkillDef {
  id: ActiveSkillId;
  job: JobId;
  name: string;
  /** keyboard shortcut in battle */
  key: string;
  /** focus points — only earned by answering correctly, never bought */
  cost: number;
  desc: string;
}

export interface PassiveDef {
  name: string;
  desc: string;
  atk?: number;
  def?: number;
  maxHp?: number;
  maxFocus?: number;
  /** damage multiplier when attacking an opened weak point (default 2) */
  weakMult?: number;
}

export interface JobDef {
  id: JobId;
  name: string;
  tier: 0 | 1 | 2;
  parent: JobId | null;
  role: string;
  desc: string;
  maxJobLevel: number;
  /** stat growth per job level above 1 (soft-capped in ../jobs.ts) */
  growth: { atk: number; def: number; maxHp: number };
  active: ActiveSkillId | null;
  passive: PassiveDef | null;
  /** given once, the first time a character takes this job */
  starterItem: string | null;
  icon: string;
}

export const JOBS: Record<JobId, JobDef> = {
  novice: {
    id: 'novice', name: 'นักผจญภัยฝึกหัด', tier: 0, parent: null, role: 'เริ่มต้น',
    desc: 'ใช้คำสั่งพื้นฐานได้ครบ จบบทนำแล้วเลือกอาชีพแรกกับอาจารย์ฮูก',
    maxJobLevel: 10, growth: { atk: 0.3, def: 0, maxHp: 1 },
    active: null, passive: null, starterItem: null, icon: 'badge',
  },
  swordsman: {
    id: 'swordsman', name: 'นักดาบ', tier: 1, parent: 'novice', role: 'โจมตีหนัก',
    desc: 'ทำความเสียหายสูงที่สุด เหมาะกับการปิดเกมเมื่อเปิดจุดอ่อนได้',
    maxJobLevel: 40, growth: { atk: 0.6, def: 0.1, maxHp: 2 },
    active: 'twin_slash',
    passive: { name: 'ฝึกดาบทุกเช้า', desc: 'ATK +3', atk: 3 },
    starterItem: 'training_blade', icon: 'sword',
  },
  guardian: {
    id: 'guardian', name: 'ผู้พิทักษ์', tier: 1, parent: 'novice', role: 'ป้องกัน/สะท้อน',
    desc: 'ทนทานที่สุด กันการโจมตีแล้วสะท้อนกลับ ในปาร์ตี้จะคอยปกป้องเพื่อน',
    maxJobLevel: 40, growth: { atk: 0.3, def: 0.25, maxHp: 4 },
    active: 'bastion',
    passive: { name: 'ร่างกายแข็งแรง', desc: 'DEF +2 · HP สูงสุด +15', def: 2, maxHp: 15 },
    starterItem: 'oak_mace', icon: 'shield',
  },
  mage: {
    id: 'mage', name: 'นักเวท', tier: 1, parent: 'novice', role: 'เวทตามความรู้',
    desc: 'ยิ่งตอบโจทย์ถูกในการต่อสู้มาก เวทยิ่งแรง และเก็บแต้มพลังได้มากกว่า',
    maxJobLevel: 40, growth: { atk: 0.45, def: 0.05, maxHp: 1.5 },
    active: 'insight_bolt',
    passive: { name: 'สมาธิลึก', desc: 'เก็บแต้มพลังได้สูงสุด +1', maxFocus: 1 },
    starterItem: 'apprentice_staff', icon: 'staff',
  },
  archer: {
    id: 'archer', name: 'นักธนู', tier: 1, parent: 'novice', role: 'เจาะจุดอ่อน',
    desc: 'ทำลายโล่และเปิดจุดอ่อนได้ดีกว่าใคร แล้วซ้ำด้วยการโจมตีที่แรงขึ้น',
    maxJobLevel: 40, growth: { atk: 0.5, def: 0.1, maxHp: 2 },
    active: 'marked_shot',
    passive: { name: 'สายตาเหยี่ยว', desc: 'โจมตีจุดอ่อนแรง ×2.5 (ปกติ ×2)', weakMult: 2.5 },
    starterItem: 'willow_bow', icon: 'bow',
  },
};

export const FIRST_JOBS: JobId[] = ['swordsman', 'guardian', 'mage', 'archer'];

export const ACTIVE_SKILLS: Record<ActiveSkillId, ActiveSkillDef> = {
  twin_slash: {
    id: 'twin_slash', job: 'swordsman', name: 'ฟันสองจังหวะ', key: 'T', cost: 1,
    desc: 'ใช้ 1 แต้มพลัง ฟันแรง ×1.7 · โล่ลดความแรงเหลือ 60% · โดนจุดอ่อนแรงขึ้นอีก',
  },
  bastion: {
    id: 'bastion', job: 'guardian', name: 'ปราการสะท้อน', key: 'T', cost: 1,
    desc: 'ใช้ 1 แต้มพลัง กันการโจมตีเทิร์นนี้ทั้งหมด และสะท้อนความแรง 60% กลับไปที่ศัตรู',
  },
  insight_bolt: {
    id: 'insight_bolt', job: 'mage', name: 'เวทแสงปัญญา', key: 'T', cost: 1,
    desc: 'ใช้ 1 แต้มพลัง เวททะลุโล่ แรงขึ้น 40% ต่อโจทย์ที่ตอบถูกในการต่อสู้นี้ (สูงสุด ×2.6)',
  },
  marked_shot: {
    id: 'marked_shot', job: 'archer', name: 'ยิงเล็งจุดอ่อน', key: 'T', cost: 1,
    desc: 'ใช้ 1 แต้มพลัง ทำลายโล่ เปิดจุดอ่อน และยิงแรงกว่าเจาะเกราะ (×0.8)',
  },
};
