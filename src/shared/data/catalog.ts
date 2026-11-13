import type { ItemDef, SubjectId, SubjectInfo } from '../types';

export const SUBJECTS: Record<SubjectId, SubjectInfo> = {
  thai: { id: 'thai', nameTh: 'ภาษาไทย', roomName: 'หออักษร', color: '#3fb950', icon: 'book' },
  english: { id: 'english', nameTh: 'ภาษาอังกฤษ', roomName: 'ท่าเรือจดหมาย', color: '#a371f7', icon: 'letter' },
  math: { id: 'math', nameTh: 'คณิตศาสตร์', roomName: 'โรงกลจักร', color: '#3b82f6', icon: 'gear' },
  science: { id: 'science', nameTh: 'วิทยาศาสตร์', roomName: 'เรือนกระจกทดลอง', color: '#f0883e', icon: 'flask' },
};

export const SUBJECT_ORDER: SubjectId[] = ['thai', 'english', 'math', 'science'];

export const ITEMS: Record<string, ItemDef> = {
  wooden_sword: {
    id: 'wooden_sword', name: 'ดาบไม้ฝึกหัด', kind: 'equipment', slot: 'weapon', atk: 0,
    description: 'ดาบไม้ของนักเรียนใหม่ เบาและปลอดภัย', icon: 'sword',
  },
  apprentice_robe: {
    id: 'apprentice_robe', name: 'เสื้อคลุมนักเรียน', kind: 'equipment', slot: 'armor', def: 1,
    description: 'เสื้อคลุมประจำสถาบัน ปักตราสี่วิชา', icon: 'robe',
  },
  copper_gear_wrench: {
    id: 'copper_gear_wrench', name: 'ประแจเฟืองทองแดง', kind: 'equipment', slot: 'weapon', atk: 3,
    description: 'ได้จากผู้พิทักษ์เฟือง ทำให้การโจมตีแรงขึ้นเล็กน้อย', icon: 'wrench',
  },
  wind_boots: {
    id: 'wind_boots', name: 'รองเท้าสายลม', kind: 'equipment', slot: 'shoes', def: 1,
    description: 'รองเท้าเบาที่ได้จากหมอกลืมเลือนตัวแรก', icon: 'boots',
  },
  focus_potion: {
    id: 'focus_potion', name: 'ยาฟื้นพลัง', kind: 'consumable', heal: 25,
    description: 'ฟื้น HP 25 หน่วย ใช้ระหว่างต่อสู้ได้', icon: 'potion',
  },
  badge_gear_awakener: {
    id: 'badge_gear_awakener', name: 'ตรา: ผู้ปลุกเฟือง', kind: 'badge',
    description: 'มอบให้ผู้ที่เปิดประตูโรงกลจักรได้สำเร็จ', icon: 'badge',
  },
};

export const BASE_STATS = { maxHp: 60, atk: 12, def: 0, maxFocus: 3 } as const;
