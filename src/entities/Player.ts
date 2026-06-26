import Phaser from 'phaser';
import { ANIM, MONOLOGUE, PLAYER, SWORD, TEX } from '../config/constants';
import { isDamageable, type Attack, type Damageable } from '../combat/Attack';
import { Knockback } from '../components/Knockback';
import { GameState } from '../state/GameState';
import { eventBus, GameEvent } from '../state/eventBus';

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
 *
 * The Player is the one entity that does NOT use the Health component, on
 * purpose. `Health` is scene-coupled (it reads scene.time for i-frames) and is
 * the right store for *transient* entities whose HP should die with them (the
 * dummy, the Walker). The Player's Hearts are durable, cross-cutting state read
 * by the parallel UIScene and must survive a full scene teardown/respawn, so
 * they live in the plain, scene-independent GameState (ADR 0003) — you can't put
 * a scene-bound object there. The cost is that the i-frame timer below is a
 * small duplication of Health's; accepted for the MVP. Revisit (e.g. make Health
 * operate over an injected store) if a third persistent-health entity appears.
 *
 * It still implements Damageable so enemy contact routes through the same Attack
 * chokepoint as everything else.
 */
export class Player extends Phaser.Physics.Arcade.Sprite implements Damageable {
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
  private readonly knockback = new Knockback(this);
  private invulnerableUntil = 0;
  private knockedBackUntil = 0;

  // Combo state. Beats chain while the player keeps attacking on cadence;
  // see the SWORD config in constants.ts for all tuning.
  private comboStep = 0;
  private nextSwingAt = 0;
  private comboExpiresAt = 0;
  /** Movement stays slowed until this time — spans the whole combo, gaps included. */
  private slowUntil = 0;
  /** The Player's currently-fading Monologue line, if any (one thought at a time). */
  private activeMonologue?: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, TEX.player);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.setCollideWorldBounds(true);
    // The knight is now a 64x64 top-down spritesheet, body-centred in the cell
    // (the centroid the repacker anchors on). Keep the 12x12 collision footprint
    // (combat feel unchanged) but centre it on the cell: the Arcade body is
    // axis-aligned and does NOT rotate with the sprite, so a box on the body
    // centre stays correct at every facing.
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(12, 12).setOffset(26, 26);
    this.play(ANIM.playerIdle);

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

    // Top-down sprite: rotate the whole frame to face the aim. The art is drawn
    // facing north (up) and pivots about its centred body centroid (default 0.5
    // origin); Phaser's rotation 0 faces east, so offset the aim by +90°.
    this.setRotation(this.aimAngle + Math.PI / 2);

    const now = this.scene.time.now;

    // While being knocked back, relinquish control so the impulse carries; skip
    // attack and movement input.
    if (now >= this.knockedBackUntil) {
      // Hold or tap to attack (Spacebar or left mouse). Swings are gated by the
      // combo cadence and the post-combo cooldown.
      const wantsAttack = this.attackKey.isDown || pointer.leftButtonDown();
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
        // Slow to a measured step for the whole combo (gaps included).
        const speed = now < this.slowUntil ? PLAYER.speed * PLAYER.attackMoveFactor : PLAYER.speed;
        this.setVelocity((vx / len) * speed, (vy / len) * speed);
      } else {
        this.setVelocity(0, 0);
      }
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

    // Animate from hit + combat + movement state, in priority order. Hurt takes
    // over for the knockback window; the sword swing shows while a beat's hitbox
    // is live (isAttacking spans exactly SWORD.swingMs, which the playerAttack
    // anim is timed to); otherwise walk while moving, idle when still. The whole
    // sprite is already rotated to the aim above, so the swing reads toward the
    // cursor and the gaps between combo beats fall back to walk/idle.
    const vel = (this.body as Phaser.Physics.Arcade.Body).velocity;
    if (now < this.knockedBackUntil) {
      this.play(ANIM.playerHurt, true);
    } else if (this.isAttacking) {
      this.play(ANIM.playerAttack, true);
    } else if (Math.abs(vel.x) > 1 || Math.abs(vel.y) > 1) {
      this.play(ANIM.playerWalk, true);
    } else {
      this.play(ANIM.playerIdle, true);
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
      // Final beat: slow through its swing only, not the recovery cooldown.
      this.slowUntil = now + SWORD.swingMs;
    } else {
      this.nextSwingAt = now + SWORD.beatIntervalMs;
      // Mid-combo: stay slowed through the swing and the gap to the next beat.
      this.slowUntil = now + SWORD.beatIntervalMs;
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
      .circle(this.x + dx, this.y + dy, SWORD.radius, 0xffffff, 0)
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

  /**
   * Damageable: take a hit (enemy contact). Hearts live in GameState; i-frames
   * gate repeated damage; knockback shoves the Player away from the attacker.
   * Emits PlayerDamaged so the HUD redraws, and PlayerDied at zero Hearts so the
   * scene can orchestrate a respawn.
   */
  hit(attack: Attack): void {
    const now = this.scene.time.now;
    if (now < this.invulnerableUntil) return;

    GameState.player.halfHearts = Math.max(0, GameState.player.halfHearts - attack.damage);
    this.invulnerableUntil = now + PLAYER.iframeMs;

    this.knockback.apply(attack.fromX, attack.fromY, attack.knockback);
    this.knockedBackUntil = now + PLAYER.knockbackMs;
    this.flashHurt();

    eventBus.emit(GameEvent.PlayerDamaged);
    if (GameState.player.halfHearts <= 0) eventBus.emit(GameEvent.PlayerDied);
  }

  /** Reposition the Player without the death reset (used on Room transitions). */
  placeAt(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.setPosition(x, y);
    this.setVelocity(0, 0);
  }

  /** Reposition and reset after death; the scene drives this on PlayerDied. */
  respawn(x: number, y: number): void {
    this.scene.tweens.killTweensOf(this);
    this.setPosition(x, y);
    this.setVelocity(0, 0);
    this.setAlpha(1);
    this.clearTint();
    this.knockedBackUntil = 0;
    this.invulnerableUntil = this.scene.time.now + PLAYER.iframeMs;
  }

  /**
   * Speak a Monologue (CONTEXT.md; ADR 0014): a transient line that floats above
   * the Player, rises, and fades — fire-and-forget, **never pausing** and taking
   * no input (the casual counterpart to the Dialogue box). Anchored to the Player
   * via the tween's onUpdate, so it tracks movement while the world keeps running.
   * Only one plays at a time — a new line replaces any still-fading one. Returns
   * the label (handy for tests; callers may ignore it).
   */
  monologue(text: string): Phaser.GameObjects.Text {
    // One thought at a time: a new line cancels and clears a still-fading one.
    if (this.activeMonologue) {
      this.scene.tweens.killTweensOf(this.activeMonologue);
      this.activeMonologue.destroy();
    }

    const label = this.scene.add
      .text(this.x, this.y - MONOLOGUE.yOffset, text, {
        fontFamily: 'monospace',
        fontSize: MONOLOGUE.fontSize,
        color: MONOLOGUE.color,
        align: 'center',
        wordWrap: { width: MONOLOGUE.maxWidth },
      })
      .setOrigin(0.5, 1)
      .setDepth(MONOLOGUE.depth);
    this.activeMonologue = label;

    this.scene.tweens.add({
      targets: label,
      alpha: { from: 1, to: 0 },
      duration: MONOLOGUE.lifeMs,
      ease: 'Quad.in', // holds readable early, fades out late
      onUpdate: (tw) => {
        // Follow the Player and drift upward as it fades (the world isn't paused).
        label.setPosition(this.x, this.y - MONOLOGUE.yOffset - MONOLOGUE.riseDist * tw.progress);
      },
      onComplete: () => {
        label.destroy();
        if (this.activeMonologue === label) this.activeMonologue = undefined;
      },
    });

    return label;
  }

  /** Blink for the duration of the i-frames. */
  private flashHurt(): void {
    this.scene.tweens.killTweensOf(this);
    this.scene.tweens.add({
      targets: this,
      alpha: 0.35,
      duration: 90,
      yoyo: true,
      repeat: Math.floor(PLAYER.iframeMs / 180),
      onComplete: () => this.setAlpha(1),
    });
  }
}
