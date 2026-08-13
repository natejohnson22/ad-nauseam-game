/**
 * Autoplay Video Ogre — the fifth enemy assembled from the shared UI-construct
 * kit (`kit.ts`), and the first **slammer** on it (issue #85, map #80). Follows
 * the Paywall / Tracking Pixel for the wind-up (`charge`) arm and the Cookie
 * Banner for the heavy chase lean.
 *
 * The satirical north star (`docs/asset-manifest.md`): the mini-boss melee is a
 * **large autoplay video-player** — a glowing media window with a **play
 * button** face, a crawling **scrubber**, and autoplay glare, that plants and
 * slams. Where the Cookie Banner is a wide thin consent *bar* and the Paywall
 * is a tall portrait *modal*, this is a chunky landscape *player*. Fiction,
 * hitbox (r=26), aura, depth, damage timing, spawn behaviour, and footprint
 * are all **frozen**; only the render changes. Its 1.1s AoE slam telegraph
 * stays the shared danger-orange `ring` (the slam *is* the warning — unlike a
 * construct muzzle flare, this ring does not go family-white).
 *
 * No local accent. Paywall's checkout-green was the valve for a wall of blue
 * that stopped reading apart (#84); a YouTube-red play button would sit on top
 * of the reserved telegraph orange and muddy the slam. Assembly + motion do
 * the work: 16:9 player, ▶ face, scrubber, no cursor (autoplay *is* the dark
 * pattern — it plays itself). If the family wall still blends, a local accent
 * stays the valve, and it stays out of the shared `UI` kit.
 *
 * It is a `telegraph_aoe` slammer, so it takes the shared `charge` 0..1 wind-up
 * signal (`Enemy.attackWind` over the telegraph — plumbed for this arm in #83).
 * On the wind-up it **plants and squashes** (anticipation), the play button
 * bleeds toward reserved telegraph **orange**, the scrubber races to the end,
 * the glare flares — then the shared ring does the blast. The pooled `Enemy`
 * sprite becomes the player's dark **screen**, and this controller owns the
 * frame / title-bar / play backing + triangle / scrubber / rec-dot / scanline
 * as siblings around it — the `algorithm-vfx` pattern (#71) one path down.
 */
import Phaser from "phaser";
import {
  UI,
  type UiConstruct,
  bakeCircle,
  bakeGlyphStrip,
  bakePlayTriangle,
  bakeRoundRectFill,
  bakeRoundRectStroke,
  bakeScanline,
  mixTint,
  piece,
} from "./kit";

// Player geometry. The Ogre's hitbox is radius 26 (footprint ~52px); the body
// deliberately dwarfs it so the mini-boss *towers* over the swarm — the same
// trick the Cookie Banner uses, reshaped here into a chunky landscape player
// rather than a thin wall. Numbers unchanged; only the silhouette it fills
// is re-shaped.
const W = 84;
const H = 50;
const RADIUS = 5;
const PAD = 5;
const TITLE_H = 7; // the player's title-bar strip

// The play-button face — the star of the silhouette, sitting in the video well.
const PLAY_R = 11; // circular backing
const PLAY_TRI = 16; // triangle bounding box, nested in the circle

// The scrubber along the bottom of the video well.
const SCRUB_W = W - PAD * 2 - 6;
const SCRUB_H = 3;
const KNOB_R = 3;
const SCRUB_CY = H / 2 - PAD - 2; // scrubber centre, bottom of the player

// Fake "now playing" title glyphs in the title-bar.
const TITLE_GLYPH_W = W - PAD * 2 - 14; // leave room for the rec-dot
const TITLE_GLYPH_H = 2;
const REC_R = 2; // blinking autoplay rec-dot in the title-bar

const DEATH_MS = 240; // "video ended" — the player collapses, the ▶ pops off

// Baked-texture keys — one bake per game, cached by `textures.exists`.
const SCREEN_TEX = "ui:ao:screen";
const FRAME_TEX = "ui:ao:frame";
const TITLE_TEX = "ui:ao:title";
const TITLE_GLYPH_TEX = "ui:ao:titleglyph";
const PLAY_BACK_TEX = "ui:ao:playback";
const PLAY_TRI_TEX = "ui:ao:playtri";
const SCRUB_TEX = "ui:ao:scrub";
const KNOB_TEX = "ui:ao:knob";
const REC_TEX = "ui:ao:rec";
const SCAN_TEX = "ui:ao:scan";

// Depths, threaded around the base sprite's 2 (the screen). Frame glow sits
// under it; chrome + scrubber just above; the play face tops the video well.
const DEPTH_FRAME = 1.84;
const DEPTH_TITLE = 2.04;
const DEPTH_GLYPH = 2.05;
const DEPTH_REC = 2.06;
const DEPTH_SCRUB = 2.05;
const DEPTH_KNOB = 2.07;
const DEPTH_SCAN = 2.08;
const DEPTH_PLAY_BACK = 2.1;
const DEPTH_PLAY_TRI = 2.12;

export class AutoplayOgreVfx implements UiConstruct {
  private readonly scene: Phaser.Scene;
  private readonly frame: Phaser.GameObjects.Sprite;
  private readonly title: Phaser.GameObjects.Sprite;
  private readonly titleGlyph: Phaser.GameObjects.Sprite;
  private readonly rec: Phaser.GameObjects.Sprite;
  private readonly playBack: Phaser.GameObjects.Sprite;
  private readonly playTri: Phaser.GameObjects.Sprite;
  private readonly scrub: Phaser.GameObjects.Sprite;
  private readonly scrubFill: Phaser.GameObjects.Sprite;
  private readonly knob: Phaser.GameObjects.Sprite;
  private readonly scan: Phaser.GameObjects.Sprite;

  /** The pooled `Enemy` sprite this rig wraps — the player's dark screen. */
  private screen: Phaser.GameObjects.Sprite | undefined;

  private t = 0; // idle clock, per-instance phase so a pair of slammers don't sync
  private bornP = 0; // entrance (overlay-drop) progress 0..1
  private slam = 0; // eased slam 0..1, follows the attack charge
  private lean = 0; // eased horizontal lean toward travel (gentle — it's slow)
  private deathTween: Phaser.Tweens.Tween | undefined;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    bakeRoundRectFill(scene, SCREEN_TEX, W, H, RADIUS);
    bakeRoundRectStroke(scene, FRAME_TEX, W, H, RADIUS, 2);
    bakeRoundRectFill(scene, TITLE_TEX, W - 4, TITLE_H, 2);
    bakeGlyphStrip(scene, TITLE_GLYPH_TEX, TITLE_GLYPH_W, TITLE_GLYPH_H);
    bakeCircle(scene, PLAY_BACK_TEX, PLAY_R);
    bakePlayTriangle(scene, PLAY_TRI_TEX, PLAY_TRI);
    bakeRoundRectFill(scene, SCRUB_TEX, SCRUB_W, SCRUB_H, 1);
    bakeCircle(scene, KNOB_TEX, KNOB_R);
    bakeCircle(scene, REC_TEX, REC_R);
    bakeScanline(scene, SCAN_TEX, W - 8, 2);

    this.frame = piece(scene, FRAME_TEX, DEPTH_FRAME, UI.FRAME, Phaser.BlendModes.ADD);
    this.title = piece(scene, TITLE_TEX, DEPTH_TITLE, UI.CYAN);
    this.titleGlyph = piece(scene, TITLE_GLYPH_TEX, DEPTH_GLYPH, UI.GLOW);
    this.rec = piece(scene, REC_TEX, DEPTH_REC, UI.GLOW, Phaser.BlendModes.ADD);
    this.playBack = piece(
      scene,
      PLAY_BACK_TEX,
      DEPTH_PLAY_BACK,
      UI.FRAME,
      Phaser.BlendModes.ADD,
    );
    this.playTri = piece(scene, PLAY_TRI_TEX, DEPTH_PLAY_TRI, UI.GLOW);
    this.scrub = piece(scene, SCRUB_TEX, DEPTH_SCRUB, UI.INK);
    // Fill grows from the left of the track — origin at the left edge.
    this.scrubFill = piece(scene, SCRUB_TEX, DEPTH_SCRUB, UI.CYAN).setOrigin(0, 0.5);
    this.knob = piece(scene, KNOB_TEX, DEPTH_KNOB, UI.GLOW);
    this.scan = piece(scene, SCAN_TEX, DEPTH_SCAN, UI.CYAN, Phaser.BlendModes.ADD);
  }

  spawn(base: Phaser.GameObjects.Sprite, x: number, y: number): void {
    this.screen = base;
    this.deathTween?.remove();
    this.deathTween = undefined;

    this.t = Math.random() * Math.PI * 2; // desync any pair of slammers
    this.bornP = 0;
    this.slam = 0;
    this.lean = 0;

    base
      .setTexture(SCREEN_TEX)
      .setOrigin(0.5, 0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setScale(0);

    this.titleGlyph.setAlpha(0.9);
    this.scrub.setAlpha(0.7);
    this.scan.setAlpha(0.45);
    this.setVisible(true);
    this.layout(x, y, 0, 0);
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
    charge: number,
  ): void {
    this.t += dt;
    this.bornP = Math.min(1, this.bornP + dt / 0.32); // ~0.32s overlay-drop

    // Slam eases toward the raw attack charge: the player sits autoplaying at
    // rest and squashes the instant it winds up, releasing as the blast goes —
    // the same ease the Tracking Pixel / Paywall use.
    this.slam = Phaser.Math.Linear(this.slam, charge, Math.min(1, dt * 12));

    // Lean gently toward travel while chasing; stills on the slam (it plants).
    // Speed 38 — slower even than the Banner — so this stays a lumber, not a tilt.
    const targetLean =
      this.slam > 0.05 ? 0 : Phaser.Math.Clamp(dx * 0.012, -0.14, 0.14);
    this.lean = Phaser.Math.Linear(this.lean, targetLean, Math.min(1, dt * 5));

    this.layout(x, y, flash, this.slam);
    void dy;
  }

  /** Position + colour every piece for the current frame. Shared by `spawn`,
   *  `tick`, and the death tween so there is one layout, not three. */
  private layout(x: number, y: number, flash: number, slamRaw: number): void {
    const screen = this.screen;
    if (screen === undefined) return;

    const slam = Phaser.Math.Easing.Cubic.Out(Phaser.Math.Clamp(slamRaw, 0, 1));
    // Slow heavy breathing befitting a lumbering mini-boss; the slam stills it
    // and squashes the body (anticipation — wide, flat, about to drop). The
    // entrance drops the overlay onto the page, height leading with an overshoot.
    const breathe = 1 + 0.018 * Math.sin(this.t * 2.1) * (1 - slam);
    const growW = Phaser.Math.Easing.Cubic.Out(this.bornP);
    const growH = Phaser.Math.Easing.Back.Out(this.bornP);
    const sx = growW * breathe * (1 + slam * 0.14 + flash * 0.06);
    const sy = growH * breathe * (1 - slam * 0.22 + flash * 0.06);

    const rot = this.lean * 0.35;
    const cos = Math.cos(rot);
    const sin = Math.sin(rot);
    const at = (lx: number, ly: number): [number, number] => [
      x + (lx * sx * cos - ly * sy * sin),
      y + (lx * sx * sin + ly * sy * cos),
    ];

    // The player screen (base sprite): dark, brightening toward white on a hit,
    // pulling a touch brighter as it slams (the autoplay glare).
    const screenTint =
      flash > 0
        ? mixTint(UI.SCREEN, 0xffffff, flash)
        : mixTint(UI.SCREEN, UI.FRAME, slam * 0.4);
    screen.setPosition(x, y).setScale(sx, sy).setRotation(rot).setTint(screenTint);

    const playCol = flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.ALERT, slam);
    const triCol = flash > 0 ? 0xffffff : mixTint(UI.GLOW, UI.ALERT, slam);

    // Frame glow — swells as it slams and on the hit.
    this.frame
      .setPosition(x, y)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha(0.65 + slam * 0.3 + flash * 0.4)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.FRAME, UI.ALERT, slam * 0.55));

    // Title-bar strip across the top, with a fake "now playing" glyph line and
    // a blinking rec-dot — the autoplay tell.
    const [tx, ty] = at(0, -H / 2 + TITLE_H / 2 + 1);
    this.title
      .setPosition(tx, ty)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.CYAN);
    const [gx, gy] = at(-4, -H / 2 + TITLE_H / 2 + 1);
    this.titleGlyph
      .setPosition(gx, gy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.GLOW);
    // Rec-dot blinks at rest (live/autoplay), goes solid orange on the slam.
    const recBlink = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.t * 5.2));
    const [rx, ry] = at(W / 2 - PAD - REC_R - 2, -H / 2 + TITLE_H / 2 + 1);
    this.rec
      .setPosition(rx, ry)
      .setScale(sx * (1 + slam * 0.4), sy * (1 + slam * 0.4))
      .setRotation(rot)
      .setAlpha(flash > 0 ? 1 : Phaser.Math.Linear(recBlink, 1, slam))
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.GLOW, UI.ALERT, slam));

    // Play-button face, centred in the video well. Pulses on its own at rest
    // (autoplay nagging you to watch) and swells + goes orange on the slam.
    const wellCy = TITLE_H / 2 - 1; // visual centre of the well below the title
    const pulse = 1 + 0.07 * Math.sin(this.t * 3.2) * (1 - slam);
    const playScale = pulse * (1 + slam * 0.28);
    const [px, py] = at(0, wellCy);
    this.playBack
      .setPosition(px, py)
      .setScale(sx * playScale, sy * playScale)
      .setRotation(rot)
      .setAlpha(0.75 + slam * 0.25)
      .setTint(playCol);
    this.playTri
      .setPosition(px, py)
      .setScale(sx * playScale, sy * playScale)
      .setRotation(rot)
      .setTint(triCol);

    // Scrubber: crawls slowly at rest (the video playing itself), races to the
    // end on the slam. Fill grows from the left; the knob rides the head.
    const idleHead = (this.t * 0.11) % 1;
    const head = Phaser.Math.Linear(idleHead, 1, slam);
    const [sx0, sy0] = at(-SCRUB_W / 2, SCRUB_CY);
    this.scrub
      .setPosition(...at(0, SCRUB_CY))
      .setScale(sx, sy)
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : UI.INK);
    this.scrubFill
      .setPosition(sx0, sy0)
      .setScale(sx * Math.max(0.02, head), sy)
      .setRotation(rot)
      .setAlpha(0.85)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.CYAN, UI.ALERT, slam));
    const [kx, ky] = at(-SCRUB_W / 2 + head * SCRUB_W, SCRUB_CY);
    this.knob
      .setPosition(kx, ky)
      .setScale(sx * (1 + slam * 0.3), sy * (1 + slam * 0.3))
      .setRotation(rot)
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.GLOW, UI.ALERT, slam));

    // Scanline sweeping the well — the CRT / autoplay glare (intensifies on slam).
    const sweep = (this.t * (0.65 + slam * 1.4)) % 1;
    const wellTop = -H / 2 + TITLE_H + 2;
    const wellH = H - TITLE_H - 10;
    const [zx, zy] = at(0, wellTop + sweep * wellH);
    this.scan
      .setPosition(zx, zy)
      .setScale(sx, sy)
      .setRotation(rot)
      .setAlpha((0.22 + 0.22 * Math.sin(this.t * 8) + slam * 0.35) * (flash > 0 ? 2 : 1))
      .setTint(flash > 0 ? 0xffffff : mixTint(UI.CYAN, UI.GLOW, slam));
  }

  /** Video ended: the player collapses toward a bright line and the play
   *  triangle pops off it, then a fade — then back to the pool. */
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
        const sx = 1 + p * 0.08;
        const sy = Math.max(0.02, 1 - p);
        const rot = startLean * 0.35;
        screen?.setPosition(x, y).setScale(sx, sy).setRotation(rot).setTint(0xffffff);
        this.frame
          .setPosition(x, y)
          .setScale(sx * (1 + p * 0.2), sy)
          .setRotation(rot)
          .setAlpha(1 - p)
          .setTint(0xffffff);
        // The ▶ breaks free and pops upward as the player fails.
        const pop = p * 16;
        const spin = p * 1.8;
        this.playBack
          .setPosition(x, y + TITLE_H / 2 - 1 - pop)
          .setRotation(spin)
          .setAlpha(1 - p);
        this.playTri
          .setPosition(x, y + TITLE_H / 2 - 1 - pop)
          .setRotation(spin)
          .setAlpha(1 - p);
        for (const g of [
          this.title,
          this.titleGlyph,
          this.rec,
          this.scrub,
          this.scrubFill,
          this.knob,
          this.scan,
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
    this.titleGlyph.destroy();
    this.rec.destroy();
    this.playBack.destroy();
    this.playTri.destroy();
    this.scrub.destroy();
    this.scrubFill.destroy();
    this.knob.destroy();
    this.scan.destroy();
  }

  private setVisible(v: boolean): void {
    this.frame.setVisible(v);
    this.title.setVisible(v);
    this.titleGlyph.setVisible(v);
    this.rec.setVisible(v);
    this.playBack.setVisible(v);
    this.playTri.setVisible(v);
    this.scrub.setVisible(v);
    this.scrubFill.setVisible(v);
    this.knob.setVisible(v);
    this.scan.setVisible(v);
  }
}
