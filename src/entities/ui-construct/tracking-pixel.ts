/**
 * Tracking Pixel — the third enemy assembled from the shared UI-construct kit
 * (`kit.ts`), and the first **caster** on it (issue #83, map #80).
 *
 * The satirical north star (`docs/asset-manifest.md`): the basic ranged pest is
 * a **tracking pixel** — the invisible 1×1 spyware that follows you around the
 * web. Here it is drawn as what it is doing: a small, cold **targeting reticle**
 * that keeps you in its crosshairs, scanning while it hunts and snapping to a
 * tight orange **lock** the instant before it fires. Fiction, hitbox, aura,
 * depth, damage timing, spawn behaviour, and footprint are all **frozen**; only
 * the render changes. Its ranged telegraph stays the shared muzzle `ring`, and
 * it fires the shared enemy **bolt** (procedural notification mote, #86) — this
 * controller only draws the body.
 *
 * The pooled `Enemy` sprite becomes the reticle's dark central **pixel**; this
 * controller owns the four corner brackets, the crosshair ticks, the blinking
 * centre dot and a scanline as siblings around it — the `algorithm-vfx` pattern
 * (#71) one path down, exactly like `popup-grunt.ts`. It differs from the two
 * chase constructs only in **assembly + motion** (spin, blink, lock), never in
 * palette — the whole point of the keystone.
 */
import Phaser from "phaser";
import {
  UI,
  type UiConstruct,
  bakeBracket,
  bakeRoundRectFill,
  bakeScanline,
  mixTint,
  piece,
} from "./kit";

// Reticle geometry. The Tracking Pixel's hitbox is radius 9 (footprint ~18px);
// the reticle is drawn to fill that silhouette — the dark pixel at its centre,
// the brackets framing it a touch wider, so it *reads* like the small caster it
// replaces without moving a single number.
const BOX = 11; // the dark central "pixel" (base sprite)
const ARM = 5; // corner-bracket arm length
const THK = 2; // stroke thickness, shared by brackets + ticks
const TICK_LEN = 4; // crosshair tick length

// The bracket corner's distance from centre (per axis): loose while scanning,
// snapping tight on lock — the "acquiring… locked" tighten.
const E_IDLE = 12;
const E_LOCK = 6.5;
// The crosshair ticks' inner distance from centre: closes in on lock too.
const TICK_R_IDLE = 10;
const TICK_R_LOCK = 7;

const SPIN_RATE = 1.1; // rad/s idle scan rotation
const BLINK_HZ = 2.6; // the recording-light blink cadence

const DEATH_MS = 190; // "signal lost" — brackets fly out, the pixel blinks dark

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const PIXEL_TEX = "ui:tp:pixel"; // the base sprite: dark central pixel
const BRACKET_TEX = "ui:tp:bracket";
const TICK_TEX = "ui:tp:tick";
const DOT_TEX = "ui:tp:dot"; // the bright blinking centre dot
const SCAN_TEX = "ui:tp:scan";

// Depths, threaded around the base sprite's 2 (the dark pixel). The reticle
// chrome sits just above it; the centre dot tops it all.
const DEPTH_SCAN = 2.02;
const DEPTH_TICK = 2.05;
const DEPTH_BRACKET = 2.06;
const DEPTH_DOT = 2.12;

/** The four corners, in placement order: TL, TR, BR, BL. Each carries the sign
 *  of its resting offset and the base rotation (i*90°) that opens its L toward
 *  the centre — see `bakeBracket`. */
const CORNERS: ReadonlyArray<{ sx: number; sy: number }> = [
  { sx: -1, sy: -1 },
  { sx: 1, sy: -1 },
  { sx: 1, sy: 1 },
  { sx: -1, sy: 1 },
];

/** The four crosshair ticks: unit directions out from centre, and whether the
 *  bar is drawn along Y (vertical) rather than X. */
const TICKS: ReadonlyArray<{ dx: number; dy: number; vertical: boolean }> = [
  { dx: 0, dy: -1, vertical: true },
  { dx: 0, dy: 1, vertical: true },
  { dx: -1, dy: 0, vertical: false },
  { dx: 1, dy: 0, vertical: false },
];

export class TrackingPixelVfx implements UiConstruct {
  private readonly scene: Phaser.Scene;
  private readonly brackets: Phaser.GameObjects.Sprite[] = [];
  private readonly ticks: Phaser.GameObjects.Sprite[] = [];
  private readonly dot: Phaser.GameObjects.Sprite;
  private readonly scan: Phaser.GameObjects.Sprite;

  /** The pooled `Enemy` sprite this rig wraps — the reticle's dark pixel. */
  private pixel: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock, per-instance phase so a wave doesn't blink in sync
  private bornP = 0; // entrance progress 0..1
  private spin = 0; // scan rotation, radians
  private lock = 0; // eased lock 0..1, follows the attack charge
  private aim = 0; // heading toward the player, radians
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeRoundRectFill(scene, PIXEL_TEX, BOX, BOX, 2);
    bakeBracket(scene, BRACKET_TEX, ARM, THK);
    bakeScanline(scene, TICK_TEX, TICK_LEN, THK);
    bakeRoundRectFill(scene, DOT_TEX, 3, 3, 1);
    bakeScanline(scene, SCAN_TEX, BOX - 2, 1);

    for (let i = 0; i < CORNERS.length; i++) {
      // Origin at the corner point so each bracket pivots on it as the reticle
      // spins and tightens.
      this.brackets.push(
        piece(scene, BRACKET_TEX, DEPTH_BRACKET, UI.FRAME, Phaser.BlendModes.ADD).setOrigin(0, 0),
      );
    }
    for (let i = 0; i < TICKS.length; i++) {
      this.ticks.push(piece(scene, TICK_TEX, DEPTH_TICK, UI.CYAN, Phaser.BlendModes.ADD));
    }
    this.dot = piece(scene, DOT_TEX, DEPTH_DOT, UI.GLOW, Phaser.BlendModes.ADD);
    this.scan = piece(scene, SCAN_TEX, DEPTH_SCAN, UI.CYAN, Phaser.BlendModes.ADD);
  }

  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.pixel = base;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = Math.random() * Math.PI * 2; // desync the blink across a wave
    this.bornP = 0;
    this.spin = Math.random() * Math.PI * 2; // and the scan phase
    this.lock = 0;
    this.aim = 0;

    base
      .setTexture(PIXEL_TEX)
      .setOrigin(0.5, 0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setScale(0);

    this.scan.setAlpha(0.5);
    this.setVisible(true);
    this.layout(x, y, 0, 0);
  }

  tick(
    dt: number,
    x: number,
    y: number,
    _dx: number,
    _dy: number,
    px: number,
    py: number,
    flash: number,
    charge: number,
  ): void {
    this.t += dt;
    this.bornP = Math.min(1, this.bornP + dt / 0.24); // ~0.24s acquire-in

    // Where the target is — the reticle tracks it. Kept every frame so the lock
    // snaps to where the shot will actually go.
    this.aim = Math.atan2(py - y, px - x);

    // Lock eases toward the raw attack charge: it scans (free spin) at rest and
    // snaps to the target the instant it winds up, releasing when the shot goes.
    this.lock = Phaser.Math.Linear(this.lock, charge, Math.min(1, dt * 12));

    // Scan freely while unlocked; ease the spin onto the aim heading as it locks
    // so a corner points dead at the target at the moment of the shot.
    const free = this.spin + dt * SPIN_RATE;
    this.spin = Phaser.Math.Angle.RotateTo(free, this.aim, dt * 6 * this.lock);

    this.layout(x, y, flash, this.lock);
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, flash: number, lockRaw: number): void {
    const pixel = this.pixel;
    if (pixel === undefined) return;

    const lock = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(lockRaw, 0, 1));
    const grow = Phaser.Math.Easing.Back.Out(this.bornP);
    // A subtle breathe while scanning; the lock stills it (a locked reticle
    // doesn't wander). The hit adds a quick swell.
    const breathe = 1 + 0.04 * Math.sin(this.t * 4) * (1 - lock);
    const sc = grow * breathe * (1 + flash * 0.12);

    // The recording-light blink: a crisp duty-cycle while scanning, going solid
    // on the lock so the "about to fire" read is steady, not flickering.
    const phase = (this.t * BLINK_HZ) % 1;
    const blinkScan = phase < 0.62 ? 1 : 0.12;
    const blink = Phaser.Math.Linear(blinkScan, 1, lock);

    // The family bleeds toward the reserved telegraph orange only on the lock —
    // in step with the muzzle ring; never a resting colour.
    const frameCol = flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.ALERT, lock);
    const cyanCol = flash > 0 ? 0xffffff : mixTint(UI.CYAN, UI.ALERT, lock);
    const dotCol = flash > 0 ? 0xffffff : mixTint(UI.GLOW, UI.ALERT, lock);

    // The central pixel (base sprite): dark, brightening toward white on a hit,
    // and pulsing a touch brighter as it locks.
    const pixelTint =
      flash > 0
        ? mixTint(UI.SCREEN, 0xffffff, flash)
        : mixTint(UI.SCREEN, UI.FRAME, lock * 0.5);
    pixel.setPosition(x, y).setScale(sc).setRotation(this.spin).setTint(pixelTint);

    // Corner brackets: the reticle frame. They ride at `e` from centre —
    // acquire-wide on entry, tight on lock — spinning as one, each pivoting on
    // its own corner so the L stays square to the box.
    const acquire = (1 - this.bornP) * 8; // sweep in from wide on spawn
    const e = (Phaser.Math.Linear(E_IDLE, E_LOCK, lock) + acquire) * sc;
    const alpha = (0.75 + 0.25 * lock) * blink;
    this.brackets.forEach((b, i) => {
      const c = CORNERS[i]!;
      // Resting offset for this corner, then rotated by the shared spin.
      const ox = c.sx * e;
      const oy = c.sy * e;
      const rot = this.spin;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      b.setPosition(x + (ox * cos - oy * sin), y + (ox * sin + oy * cos))
        .setScale(sc)
        .setRotation(i * (Math.PI / 2) + rot)
        .setAlpha(alpha)
        .setTint(frameCol);
    });

    // Crosshair ticks (N/S/E/W): close in on lock, spin with the reticle, blink
    // with the brackets.
    const tr = Phaser.Math.Linear(TICK_R_IDLE, TICK_R_LOCK, lock) * sc;
    this.ticks.forEach((tk, i) => {
      const d = TICKS[i]!;
      const rot = this.spin;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);
      const ux = d.dx * cos - d.dy * sin;
      const uy = d.dx * sin + d.dy * cos;
      tk.setPosition(x + ux * tr, y + uy * tr)
        .setScale(sc)
        .setRotation((d.vertical ? Math.PI / 2 : 0) + rot)
        .setAlpha((0.7 + 0.3 * lock) * blink)
        .setTint(cyanCol);
    });

    // The bright centre dot — the recording light. Blinks while scanning, swells
    // and goes solid orange on the lock.
    this.dot
      .setPosition(x, y)
      .setScale(sc * (1 + lock * 0.9))
      .setAlpha((0.55 + 0.45 * lock) * (flash > 0 ? 1 : blink))
      .setTint(dotCol);

    // A faint scanline drifting across the pixel — the family CRT tie.
    const sweep = (this.t * 0.8) % 1;
    this.scan
      .setPosition(x, y + (sweep - 0.5) * (BOX - 2) * sc)
      .setScale(sc)
      .setAlpha((0.2 + 0.2 * Math.sin(this.t * 9)) * (1 - lock) * (flash > 0 ? 2 : 1))
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);
  }

  /** Signal lost: the brackets fly outward and fade, the crosshair opens, and
   *  the pixel does a last rapid blink to dark — then back to the pool. */
  die(x: number, y: number, done: () => void): void {
    this.deathTween?.remove();
    const pixel = this.pixel;
    const startSpin = this.spin;

    this.deathTween = this.scene.tweens.add({
      targets: { p: 0 },
      p: 1,
      duration: DEATH_MS,
      ease: "Cubic.easeIn",
      onUpdate: (_tw, target: { p: number }) => {
        const p = target.p;
        const rot = startSpin + p * 0.8; // a final spin as it loses the target
        const e = (E_IDLE + p * 14) * (1 - p * 0.2); // brackets fly outward
        const alpha = 1 - p;
        // A last stutter of the recording light before it dies.
        const strobe = p < 0.85 ? (Math.sin(p * 60) > 0 ? 1 : 0.2) : 0;

        pixel
          ?.setPosition(x, y)
          .setScale(Math.max(0.02, 1 - p))
          .setRotation(rot)
          .setTint(0xffffff);

        this.brackets.forEach((b, i) => {
          const c = CORNERS[i]!;
          const ox = c.sx * e;
          const oy = c.sy * e;
          const cos = Math.cos(rot);
          const sin = Math.sin(rot);
          b.setPosition(x + (ox * cos - oy * sin), y + (ox * sin + oy * cos))
            .setRotation(i * (Math.PI / 2) + rot)
            .setAlpha(alpha);
        });
        for (const tk of this.ticks) tk.setAlpha(alpha * 0.8);
        this.dot.setPosition(x, y).setAlpha(strobe * alpha).setTint(0xffffff);
        this.scan.setAlpha(0);
      },
      onComplete: () => {
        this.hide();
        done();
      },
    });
  }

  hide(): void {
    this.deathTween?.remove();
    this.deathTween = undefined;
    this.setVisible(false);
  }

  destroy(): void {
    this.hide();
    for (const b of this.brackets) b.destroy();
    for (const tk of this.ticks) tk.destroy();
    this.dot.destroy();
    this.scan.destroy();
  }

  private setVisible(v: boolean): void {
    for (const b of this.brackets) b.setVisible(v);
    for (const tk of this.ticks) tk.setVisible(v);
    this.dot.setVisible(v);
    this.scan.setVisible(v);
  }
}
