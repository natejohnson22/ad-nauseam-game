import Phaser from "phaser";
import { PooledSprite } from "../../core/pool";
import impactUrl from "./assets/impact.png";

/** Texture + anim key for the one-shot explosion burst. */
const IMPACT_ART = "impact_burst";
/** The combined strip is 10 frames of 256px (craftpix 11 Free Pixel Explosions,
 *  one sequence, assembled at build time — see `assets/impact.png`). */
const FRAME = 256;
const FRAMES = 10;

/**
 * A one-shot impact burst — the craftpix explosion frames played once where a
 * shot lands, then returned to its pool the instant the animation finishes
 * (issue #66).
 *
 * Pure feedback: it carries no damage or collision. Landing shots fire it over
 * the `impact` bus event, so the projectiles never touch the pool that owns
 * these bursts. Full-colour art on the #60 path — no identity tint; the one
 * golden explosion dresses every landing, whichever shot caused it.
 */
export class Impact extends PooledSprite {
  /** 256px native scaled to a ~56px burst — reads as a hit without swallowing
   *  the entity it lands on. Tuned by eye. */
  private static readonly SCALE = 0.22;

  /** Load the explosion strip (art path, #60). Call from a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    scene.load.spritesheet(IMPACT_ART, impactUrl, {
      frameWidth: FRAME,
      frameHeight: FRAME,
    });
  }

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, IMPACT_ART);
    // Above the projectiles (2.55–2.6) so the burst reads on top of whatever
    // threw it, below the engagement drops.
    this.setDepth(2.9);
    Impact.ensureAnim(scene);
    // Return itself the frame the burst finishes — no per-frame tick needed.
    // Registered once here, not in `spawn`, so a recycled burst never stacks
    // listeners.
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => this.release());
  }

  private static ensureAnim(scene: Phaser.Scene): void {
    if (scene.anims.exists(IMPACT_ART)) return;
    scene.anims.create({
      key: IMPACT_ART,
      frames: scene.anims.generateFrameNumbers(IMPACT_ART, {
        start: 0,
        end: FRAMES - 1,
      }),
      frameRate: 28,
      repeat: 0,
    });
  }

  /** Play a burst at `x, y`. Randomised spin so repeated hits never look
   *  stamped from the same die. */
  spawn(x: number, y: number): void {
    this.setPosition(x, y)
      .setScale(Impact.SCALE)
      .setRotation(Phaser.Math.FloatBetween(0, Math.PI * 2))
      .clearTint();
    this.play(IMPACT_ART);
  }
}
