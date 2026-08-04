import Phaser from "phaser";
import type { EnemyData } from "../content/types";
import { PooledSprite } from "../core/pool";
import { circleTexture } from "../core/textures";
import type { Player } from "./player";

/**
 * Generic enemy driven entirely by its `EnemyData` — the port of `enemy.gd`.
 * Interactions are distance checks, not physics: `enemy.gd:5` states that as a
 * deliberate choice, and issue #7 kept it (no physics engine is adopted).
 *
 * Pooled, so **every** field below is reset in `spawn()`. A recycled sprite
 * remembers its last life; that is the whole hazard of the pooling story.
 *
 * Slice 5 adds the ogre's `telegraph_aoe` behaviour, at which point the switch
 * in `tick` stops being a single arm.
 */
/**
 * Told when an enemy dies, so the kill can be counted and its engagement
 * dropped. `GameScene` implements it.
 *
 * This is the surviving half of Godot's `enemy_spawned` -> `died` wiring: the
 * director owning the pool killed the *spawn* signal (issue #7), but somebody
 * outside the pool still has to hear about deaths. A field set on every
 * `spawn()` rather than a listener, because a listener on a recycled sprite is
 * the pooling bug this whole split exists to prevent.
 */
export interface EnemyDeaths {
  onEnemyDied(enemy: Enemy): void;
}

export class Enemy extends PooledSprite {
  /** Placeholder texture; `spawn` swaps in the one matching the archetype. */
  private static readonly PLACEHOLDER_RADIUS = 1;
  /** Rate `_flash` decays at, per second. */
  private static readonly FLASH_DECAY = 6;

  /** Named `archetype`, not `data`: `data` is Phaser's own DataManager slot. */
  archetype!: EnemyData;
  hp = 0;

  private player!: Player;
  private deaths!: EnemyDeaths;
  private contactCd = 0;
  private flash = 0;
  /** Last flash value pushed to the tint, so the tint is set only on change. */
  private tintedAt = -1;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Enemy.PLACEHOLDER_RADIUS));
    // Above the player and the sword arc, matching Godot's tree order: the
    // director's enemies are added to World after the player subtree.
    this.setDepth(2);
  }

  /** Re-initialise a recycled sprite. `setup()` + `_ready()` from Godot. */
  spawn(
    data: EnemyData,
    x: number,
    y: number,
    player: Player,
    deaths: EnemyDeaths,
  ): void {
    this.archetype = data;
    this.hp = data.maxHp;
    this.player = player;
    this.deaths = deaths;
    this.contactCd = 0;
    this.flash = 0;
    this.tintedAt = -1;

    this.setPosition(x, y);
    // One baked texture per archetype radius, not one scaled texture: scaling a
    // tiny circle up is how placeholder art ends up looking like a smudge.
    this.setTexture(circleTexture(this.scene, data.radius));
    this.refreshTint();
  }

  tick(delta: number): void {
    switch (this.archetype.behavior.kind) {
      case "chase":
        this.chase(delta);
        break;
    }

    this.contactCd = Math.max(0, this.contactCd - delta);
    this.tryContact();

    this.flash = Math.max(0, this.flash - delta * Enemy.FLASH_DECAY);
    this.refreshTint();
  }

  private chase(delta: number): void {
    const dx = this.player.x - this.x;
    const dy = this.player.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d > 1) {
      this.x += (dx / d) * this.archetype.speed * delta;
      this.y += (dy / d) * this.archetype.speed * delta;
    }
  }

  private tryContact(): void {
    if (this.contactCd > 0) return;
    const reach = this.archetype.radius + this.player.radius;
    if (Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y) <= reach) {
      this.player.takeDamage(this.archetype.contactDamage);
      this.contactCd = this.archetype.contactInterval;
    }
  }

  /**
   * Called by weapons. `knockbackFrom` is the source position the knockback
   * pushes away from — a position teleport, exactly as in Godot, which is one
   * of the reasons a velocity-driven physics body was rejected.
   */
  takeDamage(
    amount: number,
    knockbackFrom: Phaser.Types.Math.Vector2Like | null = null,
    knockback = 0,
  ): void {
    if (this.hp <= 0) return;
    this.hp -= amount;
    this.flash = 1;

    if (knockbackFrom !== null && knockback > 0) {
      const dx = this.x - (knockbackFrom.x ?? 0);
      const dy = this.y - (knockbackFrom.y ?? 0);
      const d = Math.hypot(dx, dy);
      if (d > 0.001) {
        this.x += (dx / d) * knockback;
        this.y += (dy / d) * knockback;
      }
    }

    if (this.hp <= 0) {
      // Released first, so the drop that lands on this position is not competing
      // with a sprite the pool is about to hand back out.
      this.release();
      this.deaths.onEnemyDied(this);
    } else {
      this.refreshTint();
    }
  }

  /** The hit flash: `data.color` lerped toward white, as a tint rather than a redraw. */
  private refreshTint(): void {
    if (this.flash === this.tintedAt) return;
    this.tintedAt = this.flash;

    const c = this.archetype.color;
    const toward = (channel: number): number =>
      Math.round(channel + (0xff - channel) * this.flash);
    this.setTint(
      (toward((c >> 16) & 0xff) << 16) |
        (toward((c >> 8) & 0xff) << 8) |
        toward(c & 0xff),
    );
  }
}
