import Phaser from 'phaser';
import { PLAYER_SPEED, SWORD, TEX } from '../config/constants';
import { isDamageable } from '../combat/Attack';

interface MoveKeys {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
}

/**
 * The Player: a Sprite subclass (composition-lite, ADR 0002). Behaviour that
 * varies across entities (Health, Knockback, AIController) will attach as
 * components later; for now this handles movement and the sword.
 *
 * Aim is decoupled from movement: the body moves with WASD/arrows (8-way),
 * while `aimAngle` tracks the mouse (free 360°). This lets the knight back away
 * from an enemy while still swinging toward it.
 */
export class Player extends Phaser.Physics.Arcade.Sprite {
  /** Group of attackable targets; set by the scene after construction. */
  attackTargets?: Phaser.GameObjects.Group;

  /** Aim direction in radians, toward the mouse. */
  aimAngle = 0;

  private keys: MoveKeys;
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private attackKey: Phaser.Input.Keyboard.Key;
  private isAttacking = false;
  private activeHitbox?: Phaser.GameObjects.Arc;
  private readonly aimPoint = new Phaser.Math.Vector2();

  // Combo state. Beats chain while the player keeps attacking on cadence;
  // see the SWORD config in constants.ts for all tuning.
  private comboStep = 0;
  private nextSwingAt = 0;
  private comboExpiresAt = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset(2, 4);

    const kb = scene.input.keyboard!;
    this.keys = {
      up: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    // Arrow keys mirror WASD.
    this.cursors = kb.createCursorKeys();
    this.attackKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
  }

  preUpdate(time: number, delta: number): void {
    super.preUpdate(time, delta);

    // Aim at the mouse. Recompute the world point every frame so a still mouse
    // still aims correctly while the camera scrolls.
    const pointer = this.scene.input.activePointer;
    this.scene.cameras.main.getWorldPoint(pointer.x, pointer.y, this.aimPoint);
    this.aimAngle = Phaser.Math.Angle.Between(this.x, this.y, this.aimPoint.x, this.aimPoint.y);

    // Hold or tap to attack (Spacebar or left mouse). Swings are gated by the
    // combo cadence and the post-combo cooldown.
    const wantsAttack = this.attackKey.isDown || pointer.leftButtonDown();
    const now = this.scene.time.now;
    if (wantsAttack && !this.isAttacking && now >= this.nextSwingAt) {
      this.swingCombo(now);
    }

    let vx = 0;
    let vy = 0;
    if (this.keys.left.isDown || this.cursors.left.isDown) vx -= 1;
    if (this.keys.right.isDown || this.cursors.right.isDown) vx += 1;
    if (this.keys.up.isDown || this.cursors.up.isDown) vy -= 1;
    if (this.keys.down.isDown || this.cursors.down.isDown) vy += 1;

    const len = Math.hypot(vx, vy);
    if (len > 0) {
      this.setVelocity((vx / len) * PLAYER_SPEED, (vy / len) * PLAYER_SPEED);
    } else {
      this.setVelocity(0, 0);
    }

    // While swinging, the hitbox tracks the Player AND re-aims toward the live
    // cursor each frame, so the slash follows the mouse mid-swing.
    if (this.isAttacking && this.activeHitbox) {
      this.activeHitbox.setPosition(
        this.x + Math.cos(this.aimAngle) * SWORD.reach,
        this.y + Math.sin(this.aimAngle) * SWORD.reach,
      );
      (this.activeHitbox.body as Phaser.Physics.Arcade.Body).updateFromGameObject();
    }
  }

  /**
   * Advance the combo by one beat and fire the swing. The chain resets to beat
   * one if it has lapsed (comboResetMs); after the final beat it imposes the
   * longer comboCooldownMs before the next chain can begin.
   */
  private swingCombo(now: number): void {
    if (now > this.comboExpiresAt) this.comboStep = 0;
    this.comboStep += 1;

    // Capture this beat's damage now; the overlap callback fires later, after
    // comboStep may have advanced or reset.
    this.attack(SWORD.comboDamage[this.comboStep - 1]);

    if (this.comboStep >= SWORD.comboDamage.length) {
      this.nextSwingAt = now + SWORD.comboCooldownMs;
      this.comboStep = 0; // chain consumed; next swing starts fresh
    } else {
      this.nextSwingAt = now + SWORD.beatIntervalMs;
    }
    this.comboExpiresAt = now + SWORD.comboResetMs;
  }

  /**
   * Swing the sword: spawn a transient circular hitbox along the aim direction
   * (combat model — transient-per-swing). A circle is used because Arcade bodies
   * can't rotate, so free aim only changes the hitbox's position, not its shape.
   * Each target is hit at most once per swing; damage flows through the Attack
   * chokepoint (ADR 0002).
   */
  private attack(damage: number): void {
    this.isAttacking = true;

    // Spawn at the current aim; preUpdate re-aims it toward the cursor each frame.
    const dx = Math.cos(this.aimAngle) * SWORD.reach;
    const dy = Math.sin(this.aimAngle) * SWORD.reach;

    const hitbox = this.scene.add
      .circle(this.x + dx, this.y + dy, SWORD.radius, 0xffffff, 0.35)
      .setDepth(5);
    this.scene.physics.add.existing(hitbox);
    const body = hitbox.body as Phaser.Physics.Arcade.Body;
    body.setAllowGravity(false);
    body.setImmovable(true);
    body.setCircle(SWORD.radius);
    this.activeHitbox = hitbox;

    const alreadyHit = new Set<unknown>();
    let overlap: Phaser.Physics.Arcade.Collider | undefined;
    if (this.attackTargets) {
      overlap = this.scene.physics.add.overlap(
        hitbox,
        this.attackTargets,
        (_hb, target) => {
          if (alreadyHit.has(target)) return;
          alreadyHit.add(target);
          if (isDamageable(target)) {
            target.hit({
              damage,
              knockback: SWORD.knockback,
              fromX: this.x,
              fromY: this.y,
            });
          }
        },
      );
    }

    this.scene.time.delayedCall(SWORD.swingMs, () => {
      overlap?.destroy();
      hitbox.destroy();
      this.activeHitbox = undefined;
      this.isAttacking = false;
    });
  }
}
