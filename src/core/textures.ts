import Phaser from "phaser";

/**
 * Texture baking — issue #4's decision made concrete.
 *
 * This module is the **primitive path** only (rings, HUD bars, telegraphs,
 * damage numbers, procedural VFX). Full-colour spritesheets for bodies /
 * weapons live on a separate **art path** — see ADR 0001 / issue #60. Do not
 * force multi-colour sheets through white-bake + `setTint`.
 *
 * Everything here is drawn once with `Graphics#generateTexture()` and rendered
 * thereafter as a tinted `Sprite`. Nothing calls `clear()` + redraw per frame:
 * under Phaser 4, Graphics/Shape sit on the `Flat` pipeline and Sprites on
 * `Quad`, so interleaving them breaks the batch at every transition.
 *
 * Shapes bake **white** so `setTint` carries all the colour — including the
 * primitive-path hit-flash lerp (tint interpolation rather than a redraw).
 * Tint is a per-vertex attribute and never breaks the batch. Art-path
 * hit-flash is an additive white overlay, not a tint lerp.
 *
 * Textures are cached by key and baked at most once per game.
 */

/** A filled white circle of the given radius. Key: `circle:<radius>`. */
export function circleTexture(scene: Phaser.Scene, radius: number): string {
  const key = `circle:${radius}`;
  if (scene.textures.exists(key)) return key;

  const size = radius * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(radius, radius, radius);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * A white circle outline of the given radius, stroked `thickness` px wide and
 * centred on the stroke (Godot's `draw_arc` semantics). Key:
 * `ring:<radius>:<thickness>`.
 *
 * The texture is a touch larger than `circleTexture`'s so the outer half of the
 * stroke is not clipped; the sprite's centre is still the circle's centre, so
 * positioning is the same as the filled version.
 */
export function ringTexture(
  scene: Phaser.Scene,
  radius: number,
  thickness: number,
): string {
  const key = `ring:${radius}:${thickness}`;
  if (scene.textures.exists(key)) return key;

  const half = thickness / 2;
  const size = (radius + half) * 2;
  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.lineStyle(thickness, 0xffffff, 1);
  g.strokeCircle(radius + half, radius + half, radius);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * A filled white rectangle. Key: `rect:<width>:<height>`.
 *
 * The HUD's two bars, which are the one place a *scaled* sprite is right rather
 * than a second bake: a fill whose width changes every time it is damaged would
 * otherwise want a texture per pixel of width.
 */
export function rectTexture(
  scene: Phaser.Scene,
  width: number,
  height: number,
): string {
  const key = `rect:${width}:${height}`;
  if (scene.textures.exists(key)) return key;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillRect(0, 0, width, height);
  g.generateTexture(key, width, height);
  g.destroy();
  return key;
}

/**
 * A filled white wedge: the sword cleave, apex at the texture's centre, opening
 * toward +x. Key: `wedge:<reach>:<arcDegrees>`.
 *
 * Centring the apex rather than pinning it to the left edge costs a little
 * texture area and buys arcs past 180deg (the arc upgrade tops out at 200deg),
 * where the trailing edge sweeps back behind the player.
 *
 * `sword_swing.gd` rebuilds this polygon every frame, but only its alpha ever
 * changes, so five textures cover a whole run: 100deg base, +25deg x 4 stacks.
 */
export function wedgeTexture(
  scene: Phaser.Scene,
  reach: number,
  arcDegrees: number,
): string {
  const key = `wedge:${reach}:${arcDegrees}`;
  if (scene.textures.exists(key)) return key;

  const size = reach * 2;
  const c = reach; // apex, at the texture centre
  const arc = Phaser.Math.DegToRad(arcDegrees);
  const half = arc * 0.5;

  // 14 steps, matching sword_swing.gd's tessellation.
  const STEPS = 14;
  const points = [new Phaser.Math.Vector2(c, c)];
  for (let i = 0; i <= STEPS; i++) {
    const a = -half + arc * (i / STEPS);
    points.push(
      new Phaser.Math.Vector2(c + Math.cos(a) * reach, c + Math.sin(a) * reach),
    );
  }

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);
  g.fillPoints(points, true);
  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * A slash-arc "swoosh": a thin curved blade-streak rather than a filled pie
 * wedge. Key: `slash:<reach>:<arcDegrees>`.
 *
 * The cleave reads as the *path the blade travels*, not a cone of area, so it
 * lines up with the swordsman's own swing animation (issue #59). For the sword's
 * 100°→200° it is a **tapered crescent** — full `THICKNESS×reach` thick at the
 * arc's centre, pinching to a point at each tip — which reads as a wispy blade
 * streak. For the Spam Filter's 360° that taper would pinch the ring to nothing
 * at the back, so a near-full arc falls back to a **uniform stroked ring**.
 *
 * The outer edge sits at `OUTER×reach`, within the `reach × reach` half-texture
 * so no tip clips. Baked white and tinted the weapon colour like everything
 * else; `sword_swing` animates only its rotation and alpha, so the handful of
 * reach/arc pairs a run uses are cached once each, exactly as the old wedge was.
 */
export function slashTexture(
  scene: Phaser.Scene,
  reach: number,
  arcDegrees: number,
): string {
  const key = `slash:${reach}:${arcDegrees}`;
  if (scene.textures.exists(key)) return key;

  const OUTER = 0.98; // outer edge, as a fraction of reach
  const THICKNESS = 0.34; // radial thickness at the arc's centre, ditto
  const size = reach * 2;
  const c = reach; // arc centre, at the texture centre
  const arc = Phaser.Math.DegToRad(arcDegrees);
  const half = arc * 0.5;
  const outerR = reach * OUTER;

  const g = scene.make.graphics({ x: 0, y: 0 }, false);
  g.fillStyle(0xffffff, 1);

  if (arcDegrees >= 300) {
    // Near-full sweep: a uniform ring band (a stroked circle), so the spin
    // cleave reads all the way round with no pinch.
    g.lineStyle(reach * THICKNESS, 0xffffff, 1);
    g.beginPath();
    g.arc(c, c, outerR - reach * THICKNESS * 0.5, -half, half);
    g.strokePath();
  } else {
    // A tapered crescent: outer edge along `outerR`, inner edge bulging in by
    // `THICKNESS` at the centre and easing back out to meet the tips (`taper`
    // is 1 at centre, 0 at ±half), so both ends come to a point.
    const STEPS = 24;
    const pts: Phaser.Math.Vector2[] = [];
    for (let i = 0; i <= STEPS; i++) {
      const a = -half + arc * (i / STEPS);
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * outerR, c + Math.sin(a) * outerR));
    }
    for (let i = STEPS; i >= 0; i--) {
      const a = -half + arc * (i / STEPS);
      const taper = Math.cos((a / half) * (Math.PI / 2));
      const innerR = outerR - reach * THICKNESS * taper;
      pts.push(new Phaser.Math.Vector2(c + Math.cos(a) * innerR, c + Math.sin(a) * innerR));
    }
    g.fillPoints(pts, true);
  }

  g.generateTexture(key, size, size);
  g.destroy();
  return key;
}

/**
 * A damage number, baked as a texture. Key: `number:<value>`.
 *
 * The one text in the game that is not a `Text` object, and deliberately
 * (issue #25). A sword cleave damages every enemy in its wedge on a single
 * frame, so a big swing spawns twenty floaters at once, several times a second,
 * on mobile too. Each `Text` owns a canvas that re-uploads on `setText` and
 * binds its own texture at draw time; twenty of them is twenty uploads and
 * twenty draw calls. Baked once per distinct value, a floater is an ordinary
 * tinted `Sprite` like everything else here, and the whole burst batches.
 *
 * That trade is only available because damage is **deterministic** — no crits,
 * no rolls — so the distinct values are a fixed handful (the sword's 140..500
 * in steps of 60, the boomerang's 100..400 in steps of 50) and the cache stops
 * growing early. A variance mechanic would make values effectively continuous
 * and would have to revisit this.
 *
 * Digits bake **white on a black outline**, and tint multiplies: the fill takes
 * the tint and the outline stays black at any colour, so one bake serves every
 * palette. The style is `HudScene`'s label style one weight up.
 */
export function numberTexture(scene: Phaser.Scene, value: number): string {
  const key = `number:${value}`;
  if (scene.textures.exists(key)) return key;

  // Not added to the display list: it exists only to rasterise its canvas.
  const text = scene.make.text(
    {
      text: String(value),
      style: {
        fontFamily: "system-ui, sans-serif",
        fontSize: "22px",
        fontStyle: "bold",
        color: "#ffffff",
        stroke: "#000000",
        strokeThickness: 4,
      },
    },
    false,
  );

  const width = Math.max(1, Math.ceil(text.width));
  const height = Math.max(1, Math.ceil(text.height));
  const canvas = scene.textures.createCanvas(key, width, height);
  canvas?.draw(0, 0, text.canvas);
  canvas?.refresh();
  // Returns its canvas to Phaser's pool. Safe because `draw` copied the pixels
  // into ours — holding on to a `Text`'s own canvas would hand the pool a
  // surface it may hand back out to the next label.
  text.destroy();

  return key;
}
