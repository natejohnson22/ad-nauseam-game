import Phaser from "phaser";
import type { Mutable, OrbitalWeaponData, WeaponData } from "../content/types";
import { WEAPONS, type WeaponId } from "../content/weapons";
import type { Controls } from "../core/controls";
import type { GameBus } from "../core/event-bus";
import type { Pool } from "../core/pool";
import type { Boomerang } from "../entities/boomerang";
import type { Enemy } from "../entities/enemy";
import type { Orbiter } from "../entities/orbiter";
import type { Player } from "../entities/player";
import type { SwordSwing } from "../entities/sword-swing";

/**
 * A weapon's per-run copy — Godot's `data.duplicate()`, so level-up upgrades
 * mutate this run's numbers and never the content module. `id` is carried
 * alongside rather than inside, because ids are record keys now (issue #3) —
 * and the `mod_*` upgrade hooks are what look weapons up by it.
 *
 * `orbs`/`phase` exist only on an orbital weapon (issue #44), which is ticked
 * outside the cooldown-and-fire loop: `orbs` are the live revolving sprites,
 * `phase` the shared angle they are spread around.
 */
type RunWeapon = {
  id: WeaponId;
  data: Mutable<WeaponData>;
  cd: number;
  orbs?: Orbiter[];
  phase?: number;
};

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
    private readonly orbiters: Pool<Orbiter>,
    private readonly bus: GameBus,
  ) {}

  addWeapon(id: WeaponId, data: WeaponData): void {
    // 0.15s so the first swing lands almost immediately, as in Godot. An orbital
    // has no fire to hasten, but it also starts revolving its first frame, so its
    // orbs appear just as promptly (issue #44).
    const weapon: RunWeapon = { id, data: { ...data }, cd: 0.15 };
    if (weapon.data.kind === "orbital") {
      weapon.orbs = [];
      weapon.phase = 0;
    }
    this.weapons.push(weapon);
  }

  /**
   * Equips a weapon from the `grant_weapon` pick (issue #32).
   *
   * The `WEAPONS` lookup lives here rather than in `Progression`, which is the
   * whole point of the effect carrying an id and no data: the tested core stays
   * on content *types* and never imports a content *value*, so nothing drags a
   * boomerang's projectile speed through a class that only does XP arithmetic.
   *
   * The 0.15s first cooldown means a weapon granted mid-fight fires almost at
   * once — the pick has a visible consequence before the modal has faded.
   */
  grantWeapon(id: WeaponId): void {
    if (this.hasWeapon(id)) return;
    this.addWeapon(id, WEAPONS[id]);
  }

  /** Whether this run is carrying it — what gates the weapon's own upgrades. */
  hasWeapon(id: WeaponId): boolean {
    return this.find(id) !== undefined;
  }

  // ------------------------------------------- upgrade hooks (Progression)
  //
  // Each mirrors a `mod_*` in `weapon_manager.gd`, including its shrug at an
  // id that is not equipped: taking a boomerang upgrade before owning the
  // boomerang is a no-op, not an error. They mutate the run copy made in
  // `addWeapon`, never the content module.

  modDamage(id: WeaponId, amount: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    weapon.data.baseDamage += amount;
    // Fired weapons re-read `baseDamage` on their next spawn, but an orbital's
    // orbs are long-lived and cached theirs — push the new figure to the live
    // ring so the upgrade lands this frame, not on a throw that never comes.
    if (weapon.orbs !== undefined) {
      for (const orb of weapon.orbs) orb.setDamage(weapon.data.baseDamage);
    }
  }

  /** Widen a melee weapon's cleave — the spin-melee's signature (issue #44). */
  modReach(id: WeaponId, amount: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    switch (weapon.data.kind) {
      case "melee":
        weapon.data.reach += amount;
        break;
      // Nothing else has a reach to widen; the union names the cases so the
      // compiler proves it, as with `modArc` below.
      case "ranged":
      case "orbital":
        break;
    }
  }

  /** Add an orb to an orbital's ring — the Firewall's signature (issue #44). */
  modOrbiters(id: WeaponId, count: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    switch (weapon.data.kind) {
      case "orbital":
        weapon.data.orbiterCount += count;
        // The ring is re-synced to the new count on the next tick.
        break;
      case "melee":
      case "ranged":
        break;
    }
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
      // An orbital has no arc either — it is a ring, not a wedge.
      case "orbital":
        break;
    }
  }

  modProjectiles(id: WeaponId, count: number): void {
    const weapon = this.find(id);
    if (weapon === undefined) return;
    switch (weapon.data.kind) {
      case "melee":
      case "orbital":
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
      // An orbital has no cooldown to run and nothing to aim: it revolves every
      // frame instead of firing (issue #44), so it steps out of the loop here.
      if (weapon.data.kind === "orbital") {
        this.tickOrbital(weapon, weapon.data, delta);
        continue;
      }
      weapon.cd -= delta;
      if (weapon.cd <= 0) {
        this.fire(weapon.data);
        weapon.cd = Math.max(0.05, weapon.data.cooldown * this.cooldownMult);
      }
    }
  }

  /**
   * Advance one orbital: keep its ring at `orbiterCount` orbs, spin the shared
   * phase, and lay the orbs evenly around the player so `+1 orbiter` re-spreads
   * the whole ring rather than bunching the newcomer (issue #44).
   */
  private tickOrbital(
    weapon: RunWeapon,
    data: Mutable<OrbitalWeaponData>,
    delta: number,
  ): void {
    const orbs = weapon.orbs ?? (weapon.orbs = []);

    while (orbs.length < data.orbiterCount) {
      const orb = this.orbiters.obtain();
      orb.spawn(data, this.enemies);
      orbs.push(orb);
    }
    while (orbs.length > data.orbiterCount) orbs.pop()?.release();

    weapon.phase = (weapon.phase ?? 0) + data.angularSpeed * delta;
    const step = (Math.PI * 2) / orbs.length;
    for (let i = 0; i < orbs.length; i++) {
      const a = weapon.phase + i * step;
      orbs[i]!.place(
        this.player.x + Math.cos(a) * data.orbitRadius,
        this.player.y + Math.sin(a) * data.orbitRadius,
        delta,
      );
    }
  }

  private fire(data: Mutable<WeaponData>): void {
    const dir = this.aimDir();
    // Announce the shot so the player sprite can pose to the real swing (issue
    // #52). Emitted once per fire — before the projectile loop below, so a
    // multi-track fan is one announcement, not one per disc.
    this.bus.emit("weaponFired", data.kind, dir.x, dir.y);
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
      // An orbital never reaches here — `tick` diverts it before the fire path —
      // but the union makes the case explicit rather than a silent fallthrough.
      case "orbital":
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
