/**
 * The Algorithm — the one enemy with no fantasy-monster fit, built as a
 * **procedural VFX construct** rather than a spritesheet (research #56, map #55,
 * issue #71). It is deliberately *not* a monster: it is the abstract system —
 * an all-seeing feed-engine, a cold white lens ringed by orbiting data-shards,
 * its dark iris tracking the player.
 *
 * This is the map's **third render path**. The other five enemies are either the
 * tinted-circle primitive path or the full-colour spritesheet art path (#60 /
 * ADR 0001); the boss is neither. It stays on the *primitive* half of the #60
 * contract — every piece is a white shape baked with `generateTexture` and
 * tinted, the same procedural-VFX family `core/textures.ts` documents — so it
 * needs no art assets and no `preload`.
 *
 * `Enemy` keeps ownership of the **core** (its own pooled sprite *is* the lens),
 * and hands it to this controller so all the boss's motion — the pulse, the
 * entrance, the death implosion — lives in one place. The extra pieces (glow
 * halo, rune ring, orbiting shards, iris, pupil) are sibling GameObjects this
 * module owns and positions each frame around the core, exactly as `Enemy`
 * carries its telegraph `ring` as a sibling.
 *
 * **Palette discipline (issue #94).** The boss donated its colours to the shared
 * UI-construct kit when that was extracted (#81); it now **imports them back**
 * from `ui-construct/kit` rather than owning a private copy, so it can no longer
 * drift from the family it seeded. It stays deliberately the *abstract* one —
 * the engine the windows come out of, not a sixth window — so this is a palette
 * pass only: no chrome, no shape change (map #80 rules the core redesign out).
 */
import Phaser from "phaser";
import { UI, mixTint } from "../ui-construct/kit";

/** Marks the archetype whose body is this procedural rig, keyed like the art
 *  registry so `content/` stays free of render concerns. */
export const isAlgorithm = (displayName: string): boolean =>
  displayName === "The Algorithm";

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const CORE_TEX = "algo:core";
const RING_TEX = "algo:ring";
const HALO_TEX = "algo:halo";
const IRIS_TEX = "algo:iris";
const PUPIL_TEX = "algo:pupil";
const SHARD_TEX = "algo:shard";

// Geometry. The hitbox is radius 48 (immovable wall); the lens sits just inside
// it and the halo + shards spill well past, so the assembly *reads* far larger
// than the body you actually park on — the presence a final boss wants.
const CORE_R = 46;
const HALO_R = 100;
const RING_R = 68;
const IRIS_R = 24;
const PUPIL_R = 9;
const SHARD_HALF = 13;

const SHARD_COUNT = 6;
const ORBIT_IDLE = 120; // resting orbit radius of the shards
const ORBIT_CHARGED = 82; // pulled in as a shot winds up
const MAX_LOOK = 13; // how far the iris slides toward the player

// Palette — **sourced from the shared family kit, not owned here** (issue #94).
// The Algorithm's colours became `UI` when the kit was extracted (#81); it now
// imports them back, so the boss cannot drift from the family it seeded. Four of
// these were hardcoded near-misses before the pass; the mapping is the whole of
// the boss's palette, and every value below is a `UI` member — no private hex.
const CORE_TINT = UI.GLOW;
const HALO_TINT = UI.FRAME;
const RING_TINT = UI.CYAN;
/** The dark iris is literally a screen — `SCREEN` is what that colour means. */
const IRIS_TINT = UI.SCREEN;
const PUPIL_TINT = UI.CYAN;
/** Shards are data calved off the lens, so they share the lens's exact material.
 *  `GLOW` (not `CYAN`) keeps the depth ladder: halo `FRAME` < ring `CYAN` <
 *  shards + core `GLOW`. Snapping them to `CYAN` would collapse them into the
 *  rune ring. */
const SHARD_TINT = UI.GLOW;
/** `UI.ALERT` *is* `Enemy.TELEGRAPH_COLOR` — so the charging body and the boss's
 *  own telegraph ring finally agree, which the old 0xff7a2a only claimed to. */
const CHARGE_TINT = UI.ALERT;

// Depths, threaded around the core's 2 and the telegraph ring's 2.5.
const DEPTH_HALO = 1.78;
const DEPTH_RING = 1.82;
const DEPTH_SHARD = 1.86;
const DEPTH_IRIS = 2.08;
const DEPTH_PUPIL = 2.1;

const DEATH_MS = 620;

/** Bake a soft-edged glow disc: concentric white fills whose overlap builds the
 *  centre up under source-over, so it fades out toward the rim. Rendered ADD. */
function bakeSoftDisc(scene: Phaser.Scene, key: string, radius: number): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const steps = 18;
  for (let i = 0; i < steps; i++) {
    const r = radius * (1 - i / steps);
    g.fillStyle(0xffffff, 0.07);
    g.fillCircle(radius, radius, r);
  }
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
  return key;
}

/** Bake a filled white disc. */
function bakeDisc(scene: Phaser.Scene, key: string, radius: number): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(radius, radius, radius);
  g.generateTexture(key, radius * 2, radius * 2);
  g.destroy();
  return key;
}

/** Bake a white ring outline (a rune-ring the assembly counter-rotates). */
function bakeRing(scene: Phaser.Scene, key: string, radius: number): string {
  if (scene.textures.exists(key)) return key;
  const t = 3;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(t, 0xffffff, 1);
  g.strokeCircle(radius + t, radius + t, radius);
  g.generateTexture(key, (radius + t) * 2, (radius + t) * 2);
  g.destroy();
  return key;
}

/** Bake a white diamond — one orbiting data-shard. */
function bakeShard(scene: Phaser.Scene, key: string, half: number): string {
  if (scene.textures.exists(key)) return key;
  const s = half * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillPoints(
    [
      new Phaser.Math.Vector2(half, 0),
      new Phaser.Math.Vector2(s, half),
      new Phaser.Math.Vector2(half, s),
      new Phaser.Math.Vector2(0, half),
    ],
    true,
  );
  g.generateTexture(key, s, s);
  g.destroy();
  return key;
}

export class AlgorithmVfx {
  private readonly scene: Phaser.Scene;
  private readonly halo: Phaser.GameObjects.Sprite;
  private readonly ring: Phaser.GameObjects.Sprite;
  private readonly iris: Phaser.GameObjects.Sprite;
  private readonly pupil: Phaser.GameObjects.Sprite;
  private readonly shards: Phaser.GameObjects.Sprite[] = [];
  /** Base orbital phase of each shard, evenly spaced round the lens. */
  private readonly shardPhase: number[] = [];

  /** The `Enemy` sprite this rig wraps — the lens. Set on `spawn`. */
  private core: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock
  private orbit = 0; // rotation of the whole shard ring
  private orbitR = ORBIT_IDLE; // current orbit radius, eased on charge
  private lookX = 0; // eased iris offset toward the player
  private lookY = 0;
  private bornP = 0; // entrance progress 0..1 — drives the lens's zoom-in
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeDisc(scene, CORE_TEX, CORE_R);
    bakeSoftDisc(scene, HALO_TEX, HALO_R);
    bakeRing(scene, RING_TEX, RING_R);
    bakeDisc(scene, IRIS_TEX, IRIS_R);
    bakeDisc(scene, PUPIL_TEX, PUPIL_R);
    bakeShard(scene, SHARD_TEX, SHARD_HALF);

    const mk = (
      tex: string,
      depth: number,
      tint: number,
      blend: Phaser.BlendModes = Phaser.BlendModes.NORMAL,
    ): Phaser.GameObjects.Sprite =>
      scene.add
        .sprite(0, 0, tex)
        .setDepth(depth)
        .setTint(tint)
        .setBlendMode(blend)
        .setVisible(false);

    this.halo = mk(HALO_TEX, DEPTH_HALO, HALO_TINT, Phaser.BlendModes.ADD);
    this.ring = mk(RING_TEX, DEPTH_RING, RING_TINT);
    this.iris = mk(IRIS_TEX, DEPTH_IRIS, IRIS_TINT);
    this.pupil = mk(PUPIL_TEX, DEPTH_PUPIL, PUPIL_TINT, Phaser.BlendModes.ADD);

    for (let i = 0; i < SHARD_COUNT; i++) {
      this.shards.push(mk(SHARD_TEX, DEPTH_SHARD, SHARD_TINT));
      this.shardPhase.push((i / SHARD_COUNT) * Math.PI * 2);
    }
  }

  /** Dress the pooled `core` sprite as the lens and bring the rig up with a
   *  quick zoom-in entrance. Idempotent-safe: resets all eased state. */
  spawn(core: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.core = core;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = 0;
    this.orbit = 0;
    this.orbitR = ORBIT_IDLE;
    this.lookX = 0;
    this.lookY = 0;
    this.bornP = 0;

    core
      .setTexture(CORE_TEX)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(CORE_TINT)
      .setScale(0);

    for (const s of this.shards) s.setScale(1).setAlpha(1);
    this.halo.setScale(1);
    this.ring.setScale(1).setAlpha(1);

    this.setVisible(true);
    this.layout(x, y, 0);
  }

  /**
   * Advance the idle life and lay every piece out around the core.
   *  - `charge` 0..1 is the ranged wind-up: shards pull in and the palette
   *    bleeds toward danger-orange, so the body says "about to fire" alongside
   *    the shared telegraph ring.
   *  - `flash` 0..1 is the hit-flash: the whole assembly brightens toward white,
   *    the only read a near-white boss can give (a white tint-lerp would vanish).
   */
  tick(
    dt: number,
    x: number,
    y: number,
    px: number,
    py: number,
    charge: number,
    flash: number,
  ): void {
    this.t += dt;
    this.bornP = Math.min(1, this.bornP + dt / 0.36); // ~0.36s zoom-in
    // Idle spin, faster as it charges.
    this.orbit += dt * (0.55 + charge * 1.4);
    this.orbitR = Phaser.Math.Linear(
      this.orbitR,
      Phaser.Math.Linear(ORBIT_IDLE, ORBIT_CHARGED, charge),
      Math.min(1, dt * 6),
    );

    // Iris slides toward the player — the feed watching you — eased so it glides.
    const dx = px - x;
    const dy = py - y;
    const d = Math.hypot(dx, dy) || 1;
    const targetX = (dx / d) * MAX_LOOK;
    const targetY = (dy / d) * MAX_LOOK;
    this.lookX = Phaser.Math.Linear(this.lookX, targetX, Math.min(1, dt * 4));
    this.lookY = Phaser.Math.Linear(this.lookY, targetY, Math.min(1, dt * 4));

    this.layout(x, y, charge, flash);
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, charge: number, flash = 0): void {
    const core = this.core;
    if (core === undefined) return;

    // Gentle breathing lens; the entrance eases it in, a hit pops its scale.
    const pulse = 1 + 0.045 * Math.sin(this.t * 2.2) + flash * 0.12;
    core.setScale(Phaser.Math.Easing.Back.Out(this.bornP) * pulse);
    // Blend the lens toward white on flash, toward orange on charge.
    core.setTint(
      mixTint(CORE_TINT, flash > 0 ? 0xffffff : CHARGE_TINT, flash > 0 ? flash : charge * 0.4),
    );

    // Halo — additive glow that swells with charge and flash.
    this.halo
      .setPosition(x, y)
      .setScale(pulse * (1 + charge * 0.15))
      .setAlpha(0.5 + charge * 0.3 + flash * 0.4)
      .setTint(flash > 0 ? 0xffffff : HALO_TINT);

    // Counter-rotating rune ring.
    this.ring
      .setPosition(x, y)
      .setRotation(-this.orbit * 0.5)
      .setAlpha(0.45 + charge * 0.35)
      .setTint(flash > 0.25 ? 0xffffff : RING_TINT);

    // Orbiting shards.
    this.shards.forEach((s, i) => {
      const a = this.orbit + this.shardPhase[i]!;
      s.setPosition(x + Math.cos(a) * this.orbitR, y + Math.sin(a) * this.orbitR)
        .setRotation(a * 2)
        .setTint(
          mixTint(SHARD_TINT, flash > 0.25 ? 0xffffff : CHARGE_TINT, flash > 0.25 ? 1 : charge),
        );
    });

    // Iris + pupil, slid toward the player.
    this.iris
      .setPosition(x + this.lookX, y + this.lookY)
      .setTint(flash > 0.25 ? 0x3a4a66 : IRIS_TINT);
    this.pupil
      .setPosition(x + this.lookX * 1.15, y + this.lookY * 1.15)
      .setAlpha(0.8 + charge * 0.2 + flash * 0.2)
      .setTint(flash > 0.25 ? 0xffffff : PUPIL_TINT);
  }

  /** Implode the whole rig — shards spiral in and fade, the lens pops then
   *  collapses, the halo flares — then hand back to the pool via `done`. */
  die(x: number, y: number, done: () => void): void {
    const core = this.core;
    this.deathTween?.remove();
    const startOrbit = this.orbitR;
    const startShard = this.shards.map((s) => s.scale);

    this.deathTween = this.scene.tweens.add({
      targets: { p: 0 },
      p: 1,
      duration: DEATH_MS,
      ease: "Cubic.easeIn",
      onUpdate: (_tw, target: { p: number }) => {
        const p = target.p;
        this.orbitR = startOrbit * (1 - p);
        this.shards.forEach((s, i) => {
          const a = this.orbit + this.shardPhase[i]!;
          s.setPosition(x + Math.cos(a) * this.orbitR, y + Math.sin(a) * this.orbitR)
            .setScale((startShard[i] ?? 1) * (1 - p))
            .setAlpha(1 - p);
        });
        // Lens: a quick over-bright pop in the first 20%, then collapse to a point.
        const cs = p < 0.2 ? 1 + (p / 0.2) * 0.35 : (1 - (p - 0.2) / 0.8) * 1.35;
        core?.setScale(Math.max(0, cs)).setTint(0xffffff);
        this.halo
          .setScale(1 + p * 1.4)
          .setAlpha((1 - p) * 0.9)
          .setTint(0xffffff);
        this.ring.setScale(1 + p * 0.6).setAlpha((1 - p) * 0.6);
      },
      onComplete: () => {
        this.hide();
        done();
      },
    });
  }

  /** Hide every owned piece (recycled as a non-boss, or returned to the pool). */
  hide(): void {
    this.deathTween?.remove();
    this.deathTween = undefined;
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    this.halo.setVisible(v);
    this.ring.setVisible(v);
    this.iris.setVisible(v);
    this.pupil.setVisible(v);
    for (const s of this.shards) s.setVisible(v);
  }
}
