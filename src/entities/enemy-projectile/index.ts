import Phaser from "phaser";
import type { EnemyBehavior } from "../../content/types";
import type { GameBus } from "../../core/event-bus";
import { PooledSprite } from "../../core/pool";
import type { Player } from "../player";
import boltUrl from "./assets/bolt.png";
import lockoutUrl from "./assets/lockout.png";

/** Art-path texture keys for the two enemy shots (issue #66). */
const BOLT_ART = "enemy_bolt_art";
const LOCKOUT_ART = "paywall_lockout_art";

/**
 * What a `ranged_standoff` enemy fires — the first thing in this game that
 * shoots *at* the player (issue #31).
 *
 * It is deliberately the dumbest projectile that works: a straight line at a
 * fixed speed, aimed once at where the player stood when it left the muzzle,
 * gone on the first thing it touches or when it runs out of travel. Nothing
 * homes, nothing curves, nothing pierces. That is the whole fairness argument
 * for the ranged half of the roster — a shot the player can read the instant it
 * appears and outrun by moving, in a game where movement is the only defence.
 *
 * The two flavours wear distinct art on the #60 path — no identity tint (issue
 * #66): a neutral stone bolt (Tracking Pixel, The Algorithm) and the fat red
 * Paywall lockout orb. The lockout is deliberately bigger and slower so the
 * player can see the silence coming — the whole reason it is fair.
 *
 * Pooled like everything else, so every field is reset in `spawn()`; see the
 * note on `Pool`.
 */
export class EnemyProjectile extends PooledSprite {
  /** The bolt's hit radius — kept as a logical number, not the sprite's visual
   *  scale, so the art can be sized by eye without moving the hitbox. */
  private static readonly RADIUS = 6;
  /** The lockout is the fat one: its hit radius is 1.8× the bolt's, unchanged
   *  from the primitive era so gameplay is identical to before the art. */
  private static readonly LOCKOUT_HIT_SCALE = 1.8;
  /** Native art is 32px. Visual scales tuned by eye — decoupled from the hit
   *  radii above so sizing the sprites never touches fairness. */
  private static readonly BOLT_SCALE = 0.55;
  private static readonly LOCKOUT_SCALE = 0.95;

  private readonly dir = new Phaser.Math.Vector2(1, 0);
  private speed = 0;
  private damage = 0;
  /** How much travel is left before it fizzles. */
  private travelLeft = 0;
  /** Seconds of weapon lockout to apply on hit; 0 for a plain bolt. */
  private lockout = 0;
  /** The logical hit radius for this shot — bolt or lockout. */
  private hitRadius = EnemyProjectile.RADIUS;

  private player!: Player;
  private bus!: GameBus;

  /** Load the bolt and lockout art (art path, #60). Call from a scene
   *  `preload`. */
  static preload(scene: Phaser.Scene): void {
    scene.load.image(BOLT_ART, boltUrl);
    scene.load.image(LOCKOUT_ART, lockoutUrl);
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, BOLT_ART);
    // Above the enemies that fire it, below the player's own boomerang: when
    // both are on screen the one the player controls should be the readable one.
    this.setDepth(2.55);
  }

  /**
   * Launch from `x, y` along `dir` — which the firing enemy has already aimed
   * and normalised.
   *
   * Takes the whole behaviour rather than a bag of numbers because every field
   * it needs is on that arm, and because the shot payload is a union: passing
   * the arm keeps the `bolt` / `lockout` switch in one place.
   */
  spawn(
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
    x: number,
    y: number,
    dir: Phaser.Math.Vector2,
    player: Player,
    bus: GameBus,
  ): void {
    this.setPosition(x, y);
    this.dir.copy(dir).normalize();
    this.speed = behavior.projectileSpeed;
    this.damage = behavior.damage;
    this.travelLeft = behavior.travelDistance;
    this.player = player;
    this.bus = bus;

    const shot = behavior.shot;
    switch (shot.kind) {
      case "bolt":
        this.lockout = 0;
        break;
      case "lockout":
        this.lockout = shot.seconds;
        break;
    }

    // Each flavour wears its own sheet — no tint carries identity (issue #66).
    // The lockout keeps its 1.8× hit radius from the primitive era, so the shot
    // the player has to dodge is exactly as big as it always was.
    const isLockout = this.lockout > 0;
    this.setTexture(isLockout ? LOCKOUT_ART : BOLT_ART)
      .clearTint()
      .setOrigin(0.5)
      .setScale(
        isLockout ? EnemyProjectile.LOCKOUT_SCALE : EnemyProjectile.BOLT_SCALE,
      );
    this.hitRadius = isLockout
      ? EnemyProjectile.RADIUS * EnemyProjectile.LOCKOUT_HIT_SCALE
      : EnemyProjectile.RADIUS;
  }

  tick(delta: number): void {
    const step = this.speed * delta;
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;

    this.travelLeft -= step;
    if (this.travelLeft <= 0) {
      this.release();
      return;
    }

    const reach = this.hitRadius + this.player.radius;
    if (
      this.player.isAlive &&
      Phaser.Math.Distance.Between(
        this.x,
        this.y,
        this.player.x,
        this.player.y,
      ) <= reach
    ) {
      this.hit();
    }
  }

  private hit(): void {
    this.player.takeDamage(this.damage);
    // After the damage, and unguarded: `Player.silence` decides for itself
    // whether it applies (dead, or invulnerable under the harness).
    if (this.lockout > 0) this.player.silence(this.lockout);
    // Burst where it landed on the player (issue #66) — the clearest "you got
    // hit" feedback the shot can give.
    this.bus.emit("impact", this.x, this.y);
    this.release();
  }
}
