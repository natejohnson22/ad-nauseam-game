import Phaser from "phaser";
import type { Mutable, WeaponData } from "../content/types";
import type { WeaponId } from "../content/weapons";
import type { Controls } from "../core/controls";
import type { Pool } from "../core/pool";
import type { Boomerang } from "../entities/boomerang";
import type { Enemy } from "../entities/enemy";
import type { Player } from "../entities/player";
import type { SwordSwing } from "../entities/sword-swing";

/**
 * A weapon's per-run copy — Godot's `data.duplicate()`, so level-up upgrades
 * mutate this run's numbers and never the content module. `id` is carried
 * alongside rather than inside, because ids are record keys now (issue #3) —
 * and the `mod_*` upgrade hooks are what look weapons up by it.
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
  /** Degrees between the shots of a multi-projectile volley. */
  private static readonly SPREAD_DEGREES = 16;

  /** Mutated by the cooldown upgrade in slice 2. */
  cooldownMult = 1;

  private readonly weapons: RunWeapon[] = [];
  private readonly aim = new Phaser.Math.Vector2();

  constructor(
    private readonly player: Player,
    private readonly controls: Controls,
    private readonly enemies: Pool<Enemy>,
    private readonly swings: Pool<SwordSwing>,
    private readonly boomerangs: Pool<Boomerang>,
  ) {}

  addWeapon(id: WeaponId, data: WeaponData): void {
    // 0.15s so the first swing lands almost immediately, as in Godot.
    this.weapons.push({ id, data: { ...data }, cd: 0.15 });
  }

  // ------------------------------------------- upgrade hooks (Progression)
  //
  // Each mirrors a `mod_*` in `weapon_manager.gd`, including its shrug at an
  // id that is not equipped: taking a boomerang upgrade before owning the
  // boomerang is a no-op, not an error. They mutate the run copy made in
  // `addWeapon`, never the content module.

  modDamage(id: WeaponId, amount: number): void {
    const weapon = this.find(id);
    if (weapon !== undefined) weapon.data.baseDamage += amount;
  }

  modCooldownMult(id: WeaponId, mult: number): void {
    const weapon = this.find(id);
    if (weapon !== undefined) weapon.data.cooldown *= mult;
  }

  modArc(id: WeaponId, degrees: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    switch (weapon.data.kind) {
      case "melee":
        weapon.data.arcDegrees += degrees;
        break;
      // A ranged weapon has no arc to widen. Godot writes `d.arc_degrees +=`
      // regardless, onto a field the boomerang carries and never reads; the
      // union is what turns that into a case that must be stated.
      case "ranged":
        break;
    }
  }

  modProjectiles(id: WeaponId, count: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    switch (weapon.data.kind) {
      case "melee":
        break;
      case "ranged":
        weapon.data.projectileCount += count;
        break;
    }
  }

  private find(id: WeaponId): RunWeapon | undefined {
    return this.weapons.find((w) => w.id === id);
  }

  tick(delta: number): void {
    /* The Paywall's lockout (issue #31). The cooldowns are *frozen*, not
       merely blocked from firing: letting them run down behind the silence
       would mean the moment it lifts every weapon fires at once, and a debuff
       that ends in a free volley costs the player nothing but a second of
       nerves. Frozen, it costs exactly the DPS it says it does. */
    if (this.player.silenced) return;

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
      case "ranged": {
        // The fan is centred on the aim: one shot goes straight down it, two
        // straddle it 8deg either side, and so on.
        const count = Math.max(1, data.projectileCount);
        for (let i = 0; i < count; i++) {
          const spread = Phaser.Math.DegToRad(
            WeaponManager.SPREAD_DEGREES * (i - (count - 1) * 0.5),
          );
          this.boomerangs
            .obtain()
            // Cloned: `aimDir` hands back a shared vector, and rotating it in
            // place would compound the spread across the volley.
            .spawn(data, dir.clone().rotate(spread), this.player, this.enemies);
        }
        break;
      }
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
