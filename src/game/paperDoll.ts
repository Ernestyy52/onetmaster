// Paper-doll rendering: equipment overlay sheets (public/assets/equipment/*) share the player's
// 48×64 frame grid, so each layer just copies the body's current frame, position, depth and alpha.
import Phaser from 'phaser';

export class PaperDoll {
  private layers: Phaser.GameObjects.Sprite[] = [];
  private keys: string[] = [];

  constructor(private scene: Phaser.Scene, private body: Phaser.GameObjects.Sprite) {
    // after movement, tweens and animation have updated the body this frame
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Bottom-to-top overlay texture keys (see shared/appearance.ts `equipmentLayers`). */
  setLayers(keys: string[]) {
    const valid = keys.filter((k) => this.scene.textures.exists(k));
    if (valid.join('|') === this.keys.join('|')) return;
    for (const l of this.layers) l.destroy();
    this.keys = valid;
    this.layers = valid.map((k) => this.scene.add.sprite(this.body.x, this.body.y, k, 0).setOrigin(this.body.originX, this.body.originY));
    this.sync();
  }

  get layerKeys() {
    return [...this.keys];
  }

  /** Runs every frame automatically; call directly after changing layers. */
  sync() {
    const b = this.body;
    const frame = Number(b.frame.name) || 0;
    this.layers.forEach((l, i) => {
      l.setFrame(frame);
      l.setPosition(b.x, b.y);
      l.setDepth(b.depth + 0.001 * (i + 1));
      l.setAlpha(b.alpha);
      l.setScale(b.scaleX, b.scaleY);
      l.setVisible(b.visible);
    });
  }

  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.sync, this);
    for (const l of this.layers) l.destroy();
    this.layers = [];
    this.keys = [];
  }
}
