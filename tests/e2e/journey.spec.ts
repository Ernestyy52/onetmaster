import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * Handoff §9 journey: start → walk to NPC → accept quest → fight → shield-break question →
 * XP + level up → equipment → open bag → unlock math door → refresh keeps story state.
 * `?test=1` exposes window.__hub / window.__onet helpers (teleport, current answer key).
 */

type W = Window & {
  __hub: {
    teleportTo(name: string): boolean;
    screenOf(name: string): { x: number; y: number } | null;
    playerTile(): { x: number; y: number };
  };
  __onet: {
    store: { getState(): Record<string, unknown> & { run: null | { state: { phase: string; focus: number; intent: string; enemyShield: boolean; weakPoint: boolean }; result: unknown } } };
    answerFor(): string | null;
  };
};

async function worldReady(page: Page) {
  await page.waitForFunction(() => (window as unknown as W).__onet?.store.getState().worldReady === true, null, { timeout: 30_000 });
}

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/screens/${test.info().project.name}-${name}.png` });
}

async function expectNoOverflow(page: Page) {
  const { sw, w } = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: window.innerWidth }));
  expect(sw).toBeLessThanOrEqual(w);
}

async function overlap(page: Page, a: string, b: string) {
  const ba = await page.locator(a).boundingBox();
  const bb = await page.locator(b).boundingBox();
  if (!ba || !bb) return false;
  return !(ba.x + ba.width <= bb.x || bb.x + bb.width <= ba.x || ba.y + ba.height <= bb.y || bb.y + bb.height <= ba.y);
}

async function interactWith(page: Page, name: string) {
  // Wandering enemies can drift out of range between teleport and click, so retry a few times.
  for (let attempt = 0; attempt < 5; attempt++) {
    await page.evaluate((n) => (window as unknown as W).__hub.teleportTo(n), name);
    const btn = page.getByTestId('btn-interact');
    await expect(btn).toBeEnabled({ timeout: 5000 });
    await btn.click();
    const opened = page.locator('[data-testid=dialogue], [data-testid=battle-panel], [data-testid=reward-modal]');
    try {
      await expect(opened.first()).toBeVisible({ timeout: 2500 });
      return;
    } catch {
      /* retry */
    }
  }
  throw new Error(`could not interact with ${name}`);
}

async function advanceDialogueUntil(page: Page, choice: RegExp) {
  for (let i = 0; i < 10; i++) {
    const reward = page.getByRole('button', { name: 'รับรางวัล' });
    if (await reward.isVisible()) await reward.click();
    const c = page.getByRole('button', { name: choice });
    if (await c.isVisible()) return c.click();
    const next = page.getByTestId('dialogue-next');
    if (await next.isVisible()) await next.click();
    await page.waitForTimeout(150);
  }
  throw new Error(`choice ${choice} never appeared`);
}

/** Play a battle through the real UI. Answers correctly except where `wrongFirst` is set. */
async function fight(page: Page, { wrongFirst = false, skill = '' } = {}) {
  await expect(page.getByTestId('battle-panel')).toBeVisible();
  let answered = 0;
  let usedSkill = false;
  for (let i = 0; i < 80; i++) {
    if (await page.getByTestId('battle-result').isVisible()) return usedSkill;
    const cont = page.getByTestId('btn-continue');
    if (await cont.isVisible()) {
      await cont.click();
      continue;
    }
    if (await page.getByTestId('question-card').isVisible()) {
      const key = await page.evaluate(() => (window as unknown as W).__onet.answerFor());
      const opts = page.locator('[data-option]');
      const target = wrongFirst && answered === 0 ? opts.and(page.locator(`:not([data-option="${key}"])`)).first() : page.locator(`[data-option="${key}"]`);
      await target.click();
      answered++;
      await expect(page.getByTestId('explanation')).toBeVisible();
      continue;
    }
    if (await page.getByTestId('commands').isVisible()) {
      const s = await page.evaluate(() => (window as unknown as W).__onet.store.getState().run!.state);
      if (skill && s.focus > 0) {
        const sb = page.locator(`[data-action="${skill}"]`);
        if (await sb.isEnabled()) {
          await sb.click();
          usedSkill = true;
          await page.waitForTimeout(300);
          continue;
        }
      }
      const action = s.focus > 0 && s.intent === 'beam' ? 'shield' : s.focus > 0 && s.enemyShield && !s.weakPoint ? 'pierce' : 'attack';
      const btn = page.locator(`[data-action="${action}"]`);
      if (await btn.isEnabled()) await btn.click();
      await page.waitForTimeout(300);
      continue;
    }
    await page.waitForTimeout(200);
  }
  throw new Error('battle did not finish');
}

test('full prototype journey', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?test=1');
  await page.getByTestId('btn-start').click();

  // WASD must type into the form, not move the character.
  const name = page.getByTestId('input-nickname');
  await name.click();
  await page.keyboard.type('wasd');
  await expect(name).toHaveValue('wasd');
  await name.fill('ต้นกล้า');
  await page.getByTestId('btn-create').click();
  await worldReady(page);
  await expectNoOverflow(page);
  await shot(page, '1-hub');

  // HUD must not cover the action button.
  expect(await overlap(page, '[data-testid=hud]', '[data-testid=btn-interact]')).toBe(false);

  // Walk to the owl by clicking/tapping on it (real pointer input on the canvas).
  const owl = await page.evaluate(() => (window as unknown as W).__hub.screenOf('owl'));
  expect(owl).not.toBeNull();
  await page.mouse.click(owl!.x, owl!.y - 20);
  await expect(page.getByTestId('dialogue')).toBeVisible({ timeout: 10_000 });
  await advanceDialogueUntil(page, /รับภารกิจ: ไล่หมอก/);
  await expect(page.getByTestId('quest-tracker')).toContainText('ไล่หมอกลืมเลือน');

  // First fight: one wrong answer (explanation shown), level up afterwards.
  await interactWith(page, 'enemy_fog_3');
  await shot(page, '2-battle-question');
  await fight(page, { wrongFirst: true });
  await expect(page.getByTestId('battle-result')).toContainText('ชนะแล้ว');
  await expect(page.getByTestId('levelup')).toBeVisible();
  await shot(page, '3-battle-result');
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('hud-level')).toHaveText('Lv.2');

  // Next quest from the owl, then the boss.
  await interactWith(page, 'owl');
  await advanceDialogueUntil(page, /รับภารกิจ: ปลุกประตู/);
  await interactWith(page, 'boss_gear_warden');
  await page.getByRole('button', { name: 'เริ่มต่อสู้' }).click();
  await fight(page);
  await expect(page.getByTestId('battle-result')).toContainText('ประแจเฟืองทองแดง');
  await page.getByTestId('btn-leave').click();
  // the defeated boss must disappear from the hub
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __game: { scene: { getScene(k: string): { boss: { visible: boolean } } } } }).__game.scene.getScene('Hub').boss.visible))
    .toBe(false);

  // Equip the loot from the bag.
  await page.getByTestId('btn-inventory').click();
  await expect(page.getByTestId('inventory')).toBeVisible();
  await page.getByTestId('item-copper_gear_wrench').click();
  await page.getByTestId('btn-equip').click();
  await expect(page.getByTestId('inventory')).toContainText('สวมใส่อยู่');
  await shot(page, '4-inventory');
  await page.getByRole('button', { name: 'ปิด' }).click();

  // Unlock the math door.
  await interactWith(page, 'door_math');
  await expect(page.getByTestId('reward-modal')).toContainText('ประตูโรงกลจักรเปิดแล้ว');
  await page.getByRole('button', { name: 'รับรางวัล' }).click();
  await expect(page.getByTestId('quest-tracker')).toContainText('บทนำสำเร็จ');
  await expect(page.getByTestId('hud-level')).toHaveText('Lv.3');

  // Refresh: story state and level come back from the save.
  await page.reload();
  await expect(page.getByTestId('btn-start')).toContainText('Lv.3');
  await page.getByTestId('btn-start').click();
  await worldReady(page);
  await expect(page.getByTestId('quest-tracker')).toContainText('บทนำสำเร็จ');
  const flags = await page.evaluate(() => (window as unknown as W).__onet.store.getState().progression as { story: { flags: Record<string, boolean> } });
  expect(flags.story.flags.door_math_open).toBe(true);
  await shot(page, '5-after-refresh');

  // M1: the owl offers the first job after the prologue; the job skill appears in battle.
  await expect(page.getByTestId('hud-job')).toContainText('นักผจญภัยฝึกหัด');
  await interactWith(page, 'owl');
  await advanceDialogueUntil(page, /เลือกอาชีพ/);
  await expect(page.getByTestId('jobs-panel')).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, '6-jobs');
  await page.getByTestId('btn-job-mage').click();
  await expect(page.getByTestId('job-current')).toContainText('นักเวท');
  await page.getByRole('button', { name: 'ปิด' }).click();
  await expect(page.getByTestId('hud-job')).toContainText('นักเวท');
  await interactWith(page, 'enemy_fog_2');
  expect(await fight(page, { skill: 'insight_bolt' })).toBe(true);
  await expect(page.getByTestId('battle-result')).toContainText('Job XP');
  await page.getByTestId('btn-leave').click();

  expect(errors).toEqual([]);
});

test('a save from before M1 keeps its character and unfinished boss fight', async ({ page }) => {
  const v1 = readFileSync('tests/unit/fixtures/save-v1-midboss.json', 'utf8');
  await page.addInitScript((save) => {
    if (!localStorage.getItem('onet-rpg-save-v2')) localStorage.setItem('onet-rpg-save-v1', save);
  }, v1);
  await page.goto('/?test=1');
  await expect(page.getByTestId('btn-start')).toContainText('ต้นกล้า Lv.2');
  await page.getByTestId('btn-start').click();
  // the old save was mid-boss-fight right after an answer: the battle resumes
  await expect(page.getByTestId('battle-panel')).toBeVisible({ timeout: 30_000 });
  await fight(page);
  await expect(page.getByTestId('battle-result')).toContainText('ชนะแล้ว');
  await page.getByTestId('btn-leave').click();
  await expect(page.getByTestId('hud-job')).toContainText('Job Lv.');
});

test('character slots: create a second character and switch back', async ({ page }) => {
  await page.goto('/?test=1');
  await page.getByTestId('btn-start').click();
  const name = page.getByTestId('input-nickname');
  await name.fill('ก');
  await name.blur();
  await expect(page.locator('#nickname-msg')).toContainText('อย่างน้อย');
  await expect(page.getByTestId('btn-create')).toBeDisabled();
  await name.fill('ใบไม้');
  await page.getByTestId('btn-create').click();
  await worldReady(page);

  await page.getByRole('button', { name: 'เมนู' }).click();
  await page.getByTestId('btn-switch-character').click();
  await expect(page.getByTestId('select-screen')).toBeVisible();
  await expectNoOverflow(page);
  await shot(page, '7-select');
  await page.getByTestId('slot-2-new').click();
  await page.getByTestId('input-nickname').fill('ใบไม้');
  await page.getByTestId('input-nickname').blur();
  await expect(page.locator('#nickname-msg')).toContainText('มีตัวละครชื่อนี้');
  await page.getByTestId('input-nickname').fill('ดอกไม้');
  await page.getByTestId('gender-female').click();
  await expect(page.getByTestId('create-preview')).toContainText('ดอกไม้');
  await expect(page.getByTestId('create-preview')).toContainText('หญิง · ชุดพื้นฐาน');
  await expect(page.getByTestId('pick-outfit')).toHaveCount(0);
  await expect(page.locator('[data-testid=create-preview] .portrait')).toHaveAttribute('style', /player_female_basic/);
  await shot(page, '8-create-female');
  await page.getByTestId('btn-create').click();
  await worldReady(page);
  await expect(page.locator('.hud-name strong')).toHaveText('ดอกไม้');
  await expect(page.locator('[data-testid=hud] .portrait')).toHaveAttribute('style', /player_female_basic/);
  const skin = await page.evaluate(() => (window as unknown as { __game: { scene: { getScene(k: string): { skin: string } } } }).__game.scene.getScene('Hub').skin);
  expect(skin).toBe('player_female_basic');

  await page.reload();
  await expect(page.getByTestId('btn-start')).toContainText('ดอกไม้');
  await page.getByTestId('btn-characters').click();
  await page.getByTestId('slot-1').click();
  await worldReady(page);
  await expect(page.locator('.hud-name strong')).toHaveText('ใบไม้');
});

test('refresh during a battle resumes the same turn', async ({ page }) => {
  await page.goto('/?test=1');
  await page.getByTestId('btn-start').click();
  await page.getByTestId('input-nickname').fill('ทดสอบ');
  await page.getByTestId('btn-create').click();
  await worldReady(page);
  await interactWith(page, 'enemy_fog_1');
  await expect(page.getByTestId('question-card')).toBeVisible();
  const stem = await page.getByTestId('question-stem').textContent();
  await page.reload();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('question-card')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('question-stem')).toHaveText(stem!);
  // battle panel must not hide the HUD
  expect(await overlap(page, '[data-testid=hud]', '[data-testid=battle-panel]')).toBe(false);
  await expectNoOverflow(page);
});
