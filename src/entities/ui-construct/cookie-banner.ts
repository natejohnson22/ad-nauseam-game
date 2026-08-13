/**
 * Cookie Banner — the second enemy assembled from the shared UI-construct kit
 * (`kit.ts`), following the Popup Grunt reference (issue #82, map #80).
 *
 * The satirical north star (`docs/asset-manifest.md`): the advanced melee wall
 * is a **cookie-consent bar** — the wide "we value your privacy" slab that walls
 * the bottom of a page, with a fat glowing **Accept** button it keeps nudging
 * your cursor toward (the dark pattern). Where the Popup Grunt is small and
 * *jabby*, the Banner is a slow, heavy **wall**: it looms and *presses* rather
 * than lunges. Fiction, hitbox (r=30), aura (the slow field, r=150), depth,
 * damage timing, spawn behaviour, and its wide-wall footprint are all
 * **frozen**; only the render changes. The pooled `Enemy` sprite becomes the
 * bar's dark **screen**, and this controller owns the frame / headline / body
 * lines / Accept button / reject-× / cursor / scanline as siblings around it —
 * the same `algorithm-vfx` / `popup-grunt` pattern, one path down.
 */
import Phaser from "phaser";
import {
  UI,
  type UiConstruct,
  bakeCross,
  bakeCursor,
  bakeGlyphStrip,
  bakeRoundRectFill,
  bakeRoundRectStroke,
  bakeScanline,
  mixTint,
  piece,
} from "./kit";

// Banner geometry. The Cookie Banner's hitbox is radius 30, but — exactly like
// the 2.7×-scaled ogre it replaces (Nate's call) — the body deliberately dwarfs
// its hitbox so it *reads* as a genuine wall towering over the swarm. Drawn
// **wide and low** here: a consent bar that walls a page bottom, not a tall
// ogre. Numbers unchanged; only the silhouette it fills is re-shaped.
const W = 120;
const H = 42;
const RADIUS = 5;
const PAD = 6;

// The fat "Accept" CTA on the right — the dark-pattern button.
const BTN_W = 36;
const BTN_H = 20;
const BTN_R = 3;

// The left text column: headline + body blurb, filling the space left of the
// button.
const CONTENT_W = W - PAD * 3 - BTN_W; // 66
const CONTENT_CX = -W / 2 + PAD + CONTENT_W / 2;
const HEAD_H = 3;
const GLYPH_H = 2;
const BODY_LINES = 2;
const REJECT = 7; // the small, de-emphasised "reject" × the dark pattern hides
const BTN_LABEL_W = BTN_W - 12;
const BTN_LABEL_H = 2;

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const SCREEN_TEX = "ui:cb:screen";
const FRAME_TEX = "ui:cb:frame";
const HEAD_TEX = "ui:cb:head";
const GLYPH_TEX = "ui:cb:glyph";
const BTN_TEX = "ui:cb:btn";
const BTN_LABEL_TEX = "ui:cb:btnlabel";
const REJECT_TEX = "ui:cb:reject";
const SCAN_TEX = "ui:cb:scan";
const CURSOR_TEX = "ui:cb:cursor";

// Depths, threaded around the base sprite's 2 (the screen). Frame glow sits
// under it; chrome + content just above; the pressing cursor tops it all.
const DEPTH_FRAME = 1.84;
const DEPTH_BTN = 2.04;
const DEPTH_GLYPH = 2.05;
const DEPTH_HEAD = 2.06;
const DEPTH_BTN_LABEL = 2.07;
const DEPTH_REJECT = 2.06;
const DEPTH_SCAN = 2.08;
const DEPTH_CURSOR = 2.12;

const DEATH_MS = 230; // the bar is dismissed — collapses to a line and fades

export class CookieBannerVfx implements UiConstruct {
  private readonly scene: Phaser.Scene;
  private readonly frame: Phaser.GameObjects.Sprite;
  private readonly headline: Phaser.GameObjects.Sprite;
  private readonly body: Phaser.GameObjects.Sprite[] = [];
  private readonly button: Phaser.GameObjects.Sprite;
  private readonly buttonLabel: Phaser.GameObjects.Sprite;
  private readonly reject: Phaser.GameObjects.Sprite;
  private readonly scan: Phaser.GameObjects.Sprite;
  private readonly cursor: Phaser.GameObjects.Sprite;

  /** The pooled `Enemy` sprite this rig wraps — the bar's dark screen. */
  private screen: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock, per-instance phase so a row of walls doesn't sync
  private bornP = 0; // entrance (unfurl) progress 0..1
  private press = 0; // 0..1 "Accept" press pop, fired on a slow heavy cadence
  private pressCd = 0; // seconds until the next press
  private lean = 0; // eased horizontal lean toward travel (gentle — it's slow)
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeRoundRectFill(scene, SCREEN_TEX, W, H, RADIUS);
    bakeRoundRectStroke(scene, FRAME_TEX, W, H, RADIUS, 2);
    bakeGlyphStrip(scene, HEAD_TEX, CONTENT_W, HEAD_H);
    bakeGlyphStrip(scene, GLYPH_TEX, CONTENT_W, GLYPH_H);
    bakeRoundRectFill(scene, BTN_TEX, BTN_W, BTN_H, BTN_R);
    bakeGlyphStrip(scene, BTN_LABEL_TEX, BTN_LABEL_W, BTN_LABEL_H);
    bakeCross(scene, REJECT_TEX, REJECT, 2);
    bakeScanline(scene, SCAN_TEX, W - 6, 2);
    bakeCursor(scene, CURSOR_TEX, 9);

    this.frame = piece(scene, FRAME_TEX, DEPTH_FRAME, UI.FRAME, Phaser.BlendModes.ADD);
    this.headline = piece(scene, HEAD_TEX, DEPTH_HEAD, UI.CYAN);
    this.button = piece(scene, BTN_TEX, DEPTH_BTN, UI.FRAME);
    // Dark label on the bright CTA — the button reads like a real one, and the
    // whole thing flares white-hot on a press.
    this.buttonLabel = piece(scene, BTN_LABEL_TEX, DEPTH_BTN_LABEL, UI.SCREEN);
    this.reject = piece(scene, REJECT_TEX, DEPTH_REJECT, UI.INK);
    this.scan = piece(scene, SCAN_TEX, DEPTH_SCAN, UI.CYAN, Phaser.BlendModes.ADD);
    this.cursor = piece(scene, CURSOR_TEX, DEPTH_CURSOR, UI.GLOW).setOrigin(0, 0);
    for (let i = 0; i < BODY_LINES; i++) {
      this.body.push(piece(scene, GLYPH_TEX, DEPTH_GLYPH, UI.INK));
    }
  }

  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.screen = base;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = Math.random() * Math.PI * 2; // desync any row of banners
    this.bornP = 0;
    this.press = 0;
    this.pressCd = 0.6 + Math.random() * 1.0;
    this.lean = 0;

    base
      .setTexture(SCREEN_TEX)
      .setOrigin(0.5, 0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setScale(0);

    for (const g of this.body) g.setAlpha(0.8);
    this.headline.setAlpha(0.95);
    this.reject.setAlpha(0.5);
    this.scan.setAlpha(0.4);
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
    this.bornP = Math.min(1, this.bornP + dt / 0.34); // ~0.34s unfurl

    // Lean gently toward travel — a heavy wall barely tilts as it grinds
    // forward (52px/s), so this stays subtle next to the popup's tilt.
    const targetLean = Phaser.Math.Clamp(dx * 0.014, -0.16, 0.16);
    this.lean = Phaser.Math.Linear(this.lean, targetLean, Math.min(1, dt * 6));

    // Press: on a slow cadence, flare the Accept button and press the cursor in
    // — the banner insisting you consent. Slower to fire and to fade than the
    // popup's jab, so it looms rather than jabs.
    this.pressCd -= dt;
    if (this.pressCd <= 0) {
      this.press = 1;
      this.pressCd = 1.4 + Math.random() * 1.1;
    }
    this.press = Math.max(0, this.press - dt * 3);

    this.layout(x, y, flash, dx, dy);
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, flash: number, dx = 0, dy = 0): void {
    const screen = this.screen;
    if (screen === undefined) return;

    // Slow heavy breathing + the press swell; the entrance *unfurls* the bar —
    // width springs open first, height fills in behind it.
    const breathe = 1 + 0.02 * Math.sin(this.t * 2);
    const press = Phaser.Math.Easing.Cubic.Out(this.press);
    const growW = Phaser.Math.Easing.Back.Out(this.bornP);
    const growH = Phaser.Math.Easing.Cubic.Out(this.bornP);
    const sx = growW * breathe * (1 + flash * 0.06);
    const sy = (0.22 + 0.78 * growH) * growH * breathe * (1 + flash * 0.06);

    // The bar screen (base sprite): dark, brightening toward white on a hit.
    screen
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(this.lean * 0.4)
      .setTint(flash > 0 ? mixTint(UI.SCREEN, 0xffffff, flash) : UI.SCREEN);

    const rot = this.lean * 0.4;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const at = (lx: number, ly: number): [number, number] => [
      x + (lx * sx * cos - ly * sy * sin),
      y + (lx * sx * sin + ly * sy * cos),
    ];

    // Frame glow — swells with the press and the hit.
    this.frame
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha(0.65 + press * 0.3 + flash * 0.4)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.CYAN, press * 0.6));

    // Headline: the bright "we value your privacy" line, top-left.
    const headY = -H / 2 + PAD + HEAD_H / 2;
    const [hx, hy] = at(CONTENT_CX, headY);
    this.headline
      .setPosition(hx, hy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);

    // Body blurb lines beneath it — the dim cookie-policy fine print.
    const bodyTop = headY + HEAD_H / 2 + 5;
    this.body.forEach((g, i) => {
      const [gx, gy] = at(CONTENT_CX, bodyTop + i * (GLYPH_H + 5));
      g.setPosition(gx, gy)
        .setScale(sx, sy)
        .setRotation(rot)
        .setTint(flash > 0 ? 0xffffff : UI.INK);
    });

    // The fat Accept button, right side, vertically centred — flaring white-hot
    // as it presses.
    const btnCx = W / 2 - PAD - BTN_W / 2;
    const [bx, by] = at(btnCx, 0);
    const btnScale = sx * (1 + press * 0.06);
    this.button
      .setPosition(bx, by)
      .setScale(btnScale, sy * (1 + press * 0.06))
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.GLOW, press));
    const [lx, ly] = at(btnCx, 0);
    this.buttonLabel
      .setPosition(lx, ly)
      .setScale(btnScale, sy)
      .setRotation(rot)
      // Dark ink on the button at rest; on a press the button whites out, so the
      // label brightens with it to stay legible.
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.SCREEN, UI.CYAN, press * 0.5));

    // The small, dim reject-× tucked in the top-right corner — the "no" the dark
    // pattern buries. Never brightens, never draws the cursor.
    const [rx, ry] = at(W / 2 - PAD - REJECT / 2, -H / 2 + PAD - 1 + REJECT / 2);
    this.reject
      .setPosition(rx, ry)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.INK);

    // Scanline sweeping down the bar — the CRT flicker.
    const sweep = (this.t * 0.7) % 1;
    const [zx, zy] = at(0, -H / 2 + 3 + sweep * (H - 6));
    this.scan
      .setPosition(zx, zy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha((0.2 + 0.2 * Math.sin(this.t * 7)) * (flash > 0 ? 2 : 1))
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);

    // Cursor hovering the Accept button, bobbing — and pressing *into* it on a
    // press, tip landing on the CTA. The magnetic nudge toward "Accept".
    const bob = Math.sin(this.t * 3) * 1.1;
    const [ux, uy] = at(btnCx - 2 + press * 1.5, 1 + bob + press * 2);
    this.cursor
      .setPosition(ux, uy)
      .setScale(sx * (1 - press * 0.1), sy * (1 - press * 0.1))
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.GLOW);

    void dx;
    void dy;
  }

  /** The bar is dismissed: a quick vertical collapse to a bright line, a slight
   *  horizontal stretch, then a fade — then back to the pool. */
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
        const sx = 1 + p * 0.12;
        const sy = 1 - p;
        const rot = startLean * 0.4;
        screen
          ?.setPosition(x, y)
          .setScale(sx, Math.max(0.02, sy))
          .setRotation(rot)
          .setTint(0xffffff);
        this.frame
          .setPosition(x, y)
          .setScale(sx * (1 + p * 0.2), Math.max(0.02, sy))
          .setRotation(rot)
          .setAlpha(1 - p)
          .setTint(0xffffff);
        for (const g of [
          this.headline,
          this.button,
          this.buttonLabel,
          this.reject,
          this.scan,
          this.cursor,
          ...this.body,
        ]) {
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
    this.headline.destroy();
    this.button.destroy();
    this.buttonLabel.destroy();
    this.reject.destroy();
    this.scan.destroy();
    this.cursor.destroy();
    for (const g of this.body) g.destroy();
  }

  private setVisible(v: boolean): void {
    this.frame.setVisible(v);
    this.headline.setVisible(v);
    this.button.setVisible(v);
    this.buttonLabel.setVisible(v);
    this.reject.setVisible(v);
    this.scan.setVisible(v);
    this.cursor.setVisible(v);
    for (const g of this.body) g.setVisible(v);
  }
}
