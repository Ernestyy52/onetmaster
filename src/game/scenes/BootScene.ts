import Phaser from 'phaser';
import { PLAYER_SPRITES } from '../../shared/appearance';

export interface ManifestEntry {
  key: string;
  file: string;
  category: string;
  frameWidth?: number;
  frameHeight?: number;
  anchor?: { x: number; y: number };
  status: 'placeholder' | 'final';
}

export const anchors = new Map<string, { x: number; y: number }>();

const DIR_ROWS = ['down', 'left', 'right', 'up'] as const;

/** Loads public/assets/manifest.json first, then every asset it lists. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    this.load.json('manifest', 'assets/manifest.json');
  }

  create() {
    const manifest = this.cache.json.get('manifest') as { assets: ManifestEntry[] };
    for (const a of manifest.assets) {
      const url = `assets/${a.file}`;
      if (a.anchor) anchors.set(a.key, a.anchor);
      if (a.category === 'map') this.load.json(a.key, url);
      else if (a.frameWidth && a.frameHeight)
        this.load.spritesheet(a.key, url, { frameWidth: a.frameWidth, frameHeight: a.frameHeight });
      else this.load.image(a.key, url);
    }
    this.load.once(Phaser.Loader.Events.COMPLETE, () => {
      this.createAnimations();
      this.scene.start('Hub');
    });
    this.load.start();
  }

  private createAnimations() {
    for (const skin of PLAYER_SPRITES) {
      DIR_ROWS.forEach((dir, row) => {
        const f = (i: number) => row * 10 + i;
        const frames = (ids: number[]) => ids.map((i) => ({ key: skin, frame: f(i) }));
        this.anims.create({ key: `${skin}-idle-${dir}`, frames: frames([0, 1]), frameRate: 2, repeat: -1 });
        this.anims.create({ key: `${skin}-walk-${dir}`, frames: frames([2, 3, 4, 5]), frameRate: 9, repeat: -1 });
        this.anims.create({ key: `${skin}-attack-${dir}`, frames: frames([6, 7]), frameRate: 10, repeat: 0 });
        this.anims.create({ key: `${skin}-hurt-${dir}`, frames: frames([8]), frameRate: 1, repeat: 0 });
        this.anims.create({ key: `${skin}-victory-${dir}`, frames: frames([9]), frameRate: 1, repeat: 0 });
      });
    }
    this.anims.create({ key: 'owl-idle', frames: this.anims.generateFrameNumbers('owl', { frames: [0, 0, 0, 0, 0, 1] }), frameRate: 3, repeat: -1 });
    this.anims.create({ key: 'wisp-float', frames: this.anims.generateFrameNumbers('wisp', { start: 0, end: 3 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'warden-idle', frames: this.anims.generateFrameNumbers('warden', { frames: [0, 1] }), frameRate: 2, repeat: -1 });
    this.anims.create({ key: 'fx-hit', frames: this.anims.generateFrameNumbers('fx_hit', { start: 0, end: 3 }), frameRate: 16, repeat: 0, hideOnComplete: true });
  }
}
