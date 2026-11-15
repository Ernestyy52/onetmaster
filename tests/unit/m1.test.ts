import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LocalGameApi, MemoryStorage } from '../../src/api/localGameApi';
import { SAVE_KEY_V1, SAVE_KEY_V2 } from '../../src/api/saveFormat';
import { normalizeAppearance, PLAYER_SPRITES, spriteKey } from '../../src/shared/appearance';
import type { RunView } from '../../src/api/types';
import { applyAction, createCombat, ENEMIES, type CombatState, type PlayerAction } from '../../src/shared/combat';
import { FIRST_JOBS, JOBS } from '../../src/shared/data/jobs';
import { QUESTION_BANK } from '../../src/shared/data/questions';
import { canChangeJob, jobBonus, jobLevelForXp } from '../../src/shared/jobs';
import { validateNickname } from '../../src/shared/nickname';
import { combatStats } from '../../src/shared/progression';

const MAGE = { gender: 'male' } as const;
const V1_FIXTURE = readFileSync('tests/unit/fixtures/save-v1-midboss.json', 'utf8');
const key = (v: RunView) => QUESTION_BANK.find((q) => q.id === v.turn!.question.id)!.answer_key;

async function play(api: LocalGameApi, v: RunView, rid: string) {
  for (let i = 0; i < 40 && !v.result; i++) {
    if (v.state.phase === 'question') v = await api.answer(v.runId, v.turn!.turnId, key(v), `${rid}-a${i}`);
    if (v.result || v.state.phase !== 'command') continue;
    const s = v.state;
    const action = s.focus > 0 && s.intent === 'beam' ? 'shield' : s.focus > 0 && s.enemyShield && !s.weakPoint ? 'pierce' : 'attack';
    v = (await api.action(v.runId, s.turn, action, `${rid}-x${i}`)).view;
  }
  return v;
}
const fight = async (api: LocalGameApi, enemyId: string, rid: string) => play(api, await api.startRun(enemyId, `${rid}-start`), rid);

async function finishPrologue(api: LocalGameApi, tag = '') {
  await api.talk('owl', `t${tag}`);
  await api.acceptQuest('q_clear_fog', `a1${tag}`);
  await fight(api, 'fog_wisp', `w${tag}`);
  await api.acceptQuest('q_math_door', `a2${tag}`);
  await fight(api, 'gear_warden', `b${tag}`);
  await api.completeQuest('q_math_door', `door${tag}`);
}

function newApi(storage = new MemoryStorage()) {
  return { storage, api: new LocalGameApi(storage, QUESTION_BANK, () => 0.3) };
}

describe('save migration v1 → v2', () => {
  it('keeps the old character, its progress, mastery and the unfinished boss fight', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY_V1, V1_FIXTURE);
    const old = JSON.parse(V1_FIXTURE);
    const { api } = newApi(storage);

    const chars = await api.listCharacters();
    expect(chars).toHaveLength(1);
    expect(chars[0]).toMatchObject({ slot: 1, nickname: 'ต้นกล้า', appearance: { gender: 'male' }, level: old.progression.level, job: 'novice' });
    // 1 fog wisp already defeated → novice job XP credited retroactively
    expect(chars[0].jobLevel).toBe(jobLevelForXp('novice', ENEMIES.fog_wisp.xp));

    const p = await api.getProgression();
    expect(p.xp).toBe(old.progression.xp);
    expect(p.mastery).toEqual(old.progression.mastery);
    expect(p.seenFamilies).toEqual(old.progression.seenFamilies);
    expect(p.inventory).toEqual(old.progression.inventory);
    expect(p.story).toEqual(old.progression.story);
    expect(p.activeRunId).toBe(old.progression.activeRunId);

    // rollback copy untouched, new key written
    expect(storage.getItem(SAVE_KEY_V1)).toBe(V1_FIXTURE);
    expect(JSON.parse(storage.getItem(SAVE_KEY_V2)!).version).toBe(2);

    // the boss fight from the old save can be finished and the prologue completed
    const run = (await api.getRun(p.activeRunId!))!;
    expect(run.result).toBeNull();
    const done = await play(api, { ...run, lastAnswer: null }, 'resume');
    expect(done.result?.outcome).toBe('won');
    const door = await api.completeQuest('q_math_door', 'door');
    expect(door.progression.story.flags.door_math_open).toBe(true);
  });

  it('does not migrate twice and survives refresh', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY_V1, V1_FIXTURE);
    const a = newApi(storage).api;
    await a.talk('owl', 'x'); // any write
    const xp = (await a.getProgression()).xp;
    const b = newApi(storage).api;
    expect((await b.getProgression()).xp).toBe(xp);
    expect(await b.listCharacters()).toHaveLength(1);
  });

  it('falls back to v1 when the v2 save is corrupted', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY_V1, V1_FIXTURE);
    storage.setItem(SAVE_KEY_V2, '{broken');
    expect(await newApi(storage).api.listCharacters()).toHaveLength(1);
  });

  it('a v1 save with no profile becomes an empty account', async () => {
    const storage = new MemoryStorage();
    const v1 = JSON.parse(V1_FIXTURE);
    v1.progression.profile = null;
    storage.setItem(SAVE_KEY_V1, JSON.stringify(v1));
    const { api } = newApi(storage);
    expect(await api.listCharacters()).toEqual([]);
    expect((await api.getProgression()).profile).toBeNull();
  });

  it('reset removes both versions so the old save does not come back', async () => {
    const storage = new MemoryStorage();
    storage.setItem(SAVE_KEY_V1, V1_FIXTURE);
    const { api } = newApi(storage);
    await api.reset();
    expect(storage.getItem(SAVE_KEY_V1)).toBeNull();
    expect(await newApi(storage).api.listCharacters()).toEqual([]);
  });
});

describe('nickname check', () => {
  it.each([
    ['ต้นกล้า', true],
    ['  Mo  Mo ', true],
    ['ก', false],
    ['ชื่อยาวมากเกินไปจริงๆนะ', false],
    ['bad<script>', false],
    ['แอดมิน01', false],
    ['TEACHER', false],
  ])('%s → %s', (name, ok) => {
    expect(validateNickname(name).ok).toBe(ok);
  });

  it('normalises spaces and rejects names already used on this device', () => {
    const r = validateNickname('  Mo  Mo ');
    expect(r.ok && r.value).toBe('Mo Mo');
    expect(validateNickname('mo mo', ['Mo Mo']).ok).toBe(false);
  });
});

describe('character slots', () => {
  it('creates, validates and selects characters; mastery is shared by the account', async () => {
    const { api } = newApi();
    await expect(api.createCharacter(0, 'ต้นกล้า', MAGE, 'c0')).rejects.toThrow();
    await expect(api.createCharacter(1, 'x', MAGE, 'c1')).rejects.toThrow();
    const a = await api.createCharacter(1, 'ต้นกล้า', MAGE, 'c2');
    expect(a.slot).toBe(1);
    // same request id → same result, no second character
    await api.createCharacter(1, 'ต้นกล้า', MAGE, 'c2');
    expect(await api.listCharacters()).toHaveLength(1);
    await expect(api.createCharacter(1, 'อีกคน', MAGE, 'c3')).rejects.toThrow();
    await expect(api.createCharacter(2, 'ต้นกล้า', MAGE, 'c4')).rejects.toThrow(); // duplicate name

    // answer one question as character 1
    let v = await api.startRun('fog_wisp', 'r1');
    v = await api.answer(v.runId, v.turn!.turnId, key(v), 'ans1');
    const mastery = (await api.getProgression()).mastery;
    expect(Object.keys(mastery)).toHaveLength(1);

    const b = await api.createCharacter(2, 'ใบไม้', { gender: 'female' }, 'c5');
    expect(b.slot).toBe(2);
    expect(b.level).toBe(1);
    expect(b.mastery).toEqual(mastery); // account-wide
    expect(b.activeRunId).toBeNull(); // runs belong to a character
    await expect(api.answer(v.runId, 'whatever', 'a', 'ans2')).rejects.toThrow();

    const back = await api.selectCharacter(1);
    expect(back.activeRunId).toBe(v.runId);
    await expect(api.selectCharacter(3)).rejects.toThrow();
  });
});

describe('jobs', () => {
  it('job change is locked until the prologue is complete', async () => {
    const { api } = newApi();
    await api.createCharacter(1, 'ต้นกล้า', MAGE, 'c');
    await expect(api.changeJob('mage', 'j1')).rejects.toThrow('หลังจบบทนำ');
    const p = await api.getProgression();
    expect(canChangeJob(p, 'mage').ok).toBe(false);
  });

  it('switches between all four first jobs; each keeps its own job level and gets its starter weapon once', async () => {
    const { api } = newApi();
    await api.createCharacter(1, 'ต้นกล้า', MAGE, 'c');
    await finishPrologue(api);

    for (const job of FIRST_JOBS) {
      const p = await api.changeJob(job, `job-${job}`);
      expect(p.job).toBe(job);
      const starter = JOBS[job].starterItem!;
      const inst = p.inventory.find((i) => i.itemId === starter)!;
      expect(inst).toBeDefined();
      expect(p.equipment.weapon).toBe(inst.instanceId);
      expect(p.maxHp).toBe(combatStats(p).maxHp);
    }
    // idempotent: replaying a request does not give a second weapon
    await api.changeJob('swordsman', 'job-swordsman');
    let p = await api.getProgression();
    expect(p.job).toBe('archer');
    expect(p.inventory.filter((i) => i.itemId === 'willow_bow')).toHaveLength(1);

    // job XP goes to the current job only
    await fight(api, 'fog_wisp', 'farm');
    p = await api.getProgression();
    expect(p.jobs.archer!.xp).toBe(ENEMIES.fog_wisp.xp);
    expect(p.jobs.mage!.xp).toBe(0);

    // switching away and back keeps the job's progress and re-equipping is restricted
    p = await api.changeJob('mage', 'back-to-mage');
    expect(p.jobs.archer!.xp).toBe(ENEMIES.fog_wisp.xp);
    expect(p.inventory.filter((i) => i.itemId === 'apprentice_staff')).toHaveLength(1);
    const bow = p.inventory.find((i) => i.itemId === 'willow_bow')!;
    await expect(api.equip(bow.instanceId)).rejects.toThrow();
  });

  it('job passives change combat stats but nothing about questions or mastery', () => {
    const base = { level: 1, equipment: {}, inventory: [] };
    expect(combatStats({ ...base, job: 'swordsman', jobs: {} }).atk).toBeGreaterThan(combatStats({ ...base, job: 'novice', jobs: {} }).atk);
    expect(combatStats({ ...base, job: 'guardian', jobs: {} }).maxHp).toBeGreaterThan(combatStats({ ...base, job: 'novice', jobs: {} }).maxHp);
    expect(combatStats({ ...base, job: 'mage', jobs: {} }).maxFocus).toBe(4);
    expect(combatStats({ ...base, job: 'archer', jobs: {} }).weakMult).toBe(2.5);
    // soft cap: job levels past 30 add much less
    const at = (lv: number) => jobBonus({ job: 'swordsman', jobs: { swordsman: { level: lv, xp: 0 } } }).atk;
    expect(at(40) - at(30)).toBeLessThan(at(30) - at(20));
  });
});

describe('job skills differ in combat', () => {
  const enemy = ENEMIES.gear_warden;
  function stateFor(job: 'swordsman' | 'guardian' | 'mage' | 'archer'): CombatState {
    const stats = combatStats({ level: 3, equipment: {}, inventory: [], job, jobs: {} });
    const s = createCombat(enemy, { ...stats, hp: stats.maxHp });
    return { ...s, phase: 'command', focus: 1, enemyShield: true, intent: 'strike', correctAnswers: 2 };
  }
  const use = (job: 'swordsman' | 'guardian' | 'mage' | 'archer', a: PlayerAction) => {
    const stats = combatStats({ level: 3, equipment: {}, inventory: [], job, jobs: {} });
    return applyAction(stateFor(job), a, enemy, stats, 0);
  };

  it('each first job has exactly its own active skill', () => {
    expect(stateFor('mage').skills).toEqual(['insight_bolt']);
    expect(() => use('mage', 'twin_slash')).toThrow();
  });

  it('swordsman hits hardest, guardian reflects, mage ignores the shield, archer opens the weak point', () => {
    const sword = use('swordsman', 'twin_slash');
    const guard = use('guardian', 'bastion');
    const mage = use('mage', 'insight_bolt');
    const archer = use('archer', 'marked_shot');

    const dealt = (r: ReturnType<typeof use>) => enemy.maxHp - r.state.enemyHp;
    // guardian takes no damage and the enemy is hurt by the reflection only
    expect(guard.events.some((e) => e.type === 'reflect')).toBe(true);
    expect(guard.state.playerHp).toBe(stateFor('guardian').playerHp);
    // archer breaks the shield and leaves a weak point open (the boss re-raises its shield on the next question turn)
    expect(archer.events).toContainEqual(expect.objectContaining({ type: 'skill', skillId: 'marked_shot', brokeShield: true }));
    expect(archer.state.weakPoint).toBe(true);
    // mage damage is not reduced by the shield and grows with correct answers
    const mageNoAnswers = applyAction({ ...stateFor('mage'), correctAnswers: 0 }, 'insight_bolt', enemy, combatStats({ level: 3, equipment: {}, inventory: [], job: 'mage', jobs: {} }), 0);
    expect(dealt(mage)).toBeGreaterThan(dealt(mageNoAnswers));
    expect(mage.state.enemyShield).toBe(true);
    // swordsman out-damages a basic attack through the shield
    const basic = applyAction(stateFor('swordsman'), 'attack', enemy, combatStats({ level: 3, equipment: {}, inventory: [], job: 'swordsman', jobs: {} }), 0);
    expect(dealt(sword)).toBeGreaterThan(dealt(basic));

    const signature = (r: ReturnType<typeof use>) => JSON.stringify([dealt(r), r.state.weakPoint, r.state.enemyShield, r.state.playerHp]);
    expect(new Set([sword, guard, mage, archer].map(signature)).size).toBe(4);
  });

  it('archer passive makes weak-point attacks stronger', () => {
    const run = (job: 'swordsman' | 'archer') => {
      const stats = { ...combatStats({ level: 3, equipment: {}, inventory: [], job, jobs: {} }), atk: 10 };
      const s = { ...createCombat(enemy, { ...stats, hp: 99 }), phase: 'command' as const, weakPoint: true, enemyShield: false, intent: 'guard' as const };
      return enemy.maxHp - applyAction(s, 'attack', enemy, stats, 0).state.enemyHp;
    };
    expect(run('archer')).toBe(25);
    expect(run('swordsman')).toBe(20);
  });

  it('runs saved before M1 (no skills field) still work', () => {
    const s = stateFor('swordsman');
    delete s.skills;
    delete s.weakMult;
    expect(() => applyAction(s, 'twin_slash', enemy, { atk: 10, def: 0 }, 0)).toThrow();
    expect(applyAction(s, 'attack', enemy, { atk: 10, def: 0 }, 0).state.turn).toBe(2);
  });
});

describe('appearance: gender with one shared basic outfit', () => {
  it('each gender has its own sheet in the manifest, both in the same basic outfit', () => {
    const manifest = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')) as { assets: { key: string; frameWidth?: number; frameHeight?: number; anchor?: { x: number; y: number } }[] };
    const male = spriteKey({ gender: 'male' });
    const female = spriteKey({ gender: 'female' });
    expect(male).toBe('player_swordsman'); // original asset id kept
    expect(female).toBe('player_female_basic');
    for (const key of [male, female]) {
      const entry = manifest.assets.find((a) => a.key === key)!;
      expect(entry, key).toBeDefined();
      expect([entry.frameWidth, entry.frameHeight, entry.anchor]).toEqual([48, 64, { x: 0.5, y: 0.94 }]);
    }
    expect(PLAYER_SPRITES.sort()).toEqual([female, male].sort());
  });

  it('reads older appearance forms from saves', () => {
    expect(normalizeAppearance('mage')).toEqual({ gender: 'male' });
    expect(normalizeAppearance('swordsman')).toEqual({ gender: 'male' });
    expect(normalizeAppearance({ gender: 'female', outfit: 'robe' })).toEqual({ gender: 'female' });
    expect(normalizeAppearance({ gender: 'x' })).toEqual({ gender: 'male' });
  });

  it('the API stores gender, rejects invalid values, and older saves are upgraded on load', async () => {
    const { api, storage } = newApi();
    await expect(api.createCharacter(1, 'ต้นกล้า', { gender: 'robot' } as never, 'bad')).rejects.toThrow();
    const p = await api.createCharacter(1, 'ต้นกล้า', { gender: 'female' }, 'ok');
    expect(p.profile?.appearance).toEqual({ gender: 'female' });
    expect((await api.listCharacters())[0].appearance.gender).toBe('female');

    const raw = JSON.parse(storage.getItem(SAVE_KEY_V2)!);
    raw.characters[0].profile.appearance = { gender: 'female', outfit: 'robe' };
    storage.setItem(SAVE_KEY_V2, JSON.stringify(raw));
    expect((await newApi(storage).api.getProgression()).profile?.appearance).toEqual({ gender: 'female' });
    raw.characters[0].profile.appearance = 'mage';
    storage.setItem(SAVE_KEY_V2, JSON.stringify(raw));
    expect((await newApi(storage).api.getProgression()).profile?.appearance).toEqual({ gender: 'male' });
  });
});
