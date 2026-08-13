/**
 * The shared **procedural UI-construct kit** — the keystone the whole ad-side
 * family is assembled from (map #80, issue #81). Every ad enemy becomes a
 * glowing browser-chrome construct built out of *these* primitives, so the
 * family coheres **by construction**: one palette, one material, differentiated
 * only by assembly + motion, never by colour.
 *
 * It is the reference `algorithm-vfx` pattern (#71) generalised: every piece is
 * a **white shape baked once via `generateTexture` and tinted per use**, so the
 * kit needs no `preload` and ships no art assets — the primitive half of the
 * #60 / ADR-0001 dual-path contract. A construct controller (see
 * `popup-grunt.ts`) owns the baked pieces as **siblings of the pooled `Enemy`**,
 * exactly as `Enemy` carries its telegraph `ring`.
 *
 * The material is **cold screen-glow UI chrome**: screen-blue / cyan / white
 * glow on near-black, with **alert-orange reserved for telegraphs** — The
 * Algorithm's palette (`algorithm-vfx`), adopted here as the family's.
 */
import Phaser from "phaser";

/**
 * The family palette. One cold screen-glow set, shared by every construct so
 * the ad-side reads as one alien UI. Orange is **reserved for telegraphs** (it
 * is `Enemy.TELEGRAPH_COLOR`, the shared danger grammar) — a construct only
 * bleeds toward it when it is about to do something; it is never a resting
 * colour.
 */
export const UI = {
  /** The dark screen a window's interior fills with — near-black, faint blue. */
  SCREEN: 0x0a0f1a,
  /** The glowing frame / outline — the family's primary "chrome" blue. */
  FRAME: 0x4aa3ff,
  /** Brighter cyan for title-bars, highlights, active chrome. */
  CYAN: 0x8fd0ff,
  /** Near-white glow — glyph text, cursor, the brightest reads. */
  GLOW: 0xdfe7f5,
  /** Dim glyph ink — fake text at rest, sitting quietly on the screen. */
  INK: 0x6f9fd8,
  /** Reserved telegraph orange — matches `Enemy.TELEGRAPH_COLOR` (0xff591a). */
  ALERT: 0xff591a,
} as const;

/** Lerp one packed `0xRRGGBB` toward another by `t`, channel-wise — the shared
 *  charge/flash blend every construct uses (mirrors `algorithm-vfx`). */
export function mixTint(from: number, to: number, t: number): number {
  const k = Phaser.Math.Clamp(t, 0, 1);
  const lerp = (shift: number): number => {
    const a = (from >> shift) & 0xff;
    const b = (to >> shift) & 0xff;
    return Math.round(a + (b - a) * k) & 0xff;
  };
  return (lerp(16) << 16) | (lerp(8) << 8) | lerp(0);
}

// --- Baked primitives -------------------------------------------------------
// Each bakes a **white** shape once (keyed, cached by `textures.exists`) and
// returns the key; the caller tints it. Dimensions are baked in, so a construct
// that wants a different size bakes under a different key.

/** A filled, rounded rectangle — a window's dark screen, a title-bar, a button
 *  body. Tinted `SCREEN` for an interior, `CYAN`/`FRAME` for chrome. */
export function bakeRoundRectFill(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  radius: number,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRoundedRect(0, 0, w, h, radius);
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** A rounded-rectangle **outline** — the glowing window frame. Rendered ADD and
 *  tinted `FRAME` it reads as backlit chrome. */
export function bakeRoundRectStroke(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
  radius: number,
  thickness = 2,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  const p = thickness; // pad so the stroke isn't clipped at the texture edge
  g.lineStyle(thickness, 0xffffff, 1);
  g.strokeRoundedRect(p, p, w, h, radius);
  g.generateTexture(key, w + p * 2, h + p * 2);
  g.destroy();
  return key;
}

/** A **glyph strip** — fake monospace text: a row of short white blocks of
 *  jittered length, the "content" scrolling inside a window. One strip = one
 *  line. Tinted `INK` at rest, `GLOW` when lit. */
export function bakeGlyphStrip(
  scene: Phaser.Scene,
  key: string,
  w: number,
  h: number,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  const gap = Math.max(2, Math.round(h * 0.9));
  const cell = h; // square-ish "characters"
  let x = 0;
  let seed = w * 131 + h * 17; // deterministic so the bake is stable
  while (x < w) {
    // Pseudo-random word length of 1–4 cells, then a space.
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const word = 1 + (seed % 4);
    const len = Math.min(word * cell, w - x);
    g.fillRect(x, 0, len - Math.min(gap, len * 0.4), h);
    x += len + gap;
  }
  g.generateTexture(key, w, h);
  g.destroy();
  return key;
}

/** An **L corner bracket** — one arm along the top edge, one down the left,
 *  meeting at the texture's top-left (0,0). Placed four-up and rotated
 *  0/90/180/270 it frames a target reticle (the Tracking Pixel), or the chrome
 *  corners of a modal. Origin the caller sets to (0,0) so the bracket pivots on
 *  its corner point. Tinted `FRAME`/`CYAN`, ADD, it reads as backlit chrome. */
export function bakeBracket(
  scene: Phaser.Scene,
  key: string,
  arm: number,
  thickness = 2,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, arm, thickness); // top arm, extends +x
  g.fillRect(0, 0, thickness, arm); // left arm, extends +y
  g.generateTexture(key, arm, arm);
  g.destroy();
  return key;
}

/** An **× mark** — the close button's glyph (two crossed strokes). */
export function bakeCross(
  scene: Phaser.Scene,
  key: string,
  size: number,
  thickness = 2,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(thickness, 0xffffff, 1);
  const m = thickness; // inset so the strokes sit inside the texture
  g.lineBetween(m, m, size - m, size - m);
  g.lineBetween(size - m, m, m, size - m);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/** A classic **cursor arrow** pointer — the clickbait hand that hovers the
 *  close button, filled white and tinted `GLOW`. Points up-left, origin at its
 *  tip (0,0) so a controller can aim the tip precisely. */
export function bakeCursor(scene: Phaser.Scene, key: string, size: number): string {
  if (scene.textures.exists(key)) return key;
  const s = size;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  // A canonical pointer silhouette scaled to `size`.
  g.fillPoints(
    [
      new Phaser.Math.Vector2(0, 0),
      new Phaser.Math.Vector2(0, s),
      new Phaser.Math.Vector2(s * 0.28, s * 0.74),
      new Phaser.Math.Vector2(s * 0.46, s * 1.06),
      new Phaser.Math.Vector2(s * 0.62, s * 0.98),
      new Phaser.Math.Vector2(s * 0.44, s * 0.66),
      new Phaser.Math.Vector2(s * 0.72, s * 0.66),
    ],
    true,
  );
  g.generateTexture(key, Math.ceil(s * 0.8), Math.ceil(s * 1.1));
  g.destroy();
  return key;
}

/** A thin horizontal **scanline** bar — the CRT flicker that sweeps a screen.
 *  Rendered ADD at low alpha, tinted `CYAN`/`GLOW`. */
export function bakeScanline(
  scene: Phaser.Scene,
  key: string,
  w: number,
  thickness = 2,
): string {
  if (scene.textures.exists(key)) return key;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, w, thickness);
  g.generateTexture(key, w, thickness);
  g.destroy();
  return key;
}

/**
 * Make a hidden, tinted sprite piece at (0,0) — the one-liner every controller
 * repeats for each primitive it owns. Mirrors `algorithm-vfx`'s local `mk`.
 */
export function piece(
  scene: Phaser.Scene,
  tex: string,
  depth: number,
  tint: number,
  blend: Phaser.BlendModes = Phaser.BlendModes.NORMAL,
): Phaser.GameObjects.Sprite {
  return scene.add
    .sprite(0, 0, tex)
    .setDepth(depth)
    .setTint(tint)
    .setBlendMode(blend)
    .setVisible(false);
}

/** The interface every ad-side construct controller implements, so `Enemy`
 *  drives them all the same way — the construct analogue of `AlgorithmVfx`'s
 *  surface. `dx`/`dy` are the base's frame displacement (for lunge + facing);
 *  `flash` 0..1 is the hit-flash. */
export interface UiConstruct {
  /** Dress the pooled base sprite and bring the rig up. */
  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void;
  /** Advance idle life and lay every piece out for this frame. `charge` 0..1 is
   *  the shared attack wind-up (`Enemy.attackWind` over the behaviour's
   *  telegraph, 0 when not winding) — the same signal the boss rig takes, so a
   *  wind-up construct (the Tracking Pixel locking on, a Paywall/Ogre charging)
   *  can bleed toward the telegraph orange in step with the muzzle ring. Chase
   *  constructs (Popup Grunt, Cookie Banner) never wind up and simply omit it —
   *  a shorter `tick` stays assignable to this interface. */
  tick(
    dt: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
    px: number,
    py: number,
    flash: number,
    charge: number,
  ): void;
  /** Play the death (a window closing) then hand back to the pool via `done`. */
  die(x: number, y: number, done: () => void): void;
  /** Hide every owned piece (recycled as another archetype, or pooled). */
  hide(): void;
}
