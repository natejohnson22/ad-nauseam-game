import { expectedPool, phaseAt, progressIn, startOf } from "../content/phases";
import type { Phase, UpgradeEffect } from "../content/types";
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

/**
 * What the player-facing upgrades need from the player. `Player` satisfies it.
 *
 * Was `speedMult` alone; issue #43's survivability axis widened it by three —
 * still just mutable numbers and one method, so a test hands it a plain object
 * and nothing drags a canvas in. `raiseMaxHp` is a method rather than a field
 * because a Max HP pick heals as well as raises the ceiling, and that pairing
 * belongs to the player, not to the caller applying the effect.
 */
export interface PlayerTarget {
  speedMult: number;
  /** Summed by the Regen upgrade; consumed per-frame in `Player.tick`. */
  regenPerSecond: number;
  /** Multiplied by the Damage Reduction upgrade; applied at `Player.takeDamage`. */
  damageTakenMult: number;
  /** Raise the HP ceiling and heal by the same amount — the Max HP upgrade. */
  raiseMaxHp(amount: number): void;
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
  /** The two new weapons' signature lines — issue #44. */
  modReach(id: WeaponId, amount: number): void;
  modOrbiters(id: WeaponId, count: number): void;
  /** Equips a weapon the run does not have — issue #32's `grant_weapon`. */
  grantWeapon(id: WeaponId): void;
  /** Whether the run is carrying it, which is what gates its upgrades. */
  hasWeapon(id: WeaponId): boolean;
}

export class Progression {
  private static readonly CHOICES = 3;
  /** The pinned-full bar of a no-upgrade phase — any value with `xp === needed`. */
  private static readonly FULL_BAR = 1;

  level = 1;
  xp = 0;
  /**
   * Engagement to the next pick — the current phase's threshold `T = pool / max`
   * (issue #35), not a compounding curve. `xpChanged` carries it so the HUD bar
   * fills toward the next pick, and a no-upgrade phase pins it full.
   */
  xpNeeded = Progression.FULL_BAR;

  private readonly stacks = new Map<UpgradeId, number>();

  /** The phase whose budget is currently in force — watched by `tick`. */
  private phase!: Phase;
  /** Picks taken since this phase opened, against its `[min, max]`. */
  private picksThisPhase = 0;

  constructor(
    private readonly player: PlayerTarget,
    private readonly weapons: UpgradeTarget,
    private readonly clock: RunClock,
    private readonly pool: readonly Upgrade[],
    private readonly bus: Pick<GameBus, "emit">,
    /** Injected so `rollChoices` is deterministic under test. */
    private readonly random: () => number = Math.random,
  ) {
    this.enterPhase(phaseAt(this.clock.elapsed));
  }

  /**
   * The ceiling and floor of the current phase's budget — `[min, max]` from the
   * table. A `max` of zero is the last stand's "no further upgrades".
   */
  private get budget(): readonly [min: number, max: number] {
    return this.phase.levelUps;
  }

  /**
   * Open a phase: recompute the threshold from its own drop pool, reset the bar,
   * and start its pick count from zero (issue #35).
   *
   * `T = pool / max`, so collecting the whole expected pool crosses it exactly
   * `max` times. A no-upgrade phase (`max === 0`) has no threshold — the bar is
   * pinned full and no pickup or milestone ever fires a pick.
   */
  private enterPhase(phase: Phase): void {
    this.phase = phase;
    this.picksThisPhase = 0;
    const max = this.budget[1];
    if (max === 0) {
      this.xp = Progression.FULL_BAR;
      this.xpNeeded = Progression.FULL_BAR;
    } else {
      this.xp = 0;
      this.xpNeeded = expectedPool(phase) / max;
    }
    this.bus.emit("xpChanged", this.xp, this.xpNeeded, this.level);
  }

  /**
   * Bank a pickup's value toward the current phase's threshold (issue #35).
   *
   * Each `T` crossing is one pick, capped at the phase's `max` — a strong player
   * who out-collects the expected pool lands at `max` and banks the rest for
   * nothing, where the floor in `tick` catches a weak one at `min`. The `while`
   * survives a pickup that carries past two thresholds, but still only one modal
   * per pickup: the game is paused for it, so a second is unreachable anyway.
   */
  addEngagement(value: number): void {
    const [, max] = this.budget;
    let leveled = false;
    if (max > 0) {
      this.xp += value;
      while (this.picksThisPhase < max && this.xp >= this.xpNeeded) {
        this.xp -= this.xpNeeded;
        this.pickTaken();
        leveled = true;
      }
    }
    this.bus.emit("xpChanged", this.xp, this.xpNeeded, this.level);
    if (leveled) this.bus.emit("leveledUp", this.rollChoices(Progression.CHOICES));
  }

  /**
   * Advance the budget clock (issue #35), called each frame from the game loop.
   *
   * **Phase turnover** re-scales the threshold when the clock crosses a
   * boundary. **The floor** then tops a weak collector up: one who has not
   * earned `min` picks by phase-progress `k/(min+1)` is handed the k-th anyway,
   * so every phase delivers at least its budgeted minimum, spread across the
   * phase rather than bunched at one edge.
   *
   * The milestones are `k/(min+1)`, not `k/min`, so the last of them lands at
   * `min/(min+1)` — strictly *inside* the phase, before the boundary. That is
   * what lets turnover be a plain re-scale with nothing owed to flush: by the
   * time the clock reaches the boundary, the floor is already paid. It also
   * keeps a *seek* honest — jumping the clock to a later phase awards none of
   * the skipped phases' picks (a seek is not a run that was played), which is
   * the level-1 seek the map's "seek the build" fog already owns, not a modal
   * storm this ticket invents.
   */
  tick(): void {
    const now = phaseAt(this.clock.elapsed);
    if (now !== this.phase) this.enterPhase(now);

    const [min, max] = this.budget;
    if (max === 0) return;
    const progress = progressIn(this.phase, this.clock.elapsed);
    const due = Math.min(min, Math.floor(progress * (min + 1)));
    while (this.picksThisPhase < due) {
      this.xp = 0;
      this.pickTaken();
      this.bus.emit("xpChanged", this.xp, this.xpNeeded, this.level);
      this.bus.emit("leveledUp", this.rollChoices(Progression.CHOICES));
    }
  }

  /** One pick: level up and count it against the phase budget. */
  private pickTaken(): void {
    this.level += 1;
    this.picksThisPhase += 1;
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
      case "weapon_reach_add":
        this.weapons.modReach(effect.weapon, effect.amount);
        break;
      case "weapon_orbiter_add":
        this.weapons.modOrbiters(effect.weapon, effect.count);
        break;
      case "player_speed_mult":
        this.player.speedMult *= effect.amount;
        break;
      case "player_cooldown_mult":
        this.weapons.cooldownMult *= effect.amount;
        break;
      case "player_max_hp_add":
        this.player.raiseMaxHp(effect.amount);
        break;
      case "player_regen_add":
        this.player.regenPerSecond += effect.amount;
        break;
      case "player_damage_reduction_mult":
        this.player.damageTakenMult *= effect.amount;
        break;
      case "grant_weapon":
        this.weapons.grantWeapon(effect.weapon);
        break;
    }
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
      case "weapon_reach_add":
      case "weapon_orbiter_add":
        return this.weapons.hasWeapon(effect.weapon);
      case "player_speed_mult":
      case "player_cooldown_mult":
      case "player_max_hp_add":
      case "player_regen_add":
      case "player_damage_reduction_mult":
        // Survivability upgrades hold no weapon (issue #43): always ready.
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
