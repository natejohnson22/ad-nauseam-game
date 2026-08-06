import Phaser from "phaser";
import type { EnemyBehavior } from "../content/types";
import { PooledSprite } from "../core/pool";
import { circleTexture, ringTexture } from "../core/textures";
import type { Player } from "./player";

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
 * Pooled like everything else, so every field is reset in `spawn()`; see the
 * note on `Pool`.
 */
export class EnemyProjectile extends PooledSprite {
  private static readonly RADIUS = 6;
  /** The faint outline, as `Boomerang` wears — it reads at a glance in a swarm. */
  private static readonly HALO_THICKNESS = 2;

  private readonly dir = new Phaser.Math.Vector2(1, 0);
  private speed = 0;
  private damage = 0;
  /** How much travel is left before it fizzles. */
  private travelLeft = 0;
  /** Seconds of weapon lockout to apply on hit; 0 for a plain bolt. */
  private lockout = 0;

  private player!: Player;
  private readonly halo: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, EnemyProjectile.RADIUS));
    // Above the enemies that fire it, below the player's own boomerang: when
    // both are on screen the one the player controls should be the readable one.
    this.setDepth(2.55);

    this.halo = scene.add
      .sprite(
        0,
        0,
        ringTexture(
          scene,
          EnemyProjectile.RADIUS + 2,
          EnemyProjectile.HALO_THICKNESS,
        ),
      )
      .setDepth(2.55)
      .setAlpha(0.5)
      .setVisible(false);
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
  ): void {
    this.setPosition(x, y);
    this.dir.copy(dir).normalize();
    this.speed = behavior.projectileSpeed;
    this.damage = behavior.damage;
    this.travelLeft = behavior.travelDistance;
    this.player = player;

    const shot = behavior.shot;
    switch (shot.kind) {
      case "bolt":
        this.lockout = 0;
        break;
      case "lockout":
        this.lockout = shot.seconds;
        break;
    }

    // The lockout shot is the fat slow one, and it has to be distinguishable
    // from a Pixel's bolt across a crowded screen — the whole reason it is fair
    // is that the player can see it coming.
    this.setScale(this.lockout > 0 ? 1.8 : 1);
    this.halo.setScale(this.getScale()).setVisible(true);
    this.refreshTint();
  }

  tick(delta: number): void {
    const step = this.speed * delta;
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;
    this.halo.setPosition(this.x, this.y);

    this.travelLeft -= step;
    if (this.travelLeft <= 0) {
      this.release();
      return;
    }

    const reach = EnemyProjectile.RADIUS * this.getScale() + this.player.radius;
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
    this.release();
  }

  /** Takes the halo with it — the pool only knows about the sprite itself. */
  override release(): void {
    this.halo.setVisible(false);
    super.release();
  }

  /** The scale is uniform, so either axis is the answer. */
  private getScale(): number {
    return this.scaleX;
  }

  /** Lockout shots wear the Paywall's red; bolts stay a neutral hostile white. */
  private refreshTint(): void {
    const color = this.lockout > 0 ? 0xd94f4f : 0xffd8e6;
    this.setTint(color);
    this.halo.setTint(color);
  }
}
