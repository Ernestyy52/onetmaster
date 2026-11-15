# M1 change log: characters, gender, jobs

**For:** ChatGPT/Codex or any other agent continuing this repo. Read this before touching character, job, save or sprite code.
**Branch:** `m1-characters-jobs` (based on `m0-mmorpg-foundation` → PR #1). **Date:** 15 Nov 2026.
**Still true:** single-player, offline prototype. `LocalGameApi` runs the server rules in the browser and saves to `localStorage`. Nothing is online yet.

## 1. What the player sees now

1. **Title:** "เริ่มผจญภัย" (no characters) → create screen. With characters: "เล่นต่อ · <name> Lv.N" continues the last selected one; "เปลี่ยน/สร้างตัวละคร" opens character select.
2. **Character select:** 3 slots per device. Filled slot shows portrait, name, Adventure Lv, job and Job Lv. Empty slot → create screen for that slot. You can also reach it from Menu (☰) → "เปลี่ยนตัวละคร".
3. **Create character:**
   - **Nickname:** 2–12 characters, Thai/English/digits/space/`_`/`-`. Checked live, and again on the server side (in `LocalGameApi`). Rejects a small blocklist (impersonation such as ครู/แอดมิน, plus rude words) and names already used on this device.
   - **Gender:** ชาย (male) / หญิง (female). Each gender has **its own sprite sheet**.
   - **Outfit: none to choose.** Everyone starts in **one basic outfit (ชุดพื้นฐาน)**. It is identical for male and female (same blue tunic, belt, boots and training sword); only the hair differs.
   - **Preview:** a large portrait with name, gender and "ชุดพื้นฐาน", shown before confirming.
   - Gender **never changes stats**. Jobs do.
4. **Jobs:** every new character starts as **นักผจญภัยฝึกหัด (Novice)**. After the prologue ends (math door opened), the owl offers "เลือกอาชีพ". The jobs panel also opens with **J** or by tapping the job chip under the name in the HUD. Players can switch freely between the 4 first jobs, and each job keeps its own Job Level.

| Job | Active skill (key **T**, costs 1 focus) | Passive | Starter weapon (given once, job-locked) |
|---|---|---|---|
| นักดาบ Swordsman | ฟันสองจังหวะ: ×1.7 damage; a shield only cuts it to 60% (normal attack 30%) | ATK +3 | ดาบเหล็กฝึกซ้อม ATK 4 |
| ผู้พิทักษ์ Guardian | ปราการสะท้อน: blocks all damage this turn and reflects 60% of it back | DEF +2, HP +15 | กระบองไม้โอ๊ก ATK 2 DEF 2 |
| นักเวท Mage | เวทแสงปัญญา: ignores the shield; +40% per correct answer in this fight (max ×2.6) | Max focus +1 (4) | ไม้เท้าฝึกเวท ATK 3 |
| นักธนู Archer | ยิงเล็งจุดอ่อน: breaks the shield, opens the weak point, ×0.8 damage | Weak-point hits ×2.5 (normal ×2) | ธนูไม้หลิว ATK 3 |

Focus points still come **only from answering questions correctly**. Skills cannot be bought, and nothing skips a question.

## 2. Three progression axes (unchanged rule, now real)

| Axis | Stored on | Grows from |
|---|---|---|
| Adventure Level (`level`, `xp`) | character | quests, wins, correct answers (repeat-decayed) |
| Job Level (`jobs[jobId].level/xp`) | character, **per job** | winning fights only (`enemy.xp`). Soft cap after job Lv 30; max 10 for Novice, 40 for first jobs |
| Subject Mastery (`mastery`, `seenFamilies`) | **account (shared by all characters)** | graded answers only |

Mastery is account-wide on purpose. It measures the child, so a new character must not reset it, and must not farm XP from questions it has already seen.

## 3. Code map: where things live

| File | What changed |
|---|---|
| `src/shared/types.ts` | `Gender`, `Appearance {gender}`, `JobId`, `JobProgress`, `Progression.slot/job/jobs`, `ItemDef.jobs`, `CharacterSummary`, optional job fields on `RewardSummary` |
| `src/shared/appearance.ts` (new) | `GENDERS`, `BASIC_OUTFIT_LABEL`, `spriteKey(appearance)`, `PLAYER_SPRITES`, `normalizeAppearance()`, which also reads older forms: the string `'swordsman'/'mage'` and `{gender, outfit}` |
| `src/shared/data/jobs.ts` (new) | data tables `JOBS`, `ACTIVE_SKILLS`, `FIRST_JOBS`. **Add advanced jobs here** with `tier: 2` and a `parent` |
| `src/shared/jobs.ts` (new) | pure rules: job XP curve, `jobBonus` (passive + soft-capped growth), `canChangeJob`, `canEquipFor` |
| `src/shared/nickname.ts` (new) | `validateNickname()`, used by both the UI and the API |
| `src/shared/combat.ts` | `PlayerAction = BasicAction \| ActiveSkillId`; `CombatState.skills/weakMult` (optional so runs saved before M1 still load); new events `skill` and `reflect` |
| `src/shared/progression.ts` | `combatStats()` now adds job bonuses and returns `maxFocus/weakMult/skills` |
| `src/api/saveFormat.ts` (new) | save types, `migrateV1`, `loadSave`, request-log trimming |
| `src/api/localGameApi.ts` | v2 save, character slots, `changeJob`, job-locked `equip`, job XP on wins, account-wide mastery |
| `src/api/types.ts` (`GameApi`) | **removed** `createProfile`; **added** `listCharacters`, `createCharacter(slot, nickname, appearance, requestId)`, `selectCharacter(slot)`, `changeJob(job, requestId)` |
| `src/ui/screens.tsx` | Title / **SelectScreen** (new) / CreateScreen (gender + preview + live name check; no outfit picker) |
| `src/ui/panels/Panels.tsx` | **JobsPanel** (new); inventory shows "ใช้ได้เฉพาะ…" and blocks wrong-job gear; menu has "เปลี่ยนตัวละคร" |
| `src/ui/battle/BattleUI.tsx`, `src/ui/App.tsx` | job skill button (key T); result card shows Job XP / Job Level up |
| `src/ui/components/Hud.tsx` | job chip (opens jobs panel); focus pips use the real max focus |
| `src/game/scenes/*` | sprite key from `spriteKey()`; animations created for all 4 player sheets; skill/reflect animations |
| `tools/assets/generate-placeholders.ts` | `Look.longHair/ribbon/skirt`; new sheet `player_female_basic` (same outfit as `player_swordsman`, long hair); hub manifest size fixed to 23×23 |
| `tools/maps/generate-hub.ts` | removed 4 duplicate corner trees (duplicate object names) |

## 4. Sprites (visual contract kept)

| Gender | asset_id | Outfit |
|---|---|---|
| male | `player_swordsman` (original id kept) | basic (blue tunic, training sword) |
| female | `player_female_basic` (new) | the **same** basic outfit; only the hair is long |

`player_mage` (robe and hat) is still in the manifest and loaded, but no character uses it any more. Keep it for a later unlockable outfit. Earlier drafts of this branch had `player_female_adventurer` / `player_female_robe` and an outfit picker; both were removed because the starter outfit must be the same for every player.

Both player sheets are 480×256, 48×64 frames, rows `down,left,right,up`, columns idle×2 / walk×4 / attack×2 / hurt / victory, anchor (0.5, 0.94). They are code-generated **placeholders** (`status: placeholder`). Final art must keep the same grid, anchor and asset ids. Regenerate with `npm run assets`. Generation is deterministic; existing PNGs come out byte-identical.

## 5. Saves and migration

- Keys: `onet-rpg-save-v1` (old) and `onet-rpg-save-v2` (current).
- On load: a valid v2 save is used. Otherwise a v1 save is migrated to v2 and written under the v2 key. **The v1 key is never deleted** (it is the rollback copy). "ลบเซฟทั้งหมด" removes both keys.
- In v1 → v2, the old single player becomes the character in slot 1 with job Novice. Novice job XP is credited from enemies already defeated. Mastery moves to the account. Inventory, story, codex and an unfinished battle are kept and can be finished.
- Early v2 saves written before gender existed stored `appearance` as `'swordsman'|'mage'`. Load converts them to `{gender:'male'}`. A brief intermediate form `{gender, outfit}` is also accepted, and the outfit is dropped.
- Test fixture `tests/unit/fixtures/save-v1-midboss.json` is a **real v1 save produced by the old code** (`origin/main` 6d33aa2), saved mid boss fight.

## 6. Tests

- `tests/unit/m1.test.ts`: migration (including resuming the old boss fight), nickname rules, slots, account-wide mastery, job lock, all 4 jobs and starter items, job-locked equip, distinct skill effects, archer passive, pre-M1 run compatibility, gender sprites and legacy appearance.
- `tests/e2e/journey.spec.ts` covers:
  - the full journey, now ending with choosing Mage and winning with the skill;
  - opening a v1 save in the browser;
  - slots, including creating a **female** character and checking the HUD portrait and the Phaser sprite key.
- Results of the gate run are in the PR/handoff message for this round. Re-run with `npm run lint && npm run typecheck && npm run test && npm run build && npm run test:e2e`.

## 7. Not done / decisions still open

- Nickname blocklist is a stub. Staff must review it before names become visible to other players (M3). Open decision: free-text names vs. preset word pairs for online display.
- Job balance is first-pass numbers only; tune them in `src/shared/data/jobs.ts`.
- No job-specific body sprites yet. Jobs show as an icon and name only.
- Offline only: answer keys are still in the JS bundle. That moves server-side in M2 (see `docs/adr/0001-mmorpg-foundation.md`).

## 7b. Sync with the parallel visual package (`docs/visual/characters/`)

A visual agent added concept art and a UI QA report on this branch while M1 was being built. Claude did **not** edit those files. Please reconcile:

- `docs/visual/handoff-to-claude.md` says M1 "uses only `player_swordsman`/`player_mage`". That is **outdated**. Character creation now has **gender**, and there are **2 runtime player sheets** (§4), both in the same basic starter outfit. `player_female_basic` is a code-generated placeholder that follow the same 48×64 / (0.5, 0.94) contract and are listed in `docs/visual/asset-manifest.md`.
- `m1-visual-qa.md` flags job icons that don't match their roles (guardian=`robe`, mage=`book`, archer=`gear`). Agreed, and **not fixed yet**. The fix is new `shield`/`staff`/`bow` icons in the atlas generator plus `src/ui/icons.ts` `ICON_NAMES` (order must match the atlas) plus `JOBS[*].icon`, all changed together.
- The concept lineup (`m1-lineup-concept.png`) is art direction only. It is not loaded in game and must not go into `public/assets/manifest.json`.
- Job-specific body sprites (shield, bow, etc.) from the concept are a later asset round. Appearance (gender) stays independent of `JobId`.

## 8. Suggested additions to character creation (not built yet)

Ordered by value for a P.6 audience versus effort. Each one stays cosmetic and must not affect stats:

1. **Skin tone (3–4 options) and hair colour (4–6):** palette swaps in the generator, without needing new sheets if done as a runtime tint/palette map. Inclusive and cheap.
2. **Hair style (short / long / tied):** the generator already has `longHair`, so this mostly separates hair from gender.
3. **Outfit colour (4 presets) for the basic outfit:** a tunic colour swap; easy, and helps players spot themselves among others in M3. Optional, because the basic outfit is intentionally shared.
4. **Randomize button (🎲)** for nickname and look. Helps kids who stall at the create screen.
5. **Preset nickname builder** (adjective + animal/object, e.g. "นกฮูกขยัน"): safest for online play, since there is no free text.
6. **"Starting subject" pick** (favourite subject): sets the first hint quest and the room the owl points to. No stat effect.
7. **Turn-around preview** (4 directions) on the create screen, using the existing sheet rows.
8. Later, with M5 content: unlockable outfits from quests and badges (never sold for real money).
