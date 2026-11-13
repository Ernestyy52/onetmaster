import Phaser from 'phaser';
import { bus, type InteractTarget } from '../eventBus';
import { anchors } from './BootScene';
import { findPath, isoToWorld, tiledObjectToTile, worldToTile, type Pt } from '../../shared/iso';
import { prop, validateMap, type TiledMap, type TiledObject, type TiledObjectLayer, type TiledTileLayer } from '../../shared/mapSchema';
import { ENEMIES } from '../../shared/combat';
import { SUBJECTS } from '../../shared/data/catalog';
import type { SubjectId } from '../../shared/types';
import { useGame, worldInputBlocked } from '../../state/store';
import { getApi } from '../../api';

type Dir = 'down' | 'left' | 'right' | 'up';

interface Interactable {
  target: InteractTarget;
  sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  tile: Pt;
  enabled: () => boolean;
  range?: number;
}

const SPEED = 105; // world px / second
const INTERACT_RANGE = 60;

export class HubScene extends Phaser.Scene {
  private map!: TiledMap;
  private blocked = new Set<string>();
  private player!: Phaser.GameObjects.Sprite;
  private skin = 'player_swordsman';
  private facing: Dir = 'down';
  private path: Pt[] = [];
  private pendingInteract: InteractTarget | null = null;
  private interactables: Interactable[] = [];
  private nearbyId: string | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private doors = new Map<SubjectId, Phaser.GameObjects.Image>();
  private boss: Phaser.GameObjects.Sprite | null = null;
  private bossTile: Pt | null = null;
  private owlMarker!: Phaser.GameObjects.Text;
  private wisps: { sprite: Phaser.GameObjects.Sprite; home: Pt; radius: number; id: string; hiddenUntil: number }[] = [];
  private lastSavedTile = '';
  private saveTimer = 0;
  private battleSource: string | null = null;
  private clickMarker!: Phaser.GameObjects.Graphics;
  private unsub: (() => void)[] = [];

  constructor() {
    super('Hub');
  }

  create() {
    this.map = this.cache.json.get('hub') as TiledMap;
    const errors = validateMap(this.map);
    if (errors.length) {
      console.error('[map] hub.json failed validation:\n' + errors.join('\n'));
      useGame.getState().set({ error: `แผนที่ไม่ถูกต้อง: ${errors[0]}` });
    }
    this.cameras.main.setBackgroundColor('#1c2a22');
    this.drawGround();
    this.buildCollision();
    this.placeObjects();
    this.spawnPlayer();
    this.setupInput();
    this.setupCamera();
    this.refreshWorld();

    this.unsub.push(
      bus.on('world:refresh', () => this.refreshWorld()),
      bus.on('input:interact', () => this.interactNearby()),
      bus.on('battle:enter', ({ sourceId }) => this.enterBattle(sourceId)),
      bus.on('battle:exit', ({ won }) => this.exitBattle(won)),
    );
    const cleanup = () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
    this.exposeTestHooks();
    bus.emit('hub:ready');
  }

  // ───────── world building ─────────

  private layer<T extends TiledTileLayer | TiledObjectLayer>(name: string): T {
    return this.map.layers.find((l) => l.name === name) as T;
  }

  private drawGround() {
    const N = this.map.width;
    const minX = isoToWorld(0, N - 1).x - 32;
    const maxX = isoToWorld(N - 1, 0).x + 32;
    const maxY = isoToWorld(N - 1, N - 1).y + 16;
    const rt = this.add.renderTexture(minX, -16, maxX - minX, maxY + 16).setOrigin(0).setDepth(-100000);
    for (const name of ['ground', 'decor_below']) {
      const l = this.layer<TiledTileLayer>(name);
      for (let y = 0; y < l.height; y++)
        for (let x = 0; x < l.width; x++) {
          const gid = l.data[y * l.width + x];
          if (!gid) continue;
          const c = isoToWorld(x, y);
          rt.drawFrame('hub_tiles', gid - 1, c.x - 32 - minX, c.y - 16 + 16);
        }
    }
  }

  private buildCollision() {
    const l = this.layer<TiledTileLayer>('collision');
    for (let y = 0; y < l.height; y++)
      for (let x = 0; x < l.width; x++) if (l.data[y * l.width + x]) this.blocked.add(`${x},${y}`);
  }

  isBlocked = (x: number, y: number) =>
    x < 0 || y < 0 || x >= this.map.width || y >= this.map.height || this.blocked.has(`${x},${y}`);

  private objTile(o: TiledObject): Pt {
    const t = tiledObjectToTile(o.x, o.y, this.map.tileheight);
    return { x: Math.round(t.x), y: Math.round(t.y) };
  }

  private addImage(key: string, tile: Pt): Phaser.GameObjects.Image {
    const w = isoToWorld(tile.x, tile.y);
    const a = anchors.get(key) ?? { x: 0.5, y: 1 };
    const img = this.add.image(w.x, w.y, key).setOrigin(a.x, a.y);
    img.setDepth(w.y);
    return img;
  }

  private label(text: string, x: number, y: number) {
    return this.add
      .text(x, y, text, {
        fontFamily: '"Mitr", "Noto Sans Thai", sans-serif', fontSize: '11px', color: '#fff8e1',
        backgroundColor: 'rgba(29,26,43,0.75)', padding: { x: 4, y: 1 }, resolution: 3,
      })
      .setOrigin(0.5, 1)
      .setDepth(90000);
  }

  private placeObjects() {
    for (const o of this.layer<TiledObjectLayer>('occluders').objects) this.addImage(String(prop(o, 'sprite')), this.objTile(o));

    for (const o of this.layer<TiledObjectLayer>('transitions').objects) {
      const subject = prop<string>(o, 'subject') as SubjectId;
      const tile = this.objTile(o);
      const img = this.addImage(String(prop(o, 'sprite')), tile);
      this.doors.set(subject, img);
      this.label(`${SUBJECTS[subject].nameTh} · ${SUBJECTS[subject].roomName}`, img.x, img.y - 118);
      this.interactables.push({
        target: { kind: 'door', id: o.name, subject, label: `ประตู${SUBJECTS[subject].nameTh}` },
        sprite: img, tile, enabled: () => true, range: 72,
      });
    }

    for (const o of this.layer<TiledObjectLayer>('spawns').objects) {
      const tile = this.objTile(o);
      const w = isoToWorld(tile.x, tile.y);
      if (o.name === 'npc_owl') {
        const owl = this.add.sprite(w.x, w.y, 'owl').setOrigin(0.5, 0.97).setDepth(w.y);
        owl.play('owl-idle');
        this.label(String(prop(o, 'label')), w.x, w.y - 62);
        this.owlMarker = this.add.text(w.x, w.y - 92, '!', {
          fontFamily: 'monospace', fontSize: '20px', color: '#ffd23f', stroke: '#1d1a2b', strokeThickness: 4,
        }).setOrigin(0.5).setDepth(90001);
        this.tweens.add({ targets: this.owlMarker, y: w.y - 98, yoyo: true, repeat: -1, duration: 500 });
        this.interactables.push({ target: { kind: 'npc', id: 'owl', label: 'คุยกับอาจารย์ฮูก' }, sprite: owl, tile, enabled: () => true });
      } else if (o.name === 'quest_board') {
        const board = this.addImage('quest_board', tile);
        this.label(String(prop(o, 'label')), w.x, w.y - 64);
        this.interactables.push({ target: { kind: 'board', id: 'quest_board', label: 'อ่านกระดานภารกิจ' }, sprite: board, tile, enabled: () => true });
      } else if (o.type === 'enemy') {
        const s = this.add.sprite(w.x, w.y, 'wisp').setOrigin(0.5, 0.95).setDepth(w.y);
        s.play({ key: 'wisp-float', startFrame: o.id % 4 });
        const wisp = { sprite: s, home: tile, radius: Number(prop(o, 'wander') ?? 1), id: o.name, hiddenUntil: 0 };
        this.wisps.push(wisp);
        this.interactables.push({
          target: { kind: 'enemy', id: o.name, enemyId: 'fog_wisp', label: `สู้กับ${ENEMIES.fog_wisp.name}` },
          sprite: s, tile, enabled: () => s.visible,
        });
        this.time.addEvent({ delay: 1800 + (o.id % 5) * 300, loop: true, callback: () => this.wander(wisp) });
      } else if (o.type === 'boss') {
        const s = this.add.sprite(w.x, w.y, 'warden').setOrigin(0.5, 0.95).setDepth(w.y).setScale(0.8);
        s.play('warden-idle');
        this.boss = s;
        this.interactables.push({
          target: { kind: 'enemy', id: o.name, enemyId: 'gear_warden', label: `สู้กับ${ENEMIES.gear_warden.name}` },
          sprite: s, tile, enabled: () => s.visible, range: 90,
        });
        this.bossTile = tile;
      }
    }

    for (const o of this.layer<TiledObjectLayer>('above').objects) {
      const tile = tiledObjectToTile(o.x, o.y);
      const w = isoToWorld(tile.x, tile.y);
      const h = Number(prop(o, 'height') ?? 60);
      const img = this.add.image(w.x, w.y - h, String(prop(o, 'sprite'))).setDepth(100000);
      if (prop(o, 'float')) this.tweens.add({ targets: img, y: w.y - h - 6, yoyo: true, repeat: -1, duration: 1400 + (o.id % 4) * 200, ease: 'Sine.inOut' });
    }
    this.clickMarker = this.add.graphics().setDepth(-50000);
  }

  private wander(w: (typeof this.wisps)[number]) {
    if (!w.sprite.visible || !this.scene.isActive()) return;
    const tx = w.home.x + Phaser.Math.Between(-w.radius, w.radius);
    const ty = w.home.y + Phaser.Math.Between(-w.radius, w.radius);
    if (this.isBlocked(tx, ty)) return;
    const p = isoToWorld(tx, ty);
    this.tweens.add({ targets: w.sprite, x: p.x, y: p.y, duration: 1200, ease: 'Sine.inOut', onUpdate: () => w.sprite.setDepth(w.sprite.y) });
  }

  private spawnPlayer() {
    const prog = useGame.getState().progression;
    this.skin = prog?.profile?.appearance === 'mage' ? 'player_mage' : 'player_swordsman';
    const spawn = this.layer<TiledObjectLayer>('spawns').objects.find((o) => o.name === 'player_spawn')!;
    let tile = this.objTile(spawn);
    const last = prog?.lastPosition;
    if (last && !this.isBlocked(last.tx, last.ty)) tile = { x: last.tx, y: last.ty };
    const w = isoToWorld(tile.x, tile.y);
    this.player = this.add.sprite(w.x, w.y, this.skin).setOrigin(0.5, 0.94);
    this.player.play(`${this.skin}-idle-down`);
  }

  // ───────── input ─────────

  private setupInput() {
    const kb = this.input.keyboard!;
    // enableCapture=false so typing "w" in the nickname field still works.
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT', false) as Record<string, Phaser.Input.Keyboard.Key>;
    this.input.on(Phaser.Input.Events.POINTER_UP, (p: Phaser.Input.Pointer) => {
      if (worldInputBlocked()) return;
      if (p.getDistance() > 10 && p.getDuration() > 250) return; // a drag, not a tap
      const wp = this.cameras.main.getWorldPoint(p.x, p.y);
      const hit = this.interactables.find((i) => i.enabled() && i.sprite.getBounds().contains(wp.x, wp.y));
      if (hit) {
        this.walkToInteract(hit);
        return;
      }
      const t = worldToTile(wp.x, wp.y);
      this.walkTo(t);
    });
  }

  private walkTo(goal: Pt): boolean {
    const start = this.playerTile();
    const path = findPath(start, goal, this.map.width, this.map.height, this.isBlocked);
    this.pendingInteract = null;
    if (!path) return false;
    this.path = path;
    this.flashMarker(goal);
    return true;
  }

  private walkToInteract(i: Interactable) {
    if (this.distanceTo(i) <= (i.range ?? INTERACT_RANGE)) {
      bus.emit('hub:interact', i.target);
      return;
    }
    const start = this.playerTile();
    const candidates: Pt[] = [];
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) if (dx || dy) candidates.push({ x: i.tile.x + dx, y: i.tile.y + dy });
    candidates.sort((a, b) => Math.hypot(a.x - start.x, a.y - start.y) - Math.hypot(b.x - start.x, b.y - start.y));
    for (const c of candidates) {
      if (this.isBlocked(c.x, c.y)) continue;
      const path = findPath(start, c, this.map.width, this.map.height, this.isBlocked);
      if (path) {
        this.path = path;
        this.pendingInteract = i.target;
        this.flashMarker(c);
        return;
      }
    }
  }

  private flashMarker(t: Pt) {
    const c = isoToWorld(t.x, t.y);
    this.clickMarker.clear().lineStyle(2, 0xfff1b8, 1);
    this.clickMarker.strokePoints([new Phaser.Math.Vector2(c.x, c.y - 14), new Phaser.Math.Vector2(c.x + 28, c.y), new Phaser.Math.Vector2(c.x, c.y + 14), new Phaser.Math.Vector2(c.x - 28, c.y)], true);
    this.clickMarker.setAlpha(1);
    this.tweens.add({ targets: this.clickMarker, alpha: 0, duration: 700 });
  }

  private playerTile(): Pt {
    return worldToTile(this.player.x, this.player.y);
  }

  private distanceTo(i: Interactable) {
    return Phaser.Math.Distance.Between(this.player.x, this.player.y, i.sprite.x, i.sprite.y);
  }

  private interactNearby() {
    if (worldInputBlocked()) return;
    const near = this.findNearby();
    if (near) bus.emit('hub:interact', near.target);
  }

  private findNearby(): Interactable | null {
    let best: Interactable | null = null;
    let bestD = Infinity;
    for (const i of this.interactables) {
      if (!i.enabled()) continue;
      const d = this.distanceTo(i);
      if (d <= (i.range ?? INTERACT_RANGE) && d < bestD) {
        best = i;
        bestD = d;
      }
    }
    return best;
  }

  // ───────── camera / resize ─────────

  private setupCamera() {
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.18, 0.18);
    cam.setRoundPixels(true);
    const N = this.map.width;
    const minX = isoToWorld(0, N - 1).x - 96;
    const maxX = isoToWorld(N - 1, 0).x + 96;
    cam.setBounds(minX, -200, maxX - minX, isoToWorld(N - 1, N - 1).y + 300);
    const fit = () => cam.setZoom(HubScene.zoomFor(this.scale.width, this.scale.height));
    fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, fit);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.scale.off(Phaser.Scale.Events.RESIZE, fit));
  }

  static zoomFor(w: number, h: number) {
    const z = Math.floor(Math.min(w / 380, h / 300) * 2) / 2;
    return Phaser.Math.Clamp(z, 1, 3);
  }

  // ───────── state sync ─────────

  private refreshWorld() {
    const prog = useGame.getState().progression;
    if (!prog) return;
    const story = prog.story;
    const math = this.doors.get('math');
    if (math) math.setTexture(story.flags.door_math_open ? 'door_math_open' : 'door_math');
    if (this.boss && this.bossTile) {
      const show = story.quests.q_math_door === 'active';
      this.boss.setVisible(show);
      const k = `${this.bossTile.x},${this.bossTile.y}`;
      if (show) this.blocked.add(k);
      else this.blocked.delete(k);
    }
    const owlHasNews =
      story.quests.q_meet_owl === 'available' || story.quests.q_clear_fog === 'available' || story.quests.q_math_door === 'available';
    this.owlMarker?.setVisible(owlHasNews);
    const skin = prog.profile?.appearance === 'mage' ? 'player_mage' : 'player_swordsman';
    if (skin !== this.skin) {
      this.skin = skin;
      this.player.setTexture(skin);
      this.player.play(`${skin}-idle-${this.facing}`);
    }
  }

  private enterBattle(sourceId: string | null) {
    this.battleSource = sourceId;
    this.path = [];
    this.pendingInteract = null;
    this.scene.launch('Battle');
    this.scene.sleep();
  }

  private exitBattle(won: boolean) {
    this.scene.stop('Battle');
    this.scene.wake();
    if (won && this.battleSource) {
      const w = this.wisps.find((x) => x.id === this.battleSource);
      if (w) {
        w.sprite.setVisible(false);
        w.hiddenUntil = this.time.now + 25000;
      }
    }
    this.battleSource = null;
    this.refreshWorld();
  }

  // ───────── per frame ─────────

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    for (const w of this.wisps) {
      if (!w.sprite.visible && w.hiddenUntil && this.time.now > w.hiddenUntil) {
        const p = isoToWorld(w.home.x, w.home.y);
        w.sprite.setPosition(p.x, p.y).setVisible(true);
        w.hiddenUntil = 0;
      }
    }
    if (worldInputBlocked()) {
      this.path = [];
      this.setAnim(false);
      this.updateNearby();
      return;
    }

    let vx = 0;
    let vy = 0;
    const k = this.keys;
    if (k.A.isDown || k.LEFT.isDown) vx -= 1;
    if (k.D.isDown || k.RIGHT.isDown) vx += 1;
    if (k.W.isDown || k.UP.isDown) vy -= 1;
    if (k.S.isDown || k.DOWN.isDown) vy += 1;
    const joy = useGame.getState().joystick;
    if (Math.hypot(joy.x, joy.y) > 0.2) {
      vx = joy.x;
      vy = joy.y;
    }

    if (vx || vy) {
      this.path = [];
      this.pendingInteract = null;
      const len = Math.hypot(vx, vy);
      const mag = Math.min(1, len);
      this.move((vx / len) * SPEED * mag * dt, (vy / len) * SPEED * mag * 0.75 * dt);
    } else if (this.path.length) {
      const next = isoToWorld(this.path[0].x, this.path[0].y);
      const dx = next.x - this.player.x;
      const dy = next.y - this.player.y;
      const d = Math.hypot(dx, dy);
      const step = SPEED * dt;
      if (d <= step) {
        this.player.setPosition(next.x, next.y);
        this.path.shift();
        this.face(dx, dy);
        if (!this.path.length && this.pendingInteract) {
          const t = this.pendingInteract;
          this.pendingInteract = null;
          bus.emit('hub:interact', t);
        }
      } else {
        this.player.x += (dx / d) * step;
        this.player.y += (dy / d) * step;
        this.face(dx, dy);
      }
      this.setAnim(true);
    } else {
      this.setAnim(false);
    }
    this.player.setDepth(this.player.y);
    this.updateNearby();
    this.maybeSavePosition(deltaMs);
  }

  private move(dx: number, dy: number) {
    const tryAt = (x: number, y: number) => {
      const t = worldToTile(x, y);
      return !this.isBlocked(t.x, t.y);
    };
    const nx = this.player.x + dx;
    const ny = this.player.y + dy;
    if (tryAt(nx, ny)) this.player.setPosition(nx, ny);
    else if (tryAt(nx, this.player.y)) this.player.x = nx;
    else if (tryAt(this.player.x, ny)) this.player.y = ny;
    this.face(dx, dy);
    this.setAnim(true);
  }

  private face(dx: number, dy: number) {
    if (Math.abs(dx) < 0.001 && Math.abs(dy) < 0.001) return;
    this.facing = Math.abs(dx) > Math.abs(dy) * 1.2 ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'up' : 'down';
  }

  private setAnim(walking: boolean) {
    const key = `${this.skin}-${walking ? 'walk' : 'idle'}-${this.facing}`;
    if (this.player.anims.currentAnim?.key !== key) this.player.play(key);
  }

  private updateNearby() {
    const near = worldInputBlocked() && useGame.getState().screen !== 'hub' ? null : this.findNearby();
    const id = near ? near.target.id : null;
    if (id !== this.nearbyId) {
      this.nearbyId = id;
      bus.emit('hub:nearby', near ? near.target : null);
    }
  }

  private maybeSavePosition(deltaMs: number) {
    this.saveTimer += deltaMs;
    if (this.saveTimer < 2000) return;
    this.saveTimer = 0;
    const t = this.playerTile();
    const key = `${t.x},${t.y}`;
    if (key !== this.lastSavedTile) {
      this.lastSavedTile = key;
      void getApi().savePosition(t.x, t.y);
    }
  }

  /** Test-only hooks (enabled in dev or with ?test=1). */
  private exposeTestHooks() {
    if (!(import.meta.env.DEV || new URLSearchParams(location.search).has('test'))) return;
    const w = window as unknown as { __hub?: unknown };
    w.__hub = {
      teleport: (tx: number, ty: number) => {
        const p = isoToWorld(tx, ty);
        this.player.setPosition(p.x, p.y);
        this.path = [];
      },
      /** place the player on a free tile next to an interactable's current position */
      teleportTo: (name: string) => {
        const i = this.interactables.find((x) => x.target.id === name);
        if (!i) return false;
        const t = worldToTile(i.sprite.x, i.sprite.y);
        for (const [dx, dy] of [[1, 1], [0, 1], [1, 0], [-1, 1], [1, -1], [-1, 0], [0, -1], [-1, -1]]) {
          if (this.isBlocked(t.x + dx, t.y + dy)) continue;
          const p = isoToWorld(t.x + dx, t.y + dy);
          this.player.setPosition(p.x, p.y);
          this.path = [];
          return true;
        }
        return false;
      },
      tileOf: (name: string) => {
        const i = this.interactables.find((x) => x.target.id === name);
        return i ? i.tile : null;
      },
      playerTile: () => this.playerTile(),
      isBlocked: (x: number, y: number) => this.isBlocked(x, y),
      screenOf: (name: string) => {
        const i = this.interactables.find((x) => x.target.id === name);
        if (!i) return null;
        const cam = this.cameras.main;
        return { x: (i.sprite.x - cam.worldView.x) * cam.zoom, y: (i.sprite.y - 10 - cam.worldView.y) * cam.zoom };
      },
    };
  }
}
