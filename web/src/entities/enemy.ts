import Phaser from "phaser";
import type { EnemyBehavior, EnemyData } from "../content/types";
import { PooledSprite } from "../core/pool";
import { circleTexture, ringTexture } from "../core/textures";
import type { Player } from "./player";

/**
 * Generic enemy driven entirely by its `EnemyData` — the port of `enemy.gd`.
 * Interactions are distance checks, not physics: `enemy.gd:5` states that as a
 * deliberate choice, and issue #7 kept it (no physics engine is adopted).
 *
 * Pooled, so **every** field below is reset in `spawn()`. A recycled sprite
 * remembers its last life; that is the whole hazard of the pooling story.
 */
/**
 * Told when an enemy is hurt or dies — so the damage can be totted up and
 * floated, and the kill counted and its engagement dropped. `GameScene`
 * implements it.
 *
 * The death half is the surviving piece of Godot's `enemy_spawned` -> `died`
 * wiring: the director owning the pool killed the *spawn* signal (issue #7),
 * but somebody outside the pool still has to hear about deaths. A field set on
 * every `spawn()` rather than a listener, because a listener on a recycled
 * sprite is the pooling bug this whole split exists to prevent — which is
 * exactly why `onEnemyDamaged` joins it here rather than riding the bus
 * (issue #25). Per-hit is the highest-frequency signal in the game; it belongs
 * on the direct call, not the announcement channel.
 */
export interface EnemyEvents {
  /** `amount` is what the weapon dealt, **not** what the enemy could absorb —
      the last hit on a grunt reports the whole swing. See `takeDamage`. */
  onEnemyDamaged(enemy: Enemy, amount: number): void;
  onEnemyDied(enemy: Enemy): void;
}

export class Enemy extends PooledSprite {
  /** Placeholder texture; `spawn` swaps in the one matching the archetype. */
  private static readonly PLACEHOLDER_RADIUS = 1;
  /** Rate `_flash` decays at, per second. */
  private static readonly FLASH_DECAY = 6;
  /** The telegraph ring's stroke, `Color(1.0, 0.35, 0.1)` and 3px in Godot. */
  private static readonly TELEGRAPH_COLOR = 0xff591a;
  private static readonly TELEGRAPH_THICKNESS = 3;

  /**
   * A per-spawn identity, handed out monotonically.
   *
   * The sprite is not one: a pool hands the same object back out, so a `Map`
   * keyed by `Enemy` — which is exactly what `boomerang.gd`'s `_hit_cd`
   * dictionary is, keyed by node — would carry a dead enemy's hit cooldown onto
   * whatever the pool recycled it into. Godot never had to answer this because
   * `queue_free()` made the key unreachable.
   */
  private static nextSpawnId = 0;

  /** Named `archetype`, not `data`: `data` is Phaser's own DataManager slot. */
  archetype!: EnemyData;
  hp = 0;
  /** Distinct per spawn — see `nextSpawnId`. Read by `Boomerang`. */
  spawnId = -1;

  private player!: Player;
  private events!: EnemyEvents;
  private contactCd = 0;
  private flash = 0;
  /** Last flash value pushed to the tint, so the tint is set only on change. */
  private tintedAt = -1;

  /** `telegraph_aoe` only; `chase` enemies leave all three untouched. */
  private aoeState: "idle" | "winding" = "idle";
  private aoeCd = 0;
  private aoeWind = 0;

  /**
   * The danger ring, drawn only while winding.
   *
   * A second sprite rather than part of the enemy's own, because Godot draws
   * both in one `_draw` and Phaser sprites have no child transforms — the same
   * reason `Player` carries its facing pip separately.
   */
  private readonly ring: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Enemy.PLACEHOLDER_RADIUS));
    // Above the player and the sword arc, matching Godot's tree order: the
    // director's enemies are added to World after the player subtree.
    this.setDepth(2);

    this.ring = scene.add
      .sprite(0, 0, ringTexture(scene, 1, Enemy.TELEGRAPH_THICKNESS))
      // Above the swarm: a telegraph buried under grunts is not a warning.
      .setDepth(2.5)
      .setTint(Enemy.TELEGRAPH_COLOR)
      .setVisible(false);
  }

  /** Re-initialise a recycled sprite. `setup()` + `_ready()` from Godot. */
  spawn(
    data: EnemyData,
    x: number,
    y: number,
    player: Player,
    events: EnemyEvents,
  ): void {
    this.archetype = data;
    this.hp = data.maxHp;
    this.player = player;
    this.events = events;
    this.contactCd = 0;
    this.flash = 0;
    this.tintedAt = -1;
    this.spawnId = Enemy.nextSpawnId++;

    this.aoeState = "idle";
    this.aoeWind = 0;
    // `setup()`'s `_aoe_cd = d.aoe_interval`: an ogre chases for a full interval
    // before its first wind-up, so it never blasts the moment it arrives.
    this.aoeCd =
      data.behavior.kind === "telegraph_aoe" ? data.behavior.interval : 0;
    this.ring.setVisible(false);
    if (data.behavior.kind === "telegraph_aoe") {
      this.ring.setTexture(
        ringTexture(this.scene, data.behavior.radius, Enemy.TELEGRAPH_THICKNESS),
      );
    }

    this.setPosition(x, y);
    // One baked texture per archetype radius, not one scaled texture: scaling a
    // tiny circle up is how placeholder art ends up looking like a smudge.
    this.setTexture(circleTexture(this.scene, data.radius));
    this.refreshTint();
  }

  tick(delta: number): void {
    const behavior = this.archetype.behavior;
    switch (behavior.kind) {
      case "chase":
        this.chase(delta);
        break;
      case "telegraph_aoe":
        this.tickAoe(delta, behavior);
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

  /**
   * The Autoplay Video Ogre's two-state machine: chase while `IDLE`, plant and
   * telegraph while `WINDING`, then blast whatever is still inside the ring.
   *
   * The wind-up is the whole enemy — it is slow (38px/s against the player's
   * 220) and its damage is a third of the player's health, so the only thing
   * making it fair is that the ring says exactly where and exactly when.
   */
  private tickAoe(
    delta: number,
    behavior: Extract<EnemyBehavior, { kind: "telegraph_aoe" }>,
  ): void {
    if (this.aoeState === "idle") {
      this.chase(delta);
      this.aoeCd -= delta;
      if (this.aoeCd <= 0) {
        this.aoeState = "winding";
        this.aoeWind = behavior.telegraph;
      }
      return;
    }

    this.aoeWind -= delta;
    if (this.aoeWind <= 0) {
      this.blast(behavior);
      this.aoeState = "idle";
      this.aoeCd = behavior.interval;
      this.ring.setVisible(false);
      return;
    }

    // Brightening as the blast nears, per `_draw`. The ring is re-positioned
    // every frame despite the ogre being planted: `takeDamage`'s knockback
    // teleports it mid-wind, and a ring left behind would lie about the blast.
    const t = 1 - this.aoeWind / Math.max(0.01, behavior.telegraph);
    this.ring
      .setPosition(this.x, this.y)
      .setAlpha(0.35 + 0.4 * t)
      .setVisible(true);
  }

  private blast(
    behavior: Extract<EnemyBehavior, { kind: "telegraph_aoe" }>,
  ): void {
    const d = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.player.x,
      this.player.y,
    );
    if (d <= behavior.radius) this.player.takeDamage(behavior.damage);
  }

  /** Takes the ring with it — the pool only knows about the sprite itself. */
  override release(): void {
    this.ring.setVisible(false);
    super.release();
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
   *
   * The single funnel every hit in the game passes through, which is why the
   * damage report lives here rather than at the two weapon call sites
   * (issue #25). It reports `amount` — what the weapon dealt — and not the HP
   * actually removed: a maxed sword reads 500 on the grunt that had 180 left,
   * because the number the player sees and the number the run totals must be
   * the same number, and the one worth watching is the build's output.
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

    // After the knockback, so the number pops where the enemy actually ended up
    // rather than where it was standing; before the death branch, so the killing
    // blow is shown and counted like every other hit.
    this.events.onEnemyDamaged(this, amount);

    if (this.hp <= 0) {
      // Released first, so the drop that lands on this position is not competing
      // with a sprite the pool is about to hand back out.
      this.release();
      this.events.onEnemyDied(this);
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
