# Lorebound: Tower of Four · หอคอยสี่วิชา · O-NET ป.6 RPG (ต้นแบบ)

เกม RPG Pixel Art แบบ 2D Isometric บนเว็บ สำหรับฝึกความรู้ O-NET ป.6 สี่วิชา เล่นได้ทั้งคอมพิวเตอร์และมือถือจากลิงก์เดียว
รายละเอียดการออกแบบทั้งหมดอยู่ใน [`handoff.md`](handoff.md) — repo นี้คือ **ระยะ “ต้นแบบเล่นจริง”** (handoff §8 แถวแรก) · แผนพัฒนาเป็น MMORPG: [`docs/adr/0001-mmorpg-foundation.md`](docs/adr/0001-mmorpg-foundation.md) — ปัจจุบันยังเล่นคนเดียวแบบออฟไลน์

**เทคโนโลยี** Phaser 3.90 + TypeScript + React 18 + Vite 6 · แผนที่ Tiled JSON · Vitest + Playwright

## เริ่มใช้งาน

```bash
npm install
npm run dev          # http://localhost:5173
```

| คำสั่ง | หน้าที่ |
| --- | --- |
| `npm run lint` / `npm run typecheck` | ESLint และ TypeScript |
| `npm run test` | Vitest — กฎเลเวล/ต่อสู้, ตัวเลือกโจทย์, API, schema แผนที่, ตัวละคร/อาชีพ/ย้ายเซฟ (50 tests) |
| `npm run build` / `npm run preview` | Build static แล้วเปิดที่ http://localhost:4173 |
| `npm run test:e2e` | Playwright เล่นเส้นทางเต็มที่ 360×800, 393×852, 768×1024, 1366×768, 1920×1080 และบันทึกภาพไว้ที่ `test-results/screens/` |
| `npm run assets` | สร้าง Placeholder PNG + `manifest.json` + `maps/hub.json` ใหม่ |
| `npm run validate:maps` | ตรวจแผนที่ Tiled ทุกไฟล์ตาม schema |

ครั้งแรกที่รัน e2e ให้ติดตั้งเบราว์เซอร์ก่อน: `npx playwright install chromium`

## เผยแพร่ให้เล่นจากลิงก์

Build เป็นไฟล์ static (`dist/`, `base: './'`) จึงวางที่โฮสต์ใดก็ได้
- **GitHub Pages** — `.github/workflows/pages.yml` deploy อัตโนมัติทุกครั้งที่ push `main` เมื่อ repo เป็น public (แผนฟรีไม่รองรับ Pages ของ repo private) จากนั้นเปิด Settings → Pages → Source: GitHub Actions · ลิงก์: `https://ernestyy52.github.io/onetmaster/`
- **Netlify** (เก็บ repo เป็น private ได้) — เชื่อม repo ใน Netlify แล้วใช้ค่าจาก `netlify.toml`

## สิ่งที่เล่นได้แล้ว

เส้นทาง: **เริ่มเกม → ตั้งชื่อเล่น/เลือกรูปลักษณ์ → เดินไปหาอาจารย์ฮูก → รับภารกิจ → สู้หมอกลืมเลือน (ตอบโจทย์ช่วงศัตรูตั้งโล่) → ได้ XP + เลเวลอัป + อุปกรณ์ → รับภารกิจประตูคณิต → สู้บอสผู้พิทักษ์เฟือง → ได้ประแจเฟืองทองแดง → สวมใส่จากกระเป๋า → แตะประตูโรงกลจักรเพื่อเปิด → Refresh แล้วกลับมาที่ Story State เดิม**

- ลานกลาง Isometric 23×23 จาก Tiled JSON: ทางแยกสี่วิชา (สีและไอคอนประจำวิชา), วงตรากลาง, NPC นกฮูก, กระดานภารกิจ, ต้นไม้/เสา/โคมที่เดินผ่านหน้า–หลังได้ (เรียงความลึกจากตำแหน่งเท้า)
- เดินด้วย WASD/ลูกศร, คลิก/แตะพื้น (A* pathfinding), จอยเสมือนบนจอสัมผัส; WASD หยุดทำงานเมื่อพิมพ์ในฟอร์มหรือเปิดหน้าต่าง
- ต่อสู้แบบผลัดกันเล่น: เห็นเจตนาศัตรูก่อน → ตอบโจทย์ได้แต้มพลัง → โจมตี (Q) / ป้องกัน (W) / เจาะเกราะ (E) / ตั้งโล่ (R) / ยา (F) · ตอบผิดได้คำอธิบาย + เหตุผลของตัวลวง และไม่ติดค้าง
- สกิลช่วยคิด “ตัดตัวเลือกผิด” จำกัด 2 ครั้งต่อรอบ และบันทึกว่าใช้คำใบ้
- Adventure Level / XP (ลด XP เมื่อเจอกลุ่มโจทย์ซ้ำ), Subject Mastery แยกจาก XP (ฝึกอยู่ → ทำได้ด้วยคำใบ้ → ทำได้ด้วยตนเอง), อุปกรณ์ 4 ช่อง, Codex, Story Progress
- **ตัวละครและอาชีพ (M1):** 3 ช่องตัวละครต่อเครื่อง, ตรวจชื่อเล่น (2–12 ตัว ไทย/อังกฤษ/ตัวเลข, คำต้องห้าม, ชื่อซ้ำ), ตัวอย่างก่อนยืนยัน · จบบทนำแล้วเลือก/สลับอาชีพกับอาจารย์ฮูกหรือกด J: นักดาบ (ฟันสองจังหวะ), ผู้พิทักษ์ (ปราการสะท้อน), นักเวท (เวทแสงปัญญา แรงตามจำนวนข้อที่ตอบถูก), นักธนู (ยิงเล็งจุดอ่อน) ใช้ด้วยปุ่ม T · Job Level แยกต่อสายอาชีพ มี soft cap · อาวุธเริ่มต้นเฉพาะอาชีพ · Subject Mastery ใช้ร่วมทุกตัวละคร · เซฟรุ่นก่อน (`onet-rpg-save-v1`) ย้ายเป็น v2 อัตโนมัติโดยไม่ลบของเดิม
- สมุดทักษะ, เมนูเลือกห้อง, แท่นเรียนรู้ (บทสอนเศษส่วน 1 นาที), กระดานภารกิจ
- เล่นต่อหลัง Refresh รวมถึงกลับเข้าเทิร์นเดิมกลางการต่อสู้
- Responsive: การ์ดโจทย์อยู่ขวาบนจอกว้าง / ครึ่งล่างบนมือถือแนวตั้ง, กระเป๋าเต็มจอบนมือถือ, ปุ่มอย่างน้อย 44×44 px, เคารพ safe area

## โครงสร้าง

| โฟลเดอร์ | หน้าที่ |
| --- | --- |
| `src/game/` | Phaser: `BootScene` (โหลดตาม manifest), `HubScene` (แผนที่ การเดิน ความลึก NPC), `BattleScene` (ภาพการต่อสู้), `eventBus.ts` (Typed Event Bus) |
| `src/ui/` | React: HUD, บทสนทนา, การ์ดโจทย์/ต่อสู้, กระเป๋า, สมุดทักษะ, หน้าห้อง |
| `src/state/store.ts` | Shared Store (zustand) ที่ทั้ง React และ Phaser อ่าน |
| `src/shared/` | กฎที่ใช้ร่วมกัน: combat, progression, questionSelector, story, iso, mapSchema, คลังโจทย์ |
| `src/api/` | `GameApi` ตามสัญญา handoff §6 + `LocalGameApi` (จำลองเซิร์ฟเวอร์ในเบราว์เซอร์) |
| `public/assets/` | tilesets, sprites, icons, effects, maps และ `manifest.json` (ขนาด เฟรม จุดยึด สิทธิ์ สถานะ) |
| `tools/` | ตัวสร้าง Placeholder art, ตัวสร้าง/ตรวจแผนที่ |
| `supabase/migrations/` | ร่าง schema + Row Level Security (ยังไม่ได้ deploy) |
| `tests/` | `unit/` (Vitest), `e2e/` (Playwright) |

## สิ่งที่ยังเป็นต้นแบบ / ต้องตัดสินใจ

- **หลังบ้านยังเป็น Local** — `LocalGameApi` บันทึกใน `localStorage` และบังคับกติกาแบบเซิร์ฟเวอร์ (ไม่ส่งเฉลยก่อนตอบ, request id กันรางวัลซ้ำ, ตรวจลำดับเทิร์น) แต่ในโหมดนี้เฉลยยังอยู่ใน bundle ต้องย้าย logic ไป Supabase Edge Functions ก่อนใช้จริง และยังเล่นต่อข้ามเครื่องไม่ได้
- **โจทย์ 24 ข้อเป็นฉบับร่างที่แต่งใหม่** (สถานะ `review`) แสดงป้าย “ร่าง · รอครูตรวจ” ในเกม · `indicator` ยังเป็น `TBD` จนกว่าจะจับคู่กับผัง สทศ. ปี 2569
- **ภาพทั้งหมดเป็น Placeholder** ที่สร้างด้วยโค้ด (`status: "placeholder"` ใน manifest) · ภาพอ้างอิง `docs/references/onet-pixel-rpg-concept.png` ยังไม่มีในเครื่องตอนสร้าง — ดู [`docs/references/README.md`](docs/references/README.md)
- ห้องวิชาอื่นนอกจากคณิตยังเป็นหน้าแนะนำ · ตัวละคร 4 ทิศ (ยังไม่ทำ 8 ทิศ) · ยังไม่มีเสียง · ยังไม่มี PWA
- ต้องยืนยันบนอุปกรณ์จริง: การอ่านภาษาไทย, การแตะ, เฟรมเรตบน iPhone Safari / Android Chrome / เครื่องโรงเรียน

**ทดสอบด้วยมือ** ใส่ `?test=1` ท้าย URL เพื่อเปิด `window.__hub` (teleport) และ `window.__onet` (store/api) สำหรับดีบัก
