# ส่งต่อ Claude · Visual M1

แพ็กเกจนี้เป็นคอนเซ็ปต์ตัวละครและสเปก UI สำหรับ M1; Model/Effort ที่แนะนำคือ **GPT-6 Sol / High** สำหรับการรักษาสัดส่วนและรูปลักษณ์ข้าม 5 บทบาท (ไม่ได้สลับโมเดลของ session โดยเอกสารนี้)

## 1. ส่งมอบ

- `docs/visual/characters/m1-character-spec.md` และ `m1-lineup-concept.png` — **concept** ของ novice และ 4 อาชีพ; ไม่ใช่ sprite sheet
- `docs/visual/characters/m1-mobile-readability-preview.png` — **concept QA** ที่ย่อ silhouette ลงกรอบ 48×64; ไม่ใช่ภาพในเกม
- `docs/visual/characters/m1-create-character-ui.md` — **concept** ของหน้าเลือกช่อง/สร้างตัว/เปลี่ยนอาชีพและสถานะ UI
- `docs/visual/characters/m1-visual-qa.md` — ผลตรวจ UI ของ branch M1 ที่ 360×800 และ 1366×768 พร้อมจุดปรับไอคอน
- `docs/visual/asset-manifest.md` — เพิ่ม `asset_id` ของภาพ concept สองไฟล์พร้อมที่มา. แพ็กเกจนี้ **ไม่มี asset ใหม่ที่ integration-ready**

## 2. สัญญานำเข้า

M1 ยังใช้ sheet เดิม `player_swordsman`/`player_mage` จาก `public/assets/manifest.json` เป็นรูปลักษณ์ ไม่ผูกกับ `JobId`. คงเฟรม 48×64, 4 ทิศ × 10 เฟรม, origin `(0.5,0.94)`, depth ตามเท้า. ภาพ concept อยู่ใต้ `docs/visual/characters/` ไม่มี frame, anchor, Tiled layer หรือ collision และห้ามโหลดเป็น asset runtime. หน้า UI ใช้ React text/portrait เดิม, ปุ่ม/การ์ดแตะ ≥44×44 CSS px, safe area และ states ตามสเปก

## 3. งาน Claude

สำหรับ **M1** รักษา `Look` แยกจาก `JobId` ตาม ADR; สร้างตัวเป็น novice, แล้วเปลี่ยนอาชีพตามกฎระบบของ Claude. คำการ์ดรูปลักษณ์ใน `src/ui/screens.tsx` แก้แล้ว; ยังไม่ต้องเชื่อมภาพ concept เป็น sprite. ชื่ออาชีพอ่านชัด แต่ไอคอน guardian/mage/archer ยังใช้ภาพแทนที่ไม่ตรงบทบาทตาม `m1-visual-qa.md`; หากเพิ่ม shield/staff/bow ให้แก้ atlas generator, index และ job key พร้อมกัน. ไม่แก้กฎ gameplay จากเอกสารภาพนี้

## 4. ตรวจรับและข้อจำกัด

ตรวจแล้วว่าภาพ concept มี 5 บทบาทแยกชัด ไม่มีข้อความ/ลายน้ำ และภาพย่อช่วยดู silhouette ที่กรอบเกม. เปิด UI จริงที่ 360×800 และ 1366×768: หน้าเลือก/สร้างตัวและแผงอาชีพอ่านได้, การ์ด/ปุ่มหลักแตะได้ ≥44 px, ชื่อซ้ำเตือนชัด, ไม่มีล้นแนวนอน; รายละเอียดและข้อจำกัดอยู่ใน `m1-visual-qa.md`. ยังไม่ได้ตรวจ sprite จริง 4 ทิศ/animation, อุปกรณ์มือถือจริง, Canvas fallback หรือการเปลี่ยนอาชีพหลังจบบทนำ. ภาพ concept ต้องวาดใหม่ลงกริดและผ่าน QA ก่อนใช้ในเกม

ข้อความส่งต่อ: อ่าน `docs/visual/handoff-to-claude.md` และไฟล์ที่อ้างอิง ใช้เฉพาะ asset ที่เป็น `integration-ready` กับ milestone ปัจจุบัน รักษา `asset_id`/anchor/layer ตาม manifest; หากสัญญาขัดกับโค้ดจริง ให้รายงานจุดขัดกันก่อนแก้สัญญา
