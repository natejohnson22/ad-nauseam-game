import Phaser from "phaser";
import type { EnemyBehavior } from "../../content/types";
import type { GameBus } from "../../core/event-bus";
import { PooledSprite } from "../../core/pool";
import type { Player } from "../player";
import {
  UI,
  bakeCircle,
  bakeGlyphStrip,
  bakePadlockBody,
  bakePadlockShackle,
  bakeRoundRectFill,
  bakeRoundRectStroke,
  mixTint,
  piece,
} from "../ui-construct/kit";

/**
 * What a `ranged_standoff` enemy fires — the first thing in this game that
 * shoots *at* the player (issue #31).
 *
 * It is deliberately the dumbest projectile that works: a straight line at a
 * fixed speed, aimed once at where the player stood when it left the muzzle,
 * gone on the first thing it touches or when it runs out of travel. Nothing
 * homes, nothing curves, nothing pierces. That is the whole fairness argument
 * for the ranged half of the roster — a shot the player can read the instant it
 * appears and outrun by moving, in a game where movement is the only defence.
 *
 * Map #80 / issue #86 flipped both flavours onto the procedural UI-construct
 * kit (the primitive half of #60 / ADR-0001): no `preload`, no art assets. The
 * **bolt** (Tracking Pixel, The Algorithm) is a hot-white spam-notification
 * mote (luminance against the family-blue bodies); the **lockout** (Paywall) is
 * a flying padlock on a torn-off modal shard in that construct's checkout-green.
 * Both stay axis-aligned — UI widgets thrown through the world, not spinning
 * physical shots — so they read as the ad-side against the player's pixel-art
 * projectiles, which stay on the art path and are untouched here.
 *
 * Pooled like everything else, so every field is reset in `spawn()`; see the
 * note on `Pool`. Sibling chrome (frame, pip, padlock) is hidden in `release()`
 * because `killAndHide` only covers this sprite.
 */
export class EnemyProjectile extends PooledSprite {
  /** The bolt's hit radius — kept as a logical number, not the sprite's visual
   *  scale, so the art can be sized by eye without moving the hitbox (#66). */
  private static readonly RADIUS = 6;
  /** The lockout is the fat one: its hit radius is 1.8× the bolt's, unchanged
   *  from the primitive era so gameplay is identical to before the art. */
  private static readonly LOCKOUT_HIT_SCALE = 1.8;

  private readonly dir = new Phaser.Math.Vector2(1, 0);
  private speed = 0;
  private damage = 0;
  /** How much travel is left before it fizzles. */
  private travelLeft = 0;
  /** Seconds of weapon lockout to apply on hit; 0 for a plain bolt. */
  private lockout = 0;
  /** The logical hit radius for this shot — bolt or lockout. */
  private hitRadius = EnemyProjectile.RADIUS;
  /** Which dressing `tick` lays out; set in `spawn`. */
  private flavor: "bolt" | "lockout" = "bolt";
  /** Idle clock, randomised per spawn so a volley doesn't pulse in sync. */
  private t = 0;

  private player!: Player;
  private bus!: GameBus;

  // Bolt toast chrome.
  private readonly boltFrame: Phaser.GameObjects.Sprite;
  private readonly boltPip: Phaser.GameObjects.Sprite;
  private readonly boltGlyph: Phaser.GameObjects.Sprite;
  // Lockout modal-shard chrome + the padlock #84 baked for this shot.
  private readonly lockFrame: Phaser.GameObjects.Sprite;
  private readonly lockBody: Phaser.GameObjects.Sprite;
  private readonly lockShackle: Phaser.GameObjects.Sprite;
  /** Soft ADD glow behind either flavour, so a fast shot still reads. */
  private readonly glow: Phaser.GameObjects.Sprite;

  constructor(scene: Phaser.Scene) {
    bakeShot(scene);
    super(scene, 0, 0, BOLT_SCREEN_TEX);
    // Above the enemies that fire it, below the player's own boomerang: when
    // both are on screen the one the player controls should be the readable one.
    this.setDepth(DEPTH_BASE);

    this.boltFrame = piece(
      scene,
      BOLT_FRAME_TEX,
      DEPTH_FRAME,
      HOT,
      Phaser.BlendModes.ADD,
    );
    this.boltPip = piece(
      scene,
      BOLT_PIP_TEX,
      DEPTH_CHROME,
      HOT,
      Phaser.BlendModes.ADD,
    );
    this.boltGlyph = piece(scene, BOLT_GLYPH_TEX, DEPTH_CHROME, HOT);
    this.lockFrame = piece(
      scene,
      LOCK_FRAME_TEX,
      DEPTH_FRAME,
      UI.FRAME,
      Phaser.BlendModes.ADD,
    );
    this.lockBody = piece(
      scene,
      LOCK_BODY_TEX,
      DEPTH_CHROME,
      MONEY,
      Phaser.BlendModes.ADD,
    );
    this.lockShackle = piece(
      scene,
      LOCK_SHACKLE_TEX,
      DEPTH_CHROME,
      MONEY,
      Phaser.BlendModes.ADD,
    ).setOrigin(0.5, 1);
    this.glow = piece(
      scene,
      GLOW_TEX,
      DEPTH_GLOW,
      HOT,
      Phaser.BlendModes.ADD,
    );
  }

  /**
   * Launch from `x, y` along `dir` — which the firing enemy has already aimed
   * and normalised.
   *
   * Takes the whole behaviour rather than a bag of numbers because every field
   * it needs is on that arm, and because the shot payload is a union: passing
   * the arm keeps the `bolt` / `lockout` switch in one place.
   */
  spawn(
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
    x: number,
    y: number,
    dir: Phaser.Math.Vector2,
    player: Player,
    bus: GameBus,
  ): void {
    this.setPosition(x, y);
    this.dir.copy(dir).normalize();
    this.speed = behavior.projectileSpeed;
    this.damage = behavior.damage;
    this.travelLeft = behavior.travelDistance;
    this.player = player;
    this.bus = bus;
    this.t = Math.random() * Math.PI * 2;

    const shot = behavior.shot;
    switch (shot.kind) {
      case "bolt":
        this.lockout = 0;
        this.flavor = "bolt";
        break;
      case "lockout":
        this.lockout = shot.seconds;
        this.flavor = "lockout";
        break;
    }

    // The lockout keeps its 1.8× hit radius from the primitive era, so the shot
    // the player has to dodge is exactly as big as it always was. Visual size
    // is baked into the textures, not a scale on a 32px sheet.
    const isLockout = this.flavor === "lockout";
    this.hitRadius = isLockout
      ? EnemyProjectile.RADIUS * EnemyProjectile.LOCKOUT_HIT_SCALE
      : EnemyProjectile.RADIUS;

    this.setTexture(isLockout ? LOCK_SCREEN_TEX : BOLT_SCREEN_TEX)
      .setOrigin(0.5)
      .setTintMode(Phaser.TintModes.MULTIPLY)
      .setTint(UI.SCREEN)
      .setRotation(0)
      .setScale(1)
      .setAlpha(1);

    this.dress();
    this.layout(x, y);
  }

  tick(delta: number): void {
    const step = this.speed * delta;
    this.x += this.dir.x * step;
    this.y += this.dir.y * step;
    this.t += delta;

    this.travelLeft -= step;
    if (this.travelLeft <= 0) {
      this.release();
      return;
    }

    this.layout(this.x, this.y);

    const reach = this.hitRadius + this.player.radius;
    if (
      this.player.isAlive &&
      Phaser.Math.Distance.Between(
        this.x,
        this.y,
        this.player.x,
        this.player.y,
      ) <= reach
    ) {
      this.hit();
    }
  }

  /** Hide sibling chrome before the pool hides this sprite — `killAndHide`
   *  does not know about the pieces. */
  override release(): void {
    this.hideRig();
    super.release();
  }

  private hit(): void {
    this.player.takeDamage(this.damage);
    // After the damage, and unguarded: `Player.silence` decides for itself
    // whether it applies (dead, or invulnerable under the harness).
    if (this.lockout > 0) this.player.silence(this.lockout);
    // Burst where it landed on the player (issue #66) — the clearest "you got
    // hit" feedback the shot can give. Impact art is a separate ticket; this
    // one only flips the projectile bodies.
    this.bus.emit("impact", this.x, this.y);
    this.release();
  }

  private dress(): void {
    const lock = this.flavor === "lockout";
    this.boltFrame.setVisible(!lock);
    this.boltPip.setVisible(!lock);
    this.boltGlyph.setVisible(!lock);
    this.lockFrame.setVisible(lock);
    this.lockBody.setVisible(lock);
    this.lockShackle.setVisible(lock);
    this.glow.setVisible(true);
  }

  private hideRig(): void {
    this.boltFrame.setVisible(false);
    this.boltPip.setVisible(false);
    this.boltGlyph.setVisible(false);
    this.lockFrame.setVisible(false);
    this.lockBody.setVisible(false);
    this.lockShackle.setVisible(false);
    this.glow.setVisible(false);
  }

  /** Position + pulse every visible piece. One layout, shared by spawn and tick. */
  private layout(x: number, y: number): void {
    if (this.flavor === "lockout") this.layoutLockout(x, y);
    else this.layoutBolt(x, y);
  }

  private layoutBolt(x: number, y: number): void {
    // Snappy unread-notification pulse — a spam toast that won't sit still.
    const pulse = 1 + 0.07 * Math.sin(this.t * 9);
    const blink = 0.55 + 0.45 * Math.max(0, Math.sin(this.t * 7));
    // Interior stays a dark chip, lifted toward white so the whole mote reads
    // as a hot toast against a wall of family-blue enemies.
    this.setPosition(x, y)
      .setScale(pulse)
      .setRotation(0)
      .setTint(mixTint(UI.SCREEN, HOT, 0.35));

    const at = (lx: number, ly: number): [number, number] => [
      x + lx * pulse,
      y + ly * pulse,
    ];

    this.glow
      .setPosition(x, y)
      .setScale(pulse * 0.7)
      .setAlpha(0.32 + 0.12 * Math.sin(this.t * 6))
      .setTint(HOT);

    this.boltFrame
      .setPosition(x, y)
      .setScale(pulse)
      .setAlpha(0.9)
      .setTint(HOT);

    const [px, py] = at(-BOLT_W / 2 + 4.5, 0);
    this.boltPip
      .setPosition(px, py)
      .setScale(pulse)
      .setAlpha(blink)
      .setTint(HOT);

    const [gx, gy] = at(2.5, 0);
    this.boltGlyph
      .setPosition(gx, gy)
      .setScale(pulse)
      .setAlpha(0.9)
      .setTint(mixTint(HOT, UI.GLOW, 0.25));
  }

  private layoutLockout(x: number, y: number): void {
    // Heavier breathe — a slow fat lock you can see coming. Chrome stays
    // family-blue; the padlock wears the Paywall's local checkout-green (#84)
    // so the silence shot reads apart from white bolts and blue bodies.
    const pulse = 1 + 0.04 * Math.sin(this.t * 3.2);
    this.setPosition(x, y).setScale(pulse).setRotation(0).setTint(UI.SCREEN);

    const at = (lx: number, ly: number): [number, number] => [
      x + lx * pulse,
      y + ly * pulse,
    ];

    this.glow
      .setPosition(x, y)
      .setScale(pulse * 0.85)
      .setAlpha(0.28 + 0.1 * Math.sin(this.t * 4))
      .setTint(MONEY);

    this.lockFrame
      .setPosition(x, y)
      .setScale(pulse)
      .setAlpha(0.75)
      .setTint(UI.FRAME);

    const [lx, ly] = at(0, LOCK_CY);
    this.lockBody
      .setPosition(lx, ly)
      .setScale(pulse)
      .setAlpha(0.95)
      .setTint(MONEY);

    // Shackle sits flush-locked on the body (this shot *is* the lock landing).
    // A tiny rattle sells "thrown" without spinning the readable silhouette.
    const rattle = Math.sin(this.t * 14) * 0.6;
    const [sx, sy] = at(rattle, LOCK_CY - LOCK_BODY_H / 2 + 1);
    this.lockShackle
      .setPosition(sx, sy)
      .setScale(pulse)
      .setAlpha(0.95)
      .setTint(MONEY);
  }
}

// --- Kit assembly (baked once, tinted per frame) ----------------------------

/** Paywall's local money accent (#84), carried onto its shot. Not added to
 *  the shared `UI` kit. */
const MONEY = 0x35d17a;
/** Bolt's hot-white — luminance against family-blue chrome, not a new hue.
 *  Pure white so a volley reads as shot-light, not more window frame. */
const HOT = 0xffffff;

const BOLT_W = 20;
const BOLT_H = 13;
const BOLT_R = 3;
const LOCK_W = 24;
const LOCK_H = 30;
const LOCK_R = 4;
const LOCK_BODY_W = 16;
const LOCK_BODY_H = 12;
const LOCK_SHACKLE_W = 11;
const LOCK_SHACKLE_LEG = 5;
const LOCK_CY = 2; // lock sits a hair below the shard's centre

const BOLT_SCREEN_TEX = "ui:shot:bolt:screen";
const BOLT_FRAME_TEX = "ui:shot:bolt:frame";
const BOLT_PIP_TEX = "ui:shot:bolt:pip";
const BOLT_GLYPH_TEX = "ui:shot:bolt:glyph";
const LOCK_SCREEN_TEX = "ui:shot:lock:screen";
const LOCK_FRAME_TEX = "ui:shot:lock:frame";
const LOCK_BODY_TEX = "ui:shot:lock:body";
const LOCK_SHACKLE_TEX = "ui:shot:lock:shackle";
const GLOW_TEX = "ui:shot:glow";

const DEPTH_GLOW = 2.52;
const DEPTH_FRAME = 2.54;
const DEPTH_BASE = 2.55;
const DEPTH_CHROME = 2.57;

function bakeShot(scene: Phaser.Scene): void {
  bakeRoundRectFill(scene, BOLT_SCREEN_TEX, BOLT_W, BOLT_H, BOLT_R);
  bakeRoundRectStroke(scene, BOLT_FRAME_TEX, BOLT_W, BOLT_H, BOLT_R, 2);
  bakeCircle(scene, BOLT_PIP_TEX, 2.4);
  bakeGlyphStrip(scene, BOLT_GLYPH_TEX, 10, 2);
  bakeRoundRectFill(scene, LOCK_SCREEN_TEX, LOCK_W, LOCK_H, LOCK_R);
  bakeRoundRectStroke(scene, LOCK_FRAME_TEX, LOCK_W, LOCK_H, LOCK_R, 2);
  bakePadlockBody(scene, LOCK_BODY_TEX, LOCK_BODY_W, LOCK_BODY_H);
  bakePadlockShackle(scene, LOCK_SHACKLE_TEX, LOCK_SHACKLE_W, LOCK_SHACKLE_LEG, 3);
  bakeCircle(scene, GLOW_TEX, 16);
}
