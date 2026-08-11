import Phaser from "phaser";
import type { RangedWeaponData } from "../../content/types";
import type { Pool } from "../../core/pool";
import { PooledSprite } from "../../core/pool";
import { circleTexture, ringTexture } from "../../core/textures";
import type { Enemy } from "../enemy";
import type { Player } from "../player";
import boomerangUrl from "./assets/boomerang.png";

/** Art-path texture key for the returning boomerang's carved-wood sprite. */
const BOOMERANG_ART = "dnt_boomerang_art";

/**
 * The `ranged` kind's projectile — the port of `boomerang.gd`, now the entity
 * behind both ranged weapons (issue #44). With `returns: true` it is the Do Not
 * Track Boomerang: flies out to `travelDistance`, turns around, homes back to the
 * player and vanishes when caught. With `returns: false` it is the pierce-ranged
 * Popup Blocker: the same straight flight, but it expires at `travelDistance`
 * instead of arcing back. Either way it damages every enemy along its path (the
 * per-enemy hit cooldown, not a pierce cap, is what stops it shredding one).
 *
 * Its geometry never changes, so unlike the sword it is one baked texture for
 * the whole run whatever the upgrades do (issue #4): the multi-track upgrade
 * adds *more* boomerangs, never a bigger one.
 *
 * The per-enemy hit cooldown is what lets one throw tag the same enemy going out
 * and coming back without shredding it in between. It is keyed by `spawnId`
 * rather than by the sprite, because a pool hands the same sprite back out —
 * see `Enemy.nextSpawnId`.
 */
export class Boomerang extends PooledSprite {
  /** Seconds before a given enemy may be hit again by this same throw. */
  private static readonly HIT_INTERVAL = 0.3;
  private static readonly RADIUS = 8;
  /** How close to the player counts as caught. */
  private static readonly CATCH = 16;
  private static readonly HALO_THICKNESS = 2;
  /** Radians/sec the carved boomerang twirls in flight — a fast thrown spin. */
  private static readonly SPIN = 18;
  /** Native art is 32px; scaled so the visible boomerang reads a touch larger
   *  than its 16px hit circle without dwarfing the fodder. Tuned by eye. */
  private static readonly ART_SCALE = 0.85;

  private speed = 0;
  private travel = 0;
  private damage = 0;
  private knockback = 0;
  private distOut = 0;
  private returning = false;
  /** Whether this throw arcs home (boomerang) or expires at range (pierce). */
  private returns = true;

  private readonly dir = new Phaser.Math.Vector2(1, 0);
  private readonly hitCd = new Map<number, number>();

  private player!: Player;
  private enemies!: Pool<Enemy>;

  /** The faint outline `_draw` strokes at `RADIUS + 2`, at half alpha. */
  private readonly halo: Phaser.GameObjects.Sprite;

  /** Load the carved-boomerang art (art path, #60). Call from a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    scene.load.image(BOOMERANG_ART, boomerangUrl);
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Boomerang.RADIUS));
    // Above the enemies it flies through, below the engagement drops.
    this.setDepth(2.6);

    this.halo = scene.add
      .sprite(
        0,
        0,
        ringTexture(scene, Boomerang.RADIUS + 2, Boomerang.HALO_THICKNESS),
      )
      .setDepth(2.6)
      .setAlpha(0.5)
      .setVisible(false);
  }

  spawn(
    data: RangedWeaponData,
    dir: Phaser.Math.Vector2,
    player: Player,
    enemies: Pool<Enemy>,
  ): void {
    this.speed = data.projectileSpeed;
    this.travel = data.travelDistance;
    this.damage = data.baseDamage;
    this.knockback = data.knockback;
    this.returns = data.returns;
    this.player = player;
    this.enemies = enemies;

    this.distOut = 0;
    this.returning = false;
    this.hitCd.clear();

    if (dir.length() > 0.001) this.dir.copy(dir).normalize();
    else this.dir.set(1, 0);

    this.setPosition(player.x, player.y);

    if (this.returns) {
      // The DNT Boomerang wears real art (issue #65): the carved-wood sprite on
      // the #60 art path — no identity tint — spun in flight (see `tick`). The
      // tinted halo is the old primitive look, so it stays hidden.
      this.setTexture(BOOMERANG_ART)
        .clearTint()
        .setOrigin(0.5)
        .setScale(Boomerang.ART_SCALE)
        .setRotation(0);
      this.halo.setVisible(false);
    } else {
      // The pierce shot (Popup Blocker) keeps the tinted-circle primitive until
      // its own art lands (issue #66). Reset any art state a pooled boomerang
      // throw left behind, then restore the original circle + halo.
      this.setTexture(circleTexture(this.scene, Boomerang.RADIUS))
        .setScale(1)
        .setRotation(0)
        .setTint(data.color);
      this.halo
        .setTint(data.color)
        .setPosition(player.x, player.y)
        .setVisible(true);
    }
  }

  tick(delta: number): void {
    if (!this.advance(delta)) return;

    // The carved boomerang twirls the whole flight; the pierce circle does not.
    if (this.returns) this.rotation += Boomerang.SPIN * delta;

    for (const [id, remaining] of this.hitCd) {
      this.hitCd.set(id, remaining - delta);
    }

    for (const enemy of this.enemies.active()) {
      if ((this.hitCd.get(enemy.spawnId) ?? 0) > 0) continue;
      const reach = Boomerang.RADIUS + enemy.archetype.radius;
      if (
        Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y) <= reach
      ) {
        enemy.takeDamage(this.damage, { x: this.x, y: this.y }, this.knockback);
        this.hitCd.set(enemy.spawnId, Boomerang.HIT_INTERVAL);
      }
    }

    this.halo.setPosition(this.x, this.y);
  }

  /** Moves one step. `false` once it has been caught and released. */
  private advance(delta: number): boolean {
    if (!this.returning) {
      const step = this.speed * delta;
      this.x += this.dir.x * step;
      this.y += this.dir.y * step;
      this.distOut += step;
      if (this.distOut >= this.travel) {
        // A pierce shot's line ends at max range; only a boomerang turns around.
        if (!this.returns) {
          this.release();
          return false;
        }
        this.returning = true;
      }
      return true;
    }

    const dx = this.player.x - this.x;
    const dy = this.player.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= Boomerang.CATCH) {
      this.release();
      return false;
    }
    const step = this.speed * delta;
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return true;
  }

  /** Takes the halo with it — the pool only knows about the sprite itself. */
  override release(): void {
    this.halo.setVisible(false);
    super.release();
  }
}
