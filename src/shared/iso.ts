// Isometric helpers. Tile (tx, ty) is a 64×32 diamond whose CENTRE sits at isoToWorld(tx, ty).
export const TILE_W = 64;
export const TILE_H = 32;

export interface Pt {
  x: number;
  y: number;
}

export function isoToWorld(tx: number, ty: number): Pt {
  return { x: (tx - ty) * (TILE_W / 2), y: (tx + ty) * (TILE_H / 2) };
}

/** Fractional tile coordinates for a world point. */
export function worldToIsoF(x: number, y: number): Pt {
  const u = x / (TILE_W / 2);
  const v = y / (TILE_H / 2);
  return { x: (u + v) / 2, y: (v - u) / 2 };
}

/** Integer tile containing a world point (diamond-exact). */
export function worldToTile(x: number, y: number): Pt {
  const f = worldToIsoF(x, y);
  return { x: Math.round(f.x) + 0, y: Math.round(f.y) + 0 }; // +0 normalises -0
}

/**
 * Tiled isometric object coordinates are measured in "tile-height pixels" along both iso
 * axes, with (0,0) at the top corner of tile (0,0). Convert to our tile-centre convention.
 */
export function tiledObjectToTile(objX: number, objY: number, tileHeight = TILE_H): Pt {
  return { x: objX / tileHeight - 0.5, y: objY / tileHeight - 0.5 };
}

export function tileToTiledObject(tx: number, ty: number, tileHeight = TILE_H): Pt {
  return { x: (tx + 0.5) * tileHeight, y: (ty + 0.5) * tileHeight };
}

/** 8-way A* on a tile grid without corner cutting. Returns tiles from start (exclusive) to goal. */
export function findPath(
  start: Pt,
  goal: Pt,
  width: number,
  height: number,
  blocked: (x: number, y: number) => boolean,
  maxNodes = 4000,
): Pt[] | null {
  const key = (x: number, y: number) => y * width + x;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height;
  if (!inside(goal.x, goal.y) || blocked(goal.x, goal.y)) return null;
  const open: { x: number; y: number; f: number }[] = [{ ...start, f: 0 }];
  const g = new Map<number, number>([[key(start.x, start.y), 0]]);
  const came = new Map<number, number>();
  const h = (x: number, y: number) => {
    const dx = Math.abs(x - goal.x);
    const dy = Math.abs(y - goal.y);
    return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
  };
  let expanded = 0;
  while (open.length && expanded++ < maxNodes) {
    open.sort((a, b) => a.f - b.f);
    const cur = open.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) {
      const path: Pt[] = [];
      let k = key(cur.x, cur.y);
      while (k !== key(start.x, start.y)) {
        path.unshift({ x: k % width, y: Math.floor(k / width) });
        k = came.get(k)!;
      }
      return path;
    }
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        if (!dx && !dy) continue;
        const nx = cur.x + dx;
        const ny = cur.y + dy;
        if (!inside(nx, ny) || blocked(nx, ny)) continue;
        if (dx && dy && (blocked(cur.x + dx, cur.y) || blocked(cur.x, cur.y + dy))) continue;
        const cost = (g.get(key(cur.x, cur.y)) ?? 0) + (dx && dy ? Math.SQRT2 : 1);
        const nk = key(nx, ny);
        if (cost < (g.get(nk) ?? Infinity)) {
          g.set(nk, cost);
          came.set(nk, key(cur.x, cur.y));
          const existing = open.find((o) => o.x === nx && o.y === ny);
          if (existing) existing.f = cost + h(nx, ny);
          else open.push({ x: nx, y: ny, f: cost + h(nx, ny) });
        }
      }
    }
  }
  return null;
}
