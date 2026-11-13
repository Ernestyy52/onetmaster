// Minimal schema check for Tiled isometric JSON maps used by the game.

export interface TiledProperty {
  name: string;
  type: string;
  value: string | number | boolean;
}

export interface TiledObject {
  id: number;
  name: string;
  type: string; // Tiled "class"
  x: number;
  y: number;
  width: number;
  height: number;
  point?: boolean;
  properties?: TiledProperty[];
}

export interface TiledTileLayer {
  type: 'tilelayer';
  name: string;
  width: number;
  height: number;
  data: number[];
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  id: number;
}

export interface TiledObjectLayer {
  type: 'objectgroup';
  name: string;
  objects: TiledObject[];
  visible: boolean;
  opacity: number;
  x: number;
  y: number;
  id: number;
  draworder?: string;
}

export interface TiledTileset {
  firstgid: number;
  name: string;
  image: string;
  imagewidth: number;
  imageheight: number;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  margin: number;
  spacing: number;
}

export interface TiledMap {
  type: 'map';
  orientation: 'isometric';
  renderorder: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite: boolean;
  layers: (TiledTileLayer | TiledObjectLayer)[];
  tilesets: TiledTileset[];
  version: string;
  tiledversion: string;
  nextlayerid: number;
  nextobjectid: number;
}

export const REQUIRED_TILE_LAYERS = ['ground', 'decor_below', 'collision'] as const;
export const REQUIRED_OBJECT_LAYERS = ['occluders', 'spawns', 'transitions', 'above'] as const;
export const REQUIRED_SPAWNS = ['player_spawn', 'npc_owl', 'quest_board'] as const;

export function prop<T extends string | number | boolean>(o: TiledObject, name: string): T | undefined {
  return o.properties?.find((p) => p.name === name)?.value as T | undefined;
}

export function validateMap(map: unknown, opts: { expectTile?: [number, number] } = {}): string[] {
  const errors: string[] = [];
  const m = map as Partial<TiledMap>;
  if (!m || typeof m !== 'object') return ['map is not an object'];
  if (m.orientation !== 'isometric') errors.push(`orientation must be "isometric" (got ${String(m.orientation)})`);
  if (m.infinite) errors.push('infinite maps are not supported');
  const [tw, th] = opts.expectTile ?? [64, 32];
  if (m.tilewidth !== tw || m.tileheight !== th) errors.push(`tile size must be ${tw}×${th} (got ${m.tilewidth}×${m.tileheight})`);
  if (!Array.isArray(m.layers)) return [...errors, 'layers missing'];
  if (!Array.isArray(m.tilesets) || m.tilesets.length === 0) errors.push('at least one tileset is required');

  for (const name of REQUIRED_TILE_LAYERS) {
    const layer = m.layers.find((l) => l.name === name);
    if (!layer) errors.push(`missing tile layer "${name}"`);
    else if (layer.type !== 'tilelayer') errors.push(`layer "${name}" must be a tilelayer`);
    else if (layer.data.length !== (m.width ?? 0) * (m.height ?? 0))
      errors.push(`layer "${name}" has ${layer.data.length} cells, expected ${(m.width ?? 0) * (m.height ?? 0)}`);
  }
  for (const name of REQUIRED_OBJECT_LAYERS) {
    const layer = m.layers.find((l) => l.name === name);
    if (!layer) errors.push(`missing object layer "${name}"`);
    else if (layer.type !== 'objectgroup') errors.push(`layer "${name}" must be an objectgroup`);
  }

  const spawns = m.layers.find((l): l is TiledObjectLayer => l.name === 'spawns' && l.type === 'objectgroup');
  if (spawns) {
    for (const s of REQUIRED_SPAWNS) if (!spawns.objects.some((o) => o.name === s)) errors.push(`spawns: missing "${s}"`);
  }
  const transitions = m.layers.find((l): l is TiledObjectLayer => l.name === 'transitions' && l.type === 'objectgroup');
  if (transitions) {
    for (const o of transitions.objects) {
      if (!prop(o, 'subject')) errors.push(`transition "${o.name}" missing property "subject"`);
      if (!prop(o, 'sprite')) errors.push(`transition "${o.name}" missing property "sprite"`);
    }
    for (const subj of ['thai', 'english', 'math', 'science'])
      if (!transitions.objects.some((o) => prop(o, 'subject') === subj)) errors.push(`transitions: no door for subject "${subj}"`);
  }
  const occ = m.layers.find((l): l is TiledObjectLayer => l.name === 'occluders' && l.type === 'objectgroup');
  if (occ) for (const o of occ.objects) if (!prop(o, 'sprite')) errors.push(`occluder "${o.name}" (#${o.id}) missing property "sprite"`);

  const maxGid = (m.tilesets ?? []).reduce((acc, t) => Math.max(acc, t.firstgid + t.tilecount - 1), 0);
  for (const l of m.layers) {
    if (l.type !== 'tilelayer') continue;
    const bad = l.data.find((g) => g < 0 || g > maxGid);
    if (bad !== undefined) errors.push(`layer "${l.name}" references unknown gid ${bad}`);
  }
  return errors;
}
