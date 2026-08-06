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
  /**
   * A `ranged_standoff` enemy's wind-up has finished and a shot leaves now,
   * from this enemy's position along `dir` (issue #31).
   *
   * Here rather than the enemy holding a projectile pool, for the same reason
   * the director never sees a `Pool<Enemy>`: the scene is the only thing that
   * owns pools, and an enemy that could reach one would be a second place
   * spawning happens. `dir` is a shared scratch vector — the implementation
   * must consume it on the call, not keep it.
   */
  onEnemyFired(
    enemy: Enemy,
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
    dir: Phaser.Math.Vector2,
  ): void;
}

export class Enemy extends PooledSprite {
  /** Placeholder texture; `spawn` swaps in the one matching the archetype. */
  private static readonly PLACEHOLDER_RADIUS = 1;
  /** Rate `_flash` decays at, per second. */
  private static readonly FLASH_DECAY = 6;
  /** The telegraph ring's stroke, `Color(1.0, 0.35, 0.1)` and 3px in Godot. */
  private static readonly TELEGRAPH_COLOR = 0xff591a;
  private static readonly TELEGRAPH_THICKNESS = 3;
  /** How faint a standing slow field is drawn — present, never alarming. */
  private static readonly AURA_ALPHA = 0.22;
  /** How far a shooter's muzzle flare sits outside its body. */
  private static readonly MUZZLE_MARGIN = 8;
  /** Reused for every shot's aim, so firing allocates nothing. */
  private static readonly aim = new Phaser.Math.Vector2();

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

  /**
   * The wind-up clock, shared by both attacking arms — `telegraph_aoe`'s blast
   * and `ranged_standoff`'s shot are the same two-state machine with a
   * different payload (issue #31). `chase` and `chase_aura` leave all three
   * untouched.
   */
  private attackState: "idle" | "winding" = "idle";
  private attackCd = 0;
  private attackWind = 0;

  /**
   * The ring: a danger telegraph on the attacking arms, and a standing slow
   * field on `chase_aura`. One sprite serving both because an archetype has
   * exactly one behaviour, so the two uses can never collide — `spawn` decides
   * which it is.
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

    this.attackState = "idle";
    this.attackWind = 0;
    this.attackCd = 0;
    this.ring.setVisible(false);

    this.setPosition(x, y);
    // One baked texture per archetype radius, not one scaled texture: scaling a
    // tiny circle up is how placeholder art ends up looking like a smudge.
    this.setTexture(circleTexture(this.scene, data.radius));
    this.refreshTint();
    // After the position, so a standing aura is drawn where the enemy actually
    // is on its first frame rather than wherever the pool last left it.
    this.resetRing(data.behavior);
  }

  /**
   * Point the ring at whatever this archetype uses it for, and seed the attack
   * clock. Both arms that attack wait a full interval before their first
   * wind-up — `setup()`'s `_aoe_cd = d.aoe_interval` — so an enemy never fires
   * the instant it arrives, which would be unreadable in the middle of a wave.
   */
  private resetRing(behavior: EnemyBehavior): void {
    switch (behavior.kind) {
      case "chase":
        break;
      case "chase_aura":
        // Standing, not telegraphing: the field is always there, so it is drawn
        // in the enemy's own colour at low alpha rather than in danger-orange.
        this.ring.setTexture(
          ringTexture(this.scene, behavior.radius, Enemy.TELEGRAPH_THICKNESS),
        );
        this.ring
          .setTint(this.archetype.color)
          .setAlpha(Enemy.AURA_ALPHA)
          .setPosition(this.x, this.y)
          .setVisible(true);
        break;
      case "telegraph_aoe":
        this.attackCd = behavior.interval;
        this.ring
          .setTexture(
            ringTexture(this.scene, behavior.radius, Enemy.TELEGRAPH_THICKNESS),
          )
          .setTint(Enemy.TELEGRAPH_COLOR);
        break;
      case "ranged_standoff":
        this.attackCd = behavior.interval;
        // Tight to the body — a muzzle flare, not a danger zone. The danger is
        // the shot that follows, and it is somewhere else a moment later.
        this.ring
          .setTexture(
            ringTexture(
              this.scene,
              this.archetype.radius + Enemy.MUZZLE_MARGIN,
              Enemy.TELEGRAPH_THICKNESS,
            ),
          )
          .setTint(Enemy.TELEGRAPH_COLOR);
        break;
    }
  }

  tick(delta: number): void {
    const behavior = this.archetype.behavior;
    switch (behavior.kind) {
      case "chase":
        this.chase(delta);
        break;
      case "chase_aura":
        this.tickAura(delta, behavior);
        break;
      case "telegraph_aoe":
        this.tickAoe(delta, behavior);
        break;
      case "ranged_standoff":
        this.tickStandoff(delta, behavior);
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
   * The Cookie Banner: chases like a grunt, and slows the player while they are
   * inside its field (issue #31).
   *
   * The slow is pushed to the player rather than pulled by them, because the
   * player would otherwise have to scan every live enemy every frame to find
   * the one or two with auras — the same scan `WeaponManager.nearestEnemy` pays
   * for once, multiplied by a swarm. Pushing means only the handful of enemies
   * that *have* a field do any work. `Player.applySlow` takes the minimum, so
   * overlapping banners do not compound.
   */
  private tickAura(
    delta: number,
    behavior: Extract<EnemyBehavior, { kind: "chase_aura" }>,
  ): void {
    this.chase(delta);
    this.ring.setPosition(this.x, this.y);

    const d = Phaser.Math.Distance.Between(
      this.x,
      this.y,
      this.player.x,
      this.player.y,
    );
    if (d <= behavior.radius) this.player.applySlow(behavior.speedMult);
  }

  /**
   * The ranged half of the roster — Tracking Pixel, Paywall, and the boss all
   * run this (issue #31).
   *
   * Three zones rather than two: close to `range`, back off inside `minRange`,
   * hold in the band between. The retreat is what stops a shooter degenerating
   * into a slow chaser once the player walks at it, and the band is what stops
   * it jittering between advance and retreat on a single threshold.
   *
   * It plants while winding up, exactly as the Ogre does. That stillness *is*
   * the telegraph as much as the flare is: an enemy that stops moving in this
   * game is about to do something.
   */
  private tickStandoff(
    delta: number,
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
  ): void {
    if (this.attackState === "idle") {
      const dx = this.player.x - this.x;
      const dy = this.player.y - this.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        // +1 toward the player when too far, -1 away when too close, 0 in the
        // band — one expression rather than a branch per zone.
        const sign = d > behavior.range ? 1 : d < behavior.minRange ? -1 : 0;
        const step = this.archetype.speed * delta * sign;
        this.x += (dx / d) * step;
        this.y += (dy / d) * step;
      }

      this.attackCd -= delta;
      if (this.attackCd <= 0) {
        this.attackState = "winding";
        this.attackWind = behavior.telegraph;
      }
      return;
    }

    this.attackWind -= delta;
    if (this.attackWind <= 0) {
      this.fire(behavior);
      this.attackState = "idle";
      this.attackCd = behavior.interval;
      this.ring.setVisible(false);
      return;
    }

    // Brightening as the shot nears, as the Ogre's ring does — one visual
    // grammar for "something is about to happen here".
    const t = 1 - this.attackWind / Math.max(0.01, behavior.telegraph);
    this.ring
      .setPosition(this.x, this.y)
      .setAlpha(0.35 + 0.4 * t)
      .setVisible(true);
  }

  /**
   * Aimed at where the player is **now**, at the instant the shot leaves — not
   * at where they were when the wind-up started. Leading the wind-up would make
   * standing still the safe play, which is the opposite of what this enemy is
   * for; aiming late means the dodge is to keep moving through the flare.
   */
  private fire(
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
  ): void {
    const dir = Enemy.aim
      .set(this.player.x - this.x, this.player.y - this.y)
      .normalize();
    // A player standing exactly on the shooter normalises to (0,0); fire right
    // rather than spawn a projectile that never moves and never expires.
    if (dir.length() < 0.001) dir.set(1, 0);
    this.events.onEnemyFired(this, behavior, dir);
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
    if (this.attackState === "idle") {
      this.chase(delta);
      this.attackCd -= delta;
      if (this.attackCd <= 0) {
        this.attackState = "winding";
        this.attackWind = behavior.telegraph;
      }
      return;
    }

    this.attackWind -= delta;
    if (this.attackWind <= 0) {
      this.blast(behavior);
      this.attackState = "idle";
      this.attackCd = behavior.interval;
      this.ring.setVisible(false);
      return;
    }

    // Brightening as the blast nears, per `_draw`. The ring is re-positioned
    // every frame despite the ogre being planted: `takeDamage`'s knockback
    // teleports it mid-wind, and a ring left behind would lie about the blast.
    const t = 1 - this.attackWind / Math.max(0.01, behavior.telegraph);
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
