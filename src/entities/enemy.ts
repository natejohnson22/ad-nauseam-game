import Phaser from "phaser";
import type { EnemyBehavior, EnemyData } from "../content/types";
import { PooledSprite } from "../core/pool";
import { circleTexture, ringTexture } from "../core/textures";
import { AlgorithmVfx, isAlgorithm } from "./algorithm-vfx";
import {
  type EnemyArt,
  enemyAnimKey,
  ensureEnemyAnims,
  getEnemyArt,
} from "./enemy-sprite";
import { UI, type UiConstruct, createUiConstruct, isUiConstruct } from "./ui-construct";
import { type Facing, facingXY } from "./player-sprite/facing";
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
  /** How long an art enemy takes to pop up into the world, in ms. */
  private static readonly POP_MS = 240;
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
   * This archetype's real art, or `undefined` while it's still a tinted circle.
   * When set, the sprite animates itself (idle/walk/death) instead of baking a
   * circle, and the hit-flash becomes an additive white-out — see #60 / #67.
   */
  private art: EnemyArt | undefined;
  /** Which way the body faces, driven by its per-frame movement. */
  private artFacing: Facing = "down";
  /**
   * The Algorithm's procedural VFX rig — the map's **third render path** (#71).
   * Set only while this sprite is the boss; the rig is lazily built on the first
   * boss spawn and reused, since a run holds exactly one. `isBoss` gates the
   * boss branches the same way `art` gates the spritesheet ones.
   */
  private algo: AlgorithmVfx | undefined;
  private isBoss = false;
  /**
   * The ad-side **procedural UI-construct** rig — the map's fourth render path
   * (#80/#81), a glowing browser-chrome window assembled from the shared kit.
   * Unlike the single-per-run boss, constructs come in swarms, so each pooled
   * `Enemy` owns its own controller, lazily built on its first construct spawn
   * and reused while the archetype stays the same. Recycled as a *different*
   * construct type, the old rig is destroyed and a new one built — the per-type
   * guard #81 left for #82+. `isConstruct` gates the branches, mirroring
   * `isBoss` / `art`.
   */
  private construct: UiConstruct | undefined;
  /** `displayName` the current `construct` was built for, or `undefined` while
   *  none is held. Compared on spawn so a Popup Grunt sprite recycled as a
   *  Paywall does not keep drawing the grunt. */
  private constructKind: string | undefined;
  private isConstruct = false;
  /**
   * The spawn "pop up" — a scale bounce from nothing to full, kept so a recycled
   * sprite kills a still-running pop before starting its own (and so death can
   * snap to full scale rather than freezing the body mid-grow).
   */
  private popTween: Phaser.Tweens.Tween | undefined;
  /**
   * Latched on the killing blow of an art enemy: the logic is already dead
   * (`onEnemyDied` fired, HP is 0), but the sprite lingers to play its death
   * clip and only returns to the pool on that clip's completion. `tick` no-ops
   * while it's set, so a corpse neither chases nor deals contact damage.
   */
  private dying = false;

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

    // Every archetype's clips, built once (idempotent). Cheap for the circle
    // roster — the registry only holds the archetypes that have real art.
    ensureEnemyAnims(scene);

    // The only non-looping enemy clip is death; when it finishes, the corpse
    // that has been lingering finally goes back to the pool. The `dying` guard
    // means idle/walk completions (there are none — they loop) can't trip it.
    this.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (this.dying && this.art && anim.key === enemyAnimKey(this.art, "death", this.artFacing)) {
          this.dying = false;
          this.release();
        }
      },
    );
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
    this.dying = false;
    // Kill any pop still running on a recycled sprite before it's re-scaled,
    // whichever kind of enemy it's coming back as.
    this.popTween?.remove();
    this.popTween = undefined;
    this.ring.setVisible(false);

    this.setPosition(x, y);
    this.isConstruct = isUiConstruct(data.displayName);
    // A construct archetype renders procedurally, so it never carries spritesheet
    // art; skip the registry lookup so the two paths can't both light up.
    this.art = this.isConstruct ? undefined : getEnemyArt(data.displayName);
    this.isBoss = isAlgorithm(data.displayName);
    if (this.isConstruct) {
      // Procedural UI-construct (#80/#81): no spritesheet, no tinted circle. The
      // rig dresses this pooled sprite as its window screen and owns the frame /
      // title-bar / close / glyphs / cursor around it; the identity tint is
      // dropped like the art + boss paths (the kit owns its own palette). Lazily
      // built per sprite and reused while this sprite stays the same archetype;
      // a type change tears the old rig down so a recycled grunt cannot spawn
      // as a Paywall still drawing a popup.
      this.algo?.hide();
      if (this.constructKind !== data.displayName) {
        this.construct?.hide();
        this.construct?.destroy();
        this.construct = createUiConstruct(this.scene, data.displayName);
        this.constructKind = data.displayName;
      }
      this.setScale(1).setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      this.construct!.spawn(this, x, y);
    } else if (this.isBoss) {
      // Procedural VFX construct (#71): no spritesheet and no tinted circle. The
      // rig dresses this pooled sprite as its lens and owns the halo/shards/iris
      // around it; the identity tint is dropped like the art path (its colours
      // are its own). Built once, reused — a run has a single boss.
      this.construct?.hide();
      this.algo ??= new AlgorithmVfx(this.scene);
      this.setScale(1).setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      this.algo.spawn(this, x, y);
    } else if (this.art) {
      // A recycled boss/construct coming back as an ordinary enemy leaves no rig.
      this.algo?.hide();
      this.construct?.hide();
      // Real art: the sprite plays its own idle clip in full colour, so the
      // identity tint is dropped (a coloured sheet × a tint is mud — #60).
      this.artFacing = "down";
      this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      this.play(enemyAnimKey(this.art, "idle", "down"));
      // The Popup Grunt *pops up*: a fast Back-eased scale bounce from nothing
      // to full, overshooting a touch so it lands with a little life. Runs on
      // top of the idle/walk clip and the chase — purely the entrance.
      this.setScale(0);
      this.popTween = this.scene.tweens.add({
        targets: this,
        scale: this.art.scale,
        duration: Enemy.POP_MS,
        ease: "Back.easeOut",
      });
    } else {
      this.algo?.hide();
      this.construct?.hide();
      // One baked texture per archetype radius, not one scaled texture: scaling
      // a tiny circle up is how placeholder art ends up looking like a smudge.
      // `setScale(1)` undoes any art scale a recycled sprite is carrying.
      this.setScale(1).setTexture(circleTexture(this.scene, data.radius));
      this.refreshTint();
    }
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
        // at low alpha rather than in danger-orange. A UI construct (#80) drops
        // its archetype identity colour for the cold family palette, so its
        // drag-behind slow field reads as family chrome-blue, not the enemy's
        // legacy brown; everything else keeps its own colour.
        this.ring.setTexture(
          ringTexture(this.scene, behavior.radius, Enemy.TELEGRAPH_THICKNESS),
        );
        this.ring
          .setTint(this.isConstruct ? UI.FRAME : this.archetype.color)
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
        //
        // A UI construct's muzzle flare reads in the family's white glow rather
        // than the shared danger orange (the Tracking Pixel's reticle body still
        // bleeds toward orange on lock — the ring is the family chrome, the
        // reticle carries the danger). Non-constructs on this arm — the boss —
        // keep the orange telegraph grammar.
        this.ring
          .setTexture(
            ringTexture(
              this.scene,
              this.archetype.radius + Enemy.MUZZLE_MARGIN,
              Enemy.TELEGRAPH_THICKNESS,
            ),
          )
          .setTint(this.isConstruct ? UI.GLOW : Enemy.TELEGRAPH_COLOR);
        break;
    }
  }

  tick(delta: number): void {
    // A corpse mid-death-clip is still active in the pool until the clip ends;
    // it holds its ground, plays out, and touches nothing until then.
    if (this.dying) return;

    const behavior = this.archetype.behavior;
    // Captured before the behaviour moves us, so the pose reads the frame's
    // actual displacement — which way it *went*, not which way the player is.
    const fromX = this.x;
    const fromY = this.y;
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

    if (this.isConstruct) {
      // The construct animates from its own displacement (lunge + lean), the
      // hit-flash, and — for the wind-up arms — the same attack charge the boss
      // rig reads, so a locking-on reticle bleeds orange in step with the muzzle
      // ring. Chase constructs never wind up, so charge stays 0 for them.
      const charge =
        this.attackState === "winding" &&
        (behavior.kind === "ranged_standoff" || behavior.kind === "telegraph_aoe")
          ? 1 - this.attackWind / Math.max(0.01, behavior.telegraph)
          : 0;
      this.construct!.tick(
        delta,
        this.x,
        this.y,
        this.x - fromX,
        this.y - fromY,
        this.player.x,
        this.player.y,
        this.flash,
        charge,
      );
    } else if (this.isBoss) {
      // The wind-up drives the boss's "about to fire" reaction — shards pull in,
      // the palette bleeds toward the telegraph orange — alongside the ring.
      const charge =
        this.attackState === "winding" && behavior.kind === "ranged_standoff"
          ? 1 - this.attackWind / Math.max(0.01, behavior.telegraph)
          : 0;
      this.algo!.tick(
        delta,
        this.x,
        this.y,
        this.player.x,
        this.player.y,
        charge,
        this.flash,
      );
    } else if (this.art) {
      this.updateArtPose(this.x - fromX, this.y - fromY);
    }
  }

  /**
   * Face the way the body moved this frame and play walk or idle to match. A
   * planted enemy (winding up, or held in a standoff band) shows idle — the
   * stillness that is itself a telegraph. `play(…, true)` ignores a re-request
   * of the clip already running, so this is a no-op on the frames it doesn't
   * change anything.
   */
  private updateArtPose(dx: number, dy: number): void {
    const moving = Math.hypot(dx, dy) > 0.01;
    if (moving) this.artFacing = facingXY(dx, dy);
    const name = moving ? "walk" : "idle";
    this.play(enemyAnimKey(this.art!, name, this.artFacing), true);
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

  /** Takes the ring (and the boss rig) with it — the pool only knows about the
   *  sprite itself. */
  override release(): void {
    this.ring.setVisible(false);
    this.algo?.hide();
    this.construct?.hide();
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
      // Scaled per archetype: the boss is `0` (an immovable wall), everything
      // else defaults to full knockback (#51).
      const scale = knockback * (this.archetype.knockbackScale ?? 1);
      if (d > 0.001 && scale !== 0) {
        this.x += (dx / d) * scale;
        this.y += (dy / d) * scale;
      }
    }

    // After the knockback, so the number pops where the enemy actually ended up
    // rather than where it was standing; before the death branch, so the killing
    // blow is shown and counted like every other hit.
    this.events.onEnemyDamaged(this, amount);

    if (this.hp <= 0) {
      if (this.isConstruct) {
        // The construct closes rather than plays a death clip: the window snaps
        // shut. Like the boss/art paths the logic dies now (kill counted here),
        // the sprite lingers for the close, and `dying` stops it acting until
        // the controller hands it back to the pool.
        this.dying = true;
        this.ring.setVisible(false);
        this.construct!.die(this.x, this.y, () => {
          this.dying = false;
          this.release();
        });
        this.events.onEnemyDied(this);
      } else if (this.isBoss) {
        // The boss implodes rather than plays a death clip: like the art path,
        // the logic dies now (kill counted here) but the sprite lingers for the
        // implosion and only returns to the pool when it finishes. `dying` stops
        // it acting in the meantime.
        this.dying = true;
        this.ring.setVisible(false);
        this.algo!.die(this.x, this.y, () => {
          this.dying = false;
          this.release();
        });
        this.events.onEnemyDied(this);
      } else if (this.art) {
        // The logic dies now — kill counted, engagement dropped at this spot —
        // but the sprite lingers to play its death clip and only releases on the
        // clip's completion (the constructor's ANIMATION_COMPLETE). `dying`
        // stops it chasing or dealing contact damage in the meantime. Cleared of
        // the white-out so the death frames read in their own colour.
        this.dying = true;
        this.ring.setVisible(false);
        // A grunt killed mid-pop snaps to full size so the death plays at the
        // body's real scale rather than freezing it half-grown.
        this.popTween?.remove();
        this.popTween = undefined;
        this.setScale(this.art.scale);
        // Drop any FILL-mode white-out the last hit left on, so the death frames
        // read in their own colour rather than a white silhouette.
        this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
        this.tintedAt = -1;
        this.play(enemyAnimKey(this.art, "death", this.artFacing));
        this.events.onEnemyDied(this);
      } else {
        // Released first, so the drop that lands on this position is not
        // competing with a sprite the pool is about to hand back out.
        this.release();
        this.events.onEnemyDied(this);
      }
    } else {
      this.refreshTint();
    }
  }

  /** The hit flash: `data.color` lerped toward white, as a tint rather than a redraw. */
  private refreshTint(): void {
    if (this.flash === this.tintedAt) return;
    this.tintedAt = this.flash;

    if (this.isBoss || this.isConstruct) {
      // The rig owns its whole palette, including the hit-flash brighten it
      // applies from `flash` in `tick`; the primitive colour-lerp below would
      // fight it, so there is nothing to do on this sprite's own tint.
      return;
    }

    if (this.art) {
      // A coloured sheet can't be lerped toward white by a multiply tint, so
      // the flash is a FILL-mode white-out: the body reads as a solid white
      // silhouette for the brightest ~0.12s of the hit, then back to its art.
      // (Phaser 4 split the fill flag off `setTint` into `setTintMode`.)
      if (this.flash > 0.25) {
        this.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
      } else {
        this.setTintMode(Phaser.TintModes.MULTIPLY).clearTint();
      }
      return;
    }

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
