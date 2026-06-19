import Phaser from 'phaser';

export interface HealthOptions {
  /** Invulnerability window after taking damage, in ms. Default 0. */
  iframeMs?: number;
  /** Called when health reaches zero. */
  onDeath?: () => void;
}

/**
 * Reusable health component (ADR 0002). Attached to any entity that can be
 * damaged — Player, enemies, the practice dummy. Tracks current/max and an
 * optional invulnerability window so a single sword swing can't multi-hit.
 */
export class Health {
  current: number;
  readonly max: number;

  private invulnerableUntil = 0;
  private readonly iframeMs: number;
  private readonly onDeath?: () => void;

  constructor(
    private readonly scene: Phaser.Scene,
    max: number,
    opts: HealthOptions = {},
  ) {
    this.max = max;
    this.current = max;
    this.iframeMs = opts.iframeMs ?? 0;
    this.onDeath = opts.onDeath;
  }

  /** Apply damage. Returns false (no-op) if currently invulnerable. */
  takeDamage(amount: number): boolean {
    if (this.scene.time.now < this.invulnerableUntil) return false;

    this.current = Math.max(0, this.current - amount);
    this.invulnerableUntil = this.scene.time.now + this.iframeMs;

    if (this.current <= 0) this.onDeath?.();
    return true;
  }

  reset(): void {
    this.current = this.max;
  }

  get fraction(): number {
    return this.current / this.max;
  }

  get isDead(): boolean {
    return this.current <= 0;
  }
}
