# ส่งต่อ Claude · Visual M0

แพ็กเกจที่เลือก: audit ฐานภาพและสัญญา Hub ก่อนเริ่มผลิตภาพ M1. Model/Effort ที่แนะนำสำหรับงานกำหนดทิศทางนี้คือ **GPT-6 Sol / Medium**; เอกสารนี้ไม่ได้สั่งเปลี่ยนโมเดลของ session โดยอัตโนมัติ

## 1. ส่งมอบ

- `docs/visual/art-direction.md` — **concept**: แนวภาพเดียวและกฎจาก renderer จริง
- `docs/visual/asset-manifest.md` — audit 22 `asset_id` เดิม; ไฟล์ที่ระบุ `integration-ready` เป็น **placeholder ที่ใช้ในต้นแบบอยู่แล้ว** ไม่ใช่ภาพสุดท้าย
- `docs/visual/scenes/hub-pilot.md` — **concept**: ผังและเกณฑ์ตรวจ Hub เส้นทาง spawn → owl/board → ประตูคณิต
- `docs/visual/audit-preview.png` — ภาพตัวอย่าง asset เดิมแบบขยายพิกเซล; **ไม่ใช่ screenshot จากเกม**

## 2. สัญญานำเข้า

ยังไม่มี asset ใหม่ให้เชื่อม. คง 64×32 tile, `hub.json` 23×23, ชื่อ layer `ground`, `decor_below`, `collision`, `occluders`, `spawns`, `transitions`, `above`; ตัวละคร 48×64, 4 ทิศ × 10 เฟรม, origin (.5,.94), depth ตาม world Y. ใช้ `public/assets/manifest.json` เป็นสัญญา runtime ปัจจุบัน; สถานะ `placeholder` ในนั้นยังไม่เปลี่ยน. Collision อ่านจาก tile layer ไม่ใช่ขอบ sprite

## 3. งาน Claude

สำหรับ **M0** ให้อ่าน audit นี้ประกอบ ADR ระบบและบันทึกผลกระทบต่อแผน M1–M3. พบ metadata `hub` 22×22 ใน manifest แต่ map จริง 23×23 และชื่อ `occluders` ซ้ำ 4 ค่า; หาก Claude ต้องอ้างชื่อ object หรือสร้าง asset pipeline ใหม่ ให้แก้ต้นทาง generator และผลลัพธ์พร้อมกันหลังตกลงสัญญา อย่าแก้ gameplay/schema จากเอกสารภาพนี้โดยปริยาย. ก่อน M1 ขอให้ยืนยัน character frame/origin และพื้นที่ UI สร้างตัวละครกับ visual package ถัดไป

## 4. ตรวจรับและข้อจำกัด

M0 ตรวจแบบ static แล้ว: PNG 21 ไฟล์มีขนาดตรง manifest, map JSON/layer/object ถูกต้องตามโครงที่ตรวจ, และช่องว่างข้าง owl/board/ประตูคณิตเดินถึงจาก spawn ได้ตามกฎ 8 ทิศแบบไม่ตัดมุม; พบข้อยกเว้นขนาด `hub` ข้างต้น. ยังไม่ได้เปิดเกมบน browser/มือถือหรือทดสอบ WebGL/Canvas เพราะ snapshot นี้ไม่มี `node_modules`; ภาพอ้างอิงหลักใน `docs/references/` ยังไม่มี. รอบ visual ถัดไปต้องจับ screenshot ที่ 360×800 และ 1366×768 รวม `?renderer=canvas` และตรวจเส้นทางใน `scenes/hub-pilot.md` ก่อนอนุมัติภาพใหม่

ข้อความส่งต่อเมื่อเริ่มเชื่อมภาพรอบถัดไป: อ่าน `docs/visual/handoff-to-claude.md` และไฟล์ที่อ้างอิง ใช้เฉพาะ asset ที่เป็น `integration-ready` กับ milestone ปัจจุบัน รักษา `asset_id`/anchor/layer ตาม manifest; หากสัญญาขัดกับโค้ดจริง ให้รายงานจุดขัดกันก่อนแก้สัญญา
