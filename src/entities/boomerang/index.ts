import Phaser from "phaser";
import type { RangedWeaponData } from "../../content/types";
import type { GameBus } from "../../core/event-bus";
import type { Pool } from "../../core/pool";
import { PooledSprite } from "../../core/pool";
import { circleTexture } from "../../core/textures";
import type { Enemy } from "../enemy";
import type { Player } from "../player";
import boomerangUrl from "./assets/boomerang.png";
import pierceUrl from "./assets/pierce.png";

/** Art-path texture key for the returning boomerang's carved-wood sprite. */
const BOOMERANG_ART = "dnt_boomerang_art";
/** Art-path texture key for the Popup Blocker's pierce-shot embers (issue #66). */
const PIERCE_ART = "popup_blocker_pierce_art";

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
  /** Radians/sec the carved boomerang twirls in flight — a fast thrown spin. */
  private static readonly SPIN = 18;
  /** Native art is 32px; scaled so the visible boomerang reads a touch larger
   *  than its 16px hit circle without dwarfing the fodder. Tuned by eye. */
  private static readonly ART_SCALE = 0.85;
  /** The pierce embers are also 32px native; a hair larger than the boomerang
   *  so the committed line reads as the heavier shot. Tuned by eye. */
  private static readonly PIERCE_SCALE = 0.95;

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
  private bus!: GameBus;

  /** Load the carved-boomerang and pierce-ember art (art path, #60). Call from
   *  a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    scene.load.image(BOOMERANG_ART, boomerangUrl);
    scene.load.image(PIERCE_ART, pierceUrl);
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Boomerang.RADIUS));
    // Above the enemies it flies through, below the engagement drops.
    this.setDepth(2.6);
  }

  spawn(
    data: RangedWeaponData,
    dir: Phaser.Math.Vector2,
    player: Player,
    enemies: Pool<Enemy>,
    bus: GameBus,
  ): void {
    this.speed = data.projectileSpeed;
    this.travel = data.travelDistance;
    this.damage = data.baseDamage;
    this.knockback = data.knockback;
    this.returns = data.returns;
    this.player = player;
    this.enemies = enemies;
    this.bus = bus;

    this.distOut = 0;
    this.returning = false;
    this.hitCd.clear();

    if (dir.length() > 0.001) this.dir.copy(dir).normalize();
    else this.dir.set(1, 0);

    this.setPosition(player.x, player.y);

    if (this.returns) {
      // The DNT Boomerang wears real art (issue #65): the carved-wood sprite on
      // the #60 art path — no identity tint — spun in flight (see `tick`).
      this.setTexture(BOOMERANG_ART)
        .clearTint()
        .setOrigin(0.5)
        .setScale(Boomerang.ART_SCALE)
        .setRotation(0);
    } else {
      // The pierce shot (Popup Blocker) now wears its own art too (issue #66):
      // the fiery embers on the #60 art path — no identity tint — oriented along
      // the shot so the committed line reads as a directed streak, not a blob.
      this.setTexture(PIERCE_ART)
        .clearTint()
        .setOrigin(0.5)
        .setScale(Boomerang.PIERCE_SCALE)
        .setRotation(this.dir.angle());
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
        // The pierce shot bursts where it tags an enemy (issue #66); the
        // returning boomerang keeps its clean unimpacted flight (#65). The
        // per-enemy hit cooldown throttles this to one burst per tag.
        if (!this.returns) this.bus.emit("impact", enemy.x, enemy.y);
      }
    }
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
}
