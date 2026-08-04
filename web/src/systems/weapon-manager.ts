import Phaser from "phaser";
import type { Mutable, WeaponData } from "../content/types";
import type { WeaponId } from "../content/weapons";
import type { Controls } from "../core/controls";
import type { Pool } from "../core/pool";
import type { Enemy } from "../entities/enemy";
import type { Player } from "../entities/player";
import type { SwordSwing } from "../entities/sword-swing";

/**
 * A weapon's per-run copy — Godot's `data.duplicate()`, so level-up upgrades
 * mutate this run's numbers and never the content module. `id` is carried
 * alongside rather than inside, because ids are record keys now (issue #3);
 * slice 2's upgrade hooks are what look weapons up by it.
 */
type RunWeapon = { id: WeaponId; data: Mutable<WeaponData>; cd: number };

/**
 * Holds the equipped weapons, ticks their cooldowns, and auto-fires each at the
 * nearest enemy — the port of `weapon_manager.gd`.
 *
 * `get_tree().get_nodes_in_group("enemies")` has no equivalent without a node
 * tree, so the enemy pool is injected instead. That is issue #7's "groups as a
 * service locator" seam, made explicit.
 */
export class WeaponManager {
  /** Mutated by the cooldown upgrade in slice 2. */
  cooldownMult = 1;

  private readonly weapons: RunWeapon[] = [];
  private readonly aim = new Phaser.Math.Vector2();

  constructor(
    private readonly player: Player,
    private readonly controls: Controls,
    private readonly enemies: Pool<Enemy>,
    private readonly swings: Pool<SwordSwing>,
  ) {}

  addWeapon(id: WeaponId, data: WeaponData): void {
    // 0.15s so the first swing lands almost immediately, as in Godot.
    this.weapons.push({ id, data: { ...data }, cd: 0.15 });
  }

  tick(delta: number): void {
    for (const weapon of this.weapons) {
      weapon.cd -= delta;
      if (weapon.cd <= 0) {
        this.fire(weapon.data);
        weapon.cd = Math.max(0.05, weapon.data.cooldown * this.cooldownMult);
      }
    }
  }

  private fire(data: Mutable<WeaponData>): void {
    const dir = this.aimDir();
    switch (data.kind) {
      case "melee":
        this.swings.obtain().spawn(data, dir, this.player, this.enemies);
        break;
    }
  }

  /** Nearest enemy, else current movement, else right — `_aim_dir()`. */
  private aimDir(): Phaser.Math.Vector2 {
    const nearest = this.nearestEnemy();
    if (nearest !== null) {
      return this.aim
        .set(nearest.x - this.player.x, nearest.y - this.player.y)
        .normalize();
    }
    const move = this.controls.getMoveVector();
    if (move.length() > 0.1) return this.aim.copy(move).normalize();
    return this.aim.set(1, 0);
  }

  private nearestEnemy(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const enemy of this.enemies.active()) {
      const d = Phaser.Math.Distance.Squared(
        this.player.x,
        this.player.y,
        enemy.x,
        enemy.y,
      );
      if (d < bestD) {
        bestD = d;
        best = enemy;
      }
    }
    return best;
  }
}
