import Phaser from 'phaser';
import { VIEW_WIDTH, VIEW_HEIGHT } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { GameState } from './state/GameState';
import { Gauntlet } from './world/Gauntlet';
import { Key } from './entities/Key';
import { playDialogue } from './narrative/dialogue';

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  width: VIEW_WIDTH,
  height: VIEW_HEIGHT,
  pixelArt: true,
  roundPixels: true,
  backgroundColor: '#0d0d14',
  physics: {
    default: 'arcade',
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    // Render at the internal resolution, then upscale the canvas to the window.
    zoom: Phaser.Scale.MAX_ZOOM,
  },
  scene: [BootScene, PreloadScene, TitleScene, GameScene, UIScene],
});

// Test-only handles for the headless smoke harness (scripts/smoke.mjs). Gated on
// a build flag (set by `npm run smoke`) so a real production build never exposes
// internals on window. __GAME reaches live scenes/entities; __STATE is the data.
if (import.meta.env.VITE_EXPOSE_STATE) {
  const w = window as unknown as Record<string, unknown>;
  w.__GAME = game;
  w.__STATE = GameState;
  w.__Gauntlet = Gauntlet; // so the smoke harness can drive a Gauntlet's lifecycle
  w.__playDialogue = playDialogue; // so the smoke harness can start a Dialogue
  w.__Key = Key; // so the smoke harness can drive a Key pickup
}
