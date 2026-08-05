import Phaser from "phaser";
import type { MeleeWeaponData } from "../content/types";
import type { Pool } from "../core/pool";
import { PooledSprite } from "../core/pool";
import { wedgeTexture } from "../core/textures";
import type { Enemy } from "./enemy";
import type { Player } from "./player";

/**
 * The AdBlock+ Sword's cleave — the port of `sword_swing.gd`. Damage lands once,
 * on spawn, to every enemy inside the wedge; the sprite then lingers 0.18s
 * purely as a visual.
 *
 * Godot rebuilds the 14-step polygon every frame, but only its alpha changes,
 * so this is a baked wedge texture with an alpha fade (issue #4). The hit test
 * stays here beside it, so the arc that damages and the arc that renders can
 * never drift apart.
 *
 * The swing is parented to the player in Godot, so it *follows* the player for
 * its whole life while the damage stays frozen at the moment of the swing. With
 * no node tree there is no parenting, so the follow is re-established by hand in
 * `tick`.
 */
export class SwordSwing extends PooledSprite {
  private static readonly LIFE = 0.18;
  private static readonly ALPHA = 0.35;

  private life = 0;
  private player!: Player;

  constructor(scene: Phaser.Scene) {
    // Placeholder wedge; `spawn` swaps in the one matching reach and arc.
    super(scene, 0, 0, wedgeTexture(scene, 1, 1));
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
    this.setPosition(x, y);
    this.setTexture(wedgeTexture(this.scene, data.reach, data.arcDegrees));
    this.setRotation(facing.angle());
    this.setTint(data.color);
    this.setAlpha(SwordSwing.ALPHA);

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
    this.setAlpha(SwordSwing.ALPHA * (this.life / SwordSwing.LIFE));
    this.setPosition(this.player.x, this.player.y);
  }
}
