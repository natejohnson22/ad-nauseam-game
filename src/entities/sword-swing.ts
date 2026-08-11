import Phaser from "phaser";
import type { MeleeWeaponData } from "../content/types";
import type { Pool } from "../core/pool";
import { PooledSprite } from "../core/pool";
import { slashTexture } from "../core/textures";
import type { Enemy } from "./enemy";
import type { Player } from "./player";

/**
 * The AdBlock+ Sword's cleave — the port of `sword_swing.gd`. Damage lands once,
 * on spawn, to every enemy inside the arc; the sprite then plays a short slash
 * swoosh purely as a visual.
 *
 * Retimed to the swordsman's own swing (issue #59). The player's attack clip
 * winds up before the blade travels (~frames 4-6 of 8 at 20fps), so a cleave
 * VFX that appeared at t=0 and was gone by 0.18s flashed *before* the blade
 * moved. Now the swoosh holds hidden for `DELAY` (the wind-up), then sweeps its
 * rotation across the arc while fading over `SWEEP`, so the drawn slash tracks
 * the blade. Damage still lands once, at spawn — moving it to the visual peak
 * would add ~`DELAY` of input latency to every swing, which a survivors DPS
 * loop can't wear; the fix here is the *read*, not the hit timing.
 *
 * The hit test stays here beside the render, so the arc that damages and the arc
 * that renders can never drift apart. The swing follows the player for its whole
 * life (re-established by hand in `tick`, since there is no Godot node tree).
 */
export class SwordSwing extends PooledSprite {
  /** Hidden wind-up before the blade travels — tracks the attack clip. */
  private static readonly DELAY = 0.1;
  /** The visible sweep-and-fade. */
  private static readonly SWEEP = 0.16;
  private static readonly LIFE = SwordSwing.DELAY + SwordSwing.SWEEP;
  private static readonly ALPHA = 0.75;
  /** How far the slash rotates through its sweep, each side of facing (rad). */
  private static readonly SWEEP_ARC = Phaser.Math.DegToRad(45);

  private life = 0;
  private facingAngle = 0;
  private player!: Player;

  constructor(scene: Phaser.Scene) {
    // Placeholder slash; `spawn` swaps in the one matching reach and arc.
    super(scene, 0, 0, slashTexture(scene, 1, 1));
    // Between the player and the enemies, as in Godot's tree order.
    this.setDepth(1);
  }

  /**
   * Fire a cleave of `data` facing `dir` from the player's position, damaging
   * every live enemy inside it.
   */
  spawn(
    data: MeleeWeaponData,
    dir: Phaser.Math.Vector2,
    player: Player,
    enemies: Pool<Enemy>,
  ): void {
    const facing =
      dir.length() > 0.001 ? dir.clone().normalize() : new Phaser.Math.Vector2(1, 0);
    const { x, y } = player;

    this.life = SwordSwing.LIFE;
    this.player = player;
    this.facingAngle = facing.angle();
    this.setPosition(x, y);
    this.setTexture(slashTexture(this.scene, data.reach, data.arcDegrees));
    this.setRotation(this.facingAngle - SwordSwing.SWEEP_ARC);
    this.setTint(data.color);
    // Hidden through the wind-up; `tick` reveals it when the blade travels.
    this.setAlpha(SwordSwing.ALPHA).setVisible(false);

    const half = Phaser.Math.DegToRad(data.arcDegrees) * 0.5;
    const facingAngle = facing.angle();
    for (const enemy of enemies.active()) {
      const dx = enemy.x - x;
      const dy = enemy.y - y;
      // The enemy's body counts toward reach, so a big enemy is hit by the edge.
      if (Math.hypot(dx, dy) > data.reach + enemy.archetype.radius) continue;
      const offset = Phaser.Math.Angle.Wrap(Math.atan2(dy, dx) - facingAngle);
      if (Math.abs(offset) <= half) {
        enemy.takeDamage(data.baseDamage, { x, y }, data.knockback);
      }
    }
  }

  tick(delta: number): void {
    this.life -= delta;
    if (this.life <= 0) {
      this.release();
      return;
    }
    // Follow the player for the whole life, as the parented Godot node did.
    this.setPosition(this.player.x, this.player.y);

    const age = SwordSwing.LIFE - this.life;
    if (age < SwordSwing.DELAY) return; // still winding up — stay hidden

    // The visible sweep: rotate through the arc while fading, so the slash
    // reads as the blade whipping across rather than a static shape popping in.
    const s = (age - SwordSwing.DELAY) / SwordSwing.SWEEP;
    this.setVisible(true);
    this.setAlpha(SwordSwing.ALPHA * (1 - s));
    this.setRotation(
      this.facingAngle + SwordSwing.SWEEP_ARC * (2 * s - 1),
    );
  }
}
