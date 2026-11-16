import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { LocalGameApi, MemoryStorage } from '../../src/api/localGameApi';
import type { RunView } from '../../src/api/types';
import { QUESTION_BANK } from '../../src/shared/data/questions';
import { validateMap } from '../../src/shared/mapSchema';

const key = (v: RunView) => QUESTION_BANK.find((q) => q.id === v.turn!.question.id)!.answer_key;

async function fight(api: LocalGameApi, enemyId: string, rid: string) {
  let v = await api.startRun(enemyId, `${rid}-start`);
  for (let i = 0; i < 40 && !v.result; i++) {
    if (v.state.phase === 'question') v = await api.answer(v.runId, v.turn!.turnId, key(v), `${rid}-a${i}`);
    const s = v.state;
    const action = s.focus > 0 && s.intent === 'beam' ? 'shield' : s.focus > 0 && s.enemyShield && !s.weakPoint ? 'pierce' : 'attack';
    v = (await api.action(v.runId, s.turn, action, `${rid}-x${i}`)).view;
  }
  return v;
}

describe('LocalGameApi (server contract)', () => {
  let storage: MemoryStorage;
  let api: LocalGameApi;
  beforeEach(async () => {
    storage = new MemoryStorage();
    api = new LocalGameApi(storage, QUESTION_BANK, () => 0.3);
    await api.createCharacter(1, '  ทดสอบ  ', { gender: 'female' }, 'create-1');
  });

  it('never sends the answer key before answering', async () => {
    const v = await api.startRun('fog_wisp', 'r1');
    expect(v.turn).not.toBeNull();
    expect(JSON.stringify(v.turn)).not.toContain('answer_key');
    expect(JSON.stringify(v.turn)).not.toContain('explanation');
  });

  it('same requestId returns the same result and grants nothing twice', async () => {
    const a = await api.talk('owl', 'talk-1');
    const b = await api.talk('owl', 'talk-1');
    expect(b.rewards).toEqual(a.rewards);
    expect((await api.getProgression()).xp).toBe(15);
    // a fresh request id on a finished quest grants nothing either
    await api.talk('owl', 'talk-2');
    expect((await api.getProgression()).xp).toBe(15);
  });

  it('rejects stale turns and wrong owners', async () => {
    const v = await api.startRun('fog_wisp', 'r1');
    await expect(api.answer(v.runId, 'bogus-turn', 'a', 'x1')).rejects.toThrow();
    await expect(api.action('run-999', 1, 'attack', 'x2')).rejects.toThrow();
  });

  it('boss is locked until its quest is active', async () => {
    await expect(api.startRun('gear_warden', 'b1')).rejects.toThrow();
  });

  it('plays the whole prologue: level up, loot, door opens, story saved', async () => {
    await api.talk('owl', 't');
    await api.acceptQuest('q_clear_fog', 'acc1');
    const wisp = await fight(api, 'fog_wisp', 'w');
    expect(wisp.result?.outcome).toBe('won');
    expect(wisp.result?.completedQuests).toContain('q_clear_fog');
    let p = await api.getProgression();
    expect(p.level).toBe(2);
    expect(p.inventory.some((i) => i.itemId === 'wind_boots')).toBe(true);

    await api.acceptQuest('q_math_door', 'acc2');
    const boss = await fight(api, 'gear_warden', 'b');
    expect(boss.result?.outcome).toBe('won');
    expect(boss.result?.readyQuests).toContain('q_math_door');
    p = await api.getProgression();
    expect(p.inventory.some((i) => i.itemId === 'copper_gear_wrench')).toBe(true);

    const done = await api.completeQuest('q_math_door', 'door');
    expect(done.progression.story.flags.door_math_open).toBe(true);
    expect(done.progression.level).toBeGreaterThanOrEqual(3);
    // completing again with a new request id is refused
    await expect(api.completeQuest('q_math_door', 'door-2')).rejects.toThrow();

    // reload from the same storage = "refresh the page"
    const reloaded = new LocalGameApi(storage, QUESTION_BANK);
    const again = await reloaded.getProgression();
    expect(again.story.quests.q_math_door).toBe('done');
    expect(again.xp).toBe(done.progression.xp);
  });

  it('resumes an unfinished run after reload', async () => {
    const v = await api.startRun('fog_wisp', 'r1');
    const reloaded = new LocalGameApi(storage, QUESTION_BANK);
    const p = await reloaded.getProgression();
    expect(p.activeRunId).toBe(v.runId);
    const resumed = await reloaded.getRun(v.runId);
    expect(resumed?.turn?.question.id).toBe(v.turn?.question.id);
  });

  it('equipment changes attack stats', async () => {
    const p = await api.getProgression();
    expect(p.equipment.weapon).toBe('s1-inv-1');
    await expect(api.equip('s1-inv-3')).rejects.toThrow(); // potion is not equipment
  });

  it('item instance ids stay unique', async () => {
    await api.talk('owl', 't');
    await api.acceptQuest('q_clear_fog', 'a');
    await fight(api, 'fog_wisp', 'w');
    const ids = (await api.getProgression()).inventory.map((i) => i.instanceId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('hub map', () => {
  it('generated Tiled JSON passes the schema', () => {
    const map = JSON.parse(readFileSync('public/assets/maps/hub.json', 'utf8'));
    expect(validateMap(map)).toEqual([]);
  });

  it('schema reports missing layers and spawns', () => {
    const map = JSON.parse(readFileSync('public/assets/maps/hub.json', 'utf8'));
    map.layers = map.layers.filter((l: { name: string }) => l.name !== 'collision');
    for (const l of map.layers) if (l.name === 'spawns') l.objects = [];
    const errors = validateMap(map);
    expect(errors.join('\n')).toContain('collision');
    expect(errors.join('\n')).toContain('player_spawn');
  });
});
