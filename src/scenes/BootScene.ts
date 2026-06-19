import Phaser from 'phaser';

/** Minimal entry scene: config lives in main.ts, so we just hand off to Preload. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    this.scene.start('Preload');
  }
}
