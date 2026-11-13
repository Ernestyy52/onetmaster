import Phaser from 'phaser';
import { bus } from '../eventBus';
import { isoToWorld } from '../../shared/iso';
import { ENEMIES, type CombatEvent, type CombatState } from '../../shared/combat';
import { SUBJECTS } from '../../shared/data/catalog';
import { useGame } from '../../state/store';

/** Battle arena visuals. Rules live in the API; this scene only animates results. */
export class BattleScene extends Phaser.Scene {
  private player!: Phaser.GameObjects.Sprite;
  private enemy!: Phaser.GameObjects.Sprite;
  private shield!: Phaser.GameObjects.Ellipse;
  private weak!: Phaser.GameObjects.Text;
  private chargeGlow!: Phaser.GameObjects.Ellipse;
  private skin = 'player_swordsman';
  private enemyKey = 'wisp';
  private playerHome = { x: 0, y: 0 };
  private enemyHome = { x: 0, y: 0 };
  private unsub: (() => void)[] = [];

  constructor() {
    super('Battle');
  }

  create() {
    const { run, progression } = useGame.getState();
    const enemyDef = ENEMIES[run?.enemyId ?? 'fog_wisp'];
    this.skin = progression?.profile?.appearance === 'mage' ? 'player_mage' : 'player_swordsman';
    this.enemyKey = enemyDef.sprite;
    const color = Phaser.Display.Color.HexStringToColor(SUBJECTS[enemyDef.subjects[0]].color).color;

    this.cameras.main.setBackgroundColor('#211b35');
    // backdrop stars
    const g = this.add.graphics();
    for (let i = 0; i < 80; i++) {
      g.fillStyle(0xffffff, Phaser.Math.FloatBetween(0.1, 0.5));
      g.fillRect(Phaser.Math.Between(-500, 500), Phaser.Math.Between(-300, 80), 1, 1);
    }
    // 5×5 iso arena
    for (let x = -2; x <= 2; x++)
      for (let y = -2; y <= 2; y++) {
        const p = isoToWorld(x, y);
        const edge = Math.abs(x) === 2 || Math.abs(y) === 2;
        this.add.image(p.x, p.y, 'hub_tiles', edge ? 3 : 2).setDepth(-1000 + p.y);
      }
    const ring = this.add.ellipse(0, 0, 300, 150).setStrokeStyle(2, color, 0.7).setDepth(-500);
    this.tweens.add({ targets: ring, alpha: 0.35, yoyo: true, repeat: -1, duration: 1200 });

    this.playerHome = isoToWorld(-1, 1);
    this.enemyHome = isoToWorld(1, -1);
    this.player = this.add.sprite(this.playerHome.x, this.playerHome.y, this.skin).setOrigin(0.5, 0.94).setDepth(this.playerHome.y);
    this.player.play(`${this.skin}-idle-right`);
    this.enemy = this.add.sprite(this.enemyHome.x, this.enemyHome.y, this.enemyKey).setOrigin(0.5, 0.95).setDepth(this.enemyHome.y);
    this.enemy.play(this.enemyKey === 'wisp' ? 'wisp-float' : 'warden-idle');
    if (this.enemyKey === 'wisp') this.enemy.setScale(1.4);

    const eh = this.enemyKey === 'wisp' ? 60 : 110;
    this.chargeGlow = this.add.ellipse(this.enemyHome.x, this.enemyHome.y - eh / 2, eh * 1.2, eh * 1.2, 0xffef9a, 0.25).setVisible(false).setDepth(this.enemyHome.y - 1);
    this.shield = this.add.ellipse(this.enemyHome.x, this.enemyHome.y - eh / 2, eh * 1.1, eh * 1.15).setStrokeStyle(3, 0x8fe3ff, 0.9).setFillStyle(0x8fe3ff, 0.12).setDepth(this.enemyHome.y + 1);
    this.weak = this.add.text(this.enemyHome.x, this.enemyHome.y - eh - 14, '◎ จุดอ่อน', {
      fontFamily: '"Mitr", sans-serif', fontSize: '12px', color: '#ff6b6b', stroke: '#1d1a2b', strokeThickness: 3, resolution: 3,
    }).setOrigin(0.5).setDepth(5000);
    this.tweens.add({ targets: this.shield, scale: 1.04, yoyo: true, repeat: -1, duration: 700 });

    if (run) this.syncState(run.state);
    this.fit();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.fit, this);
    this.unsub.push(
      bus.on('battle:fx', ({ events, state }) => this.play(events, state)),
      bus.on('battle:state', (s) => this.syncState(s)),
    );
    const cleanup = () => {
      this.unsub.forEach((u) => u());
      this.unsub = [];
      this.scale.off(Phaser.Scale.Events.RESIZE, this.fit, this);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
    this.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  }

  /** Keep the arena clear of the question card: right panel on wide screens, bottom sheet on portrait. */
  private fit() {
    const w = this.scale.width;
    const h = this.scale.height;
    const cam = this.cameras.main;
    const portrait = h > w;
    const panel = !portrait && w >= 900 ? Math.min(460, w * 0.4) : 0;
    const usableW = w - panel;
    const usableH = portrait ? h * 0.42 : h - 150;
    const zoom = Phaser.Math.Clamp(Math.floor(Math.min(usableW / 340, usableH / 230) * 2) / 2, 1, 4);
    cam.setZoom(zoom);
    const offsetX = panel / 2 / zoom;
    const offsetY = portrait ? (h / 2 - (h * 0.06 + usableH / 2)) / zoom : (h / 2 - (40 + usableH / 2)) / zoom;
    cam.centerOn(offsetX, -40 + offsetY);
  }

  private syncState(s: CombatState) {
    this.shield.setVisible(s.enemyShield && !s.weakPoint);
    this.weak.setVisible(s.weakPoint);
    this.chargeGlow.setVisible(s.intent === 'beam');
  }

  private number(x: number, y: number, text: string, color: string) {
    const t = this.add.text(x, y, text, {
      fontFamily: 'monospace', fontSize: '16px', color, stroke: '#1d1a2b', strokeThickness: 4, resolution: 3,
    }).setOrigin(0.5).setDepth(6000);
    this.tweens.add({ targets: t, y: y - 28, alpha: 0, duration: 900, ease: 'Cubic.out', onComplete: () => t.destroy() });
  }

  private hitFx(x: number, y: number) {
    const fx = this.add.sprite(x, y, 'fx_hit').setDepth(6000).setScale(1.5);
    fx.play('fx-hit');
    fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
  }

  private lunge(sprite: Phaser.GameObjects.Sprite, home: { x: number; y: number }, to: { x: number; y: number }, done: () => void) {
    this.tweens.add({
      targets: sprite, x: home.x + (to.x - home.x) * 0.45, y: home.y + (to.y - home.y) * 0.45,
      duration: 160, yoyo: true, ease: 'Quad.out', onYoyo: done,
    });
  }

  private async play(events: CombatEvent[], state: CombatState) {
    const wait = (ms: number) => new Promise<void>((r) => this.time.delayedCall(ms, r));
    const eh = this.enemyKey === 'wisp' ? 40 : 70;
    for (const e of events) {
      switch (e.type) {
        case 'player_attack':
        case 'pierce': {
          this.player.play(`${this.skin}-attack-right`);
          this.lunge(this.player, this.playerHome, this.enemyHome, () => {
            this.hitFx(this.enemyHome.x, this.enemyHome.y - eh);
            this.enemy.setTintFill(0xffffff);
            this.time.delayedCall(90, () => this.enemy.clearTint());
            const dmg = e.damage;
            const label = e.type === 'pierce' ? `เจาะ! -${dmg}` : e.doubled ? `x2 -${dmg}` : `-${dmg}`;
            this.number(this.enemyHome.x, this.enemyHome.y - eh - 20, label, e.type === 'pierce' || (e.type === 'player_attack' && e.doubled) ? '#ffd23f' : '#ffffff');
            if (e.type === 'pierce') {
              this.cameras.main.shake(120, 0.004);
              this.shield.setVisible(false);
            }
          });
          await wait(420);
          this.player.play(`${this.skin}-idle-right`);
          break;
        }
        case 'guard': {
          const ring = this.add.ellipse(this.playerHome.x, this.playerHome.y - 26, 60, 70).setStrokeStyle(3, e.mode === 'full' ? 0x8fe3ff : 0xcfd8ff, 1).setDepth(5000);
          this.tweens.add({ targets: ring, alpha: 0, delay: 600, duration: 300, onComplete: () => ring.destroy() });
          await wait(250);
          break;
        }
        case 'heal':
          this.number(this.playerHome.x, this.playerHome.y - 70, `+${e.amount}`, '#7CFC9A');
          await wait(350);
          break;
        case 'enemy_attack': {
          if (e.intent === 'beam') {
            const beam = this.add.line(0, 0, this.enemyHome.x, this.enemyHome.y - eh, this.playerHome.x, this.playerHome.y - 30, 0xffef9a).setOrigin(0).setLineWidth(5).setDepth(5500);
            this.tweens.add({ targets: beam, alpha: 0, duration: 450, onComplete: () => beam.destroy() });
            this.cameras.main.shake(200, 0.008);
          } else {
            await new Promise<void>((r) => this.lunge(this.enemy, this.enemyHome, this.playerHome, r));
          }
          if (e.damage > 0) {
            this.player.play(`${this.skin}-hurt-right`);
            this.hitFx(this.playerHome.x, this.playerHome.y - 30);
          }
          this.number(this.playerHome.x, this.playerHome.y - 70, e.blocked === 'full' ? 'กันได้!' : `-${e.damage}`, e.blocked === 'full' ? '#8fe3ff' : '#ff6b6b');
          await wait(450);
          this.player.play(`${this.skin}-idle-right`);
          break;
        }
        case 'enemy_charge':
          this.chargeGlow.setVisible(true);
          this.number(this.enemyHome.x, this.enemyHome.y - eh - 20, 'ชาร์จ!', '#ffef9a');
          await wait(400);
          break;
        case 'enemy_guard':
        case 'shield_up':
          this.shield.setVisible(true);
          await wait(250);
          break;
        case 'focus_gain':
          this.number(this.playerHome.x, this.playerHome.y - 70, '+1 พลัง', '#ffd23f');
          break;
        case 'victory':
          this.weak.setVisible(false);
          this.shield.setVisible(false);
          this.chargeGlow.setVisible(false);
          this.tweens.add({ targets: this.enemy, alpha: 0, scale: 0.4, duration: 500 });
          this.player.play(`${this.skin}-victory-right`);
          await wait(550);
          break;
        case 'defeat':
          this.player.play(`${this.skin}-hurt-right`);
          this.tweens.add({ targets: this.player, alpha: 0.4, duration: 400 });
          await wait(450);
          break;
      }
    }
    if (state.phase !== 'won') this.syncState(state);
    bus.emit('battle:fx-done');
  }
}
