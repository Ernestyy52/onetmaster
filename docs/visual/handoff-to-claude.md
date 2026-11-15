# ส่งต่อ Claude · Visual M1

แพ็กเกจนี้เป็นคอนเซ็ปต์ตัวละครและสเปก UI สำหรับ M1; Model/Effort ที่แนะนำคือ **GPT-6 Sol / High** สำหรับการรักษาสัดส่วนและรูปลักษณ์ข้าม 5 บทบาท (ไม่ได้สลับโมเดลของ session โดยเอกสารนี้)

## 1. ส่งมอบ

- `docs/visual/characters/m1-character-spec.md` และ `m1-lineup-concept.png` — **concept** ของ novice และ 4 อาชีพ; ไม่ใช่ sprite sheet
- `docs/visual/characters/m1-mobile-readability-preview.png` — **concept QA** ที่ย่อ silhouette ลงกรอบ 48×64; ไม่ใช่ภาพในเกม
- `docs/visual/characters/m1-create-character-ui.md` — สเปกหน้าเลือกช่อง/สร้างตัว/เปลี่ยนอาชีพและสถานะ UI ที่ตรวจเทียบ M1 แล้ว
- `docs/visual/characters/m1-visual-qa.md` — ผลตรวจ UI, body 2 แบบ, overlay อุปกรณ์ 8 แบบ, ไอคอน และข้อจำกัดของการตรวจ
- `docs/visual/asset-manifest.md` — บันทึก body 2 ชุด, overlay อุปกรณ์ 8 ชุด, `player_mage` ที่ยังโหลดแต่ไม่ถูกเลือกใช้ และ `asset_id` ของภาพ concept สองไฟล์. ไฟล์ที่ ChatGPT ผลิตในแพ็กเกจนี้ **ไม่มี asset ใหม่ที่ integration-ready**

## 2. สัญญานำเข้า

M1 ใช้ `Appearance = {gender}` แยกจาก `JobId`; ชาย=`player_swordsman`, หญิง=`player_female_basic`, ทั้งคู่เป็น **ชุดพื้นฐานเดียวกัน** ต่างที่ผมและไม่มีอาวุธติด body. อุปกรณ์ที่สวมเพิ่มด้วย 8 overlay ใต้ `public/assets/equipment/`; ลำดับล่างขึ้นบน `armor → shoes → charm → weapon`. Body และ overlay ใช้เฟรม 48×64, 4 ทิศ × 10 เฟรม, origin `(0.5,0.94)`, ตำแหน่ง/scale/alpha ตรงกัน; depth ตามเท้า. `player_mage` ยังอยู่ใน manifest แต่มีชุด/ไม้เท้าติด body และไม่ใช่ตัวเลือกสร้างตัวหรือฐาน overlay. ทั้งหมดเป็น `placeholder` ที่โหลดได้ตาม runtime manifest. ภาพ concept อยู่ใต้ `docs/visual/characters/` ไม่มี frame, anchor, Tiled layer หรือ collision และห้ามโหลดเป็น asset runtime. หน้า UI ต้องมี selected ของเพศ, ข้อความผิดพลาดใกล้ชื่อ และการ์ด/ปุ่มแตะ ≥44×44 CSS px

## 3. งาน Claude

สำหรับ **M1** รักษา `Appearance` แยกจาก `JobId` ตาม ADR; สร้างตัวเป็น novice แล้วเปลี่ยนอาชีพตามกฎระบบของ Claude. `src/ui/styles.css` บวก `safe-area-inset-*` ให้ `.screen` และ `.modal-backdrop` แล้ว; นำการแก้นี้เข้า branch ที่ Claude พัฒนาต่อ. ไอคอน `shield`/`staff`/`bow`/`mace` อยู่ใน commit `daf527e`; atlas, index และ key ตรงกัน และแผงอาชีพ 360×800 แสดงถูกบทบาท. Body+overlay ใน Hub/Battle/portrait ใช้สัญญาเดียวกัน; `player_mage` ยังไม่เหมาะเป็น body กับ overlay. ภาพ concept ไม่ใช่ sprite runtime และไม่ต้องเชื่อมเข้าระบบ

## 4. ตรวจรับและข้อจำกัด

ตรวจแล้วว่าภาพ concept มี 5 บทบาทแยกชัด ไม่มีข้อความ/ลายน้ำ และภาพย่อช่วยดู silhouette ที่กรอบเกม. UI สร้างตัวที่ 360×800 และ 1366×768 อยู่ครบ, ปุ่มแตะตามสเปก; ตัวละครหญิงพร้อมเสื้อคลุม/ดาบไม้แสดงใน HUD, Hub, Battle และ Canvas fallback. ตรวจเดินหันขวา/หันหลัง, บังหลังเสา และเฟรมโจมตีใน Battle ที่ 360×800; atlas อาชีพแสดงตรงบทบาท. Body 2 กับ overlay 8 sheet มี 40 เฟรมตรง manifest. `npm run lint`, `npm run typecheck` และ 56 unit tests ผ่าน; รายละเอียดอยู่ใน `m1-visual-qa.md`. ยังไม่ได้ใช้อุปกรณ์ทุกชุดหรือมือถือมีขอบเว้าจริงในการตรวจ; เก็บไว้ในรอบภาพตัวจริง/QA อุปกรณ์. ภาพ concept ต้องวาดใหม่ลงกริดและผ่าน QA ก่อนใช้ในเกม

ข้อความส่งต่อ: อ่าน `docs/visual/handoff-to-claude.md` และไฟล์ที่อ้างอิง ใช้เฉพาะ asset ที่เป็น `integration-ready` กับ milestone ปัจจุบัน รักษา `asset_id`/anchor/layer ตาม manifest; หากสัญญาขัดกับโค้ดจริง ให้รายงานจุดขัดกันก่อนแก้สัญญา
