import Phaser from "phaser";
import type { OrbitalWeaponData } from "../content/types";
import type { Pool } from "../core/pool";
import { PooledSprite } from "../core/pool";
import { circleTexture } from "../core/textures";
import type { Enemy } from "./enemy";

/**
 * One orb of an orbital weapon — the Firewall's revolving shield (issue #44).
 *
 * Unlike every other weapon entity it is **not spawned per fire**: `WeaponManager`
 * obtains one orb per `orbiterCount` when the weapon is granted and keeps them for
 * the run, releasing or obtaining more only when the `+1 orbiter` upgrade changes
 * the count. The manager owns the shared revolution phase and calls `place` each
 * frame to set this orb's position; the orb owns the hit test, so the ring that
 * draws and the ring that damages can never drift.
 *
 * Its per-enemy hit cooldown mirrors the boomerang's, and for the same reason:
 * an orb parked against an enemy would otherwise deal damage every frame. Keyed
 * by `spawnId` because the pool hands the same enemy sprite back out.
 */
export class Orbiter extends PooledSprite {
  private static readonly RADIUS = 12;

  private damage = 0;
  private knockback = 0;
  private reach = 0;
  private hitInterval = 0;

  private enemies!: Pool<Enemy>;
  private readonly hitCd = new Map<number, number>();

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Orbiter.RADIUS));
    // Above the enemies it grinds through, below the engagement drops — the
    // boomerang's depth, for the same reason.
    this.setDepth(2.6);
  }

  spawn(data: OrbitalWeaponData, enemies: Pool<Enemy>): void {
    this.damage = data.baseDamage;
    this.knockback = data.knockback;
    this.reach = data.orbiterRadius;
    this.hitInterval = data.hitInterval;
    this.enemies = enemies;
    this.hitCd.clear();

    // Baked at RADIUS; scale the sprite to the weapon's orb size so the drawn
    // circle matches the reach the hit test uses.
    this.setScale(data.orbiterRadius / Orbiter.RADIUS);
    this.setTint(data.color);
  }

  /** Set by `WeaponManager` each frame, then damage whatever the orb touches. */
  place(x: number, y: number, delta: number): void {
    this.setPosition(x, y);

    for (const [id, remaining] of this.hitCd) {
      this.hitCd.set(id, remaining - delta);
    }

    for (const enemy of this.enemies.active()) {
      if ((this.hitCd.get(enemy.spawnId) ?? 0) > 0) continue;
      const reach = this.reach + enemy.archetype.radius;
      if (Phaser.Math.Distance.Between(x, y, enemy.x, enemy.y) <= reach) {
        enemy.takeDamage(this.damage, { x, y }, this.knockback);
        this.hitCd.set(enemy.spawnId, this.hitInterval);
      }
    }
  }

  /** Update the live damage number when the weapon's damage upgrade lands. */
  setDamage(amount: number): void {
    this.damage = amount;
  }
}
