import Phaser from 'phaser';
import { VIEW_WIDTH, VIEW_HEIGHT } from './config/constants';
import { BootScene } from './scenes/BootScene';
import { PreloadScene } from './scenes/PreloadScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';

new Phaser.Game({
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
  scene: [BootScene, PreloadScene, GameScene, UIScene],
});
