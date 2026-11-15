# ADR 0001 — ฐานสำหรับพัฒนาหอคอยสี่วิชาเป็น MMORPG (M0)

- **สถานะ:** เสนอ (รอเจ้าของโปรเจกต์ยืนยันข้อที่ระบุว่า "ต้องตัดสินใจ")
- **วันที่:** 15 พฤศจิกายน 2569
- **ขอบเขต:** M0 เท่านั้น — ตรวจฐานเกม กำหนดสัญญาข้อมูล ลำดับ migration ความเสี่ยง และเกณฑ์ทดสอบ M1–M4 ไม่มีการสร้างระบบใหม่ในรอบนี้
- **หมายเหตุ routing:** รอบนี้ทำใน session เดียวบน Opus 5.5 จึงไม่ได้เปิด subagent Opus/medium แยก ข้อตัดสินใจด้านสถาปัตยกรรมด้านล่างไม่ได้ผ่านการตรวจจากโมเดลอื่น

> **ข้อเท็จจริงสำคัญ:** เกมตอนนี้เป็นต้นแบบเล่นคนเดียวแบบ local ยังไม่ใช่ MMO ไม่มีเซิร์ฟเวอร์ ไม่มีบัญชี และยังไม่มีผู้เล่นคนอื่นในโลก

## 1. สถานะจริงของโค้ด (ตรวจ 15 พ.ย. 2569)

| ส่วน | ไฟล์ | ใช้ซ้ำได้ | ช่องว่างสำหรับหลายผู้เล่น |
|---|---|---|---|
| สัญญา API | `src/api/types.ts` (`GameApi` 15 เมธอด, `requestId` ทุกคำสั่งเขียน) | ✅ รูปแบบ request id / RunView / ไม่ส่งเฉลยก่อนตอบ | ผูกกับ "ผู้เล่นเดียว = progression เดียว" ไม่มี account/character/zone/party |
| เซิร์ฟเวอร์จำลอง | `src/api/localGameApi.ts` (เซฟ `onet-rpg-save-v1` ใน localStorage, `once()` เก็บผลตาม requestId) | ✅ ตรรกะเกรดคำตอบ/รางวัล/เทิร์นย้ายไป Edge Function ได้เกือบตรง | เฉลยอยู่ใน bundle, ตาราง `requests` โตไม่จำกัด, ไม่มี save migration (version≠1 → เริ่มใหม่ ทำให้เซฟหาย) |
| เลือก implementation | `src/api/index.ts` `getApi()` | ✅ จุดเดียวสำหรับสลับเป็น `SupabaseGameApi` | ยังไม่มี config เลือกโหมด online/offline |
| กฎร่วม | `src/shared/combat.ts`, `progression.ts`, `questionSelector.ts`, `story.ts` | ✅ เป็นฟังก์ชันบริสุทธิ์ ใช้ใน Deno Edge Function ได้ | `PlayerAction` เป็น union ตายตัว 5 คำสั่ง ไม่มีสกิลอาชีพ; combat 1 ผู้เล่น vs 1 ศัตรู |
| ข้อมูลเกม | `src/shared/data/catalog.ts` (ITEMS, `BASE_STATS`), `questions.ts` (24 ข้อ สถานะ `review`) | ✅ | ไม่มีตารางอาชีพ/สกิล; `questions.ts` (มีเฉลย) ถูก import จาก client |
| ชนิดข้อมูล | `src/shared/types.ts` | ✅ `SkillMastery`, `ReviewStatus`, `PublicQuestion` | `Appearance = 'swordsman' \| 'mage'` ปนกับอาชีพ; ไม่มี `Character`, `JobId`, `jobLevel` |
| Store | `src/state/store.ts` (zustand) | ✅ | ไม่มี state ของผู้เล่นอื่น/โซน/ปาร์ตี้/การเชื่อมต่อ |
| Phaser | `src/game/scenes/HubScene.ts` (Tiled 23×23, A*, depth ตามเท้า), `BattleScene.ts`, `eventBus.ts` | ✅ แผนที่/การเดิน/event bus แบบมี type | มี sprite ผู้เล่นคนเดียว; skin เลือกจาก `appearance` ตรง ๆ |
| UI | `src/ui/screens.tsx`, `App.tsx`, `battle/BattleUI.tsx`, `panels/Panels.tsx` | ✅ responsive, ปุ่ม ≥44px, safe area | หน้าสร้างตัวละครมีแค่ชื่อ+2 รูปลักษณ์; ไม่มีช่องตัวละคร/หน้าสกิลอาชีพ |
| Schema | `supabase/migrations/0001_init.sql` (ยังไม่ deploy) | ✅ RLS อ่านอย่างเดียว, `question_versions` ไม่มี policy นักเรียน, `teaches()`, unique request_id | ดูข้อ 4 |
| Tests | `tests/unit/*.test.ts` (29 tests), `tests/e2e/journey.spec.ts` (5 viewport), CI `.github/workflows/ci.yml` | ✅ | ไม่มี test เซฟเก่า, ไม่มี integration test กับ DB, ไม่มี e2e หลายบัญชี |

## 2. การตัดสินใจ

### D1 — แหล่งความจริงและความเป็นเจ้าของข้อมูล

| ข้อมูล | ประเภท | เจ้าของ (เมื่อออนไลน์) | client ส่งอะไรได้ |
|---|---|---|---|
| บัญชี, บทบาท นักเรียน/ครู | ถาวร | Supabase Auth + `profiles` | ไม่มี (บทบาทตั้งโดยครู/แอดมิน) |
| ตัวละคร: ชื่อเล่น รูปลักษณ์ อาชีพ Adventure/Job Level XP HP เควสต์ | ถาวร | Postgres ผ่าน Edge Function | **คำสั่ง** (สร้าง, เปลี่ยนอาชีพ, รับเควสต์) ไม่ใช่ค่า |
| ไอเทม, อุปกรณ์ | ถาวร | Edge Function | คำสั่ง equip/unequip ด้วย instance id |
| **Subject Mastery, ประวัติ family ที่เห็น** | ถาวร | **ต่อบัญชี** ไม่ใช่ต่อตัวละคร | ไม่มี (ได้จากการเกรดคำตอบบน server เท่านั้น) |
| run การต่อสู้, เทิร์น, คำถามที่ปักไว้ | ถาวรระยะสั้น | Edge Function + `runs` | คำตอบ (optionId) และคำสั่ง (action/skill) พร้อม turn + requestId |
| ตำแหน่งในโซน, ทิศ, ออนไลน์/ไม่ออนไลน์ | ชั่วคราว | Realtime Presence/Broadcast | ส่งได้เอง (ไม่มีรางวัลผูกกับตำแหน่ง) |
| `lastPosition` | ถาวรแบบสะดวก | บันทึกเป็นระยะ ไม่ใช้คิดรางวัล | ส่งได้ |

เหตุผล mastery ต่อบัญชี: Subject Mastery วัดความรู้ของเด็ก ถ้าเก็บต่อตัวละคร การสร้างตัวใหม่จะรีเซ็ตผลวัดและทำให้ฟาร์ม XP จากโจทย์เดิมได้ (`seenFamilies` ลด XP) ข้ามตัวละคร

### D2 — แบ็กเอนด์: Supabase (Auth + Postgres + Edge Functions + Realtime)

- ใช้ตามร่างเดิม เพราะ schema/RLS ร่างไว้แล้ว และกฎใน `src/shared` เป็น TypeScript บริสุทธิ์ที่รันใน Deno ได้
- คำสั่งเขียนทั้งหมดผ่าน Edge Function (service role) ซึ่งเรียก Postgres function ภายในธุรกรรมเดียว; client มีสิทธิ์ `select` ข้อมูลของตัวเองผ่าน RLS เท่านั้น ไม่มี policy `insert/update/delete` สำหรับนักเรียน
- Realtime ใช้สำหรับตำแหน่ง/presence (M3) และ "แจ้งว่า state เปลี่ยน ให้ดึงใหม่" ในดันเจียน (M4) — **ห้ามส่งคำถาม/คำตอบผ่าน broadcast**
- ทางเลือกที่ไม่เลือกตอนนี้: เกมเซิร์ฟเวอร์เฉพาะ (Node/Colyseus บน VPS) ควบคุมการเคลื่อนที่ได้ดีกว่าและค่าข้อความต่ำกว่า แต่ต้องดูแลระบบเอง **ทบทวนใหม่**ถ้า M3 วัดแล้ว traffic เกินโควตา Realtime หรือถ้าต้องการการต่อสู้ real-time ที่ server ควบคุมการเคลื่อนที่
- `LocalGameApi` คงไว้เป็นโหมด offline/dev และใช้ใน unit test ต้องมีป้าย "โหมดออฟไลน์" ในเกม และห้ามเรียกว่าออนไลน์

### D3 — โครงสร้างข้อมูลหลัก (TypeScript ฝั่ง shared)

```ts
type JobId = 'novice' | 'swordsman' | 'guardian' | 'mage' | 'archer'; // ขยายสายขั้นสูงได้จากข้อมูล
type Look = { body: 'a' | 'b'; hair: number; palette: number };        // รูปลักษณ์แยกจากอาชีพ

interface JobDef {           // src/shared/data/jobs.ts
  id: JobId; tier: 0 | 1 | 2; parent: JobId | null;
  unlock: { prologueDone?: boolean; jobLevel?: number; adventureLevel?: number };
  statGrowth: { hp: number; atk: number; def: number; focus: number }; // ต่อ job level, soft cap ใน progression.ts
  skills: string[]; allowedWeaponTags: string[];
}
interface SkillDef {         // src/shared/data/skills.ts
  id: string; job: JobId; kind: 'active' | 'passive'; focusCost: number;
  effect: SkillEffect;       // data-driven: damage mult, pierce, shield, heal, taunt(ปาร์ตี้)…
  requiresCorrectAnswer: boolean; // สกิลแรงต้องใช้ Focus จากการตอบถูก ไม่ใช่ซื้อได้
}
interface Character {
  id: string; slot: 1 | 2 | 3; nickname: string; look: Look;
  job: JobId; jobLevel: number; jobXp: number;
  level: number; xp: number;          // Adventure Level เดิม
  hp: number; inventory: ItemInstance[]; equipment: Partial<Record<EquipSlot, string>>;
  learnedSkills: string[]; story: StoryProgress; codex: string[];
  activeRunId: string | null; lastPosition: { zone: string; tx: number; ty: number } | null;
}
interface AccountProgress {   // ต่อบัญชี
  mastery: Record<string, SkillMastery>; seenFamilies: Record<string, number>;
}
type ZoneId = `hub` | `field:${SubjectId}:${number}` | `dungeon:${string}`;
interface Party { id: string; leaderId: string; memberIds: string[] /* 2–4 */; dungeonRunId: string | null }
```

- `PlayerAction` เปลี่ยนเป็น `{ kind: 'basic', action: 'attack'|'defend'|'pierce'|'shield'|'potion' } | { kind: 'skill', skillId }` และรับรูปแบบ string เดิมระหว่างย้าย
- `ItemDef` เพิ่ม `jobs?: JobId[]` และ `weaponTag?` เพื่อจำกัดอุปกรณ์ตามอาชีพ อุปกรณ์เพิ่มเฉพาะพลังต่อสู้ ไม่แตะ mastery/จำนวนคำใบ้/การข้ามโจทย์
- Job Level ได้ XP จากการต่อสู้ (ชนะ/ใช้สกิลถูกบทบาท) แยกจาก Adventure XP; ทั้งสองแยกจาก mastery ตามกฎเดิม
- การเปลี่ยนอาชีพครั้งแรก: หลังจบบทนำ (`prologueComplete`) — เงื่อนไขอยู่ใน `JobDef.unlock` ปรับได้

### D4 — สัญญา `GameApi` ที่ต้องเปลี่ยน

| รอบ | เพิ่ม/เปลี่ยน |
|---|---|
| M1 | `listCharacters()`, `createCharacter(slot, nickname, look, requestId)`, `selectCharacter(id)`, `validateNickname(name)`, `changeJob(jobId, requestId)`; `getProgression()` คืนตัวละครที่เลือก + `AccountProgress`; `action()` รับ action รูปแบบใหม่ |
| M2 | `SupabaseGameApi implements GameApi`; `signIn/signOut/session`; ทุกคำสั่งเขียนส่ง `requestId` แบบ UUID เท่านั้น (เลิก fallback ที่ไม่ใช่ UUID ใน `requestId()`); `getRun` ใช้กู้สถานะหลัง reconnect |
| M3 | แยก `WorldClient` (ไม่ใช่ `GameApi`): `joinZone(zoneId) → shardId`, `leaveZone()`, `sendMove(tx, ty, dir)`, `onPeers(cb)` |
| M4 | `createParty`, `invite(characterId)`, `respondInvite`, `leaveParty`, `startDungeon(dungeonId, requestId)`, `lockAnswer(runId, turnId, optionId, requestId)`, `teamCommand(runId, command)` (คำสั่งช่วยทีมสำเร็จรูป ไม่เปิดเฉลย) |

### D5 — การ migrate เซฟ (ห้ามทำเซฟผู้เล่นเดิมหาย)

1. **v1 → v2 (M1, local):** อ่าน `onet-rpg-save-v1` ถ้าไม่มี `onet-rpg-save-v2` แปลงเป็น `{ version: 2, account: { mastery, seenFamilies }, characters: [ตัวเดิมที่ slot 1], selected, runs, requests }` โดย: `level/xp` → Adventure เดิม, `job='novice'`, `jobLevel=1`, `appearance` เดิม → `look` ที่ใกล้เคียง (อาชีพไม่ได้มาจาก appearance), story/inventory/equipment/codex/activeRunId คงเดิม (run ที่ค้างยังเล่นต่อได้) **ไม่ลบคีย์ v1** เพื่อ rollback; ตัดตาราง `requests` เก่ากว่า N รายการ
2. **ตัวแปลงเป็นฟังก์ชันบริสุทธิ์** `migrateSave(raw): SaveV2` ใน `src/api/saveMigrations.ts` มี fixture เซฟ v1 จริงใน `tests/unit/fixtures/`
3. **local → online (M2):** หลังล็อกอินครั้งแรก เสนอ "นำความคืบหน้าจากเครื่องนี้ขึ้นบัญชี" หนึ่งครั้ง Edge Function `import-local-save` ตรวจรูปแบบและ**จำกัดค่า** (level ≤ ที่บทนำให้ได้, ไอเทมเฉพาะที่มีใน catalog และได้จากเควสต์ที่ทำแล้ว) เพราะ client แก้ localStorage ได้ — mastery จาก local นำเข้าเป็น "ข้อมูลอ้างอิง" ไม่นับเป็นผลวัดของครู
4. **Postgres:** migration แบบเลขลำดับใน `supabase/migrations/`, ห้ามแก้ไฟล์ที่ deploy แล้ว

### D6 — ปัญหาของ schema ร่าง `0001_init.sql` ที่ต้องแก้ใน M2 (ยังไม่ deploy จึงแก้ไฟล์เดิมได้)

- `profiles.appearance` ย้ายไปตาราง `characters (id, user_id, slot unique per user, nickname, look jsonb, job, job_level, job_xp, level, xp, hp, story jsonb, last_position jsonb, version int)`; เพิ่ม `character_items`, `character_equipment`, `character_skills`
- `runs.player_id` → `character_id` + `user_id` (ใช้ใน RLS); `mastery` คงต่อ `user_id` ตาม D1
- เพิ่ม `request_log (user_id, request_id uuid, endpoint, response jsonb, created_at, primary key (user_id, request_id))` เป็นกลไก idempotency กลาง แทนการพึ่ง unique ในแต่ละตาราง
- `reward_events unique (player_id, source)` ต้องให้ `source` รวมรอบเวลา/run id สำหรับเควสต์รายวันใน M5 (เช่น `daily:<quest>:<yyyy-mm-dd>`)
- `profiles.nickname` เป็นข้อมูลที่ผู้เล่นอื่นจะเห็นใน M3 → ต้องผ่านการตรวจชื่อฝั่ง server
- `question_versions`: Edge Function เลือกเฉพาะ `review_status in ('approved','published')` ใน production; สถานะ `review` ใช้ได้เฉพาะ environment dev ที่ตั้ง flag ชัดเจน
- เพิ่ม `parties`, `party_members`, `dungeon_runs (…, version int)`, `dungeon_turn_answers (run_id, turn, character_id, option_id, locked_at)` ใน M4

### D7 — เป้าหมายผู้เล่นพร้อมกันและข้อสมมติต้นทุน

| ค่า | เป้าหมายรอบนำร่อง (โรงเรียนเดียว) |
|---|---|
| ผู้เล่นออนไลน์พร้อมกันทั้งระบบ | ≤ 200 |
| ผู้เล่นที่มองเห็นกันต่อ hub shard | ≤ 30 (เกินแล้วเปิด shard ใหม่ `hub:2`, `hub:3`; เพื่อนในปาร์ตี้ไป shard เดียวกัน) |
| ปาร์ตี้/ดันเจียน | 2–4 คนต่อ instance |
| ส่งตำแหน่ง | เฉพาะเมื่อเคลื่อนที่ ≤ 4 ครั้ง/วินาที (คลิกเดินส่งปลายทางครั้งเดียว), idle ไม่ส่ง, presence heartbeat ตามค่าเริ่มต้นของ Realtime |
| รับข้อมูลต่อ client | เป้าหมาย ≤ 5 KB/s ที่ 30 คนใน shard |
| เฟรมเรต | ≥ 50 FPS คอม, ≥ 30 FPS มือถือระดับกลาง (Canvas fallback) ขณะมีผู้เล่นอื่น 30 คน |
| ตัดผู้เล่น idle/หลุด | ไม่มีความเคลื่อนไหว 5 นาที → ออกจาก presence; หลุดในดันเจียน → รอ 60 วินาทีแล้วเทิร์นของคนนั้น = ป้องกันอัตโนมัติ |

**ข้อสมมติต้นทุน (ต้องตรวจราคาปัจจุบันก่อนตัดสินใจ):** dev ใช้แผนฟรีของ Supabase; นำร่องใช้แผนเสียเงินระดับเริ่มต้นเพราะแผนฟรีจำกัดจำนวนการเชื่อมต่อ Realtime พร้อมกันและข้อความต่อเดือน และ project หยุดเมื่อไม่ใช้งาน หน้าเว็บยังเป็น static บน Netlify/GitHub Pages M3 ต้องวัดจำนวนข้อความจริงต่อผู้เล่นต่อชั่วโมงแล้วคำนวณเทียบโควตา

## 3. ลำดับงานและ migration

1. **M1 (local):** ข้อมูลอาชีพ/สกิล → `migrateSave` v1→v2 + tests → ขยาย `GameApi` ใน `LocalGameApi` → หน้าเลือก/สร้างตัวละคร → skill UI ในการต่อสู้ → job change หลังบทนำ
2. **M2:** แก้ `0001_init.sql` ตาม D6 → Postgres functions + RLS → Edge Functions ย้ายตรรกะจาก `LocalGameApi` → `SupabaseGameApi` → แยก `questions.ts` ออกจาก bundle online (import เฉพาะโหมด local ผ่าน dynamic import) → import-local-save → integration tests กับ Supabase local (`supabase start`)
3. **M3:** `WorldClient` + Realtime channel ต่อ shard → avatar ผู้เล่นอื่นใน `HubScene` (interpolation) → join/leave/idle cleanup → วัด traffic/FPS
4. **M4:** ตารางปาร์ตี้/ดันเจียน → ฟังก์ชันแก้เทิร์นแบบ `select … for update` + `version` → UI ปาร์ตี้/คำสั่งช่วยทีม → reconnect → e2e หลายบัญชี

## 4. ความเสี่ยง

| ความเสี่ยง | ผลกระทบ | การลด |
|---|---|---|
| เฉลยอยู่ใน JS bundle (`questions.ts` ถูก import ฝั่ง client) | โกงคำตอบ, ผลวัดเชื่อไม่ได้ | M2 ย้ายไป server และมี test ตรวจว่า bundle online ไม่มี `answer_key` |
| เซฟเดิมหายเมื่อ version เปลี่ยน (`load()` เริ่มใหม่ถ้า version≠1) | ผู้เล่นเดิมเสียความคืบหน้า | D5 ข้อ 1–2, ไม่ลบคีย์ v1 |
| ข้อมูล localStorage ปลอมได้ตอนนำเข้า | ได้เลเวล/ไอเทมโดยไม่เล่น | จำกัดค่าใน `import-local-save` |
| ชื่อเล่นอิสระที่ผู้อื่นเห็น (M3) | ความปลอดภัยของเด็ก | ตรวจชื่อฝั่ง server + รายการคำต้องห้าม + ครูซ่อนชื่อได้; **ต้องตัดสินใจ:** ใช้ชื่อเล่นอิสระหรือชื่อแบบเลือกคำสำเร็จรูปสำหรับแสดงในโลกออนไลน์ |
| race condition รางวัลดันเจียน/คำตอบพร้อมกัน | รางวัลซ้ำ | ธุรกรรมเดียว + `request_log` + unique ต่อ (run, character) + Opus/high review ก่อนปิด M2/M4 |
| โควตา Realtime | ค่าใช้จ่าย/หลุด | D7, วัดใน M3, ทางเลือกเซิร์ฟเวอร์เฉพาะ |
| โจทย์ 24 ข้อยังสถานะ `review` | ใช้ production ไม่ได้ | ต้องได้ครูอนุมัติ; online production ปฏิเสธโจทย์ที่ไม่ใช่ approved/published |
| สมดุล 4 อาชีพในการต่อสู้ 1 vs 1 ที่มีอยู่ | อาชีพบางสายไม่มีบทบาท (ผู้พิทักษ์ในงานเดี่ยว) | สกิลผู้พิทักษ์มีผลทั้งเดี่ยว (ลดดาเมจ/สะท้อน) และปาร์ตี้ (taunt) |

## 5. เกณฑ์ทดสอบ M1–M4

| Milestone | Unit / integration | E2E / ทดสอบมือ |
|---|---|---|
| M1 | `migrateSave` กับ fixture v1 (มี run ค้างกลางการต่อสู้); ตรวจชื่อ (ความยาว, อักษรไทย/อังกฤษ/ตัวเลข, คำต้องห้าม); `changeJob` ซ้ำด้วย requestId เดิมไม่ซ้ำผล; สกิลแต่ละอาชีพให้ `CombatEvent` ต่างกัน; อุปกรณ์ผิดอาชีพสวมไม่ได้; soft cap | สร้างตัวใหม่ → เล่นบทนำจบ → เปลี่ยนอาชีพทั้ง 4 (4 ช่อง/รีเซ็ต) และเห็นผลสกิลต่างกัน; เปิดด้วยเซฟ v1 → ตัวละครเดิมอยู่ครบ; Refresh กลางการต่อสู้; viewport 5 ขนาดเดิม |
| M2 | integration กับ Supabase local: ผู้ใช้ B `select` ข้อมูล A ไม่ได้, นักเรียน `select question_versions` ไม่ได้, `insert/update` ตรงไม่ได้; ส่ง answer/complete ซ้ำและพร้อมกัน 10 ครั้ง → XP/ไอเทมเพิ่มครั้งเดียว; turn ผิดถูกปฏิเสธ; bundle online ไม่มี `answer_key` | บัญชีเดียวสองเบราว์เซอร์เห็นตัวละครเดียวกัน; ตัดเน็ตกลางการต่อสู้แล้วกลับมาที่เทิร์นเดิม |
| M3 | rate limit ฝั่ง client, interpolation, การเลือก shard เมื่อเต็ม | สองบัญชีสองเบราว์เซอร์เห็นกันเดินใน hub; ปิดแท็บ → หายจาก presence ภายในเวลาที่กำหนด; กลับเข้าได้; วัด FPS/KB/s ตามตาราง D7 (ใช้ผู้เล่นจริงหรือบัญชีทดสอบจริง ไม่ใช่ bot ในเครื่อง แล้วเรียกว่า multiplayer) |
| M4 | 2–4 คนล็อกคำตอบพร้อมกัน; คนหนึ่งดึง state ก่อนล็อก → ไม่เห็นคำตอบเพื่อน; สรุปรางวัลพร้อมกัน → ครั้งเดียวต่อคน; หัวหน้าออก → ส่งต่อหัวหน้า | e2e หลายบัญชีใน Playwright (หลาย context) เข้าดันเจียนเดียว จบ/แพ้/หลุด แล้วสถานะทุกคนถูกต้อง |

## 6. ผลกระทบจาก visual package (`docs/visual/`, M0 ภาพ)

- **M1 ตัวละคร:** คงสัญญา sprite 48×64, 4 ทิศ × 10 เฟรม, origin (.5,.94) ตาม `docs/visual/art-direction.md` — ไม่มี asset ใหม่ จึงให้ `Look` ใน M1 เลือกจาก sheet ที่มีอยู่ (`player_swordsman`, `player_mage`) + palette tint ผ่าน Phaser ก่อน และให้แต่ละอาชีพมี "สัญลักษณ์อาชีพ" เป็น icon/ป้าย React จนกว่าจะมี sprite อาชีพ ห้ามเปลี่ยนขนาดเฟรม/anchor โดยไม่ประสาน visual
- **ชื่อ sheet ผูกกับอาชีพ:** `player_swordsman`/`player_mage` เป็นชื่อเชิงอาชีพแต่จะใช้เป็น "รูปลักษณ์" — คง `asset_id` เดิมไว้ (โค้ดอ้างอิงอยู่) และ map `look.body` → asset_id ในข้อมูล
- **M1 หน้าสร้างตัวละคร:** ต้องยืนยันพื้นที่ UI กับ visual ก่อนทำจริง (ตาม `handoff-to-claude.md` §3); แผนเริ่มต้นใช้ layout responsive เดิมของ `screens.tsx`
- **M3 avatar ผู้เล่นอื่น:** ใช้ sprite/anim เดิม, depth ตาม world Y เหมือนผู้เล่นหลัก; ป้ายชื่อเป็น Phaser text ขนาดเล็กหรือ React overlay — ต้องทดสอบบน 360×800 ไม่ให้ป้ายบังจุดโต้ตอบ
- **บั๊กสัญญาที่พบโดย visual audit:** metadata `hub` ใน `public/assets/manifest.json` ระบุ 22×22 แต่แผนที่จริง 23×23 และชื่อ object ใน `occluders` ซ้ำ 4 ชื่อ — M3 จะอ้าง zone/object ด้วย id จึงต้องแก้ที่ generator (`tools/assets/generate-placeholders.ts`, `tools/maps/generate-hub.ts`) และผลลัพธ์พร้อมกัน; กำหนดทำต้น M1 เป็นงานเล็ก ไม่แก้ gameplay

> **อัปเดต M1 (15 พ.ย. 2569):** ทำแล้วบน branch `m1-characters-jobs` — รูปลักษณ์เป็น `{gender}` — เพศเลือก sprite (`player_swordsman` ชาย คง asset_id เดิม, `player_female_basic` หญิง) และทุกคนเริ่มด้วยชุดพื้นฐานเดียวกัน ไม่มีตัวเลือกชุด, แก้ hub 23×23 และชื่อ occluder ซ้ำแล้ว รายละเอียด: `docs/changes/M1-characters-jobs.md`

## 7. ผลตรวจฐาน (รันจริง 15 พ.ย. 2569 บนสำเนาที่ตรงกับ `origin/main` `6d33aa2`)

`npm run lint` ✅ · `npm run typecheck` ✅ · `npm run test` ✅ 29/29 · `npm run build` ✅ · `npm run validate:maps` ✅ · `npm run test:e2e` ยังไม่รัน (ยังไม่ได้ติดตั้ง Playwright Chromium; M0 ไม่แก้โค้ด) · ยืนยันแล้วว่า `answer_key` อยู่ใน `dist/assets/index-*.js`

## 8. ต้องการจากเจ้าของโปรเจกต์

1. ยืนยันใช้ Supabase (D2) และสร้าง project สำหรับ dev — ต้องใช้ใน M2 เท่านั้น M1 ทำได้เลย
2. ตัดสินใจเรื่องชื่อเล่นที่แสดงในโลกออนไลน์ (ข้อความในความเสี่ยง)
3. เงื่อนไขเปลี่ยนอาชีพครั้งแรก: ค่าเสนอคือ "หลังจบบทนำ"
4. ครูผู้ตรวจโจทย์ก่อนเปิด production
