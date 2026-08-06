import { startOf } from "../content/phases";
import type { UpgradeEffect } from "../content/types";
import type { Upgrade, UpgradeId } from "../content/upgrades";
import type { WeaponId } from "../content/weapons";
import type { GameBus } from "../core/event-bus";

/**
 * Engagement (XP) -> level -> "pick 1 of 3" upgrades — the port of
 * `progression.gd`, and the protected core of Prototype 1.
 *
 * **Phaser-free, and tested.** Its collaborators arrive as the two narrow
 * interfaces below rather than as `Player` and `WeaponManager`, so a test can
 * hand it plain objects and nothing drags a canvas in. The interfaces are also
 * the honest statement of what a level-up may touch: two mutable numbers and
 * four weapon hooks.
 */

/** What the speed upgrade needs from the player. `Player` satisfies it. */
export interface SpeedTarget {
  speedMult: number;
}

/**
 * How far into the run it is — the fourth collaborator, added by issue #32 so a
 * pick can be gated on a phase. `Run` satisfies it.
 *
 * A read of one number, not the `Run` class, for the same reason as its two
 * neighbours here: the tests hand it `{ elapsed: 0 }` and nothing drags a canvas
 * in. It is also the honest statement of the widening — `Progression` is now
 * time-aware, and this interface is exactly how much time it may see.
 */
export interface RunClock {
  readonly elapsed: number;
}

/** `weapon_manager.gd`'s upgrade hooks. `WeaponManager` satisfies it. */
export interface UpgradeTarget {
  cooldownMult: number;
  modDamage(id: WeaponId, amount: number): void;
  modCooldownMult(id: WeaponId, mult: number): void;
  modArc(id: WeaponId, degrees: number): void;
  modProjectiles(id: WeaponId, count: number): void;
  /** Equips a weapon the run does not have — issue #32's `grant_weapon`. */
  grantWeapon(id: WeaponId): void;
  /** Whether the run is carrying it, which is what gates its upgrades. */
  hasWeapon(id: WeaponId): boolean;
}

export class Progression {
  /** Engagement needed for level 2. */
  static readonly FIRST_LEVEL_XP = 5;
  private static readonly CURVE = 1.35;
  private static readonly CHOICES = 3;

  level = 1;
  xp = 0;
  xpNeeded = Progression.FIRST_LEVEL_XP;

  private readonly stacks = new Map<UpgradeId, number>();

  constructor(
    private readonly player: SpeedTarget,
    private readonly weapons: UpgradeTarget,
    private readonly clock: RunClock,
    private readonly pool: readonly Upgrade[],
    private readonly bus: Pick<GameBus, "emit">,
    /** Injected so `rollChoices` is deterministic under test. */
    private readonly random: () => number = Math.random,
  ) {
    this.bus.emit("xpChanged", this.xp, this.xpNeeded, this.level);
  }

  /**
   * Bank a pickup's value. The loop is a `while`, not an `if`: one late-run
   * pickup can carry past two thresholds at once, and the player is owed both
   * levels — but still only **one** modal, which is what `leveled` tracks.
   */
  addEngagement(value: number): void {
    this.xp += value;
    let leveled = false;
    while (this.xp >= this.xpNeeded) {
      this.xp -= this.xpNeeded;
      this.levelUp();
      leveled = true;
    }
    this.bus.emit("xpChanged", this.xp, this.xpNeeded, this.level);
    if (leveled) this.bus.emit("leveledUp", this.rollChoices(Progression.CHOICES));
  }

  /** How many times `id` has been taken this run. */
  stacksOf(id: UpgradeId): number {
    return this.stacks.get(id) ?? 0;
  }

  applyUpgrade(upgrade: Upgrade): void {
    this.stacks.set(upgrade.id, this.stacksOf(upgrade.id) + 1);

    // Exhaustive over `UpgradeEffect`. `progression.gd`'s `match` silently fell
    // through on an unhandled effect; `noFallthroughCasesInSwitch` plus a union
    // with no default arm is what turns that into a compile error (issue #3).
    const effect = upgrade.data.effect;
    switch (effect.kind) {
      case "weapon_damage_add":
        this.weapons.modDamage(effect.weapon, effect.amount);
        break;
      case "weapon_cooldown_mult":
        this.weapons.modCooldownMult(effect.weapon, effect.amount);
        break;
      case "weapon_arc_add":
        this.weapons.modArc(effect.weapon, effect.degrees);
        break;
      case "weapon_projectile_add":
        this.weapons.modProjectiles(effect.weapon, effect.count);
        break;
      case "player_speed_mult":
        this.player.speedMult *= effect.amount;
        break;
      case "player_cooldown_mult":
        this.weapons.cooldownMult *= effect.amount;
        break;
      case "grant_weapon":
        this.weapons.grantWeapon(effect.weapon);
        break;
    }
  }

  private levelUp(): void {
    this.level += 1;
    this.xpNeeded = Math.round(this.xpNeeded * Progression.CURVE) + 1;
  }

  /**
   * Up to `n` distinct eligible upgrades — guaranteed ones first, in pool order,
   * then the rest shuffled behind them (issue #32).
   *
   * The one filter this used to be (under its stack cap) is now three, and the
   * ordering is no longer purely random. A guaranteed upgrade is only *featured*
   * while it has never been taken: `maxStacks` decides whether it may be offered
   * again at all, and `stacksOf` decides whether it still gets the free slot, so
   * a hypothetical stackable guarantee would lead the roll exactly once rather
   * than owning a slot for its whole life.
   */
  private rollChoices(n: number): readonly Upgrade[] {
    const eligible = this.pool.filter((u) => this.isEligible(u));
    const featured = eligible.filter(
      (u) => u.data.guaranteed === true && this.stacksOf(u.id) === 0,
    );
    const rest = eligible.filter((u) => !featured.includes(u));
    return [...featured, ...this.shuffle(rest)].slice(0, n);
  }

  /** Under its stack cap, past its phase gate, and holding the right weapons. */
  private isEligible(upgrade: Upgrade): boolean {
    const { maxStacks, unlockedFrom, effect } = upgrade.data;
    if (this.stacksOf(upgrade.id) >= maxStacks) return false;
    if (unlockedFrom !== undefined && this.clock.elapsed < startOf(unlockedFrom)) {
      return false;
    }
    return this.weaponReady(effect);
  }

  /**
   * The **inferred** gate (issue #32): an upgrade that modifies a weapon waits
   * for the weapon, and a grant waits for its absence.
   *
   * Nothing declares this. `boomerang_damage.effect` already says
   * `weapon: "dnt_boomerang"`, so a `requires: "grant_boomerang"` beside it
   * would be the same fact written twice — the shape this codebase keeps
   * deleting. Inferring it also means the upgrade-pool ticket can add weapons
   * without remembering a rule.
   *
   * Before this existed, "Sharper Signal" could roll at level 2 and `modDamage`
   * would shrug at an unequipped boomerang: a pick silently spent on nothing.
   */
  private weaponReady(effect: UpgradeEffect): boolean {
    switch (effect.kind) {
      case "grant_weapon":
        return !this.weapons.hasWeapon(effect.weapon);
      case "weapon_damage_add":
      case "weapon_cooldown_mult":
      case "weapon_arc_add":
      case "weapon_projectile_add":
        return this.weapons.hasWeapon(effect.weapon);
      case "player_speed_mult":
      case "player_cooldown_mult":
        return true;
    }
  }

  /** Fisher-Yates, in place on the caller's copy — Godot's `Array.shuffle()`. */
  private shuffle(items: Upgrade[]): Upgrade[] {
    for (let i = items.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1));
      [items[i], items[j]] = [items[j]!, items[i]!];
    }
    return items;
  }
}
