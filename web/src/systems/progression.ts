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

/** `weapon_manager.gd`'s upgrade hooks. `WeaponManager` satisfies it. */
export interface UpgradeTarget {
  cooldownMult: number;
  modDamage(id: WeaponId, amount: number): void;
  modCooldownMult(id: WeaponId, mult: number): void;
  modArc(id: WeaponId, degrees: number): void;
  modProjectiles(id: WeaponId, count: number): void;
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
    }
  }

  private levelUp(): void {
    this.level += 1;
    this.xpNeeded = Math.round(this.xpNeeded * Progression.CURVE) + 1;
  }

  /** Up to `n` distinct upgrades that are not already at their stack cap. */
  private rollChoices(n: number): readonly Upgrade[] {
    const available = this.pool.filter(
      (u) => this.stacksOf(u.id) < u.data.maxStacks,
    );
    return this.shuffle(available).slice(0, n);
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
