import Phaser from "phaser";

/**
 * Texture baking — issue #4's decision made concrete.
 *
 * Everything is drawn once with `Graphics#generateTexture()` and rendered
 * thereafter as a tinted `Sprite`. Nothing calls `clear()` + redraw per frame:
 * under Phaser 4, Graphics/Shape sit on the `Flat` pipeline and Sprites on
 * `Quad`, so interleaving them breaks the batch at every transition.
 *
 * Shapes bake **white** so `setTint` carries all the colour — including
 * `enemy.gd`'s hit-flash lerp, which becomes a tint interpolation rather than a
 * redraw. Tint is a per-vertex attribute and never breaks the batch.
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
