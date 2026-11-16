# Brief for ChatGPT: game name, title screen, cover art, backgrounds

**For:** ChatGPT (image generation and UI design). **From:** Claude Code, working in this repo. **Date:** 15 Nov 2026.
**Status:** the name is chosen: **Lorebound: Tower of Four**. The title text is already in the game; the art below is not made yet.

## 1. The game in one paragraph

An isometric pixel-art fantasy RPG for Thai Grade 6 students (age about 11–12) preparing for the O-NET exam. The four subjects are Thai, English, Math and Science. Each subject is a broken "seal of knowledge". The player starts as a Novice at an adventurers' academy hub, talks to an owl mentor, and fights gentle fantasy enemies (a fog wisp, a gear warden). In battle, answering a question correctly opens the enemy's weak point. After the prologue the player picks a first job: Swordsman, Guardian, Mage or Archer. There are three separate progressions: Adventure Level, Job Level and Subject Mastery. Characters can be male or female, both start in the same basic outfit, and equipped gear shows on the sprite and portrait. Online accounts save progress on a server. It is free and child-safe: no pay-to-win and no violence beyond soft fantasy combat.

Current Thai working title: **หอคอยสี่วิชา** ("The Tower of Four Subjects").

## 2. Name

| Name | Why it fits |
|---|---|
| **Lorebound: Tower of Four** (chosen) | "Lore" = knowledge; fits a learning RPG and sounds epic. "Tower of Four" = the four subjects. |

Logo lockup: **LOREBOUND** large, `Tower of Four` below it, the Thai subtitle `หอคอยสี่วิชา` smaller, and a tiny tag `O-NET ป.6 RPG`. A motif idea: an open book or scroll bound by a ribbon or chain, with the four seal colours woven in.
Rule: the name and art must be original. Do not copy the names, logos, characters, UI or art of any existing game (for example Ragnarok Online, MapleStory or Pokémon), even loosely.

## 3. Visual style to match the game

- **Pixel art**, crisp and unblurred, isometric world (64×32 px tiles). Characters are 48×64 px with dark outlines.
- Outline / darkest ink: `#1d1a2b`. Warm key light from the top-left, short shadows, no big glow that hides things.
- Subject colours (also used on in-game chips and icons):
  - Math `#3b82f6` (blue)
  - Thai `#3fb950` (green)
  - Science `#f0883e` (orange)
  - English `#a371f7` (purple)
- Mood: a bright, inviting magical academy with a stone garden courtyard, small magic buildings and a tall tower. Wonder and curiosity, not dark or scary.
- Fonts used by the game UI: **Mitr** for headings and **Sarabun** for body text (both support Thai). The logo can be custom pixel lettering, but the Thai subtitle must stay readable.

## 4. Deliverables

Put the files in `public/assets/ui/title/` (create the folder). Use PNG unless noted.

| File | Size | What |
|---|---|---|
| `logo.png` | 1200×480, transparent | Name lockup from §2 |
| `logo-pixel.png` | 600×240, transparent | The same logo at true pixel scale (shown at 2×) |
| `bg-far.png` | 1920×1080 | Sky with distant mountains and the tower silhouette |
| `bg-mid.png` | 1920×1080, transparent | The academy and tower, the hero of the image |
| `bg-near.png` | 1920×1080, transparent | Foreground stone garden, plants and floating seal shards |
| `bg-mobile.png` | 1080×1920 | Portrait version, flattened to one image |
| `cover.png` | 1920×1080 | Key art / store cover: tower, the four seals in subject colours, the four job heroes small in front, and the logo |
| `cover-square.png` | 1080×1080 | Square crop for icons and social posts |
| `title-mock.png` | 1920×1080 and 390×844 | UI mockups of the title screen (desktop and phone) |

Backgrounds are layered so the game can add a slow parallax. They also have to work flattened as one image. The game respects "reduced motion".

## 5. Title screen UI (what it must contain)

The screen is React over a full-screen background. Keep these elements, in this order:

1. Logo (§2).
2. A row of 4 subject chips, each with an icon and Thai name in its subject colour: คณิต, ไทย, วิทย์, อังกฤษ.
3. A one-line story: *ตราแห่งความรู้ทั้งสี่แตกกระจาย ใช้ความรู้เปิดจุดอ่อนของศัตรู แล้วฟื้นฟูสถาบันนักผจญภัย*
4. A primary button: `เริ่มผจญภัย` / `เล่นต่อ · <name> Lv.<n>` / `เลือกตัวละคร`.
5. A secondary button: `เปลี่ยน/สร้างตัวละคร`.
6. A small status line (offline/online save, "questions are drafts awaiting teacher review").

Online builds show a sign-in card (email + password, sign up / sign in) before this screen. Design it in the same style.

Constraints:
- Touch targets are at least **44×44 CSS px**. Keep text contrast at WCAG AA or better on top of the background. Put a soft panel behind the text if needed.
- Phone first: it must fit 390×844 with no scrolling. Respect safe areas (notch, home bar). Also cover 768×1024 tablet and 1920×1080 desktop.
- Never use colour alone to tell subjects apart: always pair it with an icon and a label.
- No ads, no shop, no "buy" buttons, no countdown or pressure tactics (child safety).

## 6. Handing results back

Return the PNGs plus, for the UI, either a static HTML/CSS mock or exact values: colours, font sizes, spacing and the layout per breakpoint. Claude Code will wire them into `src/ui/screens.tsx` (`TitleScreen`, `AuthScreen`) and `src/ui/styles.css`, (the name is already in `index.html` and `TitleScreen`). Add each asset as a row in `docs/visual/asset-manifest.md`.
