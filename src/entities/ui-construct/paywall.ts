/**
 * Paywall — the fourth enemy assembled from the shared UI-construct kit
 * (`kit.ts`), and the second **caster** on it (issue #84, map #80). Follows the
 * Tracking Pixel reference for the wind-up (`charge`) arm and the Popup Grunt /
 * Cookie Banner references for the window chrome.
 *
 * The satirical north star (`docs/asset-manifest.md`): the advanced ranged
 * threat is a **"Subscribe to continue" paywall** — the locked modal that slams
 * down over an article, a big central **padlock**, a dimmed column of text you
 * can't finish reading, and a fat glowing **Subscribe** CTA. Where the Tracking
 * Pixel is a small scanning reticle, the Paywall is a **tall, ornate modal**
 * that plants and looms (scale ~2.0 — it towers over the Pixel without being a
 * full wall like the Cookie Banner). Fiction, hitbox (r=24), aura, depth, damage
 * timing, spawn behaviour, and footprint are all **frozen**; only the render
 * changes.
 *
 * It is a `ranged_standoff` caster, so it takes the shared `charge` 0..1 wind-up
 * signal (`Enemy.attackWind` over the telegraph — the same the boss rig takes).
 * On the wind-up it **locks**: the shackle slams shut, the lock and CTA bleed
 * toward the reserved telegraph **orange**, exactly as the Tracking Pixel's
 * reticle body does (#83, carried into #84) — while the muzzle telegraph `ring`
 * stays family white (gated on `isConstruct` in `enemy.ts`). It fires the
 * procedural **lockout** shot (#86) — a flying padlock on a modal shard, wearing
 * this construct's local checkout-green. The pooled `Enemy` sprite becomes the
 * modal's dark **screen**, and this
 * controller owns the frame / title-bar / dimmed content / padlock / Subscribe
 * CTA / cursor / scanline as siblings around it — the `algorithm-vfx` pattern
 * (#71) one path down, exactly like the three constructs before it.
 */
import Phaser from "phaser";
import {
  UI,
  type UiConstruct,
  bakeCross,
  bakeCursor,
  bakeGlyphStrip,
  bakePadlockBody,
  bakePadlockShackle,
  bakeRoundRectFill,
  bakeRoundRectStroke,
  bakeScanline,
  mixTint,
  piece,
} from "./kit";

// Modal geometry. The Paywall's hitbox is radius 24 (footprint ~48px); the modal
// is drawn **tall and portrait** to fill that silhouette — its body ~= the
// footprint, the frame glow spilling a touch past — so it *reads* as the big,
// ornate caster it replaces without moving a single number. Portrait, not the
// popup's little landscape window nor the banner's wide bar: differentiate by
// assembly, never by palette.
const W = 40;
const H = 50;
const RADIUS = 5;
const PAD = 5;
const TITLE_H = 7; // the modal's title-bar strip

// The central padlock — the star of the silhouette.
const LOCK_W = 16;
const LOCK_BODY_H = 12;
const LOCK_SHACKLE_W = 11;
const LOCK_SHACKLE_LEG = 5;
const LOCK_CY = -3; // lock centre, a touch above the modal's middle

// The dimmed "article behind the wall" content column.
const CONTENT_W = W - PAD * 2;
const GLYPH_H = 2;
const CONTENT_LINES = 3;

// The fat "Subscribe" CTA near the bottom — the dark-pattern button.
const BTN_W = W - PAD * 2 - 4;
const BTN_H = 11;
const BTN_R = 3;
const BTN_LABEL_W = BTN_W - 10;
const BTN_LABEL_H = 2;
const BTN_CY = H / 2 - PAD - BTN_H / 2; // button centre, bottom of the modal

const CLOSE = TITLE_H - 2; // the small, dim (disabled) close × the paywall buries

// The Paywall's **money accent** — a checkout/subscribe green, kept *local to
// this construct* (Nate's call, #84): the family shares one cold-blue material,
// but a wall of blue constructs stopped reading apart, so the Paywall's money
// elements — the padlock and the fat "Subscribe" CTA — take a warm green while
// its window chrome (frame, title, content, scanline) stays family-blue. The
// green is the *one* deliberate exception to the map's "never by palette" rule,
// confined here rather than added to the shared `UI` kit, so the other three
// constructs are untouched. Green also buys a cleaner windup read than the
// family blue: green at rest snaps to the reserved telegraph orange on the lock
// with more contrast than blue→orange ever had.
const MONEY = 0x35d17a; // resting checkout-green (subscribe/$ coding)

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const SCREEN_TEX = "ui:pw:screen";
const FRAME_TEX = "ui:pw:frame";
const TITLE_TEX = "ui:pw:title";
const CLOSE_TEX = "ui:pw:close";
const GLYPH_TEX = "ui:pw:glyph";
const LOCK_BODY_TEX = "ui:pw:lockbody";
const LOCK_SHACKLE_TEX = "ui:pw:lockshackle";
const BTN_TEX = "ui:pw:btn";
const BTN_LABEL_TEX = "ui:pw:btnlabel";
const SCAN_TEX = "ui:pw:scan";
const CURSOR_TEX = "ui:pw:cursor";

// Depths, threaded around the base sprite's 2 (the screen). Frame glow sits
// under it; chrome + dimmed content just above; the padlock over the content;
// the cursor tops it all.
const DEPTH_FRAME = 1.84;
const DEPTH_TITLE = 2.04;
const DEPTH_GLYPH = 2.05;
const DEPTH_CLOSE = 2.06;
const DEPTH_BTN = 2.06;
const DEPTH_BTN_LABEL = 2.07;
const DEPTH_SCAN = 2.08;
const DEPTH_LOCK = 2.1;
const DEPTH_CURSOR = 2.12;

const DEATH_MS = 220; // "access denied" — the modal collapses, the lock drops

export class PaywallVfx implements UiConstruct {
  private readonly scene: Phaser.Scene;
  private readonly frame: Phaser.GameObjects.Sprite;
  private readonly title: Phaser.GameObjects.Sprite;
  private readonly close: Phaser.GameObjects.Sprite;
  private readonly content: Phaser.GameObjects.Sprite[] = [];
  private readonly lockBody: Phaser.GameObjects.Sprite;
  private readonly lockShackle: Phaser.GameObjects.Sprite;
  private readonly button: Phaser.GameObjects.Sprite;
  private readonly buttonLabel: Phaser.GameObjects.Sprite;
  private readonly scan: Phaser.GameObjects.Sprite;
  private readonly cursor: Phaser.GameObjects.Sprite;

  /** The pooled `Enemy` sprite this rig wraps — the modal's dark screen. */
  private screen: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock, per-instance phase so casters don't pulse in sync
  private bornP = 0; // entrance (slam-down) progress 0..1
  private lock = 0; // eased lock 0..1, follows the attack charge
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeRoundRectFill(scene, SCREEN_TEX, W, H, RADIUS);
    bakeRoundRectStroke(scene, FRAME_TEX, W, H, RADIUS, 2);
    bakeRoundRectFill(scene, TITLE_TEX, W - 4, TITLE_H, 2);
    bakeCross(scene, CLOSE_TEX, CLOSE, 2);
    bakeGlyphStrip(scene, GLYPH_TEX, CONTENT_W, GLYPH_H);
    bakePadlockBody(scene, LOCK_BODY_TEX, LOCK_W, LOCK_BODY_H);
    bakePadlockShackle(scene, LOCK_SHACKLE_TEX, LOCK_SHACKLE_W, LOCK_SHACKLE_LEG, 3);
    bakeRoundRectFill(scene, BTN_TEX, BTN_W, BTN_H, BTN_R);
    bakeGlyphStrip(scene, BTN_LABEL_TEX, BTN_LABEL_W, BTN_LABEL_H);
    bakeScanline(scene, SCAN_TEX, W - 6, 2);
    bakeCursor(scene, CURSOR_TEX, 9);

    this.frame = piece(scene, FRAME_TEX, DEPTH_FRAME, UI.FRAME, Phaser.BlendModes.ADD);
    this.title = piece(scene, TITLE_TEX, DEPTH_TITLE, UI.CYAN);
    // The close × is disabled ink — the "you can't close this" of a paywall. It
    // never brightens and never draws the cursor (the CTA does).
    this.close = piece(scene, CLOSE_TEX, DEPTH_CLOSE, UI.INK);
    this.lockBody = piece(scene, LOCK_BODY_TEX, DEPTH_LOCK, MONEY, Phaser.BlendModes.ADD);
    // Shackle origin at bottom-centre so it lifts and slams on its own base.
    this.lockShackle = piece(
      scene,
      LOCK_SHACKLE_TEX,
      DEPTH_LOCK,
      MONEY,
      Phaser.BlendModes.ADD,
    ).setOrigin(0.5, 1);
    this.button = piece(scene, BTN_TEX, DEPTH_BTN, MONEY);
    this.buttonLabel = piece(scene, BTN_LABEL_TEX, DEPTH_BTN_LABEL, UI.SCREEN);
    this.scan = piece(scene, SCAN_TEX, DEPTH_SCAN, UI.CYAN, Phaser.BlendModes.ADD);
    this.cursor = piece(scene, CURSOR_TEX, DEPTH_CURSOR, UI.GLOW).setOrigin(0, 0);
    for (let i = 0; i < CONTENT_LINES; i++) {
      this.content.push(piece(scene, GLYPH_TEX, DEPTH_GLYPH, UI.INK));
    }
  }

  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.screen = base;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = Math.random() * Math.PI * 2; // desync any pair of casters
    this.bornP = 0;
    this.lock = 0;

    base
      .setTexture(SCREEN_TEX)
      .setOrigin(0.5, 0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setScale(0);

    for (const g of this.content) g.setAlpha(0.7);
    this.close.setAlpha(0.5);
    this.scan.setAlpha(0.45);
    this.setVisible(true);
    this.layout(x, y, 0, 0);
  }

  tick(
    dt: number,
    x: number,
    y: number,
    _dx: number,
    _dy: number,
    _px: number,
    _py: number,
    flash: number,
    charge: number,
  ): void {
    this.t += dt;
    this.bornP = Math.min(1, this.bornP + dt / 0.3); // ~0.3s slam-down

    // Lock eases toward the raw attack charge: the modal sits open at rest and
    // snaps its shackle shut the instant it winds up, releasing as the shot goes
    // — the same ease the Tracking Pixel uses.
    this.lock = Phaser.Math.Linear(this.lock, charge, Math.min(1, dt * 12));

    this.layout(x, y, flash, this.lock);
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, flash: number, lockRaw: number): void {
    const screen = this.screen;
    if (screen === undefined) return;

    const lock = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(lockRaw, 0, 1));
    // Slow, heavy breathing befitting a big deliberate caster; the lock stills
    // it (a locked modal doesn't wander). The entrance slams the modal down with
    // an overshoot, height leading so it reads as dropping into place.
    const breathe = 1 + 0.02 * Math.sin(this.t * 2.4) * (1 - lock);
    const growW = Phaser.Math.Easing.Cubic.Out(this.bornP);
    const growH = Phaser.Math.Easing.Back.Out(this.bornP);
    const sx = growW * breathe * (1 + flash * 0.07);
    const sy = growH * breathe * (1 + flash * 0.07);

    // The modal screen (base sprite): dark, brightening toward white on a hit,
    // pulling a touch brighter as it locks.
    const screenTint =
      flash > 0
        ? mixTint(UI.SCREEN, 0xffffff, flash)
        : mixTint(UI.SCREEN, UI.FRAME, lock * 0.35);
    screen.setPosition(x, y).setScale(sx, sy).setRotation(0).setTint(screenTint);

    // Local-to-world helper (no lean — the Paywall plants square to cast).
    const at = (lx: number, ly: number): [number, number] => [x + lx * sx, y + ly * sy];

    // The money elements rest on the green accent and bleed toward the reserved
    // telegraph orange only on the lock — in step with the (white) muzzle ring;
    // never a resting colour (#83/#84). Green→orange reads harder than the
    // family's blue→orange, which is the point of the accent (#84).
    const lockCol = flash > 0 ? 0xffffff : mixTint(MONEY, UI.ALERT, lock);
    const btnCol = flash > 0 ? 0xffffff : mixTint(MONEY, UI.ALERT, lock);

    // Frame glow — swells as it locks and on the hit.
    this.frame
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(0)
      .setAlpha(0.65 + lock * 0.3 + flash * 0.4)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.ALERT, lock * 0.6));

    // Title-bar strip across the top, with the disabled close × in its corner.
    const [tx, ty] = at(0, -H / 2 + TITLE_H / 2 + 1);
    this.title
      .setPosition(tx, ty)
      .setScale(sx, sy)
      .setRotation(0)
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);
    const [xx, xy] = at(W / 2 - CLOSE / 2 - 2, -H / 2 + TITLE_H / 2 + 1);
    this.close
      .setPosition(xx, xy)
      .setScale(sx, sy)
      .setRotation(0)
      .setTint(flash > 0 ? 0xffffff : UI.INK);

    // Dimmed content lines — the article behind the wall, fading toward the
    // bottom (the "…continue reading" cut-off the paywall drops over).
    const contentTop = -H / 2 + TITLE_H + 4;
    this.content.forEach((g, i) => {
      const [gx, gy] = at(0, contentTop + i * (GLYPH_H + 3));
      g.setPosition(gx, gy)
        .setScale(sx, sy)
        .setRotation(0)
        // Deeper lines are dimmer; everything dims further as it locks down.
        .setAlpha((0.6 - i * 0.14) * (1 - lock * 0.5))
        .setTint(flash > 0 ? 0xffffff : UI.INK);
    });

    // The central padlock: body plus a shackle that lifts a hair while open and
    // slams flush as it locks. A quick scale snap on the lock sells the "clunk".
    const snap = 1 + lock * 0.16 * (1 - lock) * 4; // peaks mid-lock, a tap
    const [lx, ly] = at(0, LOCK_CY);
    this.lockBody
      .setPosition(lx, ly)
      .setScale(sx * snap, sy * snap)
      .setRotation(0)
      .setAlpha(0.85 + lock * 0.15)
      .setTint(flash > 0 ? 0xffffff : lockCol);
    // Shackle sits on top of the body (its bottom-centre origin meets the body
    // top); it rides up `open` in world pixels while unlocked and drops to 0
    // on lock. Lift is applied after `at()` so a spawn frame at sy=0 cannot
    // divide by zero.
    const open = (1 - lock) * 2.2;
    const [shx, shy] = at(0, LOCK_CY - LOCK_BODY_H / 2 + 1);
    this.lockShackle
      .setPosition(shx, shy - open)
      .setScale(sx * snap, sy * snap)
      .setRotation(0)
      .setAlpha(0.85 + lock * 0.15)
      .setTint(flash > 0 ? 0xffffff : lockCol);

    // The fat "Subscribe" CTA near the bottom — flares orange-hot as it locks.
    const [bx, by] = at(0, BTN_CY);
    this.button
      .setPosition(bx, by)
      .setScale(sx * (1 + lock * 0.05), sy * (1 + lock * 0.05))
      .setRotation(0)
      .setTint(flash > 0 ? 0xffffff : btnCol);
    this.buttonLabel
      .setPosition(bx, by)
      .setScale(sx, sy)
      .setRotation(0)
      // Dark ink on the button at rest; on the lock the button flares, so the
      // label brightens with it to stay legible.
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.SCREEN, UI.GLOW, lock * 0.6));

    // Scanline sweeping down the content — the CRT flicker (stills on lock).
    const sweep = (this.t * 0.7) % 1;
    const [zx, zy] = at(0, -H / 2 + TITLE_H + 2 + sweep * (H - TITLE_H - BTN_H - 6));
    this.scan
      .setPosition(zx, zy)
      .setScale(sx, sy)
      .setRotation(0)
      .setAlpha((0.2 + 0.2 * Math.sin(this.t * 7)) * (1 - lock * 0.7) * (flash > 0 ? 2 : 1))
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);

    // Cursor hovering the Subscribe CTA, bobbing — and pressing *into* it on the
    // lock, tip landing on the button. The dark-pattern nudge to "Subscribe".
    const bob = Math.sin(this.t * 3.4) * 1.1;
    const [ux, uy] = at(BTN_W * 0.18, BTN_CY - 1 + bob - lock * 2);
    this.cursor
      .setPosition(ux, uy)
      .setScale(sx * (1 - lock * 0.1), sy * (1 - lock * 0.1))
      .setRotation(0)
      .setTint(flash > 0 ? 0xffffff : UI.GLOW);
  }

  /** Access denied: the modal collapses toward a bright line and the lock drops
   *  out of it, then a fade — then back to the pool. */
  die(x: number, y: number, done: () => void): void {
    this.deathTween?.remove();
    const screen = this.screen;

    this.deathTween = this.scene.tweens.add({
      targets: { p: 0 },
      p: 1,
      duration: DEATH_MS,
      ease: "Cubic.easeIn",
      onUpdate: (_tw, target: { p: number }) => {
        const p = target.p;
        // Collapse toward a bright horizontal line, then thin to nothing.
        const sx = 1 - p * 0.12;
        const sy = 1 - p;
        screen?.setPosition(x, y).setScale(sx, Math.max(0.02, sy)).setTint(0xffffff);
        this.frame
          .setPosition(x, y)
          .setScale(sx * (1 + p * 0.25), Math.max(0.02, sy))
          .setAlpha(1 - p)
          .setTint(0xffffff);
        // The lock breaks free and drops as the modal fails.
        const drop = p * 14;
        const spin = p * 1.4;
        this.lockBody.setPosition(x, y + LOCK_CY + drop).setRotation(spin).setAlpha(1 - p);
        this.lockShackle
          .setPosition(x, y + LOCK_CY - LOCK_BODY_H / 2 + 1 - drop * 0.4)
          .setRotation(-spin)
          .setAlpha(1 - p);
        for (const g of [
          this.title,
          this.close,
          this.button,
          this.buttonLabel,
          this.scan,
          this.cursor,
          ...this.content,
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
    this.title.destroy();
    this.close.destroy();
    this.lockBody.destroy();
    this.lockShackle.destroy();
    this.button.destroy();
    this.buttonLabel.destroy();
    this.scan.destroy();
    this.cursor.destroy();
    for (const g of this.content) g.destroy();
  }

  private setVisible(v: boolean): void {
    this.frame.setVisible(v);
    this.title.setVisible(v);
    this.close.setVisible(v);
    this.lockBody.setVisible(v);
    this.lockShackle.setVisible(v);
    this.button.setVisible(v);
    this.buttonLabel.setVisible(v);
    this.scan.setVisible(v);
    this.cursor.setVisible(v);
    for (const g of this.content) g.setVisible(v);
  }
}
