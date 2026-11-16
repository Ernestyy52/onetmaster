# ส่งต่อ Claude · Visual M2

## 1. ส่งมอบ

`docs/visual/screens/m2-account-states.md` — สเปกและ QA ของหน้าเข้าสู่ระบบ/สร้างบัญชี/กลับเข้าเกม; **UI implementation** อยู่ใน `src/ui/screens.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`. ไม่มี asset ใหม่. งาน M1 ภาพตัวละครยังอยู่ที่ `docs/visual/characters/` และ `docs/visual/asset-manifest.md`.

## 2. สัญญานำเข้า

AuthScreen ใช้สถานะเริ่มต้น, สร้างบัญชี, busy, error และ retry ตามตารางในสเปก. ปุ่มกด ≥44 CSS px, ฟอร์มมี safe area, ข้อผิดพลาดแสดงครั้งเดียวในฟอร์ม. ไม่ต้องเพิ่ม asset ID, anchor, frame, Tiled layer หรือ collision.

## 3. งาน Claude

ใน M2 ให้เชื่อมสถานะหลังเข้าสู่ระบบ/เลือกตัว/หลุดและกลับเข้าเกมกับ API จริง และตรวจด้วยบัญชีทดสอบสองบัญชีตาม `docs/changes/M2-accounts-server.md`. รักษาข้อความ error ที่เข้าใจได้ ไม่เปิดอีเมล/ข้อมูลเด็กบนหน้าเลือกตัว. UI package นี้ไม่เปลี่ยนสัญญาเซฟหรือกฎเกม.

## 4. ตรวจรับและข้อจำกัด

ตรวจหน้าที่ไม่ต้องเข้าสู่ระบบแล้วที่ 360×800 และ 1366×768. ตรวจ signed-in, session หมด, network error, retry และ keyboard มือถือจริงเพิ่มเติมก่อนปิด M2; ยังไม่อ้างว่า online flow ผ่าน. รายละเอียดและภาพที่ต้องเห็นอยู่ใน `docs/visual/screens/m2-account-states.md`.

ข้อความส่งต่อ: อ่าน `docs/visual/handoff-to-claude.md` และไฟล์ที่อ้างอิง ใช้เฉพาะ asset ที่เป็น `integration-ready` กับ milestone ปัจจุบัน รักษา `asset_id`/anchor/layer ตาม manifest; หากสัญญาขัดกับโค้ดจริง ให้รายงานจุดขัดกันก่อนแก้สัญญา
