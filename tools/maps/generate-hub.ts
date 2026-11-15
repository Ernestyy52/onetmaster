// Generates public/assets/maps/hub.json — a Tiled-compatible isometric map of the central hall.
// After the first generation the file can be opened and edited in Tiled directly.
import { writeFileSync } from 'node:fs';
import { tileToTiledObject } from '../../src/shared/iso';
import type { TiledMap, TiledObject, TiledObjectLayer, TiledProperty, TiledTileLayer } from '../../src/shared/mapSchema';
import { validateMap } from '../../src/shared/mapSchema';
import { rng } from '../assets/pixel';

const N = 23;
const C = 11;
const G = { grass: 1, flowers: 2, plaza: 3, plazaDark: 4, path: 5, thai: 6, english: 7, math: 8, science: 9, collision: 12, seal0: 13 };

const r = rng(2569);
const ground = new Array(N * N).fill(0);
const decor = new Array(N * N).fill(0);
const collision = new Array(N * N).fill(0);
const idx = (x: number, y: number) => y * N + x;

for (let y = 0; y < N; y++)
  for (let x = 0; x < N; x++) {
    const d = Math.abs(x - C) + Math.abs(y - C);
    let g: number = r() < 0.12 ? G.flowers : G.grass;
    if (Math.abs(x - C) <= 1 || Math.abs(y - C) <= 1) g = G.path;
    if (d <= 5) g = d === 5 ? G.plazaDark : G.plaza;
    ground[idx(x, y)] = g;
    if (x === 0 || y === 0 || x === N - 1 || y === N - 1) collision[idx(x, y)] = G.collision;
  }
// Coloured tiles in front of each door
const DOORS = [
  { subject: 'math', at: [C, 1], front: [C, 2], gid: G.math },
  { subject: 'thai', at: [1, C], front: [2, C], gid: G.thai },
  { subject: 'science', at: [N - 2, C], front: [N - 3, C], gid: G.science },
  { subject: 'english', at: [C, N - 2], front: [C, N - 3], gid: G.english },
] as const;
for (const d of DOORS) {
  ground[idx(d.front[0], d.front[1])] = d.gid;
  collision[idx(d.at[0], d.at[1])] = G.collision;
  // walls either side of each door
  for (const off of [-1, 1]) {
    const wx = d.at[0] === C ? C + off : d.at[0];
    const wy = d.at[1] === C ? C + off : d.at[1];
    collision[idx(wx, wy)] = G.collision;
  }
}
// Seal (3×3) in decor_below
for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) decor[idx(C - 1 + i, C - 1 + j)] = G.seal0 + j * 3 + i;

let nextId = 1;
const p = (name: string, value: string | number | boolean): TiledProperty => ({
  name, type: typeof value === 'number' ? 'int' : typeof value === 'boolean' ? 'bool' : 'string', value,
});
function obj(name: string, type: string, tx: number, ty: number, props: TiledProperty[]): TiledObject {
  const o = tileToTiledObject(tx, ty);
  return { id: nextId++, name, type, x: o.x, y: o.y, width: 0, height: 0, point: true, properties: props };
}

const occluders: TiledObject[] = [];
const blockTile = (x: number, y: number) => (collision[idx(x, y)] = G.collision);
const isRoad = (x: number, y: number) => Math.abs(x - C) <= 2 || Math.abs(y - C) <= 2;

// Tree line just inside the boundary, leaving the roads open.
for (let i = 1; i < N - 1; i++) {
  for (const [x, y] of [[i, 1], [1, i], [i, N - 2], [N - 2, i]] as [number, number][]) {
    if (isRoad(x, y) || (i % 2 === 0 && !(x === 1 && y === 1))) continue;
    if (occluders.some((o) => o.name === `tree_${x}_${y}`)) continue; // corners are visited by two edges
    occluders.push(obj(`tree_${x}_${y}`, 'prop', x, y, [p('sprite', (x + y) % 4 === 0 ? 'tree_round' : 'tree'), p('collide', true)]));
    blockTile(x, y);
  }
}
// Scattered trees and bushes in the four grass quadrants
const scatter: [number, number, string][] = [
  [4, 4, 'tree'], [6, 3, 'tree_round'], [3, 6, 'bush'], [17, 4, 'tree_round'], [19, 6, 'tree'], [16, 3, 'bush'],
  [4, 18, 'tree'], [3, 16, 'bush'], [6, 19, 'tree_round'], [18, 18, 'tree'], [16, 19, 'bush'], [19, 16, 'tree_round'],
  [7, 5, 'bush'], [15, 17, 'bush'],
];
for (const [x, y, sprite] of scatter) {
  occluders.push(obj(`${sprite}_${x}_${y}`, 'prop', x, y, [p('sprite', sprite), p('collide', true)]));
  blockTile(x, y);
}
for (const [x, y] of [[7, 7], [15, 7], [7, 15], [15, 15]]) {
  occluders.push(obj(`pillar_${x}_${y}`, 'prop', x, y, [p('sprite', 'pillar'), p('collide', true)]));
  blockTile(x, y);
}
for (const [x, y] of [[13, 4], [9, 4], [4, 9], [4, 13], [18, 9], [18, 13], [9, 18], [13, 18]]) {
  occluders.push(obj(`lamp_${x}_${y}`, 'prop', x, y, [p('sprite', 'lamp'), p('collide', true)]));
  blockTile(x, y);
}

const spawns: TiledObject[] = [
  obj('player_spawn', 'spawn', C + 1, C + 1, []),
  obj('npc_owl', 'npc', C + 2, C - 2, [p('sprite', 'owl'), p('label', 'อาจารย์ฮูก'), p('collide', true)]),
  obj('quest_board', 'board', C - 2, C - 2, [p('sprite', 'quest_board'), p('label', 'กระดานภารกิจ'), p('collide', true)]),
  obj('enemy_fog_1', 'enemy', 6, 15, [p('enemy', 'fog_wisp'), p('wander', 2)]),
  obj('enemy_fog_2', 'enemy', 16, 8, [p('enemy', 'fog_wisp'), p('wander', 2)]),
  obj('enemy_fog_3', 'enemy', 15, 14, [p('enemy', 'fog_wisp'), p('wander', 1)]),
  obj('boss_gear_warden', 'boss', C, 4, [p('enemy', 'gear_warden'), p('requires_quest', 'q_math_door')]),
];
blockTile(C + 2, C - 2);
blockTile(C - 2, C - 2);

const transitions: TiledObject[] = DOORS.map((d) =>
  obj(`door_${d.subject}`, 'door', d.at[0], d.at[1], [p('subject', d.subject), p('sprite', `door_${d.subject}`), p('target_scene', `room_${d.subject}`)]),
);

const above: TiledObject[] = [
  [5, 10], [17, 12], [10, 17], [12, 5], [8, 12],
].map(([x, y]) => obj(`lantern_${x}_${y}`, 'decor', x, y, [p('sprite', 'floating_lantern'), p('float', true), p('height', 70)]));

const tileLayer = (id: number, name: string, data: number[], visible = true): TiledTileLayer => ({
  id, name, type: 'tilelayer', width: N, height: N, data, visible, opacity: 1, x: 0, y: 0,
});
const objLayer = (id: number, name: string, objects: TiledObject[]): TiledObjectLayer => ({
  id, name, type: 'objectgroup', objects, visible: true, opacity: 1, x: 0, y: 0, draworder: 'topdown',
});

const map: TiledMap = {
  type: 'map', version: '1.10', tiledversion: '1.11.0', orientation: 'isometric', renderorder: 'right-down',
  width: N, height: N, tilewidth: 64, tileheight: 32, infinite: false,
  tilesets: [{
    firstgid: 1, name: 'hub_tiles', image: '../tilesets/hub_tiles.png', imagewidth: 1344, imageheight: 32,
    tilewidth: 64, tileheight: 32, tilecount: 21, columns: 21, margin: 0, spacing: 0,
  }],
  layers: [
    tileLayer(1, 'ground', ground),
    tileLayer(2, 'decor_below', decor),
    tileLayer(3, 'collision', collision, false),
    objLayer(4, 'occluders', occluders),
    objLayer(5, 'spawns', spawns),
    objLayer(6, 'transitions', transitions),
    objLayer(7, 'above', above),
  ],
  nextlayerid: 8,
  nextobjectid: nextId,
};

const errors = validateMap(map);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
writeFileSync('public/assets/maps/hub.json', JSON.stringify(map));
console.log(`hub.json: ${N}×${N}, ${occluders.length} props, ${spawns.length} spawns`);
