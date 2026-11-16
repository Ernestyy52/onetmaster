// Nickname rules — the same check runs in the UI (instant feedback) and in the API (enforced).
// Nicknames will be visible to other players from M3, so the blocklist must be reviewed by staff
// before going online; this list only covers impersonation and a few obvious words.

export const NICKNAME_MIN = 2;
export const NICKNAME_MAX = 12;

const ALLOWED = /^[฀-๿A-Za-z0-9 _-]+$/;
const BLOCKED = ['admin', 'แอดมิน', 'ผู้ดูแล', 'ครู', 'teacher', 'moderator', 'system', 'ระบบ', 'fuck', 'shit', 'เหี้ย', 'ควย', 'สัส'];

export type NicknameCheck = { ok: true; value: string } | { ok: false; reason: string };

export function normalizeNickname(raw: string): string {
  return raw.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function validateNickname(raw: string, taken: string[] = []): NicknameCheck {
  const value = normalizeNickname(raw);
  const len = [...value].length;
  if (len < NICKNAME_MIN) return { ok: false, reason: `ชื่อเล่นต้องยาวอย่างน้อย ${NICKNAME_MIN} ตัวอักษร` };
  if (len > NICKNAME_MAX) return { ok: false, reason: `ชื่อเล่นยาวได้ไม่เกิน ${NICKNAME_MAX} ตัวอักษร` };
  if (!ALLOWED.test(value)) return { ok: false, reason: 'ใช้ได้เฉพาะอักษรไทย อังกฤษ ตัวเลข เว้นวรรค _ และ -' };
  const lower = value.toLowerCase().replace(/[\s_-]/g, '');
  if (BLOCKED.some((w) => lower.includes(w))) return { ok: false, reason: 'ชื่อนี้ใช้ไม่ได้ ลองชื่ออื่นนะ' };
  if (taken.some((t) => normalizeNickname(t).toLowerCase() === value.toLowerCase()))
    return { ok: false, reason: 'มีตัวละครชื่อนี้ในเครื่องนี้แล้ว' };
  return { ok: true, value };
}
