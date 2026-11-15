# M1 · ระบบรูปลักษณ์ตัวละคร

**สถานะ: concept** — [ภาพเรียงตัวละคร](m1-lineup-concept.png) แสดงนักผจญภัยฝึกหัด, นักดาบ, ผู้พิทักษ์, นักเวท, นักธนู จากซ้ายไปขวา. [ภาพย่อทดสอบการอ่าน](m1-mobile-readability-preview.png) ย่อแต่ละตัวลงในกรอบ 48×64 แล้วขยายกลับเพื่อดูที่ขนาดเกม; ไม่ใช่ sprite sheet หรือภาพจากเกมจริง

## กฎที่ต้องรักษาใน M1

- `Look` แยกจาก `JobId` ตาม `docs/adr/0001-mmorpg-foundation.md`: ทรงผม/โทนสี/รูปลักษณ์ไม่ล็อกอาชีพ ทุกคนเริ่ม `novice` แล้วเลือกอาชีพเมื่อระบบอนุญาต
- ในเกม M1 ให้ใช้ sheet เดิม `player_swordsman` และ `player_mage` เป็น **รูปลักษณ์** ตามแผน ADR; ไม่มี asset อาชีพใหม่ที่ `integration-ready` จากแพ็กเกจนี้. รูป 5 บทบาทใช้กำหนดทิศทางภาพสำหรับรอบผลิต sprite ภายหลัง
- สัญญา sprite ที่ผลิตต่อ: เฟรม 48×64 px, 4 แถว `down,left,right,up`, แถวละ 10 เฟรม (idle 2, walk 4, attack 2, hurt 1, victory 1), origin `(0.5,0.94)`, แนวเท้าคงที่, พื้นหลังโปร่งใส. อย่าตัดภาพ concept มาเป็นเฟรมอัตโนมัติ
- อาชีพต้องอ่านได้จาก **รูปทรง + อุปกรณ์ + ชื่อ/ไอคอน UI** โดยไม่อาศัยสีเพียงอย่างเดียว. สีวิชา 4 สีสงวนไว้สำหรับการนำทางวิชา จึงไม่กำหนดสีวิชาเป็นรหัสอาชีพ

| บทบาท | silhouette ที่ต้องอ่านได้ใน 48×64 | เครื่องหมาย UI ระยะ M1 | สิ่งที่ห้ามสื่อผิด |
| --- | --- | --- | --- |
| `novice` นักผจญภัยฝึกหัด | เสื้อเรียบ กระเป๋าสะพายเล็ก ไม่มีอาวุธเด่น | ป้าย `ฝึกหัด` | ไม่ให้ดูเป็นอาชีพนักดาบ/นักเวทที่เลือกแล้ว |
| `swordsman` นักดาบ | ดาบสั้นยื่นพ้นลำตัวด้านข้าง | ดาบ + ชื่อ `นักดาบ` | ดาบไม่ทับใบหน้า/ตัวเลือกโจทย์ |
| `guardian` ผู้พิทักษ์ | โล่ทรงกว้างด้านหน้า ไหล่แน่น | โล่ + ชื่อ `ผู้พิทักษ์` | โล่ไม่ปิดเท้าจน depth ผิด |
| `mage` นักเวท | หมวกทรงแหลมสั้น ไม้เท้า | ดาว/ไม้เท้า + ชื่อ `นักเวท` | หมวกไม่ล้นกรอบเฟรมด้านบน |
| `archer` นักธนู | คันธนูโค้งข้างตัวและซองลูกธนู | ธนู + ชื่อ `นักธนู` | คันธนูไม่ขยาย hit area หรือ collision |

## Visual QA ที่ทำและยังต้องทำ

- ภาพ concept มี 5 ตัวแยกกัน ไม่มีข้อความ/ลายน้ำ, RGBA 1983×793. ภาพย่อเชิงสังเกตในกรอบ 48×64 ยังแยกบทบาทได้จากอุปกรณ์; **ผลนี้ไม่ยืนยันว่าเฟรมจริงเล่นได้**
- ภาพ concept มีองค์ประกอบยื่นนอกกรอบ เช่น โล่ หมวก และธนู; รอบผลิตต้องลดรายละเอียดให้พอดี 48×64 และตรวจ baseline เท้าทุกเฟรม รวมถึงเมื่อหันซ้าย/ขวา/ขึ้น
- ต้องตรวจบนจอจริงที่ zoom 1–3 ของ `HubScene`, พื้นหญ้า/หิน, หน้าสร้างตัว 360×800 และ 1366×768, WebGL/Canvas, hover/focus/selected/disabled; ยังไม่ได้ตรวจการแสดงผลเหล่านี้ในรอบ concept

## ที่มาภาพ

ภาพ concept สร้างด้วย built-in ImageGen วันที่ 15 พ.ย. 2569 โดยใช้ `docs/visual/audit-preview.png` เป็น **style reference ของงานในรีโปเอง**. Prompt หลัก: “five separate full-body pixel-art concepts: novice, swordsman, guardian, mage, archer; shared compact body proportions; same neutral face/hair; distinct satchel, sword, shield, staff/hat, bow/quiver; child-friendly original fantasy; no text, logo, watermark, frames or grid.” ภาพย่อ QA สร้างจากภาพ concept โดยย่อลงกรอบ 48×64 ด้วย nearest-neighbor เพื่อดู silhouette เท่านั้น. ไม่ใช้ reference หรือ asset เฉพาะของเกมอื่น

<details><summary>Prompt ที่ใช้สร้างภาพ</summary>

```text
Use case: stylized-concept. Asset type: M1 character design concept lineup for the original Thai educational isometric pixel RPG 'หอคอยสี่วิชา'. Use the supplied image ONLY as a reference for the current game's tiny pixel proportions, dark outline, cheerful readable palette and simple shape language; do not reproduce any existing character exactly. Create ONE polished pixel-art concept sheet with exactly five separate full-body figures, evenly spaced left to right: novice adventurer, swordsman, guardian, mage, archer. All five share the same compact 48x64 sprite-frame body proportions and a consistent neutral base face/hair, so clothing and equipment communicate the role independently of body/appearance choices. Novice: small satchel and simple tunic; swordsman: short training sword and clear blade silhouette; guardian: broad small shield and sturdy shoulder silhouette; mage: short staff and pointed cap; archer: short bow and quiver silhouette. Child-friendly fantasy, gentle, no violence, no detailed armor, no adult proportions. Front-facing slight isometric three-quarter view consistent across all five; feet aligned at one baseline; crisp intentional pixel clusters with no gradients or anti-aliasing, 1-pixel dark outlines at native pixel scale, warm upper-left light, clearly separated colors and shapes at mobile size. Transparent or plain neutral background, no scenery. NO text, NO labels, NO logos, NO watermark, NO UI. This is a CONCEPT lineup only, not a production sprite sheet; do not add multiple poses, frames, grids, or cut marks.
```

</details>
