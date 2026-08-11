/**
 * PROTOTYPE — THROWAWAY. Shared spine for the playable-character experiments.
 *
 * Both stand-ins (swordsman, minotaur) are pure follower art: the real `Player`
 * still owns movement / HP / collision and just goes invisible, and the avatar
 * mirrors it each frame. The one non-trivial bit they share lives here — driving
 * the attack off the *real* sword by watching the scene's `SwordSwing` pool, so a
 * fresh cleave plays the attack clip in that cleave's own aim direction with no
 * coupling to `WeaponManager`. Subclasses only say how their art poses.
 */
import Phaser from "phaser";
import type { Pool } from "../core/pool";
import type { SwordSwing } from "../entities/sword-swing";

export type Facing = "down" | "left" | "right" | "up";

/** Dominant-axis facing from any (x, y) — the move vector, or a swing's aim via
 *  cos/sin of its rotation. */
export const facingXY = (x: number, y: number): Facing =>
  Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";

export abstract class BaseAvatar extends Phaser.GameObjects.Sprite {
  /** True while a one-shot attack clip is playing; cleared on its completion. */
  protected attacking = false;
  /** Swings live last frame, by identity — one present now but not here is a
      fresh cleave. Pool reuse is fine: a re-obtained swing was absent while
      pooled, so it correctly reads as new. */
  private prevSwings = new Set<SwordSwing>();
  private readonly readout: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    frame: number,
    private readonly swings: Pool<SwordSwing>,
  ) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    this.setDepth(0.05);

    // The attack clips are the only non-looping ones, so any completion is the
    // end of an attack — drop back to move/idle next frame.
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.attacking = false;
    });

    // Surface the state — the prototype rule. Pinned to the camera, dev-only.
    this.readout = scene.add
      .text(940, 96, "", {
        fontFamily: "monospace",
        fontSize: "14px",
        color: "#ffe08a",
        backgroundColor: "#00000080",
      })
      .setScrollFactor(0)
      .setDepth(1000);
  }

  tick(_dt: number, x: number, y: number, move: Phaser.Math.Vector2): void {
    this.setPosition(x, y);
    const moving = move.length() > 0.1;

    const fresh = this.freshSwing();
    if (fresh) {
      this.attacking = true;
      this.onAttack(fresh, move);
    } else if (!this.attacking) {
      this.onMove(moving, move);
    }

    this.readout.setText(`PROTOTYPE ${this.label}\n${this.describe(moving)}`);
  }

  /** Pose for a fresh cleave — face the way it swung, play the attack clip. */
  protected abstract onAttack(
    swing: SwordSwing,
    move: Phaser.Math.Vector2,
  ): void;
  /** Pose for ordinary movement — play run/walk or idle. */
  protected abstract onMove(moving: boolean, move: Phaser.Math.Vector2): void;
  /** Name shown in the readout header. */
  protected abstract get label(): string;
  /** Readout body (facing + state), the avatar's own words. */
  protected abstract describe(moving: boolean): string;

  /** The one swing that became live since last frame, or `null`; rolls the
   *  seen-set forward. */
  private freshSwing(): SwordSwing | null {
    const live = this.swings.active();
    let fresh: SwordSwing | null = null;
    for (const s of live) if (!this.prevSwings.has(s)) fresh = s;
    this.prevSwings = new Set(live);
    return fresh;
  }

  override destroy(fromScene?: boolean): void {
    this.readout.destroy();
    super.destroy(fromScene);
  }
}
