/**
 * Popup Grunt — the first enemy assembled from the shared UI-construct kit
 * (`kit.ts`), and the proof the keystone coheres (issue #81, map #80).
 *
 * The satirical north star (`docs/asset-manifest.md`): the basic swarm melee is
 * a **pop-up ad** — a small browser window that rushes you and jabs with its
 * `×`-close corner. Fiction, hitbox, aura, depth, damage timing, spawn
 * behaviour, and footprint are all **frozen**; only the render changes. The
 * pooled `Enemy` sprite becomes the window's dark **screen**, and this
 * controller owns the frame / title-bar / close-button / glyph lines / cursor /
 * scanline as siblings around it — exactly the `algorithm-vfx` pattern (#71),
 * one path down.
 */
import Phaser from "phaser";
import {
  UI,
  type UiConstruct,
  bakeCursor,
  bakeCross,
  bakeGlyphStrip,
  bakeRoundRectFill,
  bakeRoundRectStroke,
  bakeScanline,
  mixTint,
  piece,
} from "./kit";

// Window geometry. The grunt's hitbox is radius 13 (footprint ~26px); the
// window is drawn to fill that silhouette — its body ~= the footprint, the frame
// glow spilling a touch past, so it *reads* like the swarm blob it replaces
// without moving a single number.
const W = 30;
const H = 24;
const RADIUS = 4;
const TITLE_H = 8; // the draggable title-bar strip
const BODY_TOP = TITLE_H + 2;

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const SCREEN_TEX = "ui:pg:screen";
const FRAME_TEX = "ui:pg:frame";
const TITLE_TEX = "ui:pg:title";
const CLOSE_TEX = "ui:pg:close";
const GLYPH_TEX = "ui:pg:glyph";
const SCAN_TEX = "ui:pg:scan";
const CURSOR_TEX = "ui:pg:cursor";

// Depths, threaded around the base sprite's 2 (the screen). Frame glow sits
// under it; chrome + content sit just above; cursor tops it all.
const DEPTH_FRAME = 1.84;
const DEPTH_TITLE = 2.04;
const DEPTH_GLYPH = 2.05;
const DEPTH_CLOSE = 2.07;
const DEPTH_SCAN = 2.06;
const DEPTH_CURSOR = 2.12;

const GLYPH_W = W - 8;
const GLYPH_H = 2;

const DEATH_MS = 200; // the window snaps shut

export class PopupGruntVfx implements UiConstruct {
  private readonly scene: Phaser.Scene;
  private readonly frame: Phaser.GameObjects.Sprite;
  private readonly title: Phaser.GameObjects.Sprite;
  private readonly close: Phaser.GameObjects.Sprite;
  private readonly glyphs: Phaser.GameObjects.Sprite[] = [];
  private readonly scan: Phaser.GameObjects.Sprite;
  private readonly cursor: Phaser.GameObjects.Sprite;

  /** The pooled `Enemy` sprite this rig wraps — the window's dark screen. */
  private screen: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock, per-instance phase so a swarm doesn't pulse in sync
  private bornP = 0; // entrance progress 0..1
  private lunge = 0; // 0..1 lunge pop, fired on a cadence
  private lungeCd = 0; // seconds until the next lunge
  private lean = 0; // eased horizontal lean toward travel
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeRoundRectFill(scene, SCREEN_TEX, W, H, RADIUS);
    bakeRoundRectStroke(scene, FRAME_TEX, W, H, RADIUS, 2);
    bakeRoundRectFill(scene, TITLE_TEX, W - 4, TITLE_H, 2);
    bakeCross(scene, CLOSE_TEX, TITLE_H - 1, 2);
    bakeGlyphStrip(scene, GLYPH_TEX, GLYPH_W, GLYPH_H);
    bakeScanline(scene, SCAN_TEX, W - 6, 2);
    bakeCursor(scene, CURSOR_TEX, 9);

    this.frame = piece(scene, FRAME_TEX, DEPTH_FRAME, UI.FRAME, Phaser.BlendModes.ADD);
    this.title = piece(scene, TITLE_TEX, DEPTH_TITLE, UI.CYAN);
    this.close = piece(scene, CLOSE_TEX, DEPTH_CLOSE, UI.GLOW);
    this.scan = piece(scene, SCAN_TEX, DEPTH_SCAN, UI.CYAN, Phaser.BlendModes.ADD);
    this.cursor = piece(scene, CURSOR_TEX, DEPTH_CURSOR, UI.GLOW).setOrigin(0, 0);
    for (let i = 0; i < 2; i++) this.glyphs.push(piece(scene, GLYPH_TEX, DEPTH_GLYPH, UI.INK));
  }

  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.screen = base;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = Math.random() * Math.PI * 2; // desync the swarm
    this.bornP = 0;
    this.lunge = 0;
    this.lungeCd = 0.4 + Math.random() * 0.8;
    this.lean = 0;

    base
      .setTexture(SCREEN_TEX)
      .setOrigin(0.5, 0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setScale(0);

    for (const g of this.glyphs) g.setAlpha(0.85);
    this.scan.setAlpha(0.5);
    this.setVisible(true);
    this.layout(x, y, 0);
  }

  tick(
    dt: number,
    x: number,
    y: number,
    dx: number,
    dy: number,
    _px: number,
    _py: number,
    flash: number,
  ): void {
    this.t += dt;
    this.bornP = Math.min(1, this.bornP + dt / 0.22); // ~0.22s pop-up

    // Lean the window toward the way it's travelling — a popup tilting as it
    // rushes. Eased so it glides rather than snaps.
    const targetLean = Phaser.Math.Clamp(dx * 0.02, -0.32, 0.32);
    this.lean = Phaser.Math.Linear(this.lean, targetLean, Math.min(1, dt * 8));

    // Lunge: on a cadence, pop a quick scale surge — the popup jabbing forward.
    this.lungeCd -= dt;
    if (this.lungeCd <= 0) {
      this.lunge = 1;
      this.lungeCd = 0.7 + Math.random() * 0.7;
    }
    this.lunge = Math.max(0, this.lunge - dt * 4.5);

    this.layout(x, y, flash, dx, dy);
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, flash: number, dx = 0, dy = 0): void {
    const screen = this.screen;
    if (screen === undefined) return;

    // Idle breathing + the lunge surge; the entrance eases the whole thing in.
    const breathe = 1 + 0.03 * Math.sin(this.t * 3);
    const lunge = Phaser.Math.Easing.Cubic.Out(this.lunge);
    const grow = Phaser.Math.Easing.Back.Out(this.bornP);
    const sx = grow * breathe * (1 + lunge * 0.14 + flash * 0.08);
    const sy = grow * breathe * (1 - lunge * 0.06 + flash * 0.08);

    // The window screen (base sprite): dark, brightening toward white on a hit.
    screen
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(this.lean * 0.5)
      .setTint(flash > 0 ? mixTint(UI.SCREEN, 0xffffff, flash) : UI.SCREEN);

    const rot = this.lean * 0.5;
    // Local-to-world offset helper, respecting the window's lean + scale.
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const at = (lx: number, ly: number): [number, number] => [
      x + (lx * sx * cos - ly * sy * sin),
      y + (lx * sx * sin + ly * sy * cos),
    ];

    // Frame glow — swells with the lunge and the hit.
    this.frame
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha(0.7 + lunge * 0.3 + flash * 0.4)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.CYAN, lunge));

    // Title-bar strip across the top.
    const [tx, ty] = at(0, -(H / 2) + TITLE_H / 2 + 1);
    this.title
      .setPosition(tx, ty)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);

    // The × close button, top-right of the title-bar — the jabbing corner.
    const [cx, cy] = at(W / 2 - TITLE_H / 2 - 1, -(H / 2) + TITLE_H / 2 + 1);
    this.close
      .setPosition(cx, cy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.GLOW, UI.ALERT, lunge));

    // Two glyph "content" lines in the body.
    this.glyphs.forEach((g, i) => {
      const [gx, gy] = at(-1, BODY_TOP - H / 2 + i * (GLYPH_H + 3));
      g.setPosition(gx, gy)
        .setScale(sx, sy)
        .setRotation(rot)
        .setTint(flash > 0 ? 0xffffff : UI.INK);
    });

    // Scanline sweeping down the body — the CRT flicker.
    const sweep = (this.t * 0.9) % 1;
    const [zx, zy] = at(0, BODY_TOP - H / 2 + sweep * (H - BODY_TOP - 1));
    this.scan
      .setPosition(zx, zy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha((0.25 + 0.25 * Math.sin(this.t * 9)) * (flash > 0 ? 2 : 1))
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);

    // Cursor hand hovering the close button, bobbing — and jabbing in on a
    // lunge, tip landing on the ×.
    const bob = Math.sin(this.t * 4) * 1.2;
    const [ux, uy] = at(
      W / 2 - TITLE_H / 2 - 1 - lunge * 2,
      -(H / 2) + TITLE_H / 2 + 2 + bob - lunge * 2,
    );
    this.cursor
      .setPosition(ux, uy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.GLOW);

    void dx;
    void dy;
  }

  /** The window snaps shut: a quick horizontal collapse to a line, then a fade,
   *  then back to the pool. */
  die(x: number, y: number, done: () => void): void {
    this.deathTween?.remove();
    const screen = this.screen;
    const startLean = this.lean;

    this.deathTween = this.scene.tweens.add({
      targets: { p: 0 },
      p: 1,
      duration: DEATH_MS,
      ease: "Cubic.easeIn",
      onUpdate: (_tw, target: { p: number }) => {
        const p = target.p;
        // Collapse toward a bright horizontal line, then thin to nothing.
        const sx = 1 - p * 0.15;
        const sy = 1 - p;
        const rot = startLean * 0.5;
        screen?.setPosition(x, y).setScale(sx, Math.max(0.02, sy)).setRotation(rot).setTint(0xffffff);
        this.frame
          .setPosition(x, y)
          .setScale(sx * (1 + p * 0.3), Math.max(0.02, sy))
          .setRotation(rot)
          .setAlpha(1 - p)
          .setTint(0xffffff);
        for (const g of [this.title, this.close, this.scan, ...this.glyphs, this.cursor]) {
          g.setAlpha((1 - p) * 0.9);
        }
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
    this.frame.destroy();
    this.title.destroy();
    this.close.destroy();
    this.scan.destroy();
    this.cursor.destroy();
    for (const g of this.glyphs) g.destroy();
  }

  private setVisible(v: boolean): void {
    this.frame.setVisible(v);
    this.title.setVisible(v);
    this.close.setVisible(v);
    this.scan.setVisible(v);
    this.cursor.setVisible(v);
    for (const g of this.glyphs) g.setVisible(v);
  }
}
