// Tiny pixel canvas for generating placeholder art as PNG files.
import { PNG } from 'pngjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type RGBA = [number, number, number, number];

export function hex(h: string, a = 255): RGBA {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, a];
}

export function shade(c: RGBA, f: number): RGBA {
  const t = f > 0 ? 255 : 0;
  const k = Math.abs(f);
  return [Math.round(c[0] + (t - c[0]) * k), Math.round(c[1] + (t - c[1]) * k), Math.round(c[2] + (t - c[2]) * k), c[3]];
}

export function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Canvas {
  data: Uint8Array;
  constructor(public w: number, public h: number) {
    this.data = new Uint8Array(w * h * 4);
  }
  get(x: number, y: number): RGBA {
    const i = (y * this.w + x) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  px(x: number, y: number, c: RGBA) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || c[3] === 0) return;
    const i = (y * this.w + x) * 4;
    if (c[3] === 255) {
      this.data.set(c, i);
      return;
    }
    const a = c[3] / 255;
    const ea = this.data[i + 3] / 255;
    const oa = a + ea * (1 - a);
    for (let k = 0; k < 3; k++) this.data[i + k] = Math.round((c[k] * a + this.data[i + k] * ea * (1 - a)) / (oa || 1));
    this.data[i + 3] = Math.round(oa * 255);
  }
  rect(x: number, y: number, w: number, h: number, c: RGBA) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.px(x + i, y + j, c);
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: RGBA) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++)
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.px(x, y, c);
      }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGBA) {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
    for (let i = 0; i <= steps; i++) this.px(x0 + ((x1 - x0) * i) / steps, y0 + ((y1 - y0) * i) / steps, c);
  }
  /** Iso diamond centred at (cx, cy) with half sizes hw, hh. */
  diamond(cx: number, cy: number, hw: number, hh: number, fill: (x: number, y: number, edge: 'tl' | 'tr' | 'bl' | 'br' | null) => RGBA) {
    for (let y = -hh; y < hh; y++) {
      const fy = y + 0.5;
      const span = hw * (1 - Math.abs(fy) / hh);
      for (let x = -Math.floor(span); x < Math.ceil(span); x++) {
        const fx = x + 0.5;
        const d = Math.abs(fx) / hw + Math.abs(fy) / hh;
        let edge: 'tl' | 'tr' | 'bl' | 'br' | null = null;
        if (d > 0.9) edge = fy < 0 ? (fx < 0 ? 'tl' : 'tr') : fx < 0 ? 'bl' : 'br';
        this.px(cx + x, cy + y, fill(x, y, edge));
      }
    }
  }
  /** Draw an ASCII bitmap; each char maps to a colour in `pal` ('.' / ' ' = transparent). */
  bitmap(x: number, y: number, rows: string[], pal: Record<string, RGBA>, scale = 1) {
    rows.forEach((row, j) =>
      [...row].forEach((ch, i) => {
        const c = pal[ch];
        if (c) this.rect(x + i * scale, y + j * scale, scale, scale, c);
      }),
    );
  }
  /** Add a 1px outline around opaque pixels inside the given region. */
  outline(c: RGBA, x0 = 0, y0 = 0, w = this.w, h = this.h) {
    const marks: [number, number][] = [];
    for (let y = y0; y < y0 + h; y++)
      for (let x = x0; x < x0 + w; x++) {
        if (this.get(x, y)[3] !== 0) continue;
        const n = [
          [1, 0], [-1, 0], [0, 1], [0, -1],
        ].some(([dx, dy]) => {
          const nx = x + dx;
          const ny = y + dy;
          return nx >= x0 && ny >= y0 && nx < x0 + w && ny < y0 + h && this.get(nx, ny)[3] > 128;
        });
        if (n) marks.push([x, y]);
      }
    for (const [x, y] of marks) this.px(x, y, c);
  }
  blit(src: Canvas, dx: number, dy: number) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) this.px(dx + x, dy + y, src.get(x, y));
  }
  save(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    const png = new PNG({ width: this.w, height: this.h });
    png.data = Buffer.from(this.data);
    writeFileSync(path, PNG.sync.write(png));
  }
}
