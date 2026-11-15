import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { HubScene } from './scenes/HubScene';
import { BattleScene } from './scenes/BattleScene';

/**
 * Pick the renderer. Software-only WebGL (no GPU: old school PCs, CI runners) is far slower than
 * Phaser's Canvas renderer for this 2D pixel game, so fall back to Canvas when the browser reports a
 * major performance caveat. `?renderer=canvas|webgl` overrides for testing.
 */
export function pickRenderer(): number {
  const forced = new URLSearchParams(location.search).get('renderer');
  if (forced === 'canvas') return Phaser.CANVAS;
  if (forced === 'webgl') return Phaser.WEBGL;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2', { failIfMajorPerformanceCaveat: true }) ?? c.getContext('webgl', { failIfMajorPerformanceCaveat: true });
    if (!gl) return Phaser.CANVAS;
    (gl as WebGLRenderingContext).getExtension('WEBGL_lose_context')?.loseContext();
    return Phaser.WEBGL;
  } catch {
    return Phaser.CANVAS;
  }
}

export function createGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: pickRenderer(),
    parent,
    backgroundColor: '#1c2a22',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: { mode: Phaser.Scale.RESIZE, width: parent.clientWidth || 800, height: parent.clientHeight || 600 },
    input: { activePointers: 2 },
    scene: [BootScene, HubScene, BattleScene],
    banner: false,
  });
}
