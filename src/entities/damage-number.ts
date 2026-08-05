import Phaser from "phaser";
import { PooledSprite } from "../core/pool";
import { numberTexture } from "../core/textures";

/**
 * The number that pops off an enemy when a weapon connects — issue #25.
 *
 * Pooled like every other entity here, and for the usual reason: the late-run
 * ramp fires these in bursts of twenty, and allocating a text object per hit is
 * the thing pooling exists to avoid. Its texture is baked per distinct damage
 * value (`numberTexture`), so a burst of identical hits is a burst of sprites
 * sharing one texture — one batch, no uploads.
 *
 * Purely cosmetic: nothing reads it, and it damages nothing. It is spawned
 * *after* the damage has already been applied, so a floater that fails to
 * appear can never cost the player a hit.
 */
export class DamageNumber extends PooledSprite {
  /** How long a number stays up. Long enough to read mid-swarm, short enough
      that the next swing is not fighting it for space. */
  private static readonly LIFE = 0.6;
  /** Pixels risen over that life. */
  private static readonly RISE = 34;
  /** Horizontal scatter, +/- this many pixels from the enemy's centre. */
  private static readonly JITTER = 12;
  /** Clear of the enemy's own sprite, so the number is never sitting on it. */
  private static readonly LIFT = 6;
  private static readonly COLOR = 0xffffff;

  private life = 0;
  /** Where the number started, so the rise is absolute rather than cumulative
      — a per-frame `y -=` would drift with the frame rate. */
  private baseX = 0;
  private baseY = 0;

  constructor(scene: Phaser.Scene) {
    // Placeholder; `spawn` swaps in the bake for the value actually dealt.
    super(scene, 0, 0, numberTexture(scene, 0));
    // Above the enemies (2) and the ogre's telegraph ring (2.5): a number
    // buried under the swarm is not feedback.
    this.setDepth(3);
    this.setTint(DamageNumber.COLOR);
  }

  /** Pop `amount` above (`x`, `y`) — the position of the enemy that was hit. */
  spawn(amount: number, x: number, y: number, radius: number): void {
    this.life = DamageNumber.LIFE;
    // Two hits landing on the same enemy in the same second would otherwise
    // stack pixel-for-pixel and read as one number.
    this.baseX =
      x + Phaser.Math.FloatBetween(-DamageNumber.JITTER, DamageNumber.JITTER);
    this.baseY = y - radius - DamageNumber.LIFT;

    this.setTexture(numberTexture(this.scene, amount));
    this.setPosition(this.baseX, this.baseY);
    this.setAlpha(1);
  }

  tick(delta: number): void {
    this.life -= delta;
    if (this.life <= 0) {
      this.release();
      return;
    }

    const t = 1 - this.life / DamageNumber.LIFE;
    this.setPosition(this.baseX, this.baseY - DamageNumber.RISE * t);
    // Fades over the back half only, so the number is at full strength for as
    // long as it takes to actually read it.
    this.setAlpha(t < 0.5 ? 1 : 1 - (t - 0.5) * 2);
  }
}
