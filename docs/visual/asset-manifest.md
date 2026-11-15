# M0 · รายการ asset ภาพที่มีอยู่

**ขอบเขต:** audit จาก `public/assets/manifest.json`, ไฟล์ PNG/JSON จริง และจุดเรียกใน Phaser/React ณ 15 พ.ย. 2569. `asset_id` ตรงกับ manifest `key` เดิมเพื่อให้โค้ดอ้างอิงต่อได้ ไม่มี asset ใหม่ใน M0

**ความหมายสถานะในเอกสารนี้:** `integration-ready` = ไฟล์เดิมมีขนาด/เฟรมตรงสัญญาและถูกโหลดหรือใช้งานในเกมต้นแบบแล้ว; ยังเป็น **placeholder** ตาม runtime manifest และยังไม่ผ่าน visual QA เพื่อใช้เป็นภาพสุดท้าย. `concept` = มีไฟล์แต่ยังไม่พบการใช้ในฉาก/UI ปัจจุบัน. สิทธิ์ของทุกรายการ: ภาพ placeholder ต้นฉบับสร้างด้วย `tools/assets/generate-placeholders.ts` (project-owned); แผนที่สร้างด้วย `tools/maps/generate-hub.ts`. ไม่มีภาพอ้างอิงภายนอกหรือ AI asset ในชุดนี้

| asset_id | path ใต้ `public/assets/` | ขนาด / กริด / ทิศ / เฟรม | anchor | layer / จุดชน / ใช้ในเกม | status |
| --- | --- | --- | --- | --- | --- |
| `hub_tiles` | `tilesets/hub_tiles.png` | 1344×32; 21×(64×32), GID 1–21 | tile center | `ground`, `decor_below`; GID 12 ใช้กับ `collision` ที่ซ่อน; พื้น/ตรา/ทางแยก | integration-ready |
| `tree` | `sprites/tree.png` | 64×96; ภาพเดี่ยว | .5,.95 | `occluders`; จุดชนอยู่ใน `collision`; ต้นไม้ | integration-ready |
| `tree_round` | `sprites/tree_round.png` | 64×96; ภาพเดี่ยว | .5,.95 | `occluders`; จุดชนอยู่ใน `collision`; ต้นไม้ | integration-ready |
| `pillar` | `sprites/pillar.png` | 32×80; ภาพเดี่ยว | .5,.98 | `occluders`; จุดชนอยู่ใน `collision`; เสา | integration-ready |
| `lamp` | `sprites/lamp.png` | 24×64; ภาพเดี่ยว | .5,.98 | `occluders`; จุดชนอยู่ใน `collision`; โคมพื้น | integration-ready |
| `bush` | `sprites/bush.png` | 40×32; ภาพเดี่ยว | .5,.95 | `occluders`; จุดชนอยู่ใน `collision`; พุ่มไม้ | integration-ready |
| `floating_lantern` | `sprites/floating_lantern.png` | 16×24; ภาพเดี่ยว | .5,.5 ใน manifest | `above`; ไม่มีจุดชน; โคมลอย (`HubScene` ใช้ origin ค่าเริ่มต้นของ Phaser) | integration-ready |
| `quest_board` | `sprites/quest_board.png` | 48×64; ภาพเดี่ยว | .5,.97 | `spawns`; จุดชนอยู่ใน `collision`; กระดานภารกิจ | integration-ready |
| `owl_perch` | `sprites/owl_perch.png` | 48×40; ภาพเดี่ยว | .5,.95 | ยังไม่พบการใช้ในฉาก; ไม่มีจุดชนที่ผูกกับ asset | concept |
| `door_thai` | `sprites/door_thai.png` | 96×120; ภาพเดี่ยว | .5,.97 | `transitions`; จุดชนอยู่ใน `collision`; ประตูไทย | integration-ready |
| `door_english` | `sprites/door_english.png` | 96×120; ภาพเดี่ยว | .5,.97 | `transitions`; จุดชนอยู่ใน `collision`; ประตูอังกฤษ | integration-ready |
| `door_math` | `sprites/door_math.png` | 96×120; ภาพเดี่ยว | .5,.97 | `transitions`; จุดชนอยู่ใน `collision`; ประตูคณิตปิด | integration-ready |
| `door_math_open` | `sprites/door_math_open.png` | 96×120; ภาพเดี่ยว | .5,.97 | texture แทน `door_math` เมื่อ flag เปิด; จุดชนใช้ map เดิม | integration-ready |
| `door_science` | `sprites/door_science.png` | 96×120; ภาพเดี่ยว | .5,.97 | `transitions`; จุดชนอยู่ใน `collision`; ประตูวิทย์ | integration-ready |
| `player_swordsman` | `sprites/player_swordsman.png` | 480×256; 48×64 × 40; 4 ทิศ × 10 เฟรม | .5,.94 | avatar ใน Hub/Battle; จุดชนใช้ไทล์ตำแหน่งเท้า | integration-ready |
| `player_mage` | `sprites/player_mage.png` | 480×256; 48×64 × 40; 4 ทิศ × 10 เฟรม | .5,.94 | avatar ใน Hub/Battle; จุดชนใช้ไทล์ตำแหน่งเท้า | integration-ready |
| `player_female_adventurer` | `sprites/player_female_adventurer.png` | 480×256; 48×64 × 40; 4 ทิศ × 10 เฟรม | .5,.94 | avatar หญิง ชุดนักผจญภัย (M1, ผมยาว+โบว์+กระโปรง); จุดชนใช้ไทล์ตำแหน่งเท้า | integration-ready (placeholder) |
| `player_female_robe` | `sprites/player_female_robe.png` | 480×256; 48×64 × 40; 4 ทิศ × 10 เฟรม | .5,.94 | avatar หญิง ชุดคลุมเวท (M1, ผมยาว+หมวก); จุดชนใช้ไทล์ตำแหน่งเท้า | integration-ready (placeholder) |
| `owl` | `sprites/owl.png` | 96×64; 48×64 × 2 idle | .5,.97 | `spawns/npc_owl`; จุดชนอยู่ใน `collision`; NPC | integration-ready |
| `wisp` | `sprites/wisp.png` | 192×48; 48×48 × 4 float | .5,.95 | `spawns` enemy; จุดชน/ระยะโต้ตอบจากตำแหน่ง ไม่ใช่ PNG | integration-ready |
| `warden` | `sprites/warden.png` | 384×112; 96×112 × 4 (idle 2, attack, hurt) | .5,.95 | `spawns` boss; แสดงที่ scale .8; จุดชนปรับตาม quest | integration-ready |
| `icons` | `icons/icons.png` | 416×32; 32×32 × 13 | ไม่ใช้ | React CSS sprite สำหรับไอเทม/ทักษะ; ไม่มีจุดชน | integration-ready |
| `fx_hit` | `effects/hit.png` | 128×32; 32×32 × 4 | ค่า default ของ scene | Battle effect 16 fps; ไม่มีจุดชน | integration-ready |
| `hub` | `maps/hub.json` | **23×23** tile, 64×32; ไม่มี frame | Tiled object origin ตาม `iso.ts` | ฉาก Hub, layer/collision ตาม `scenes/hub-pilot.md`; manifest เดิมระบุ 22×22 ผิด — แก้เป็น 23×23 แล้วใน M1 | integration-ready |

## M1 · ภาพแนวคิดที่ยังไม่โหลดเข้าเกม

| asset_id | path ในรีโป | ขนาด / กริด / ทิศ / เฟรม | anchor / layer / จุดชน / การใช้ | status / ที่มา |
| --- | --- | --- | --- | --- |
| `m1_character_lineup_concept` | `docs/visual/characters/m1-lineup-concept.png` | 1983×793 RGBA; 5 ตัวเต็มตัว; **ไม่มีกริด ทิศ หรือเฟรมเกม** | ไม่มี anchor/layer/collision; ใช้เป็นภาพอ้างอิงออกแบบเท่านั้น | concept; built-in ImageGen 15 พ.ย. 2569 จาก style reference ที่สร้างในรีโป; ตรวจไม่พบลายน้ำ |
| `m1_mobile_readability_preview` | `docs/visual/characters/m1-mobile-readability-preview.png` | 840×200 RGB; ภาพย่อแต่ละตัวในกรอบจำลอง 48×64 | ไม่มี anchor/layer/collision; ใช้ตรวจ silhouette เท่านั้น | concept; แปลงจาก `m1_character_lineup_concept` ด้วย nearest-neighbor |

สองไฟล์นี้ **ห้ามใส่ใน `public/assets/manifest.json` หรือโหลดใน Phaser**. ผลงานภาพ M1 ที่ใช้จริงยังมีเพียง asset placeholder เดิม; รอบผลิต sprite ต้องทำกริด/เฟรม/origin และ QA ก่อนเปลี่ยนสถานะ

**กฎ animation ผู้เล่น:** แต่ละแถวเรียง `down,left,right,up`; คอลัมน์ 0–1 idle, 2–5 walk, 6–7 attack, 8 hurt, 9 victory. `BootScene.ts` สร้าง animation จากลำดับนี้โดยตรง. หากเปลี่ยนขนาด, ลำดับ, anchor หรือ `asset_id` ต้องประสาน Claude ก่อน เพราะมีผลต่อ loader, depth, การเดิน และ UI

**ข้อสังเกตสัญญา:** `floating_lantern` มี anchor ใน manifest แต่ `HubScene` วางภาพด้วย `this.add.image` โดยไม่อ่าน anchor; ค่าปัจจุบันบังเอิญตรงกับค่า default (.5,.5). `hub` metadata ขนาดผิด 1 ไทล์ต่อแกน และชื่อ object ซ้ำ 4 ชื่อใน map; บันทึกไว้ใน `scenes/hub-pilot.md`. `owl_perch` โหลดผ่าน manifest แต่ยังไม่ถูกใช้
