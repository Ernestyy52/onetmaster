import { describe, expect, it } from 'vitest';
import { applyAction, applyAnswer, createCombat, ENEMIES } from '../../src/shared/combat';
import { findPath, isoToWorld, tiledObjectToTile, tileToTiledObject, worldToTile } from '../../src/shared/iso';
import { levelForXp, masteryLevel, newMastery, questionXp, recordMastery, statsForLevel, xpToReach } from '../../src/shared/progression';

describe('progression', () => {
  it('levels follow the XP curve', () => {
    expect(xpToReach(1)).toBe(0);
    expect(xpToReach(2)).toBe(50);
    expect(xpToReach(3)).toBe(120);
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(49)).toBe(1);
    expect(levelForXp(50)).toBe(2);
    expect(levelForXp(125)).toBe(3);
  });

  it('repeating a variant family pays less XP (anti-farming) and hints halve it', () => {
    expect(questionXp(10, 0, false)).toBe(10);
    expect(questionXp(10, 1, false)).toBeLessThan(10);
    expect(questionXp(10, 10, false)).toBe(3); // floor 25%
    expect(questionXp(10, 0, true)).toBe(5);
  });

  it('stats flatten after the soft cap', () => {
    const gain5560 = statsForLevel(60).atk - statsForLevel(55).atk;
    const gain6065 = statsForLevel(65).atk - statsForLevel(60).atk;
    expect(gain6065).toBeLessThan(gain5560);
  });

  it('mastery: independent only after two different families without hints', () => {
    let m = newMastery('math.x', 'math');
    m = recordMastery(m, { correct: false, usedHint: false, familyId: 'a' });
    expect(m.level).toBe('practising');
    m = recordMastery(m, { correct: true, usedHint: true, familyId: 'a' });
    expect(m.level).toBe('with_hint');
    m = recordMastery(m, { correct: true, usedHint: false, familyId: 'a' });
    m = recordMastery(m, { correct: true, usedHint: false, familyId: 'a' });
    expect(m.level).toBe('with_hint');
    m = recordMastery(m, { correct: true, usedHint: false, familyId: 'b' });
    expect(masteryLevel(m)).toBe('independent');
  });
});

describe('combat', () => {
  const player = { maxHp: 60, hp: 60, atk: 12, def: 0, maxFocus: 3 };

  it('a correct answer gives a focus point; a wrong one does not block the turn', () => {
    const s = createCombat(ENEMIES.gear_warden, player);
    expect(s.phase).toBe('question');
    expect(s.enemyShield).toBe(true);
    const ok = applyAnswer(s, true).state;
    expect(ok.focus).toBe(1);
    expect(ok.phase).toBe('command');
    const bad = applyAnswer(s, false).state;
    expect(bad.focus).toBe(0);
    expect(bad.phase).toBe('command');
  });

  it('pierce breaks the shield and the next attack deals double damage', () => {
    let s = applyAnswer(createCombat(ENEMIES.gear_warden, player), true).state;
    s = applyAction(s, 'pierce', ENEMIES.gear_warden, player, 0).state;
    expect(s.weakPoint).toBe(true);
    const hpBefore = s.enemyHp;
    s = applyAnswer(s, false).state; // turn 2 is a question turn
    const out = applyAction(s, 'attack', ENEMIES.gear_warden, player, 0);
    expect(hpBefore - out.state.enemyHp).toBe(24);
    expect(out.events.some((e) => e.type === 'player_attack' && e.doubled)).toBe(true);
  });

  it('shield fully blocks the boss beam', () => {
    let s = applyAnswer(createCombat(ENEMIES.gear_warden, player), true).state;
    s = applyAction(s, 'defend', ENEMIES.gear_warden, player, 0).state; // turn 1: charge
    expect(s.intent).toBe('beam');
    s = applyAnswer(s, true).state;
    const out = applyAction(s, 'shield', ENEMIES.gear_warden, player, 0);
    const hit = out.events.find((e) => e.type === 'enemy_attack');
    expect(hit && hit.type === 'enemy_attack' && hit.damage).toBe(0);
  });

  it('cannot use a skill without focus', () => {
    const s = applyAnswer(createCombat(ENEMIES.fog_wisp, player), false).state;
    expect(() => applyAction(s, 'pierce', ENEMIES.fog_wisp, player, 0)).toThrow();
  });
});

describe('iso helpers', () => {
  it('world ↔ tile round-trips at tile centres', () => {
    for (const [x, y] of [[0, 0], [5, 3], [11, 11], [22, 0]]) {
      const w = isoToWorld(x, y);
      expect(worldToTile(w.x, w.y)).toEqual({ x, y });
      expect(worldToTile(w.x + 20, w.y + 5)).toEqual({ x, y }); // still inside the diamond
    }
  });

  it('Tiled object coordinates convert to tile coordinates', () => {
    const o = tileToTiledObject(4, 7);
    expect(tiledObjectToTile(o.x, o.y)).toEqual({ x: 4, y: 7 });
  });

  it('A* routes around walls without cutting corners', () => {
    const wall = new Set(['2,0', '2,1', '2,2', '2,3']);
    const path = findPath({ x: 0, y: 0 }, { x: 4, y: 0 }, 6, 6, (x, y) => wall.has(`${x},${y}`))!;
    expect(path.at(-1)).toEqual({ x: 4, y: 0 });
    expect(path.some((p) => wall.has(`${p.x},${p.y}`))).toBe(false);
    expect(findPath({ x: 0, y: 0 }, { x: 2, y: 1 }, 6, 6, (x, y) => wall.has(`${x},${y}`))).toBeNull();
  });
});
