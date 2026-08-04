/**
 * Content types — the hand-written half of what `.tres` used to be.
 *
 * Issue #3: content is TS object literals checked with `satisfies`, ids are
 * record keys rather than fields, and the variant fields (`kind`, `behavior`)
 * are discriminated unions so every dispatch switch is exhaustive.
 *
 * Slice 5 added the second arm of both content unions — `ranged` weapons and
 * `telegraph_aoe` behaviour — and the bet paid: the compiler named every switch
 * that needed a case (`Enemy#tick`, `WeaponManager#fire`, `#modArc`,
 * `#modProjectiles`) rather than leaving them to be found by playing. Both
 * unions are now complete for Prototype 1.
 */

import type { WeaponId } from "./weapons";

/** Strips `readonly` for the per-run copies upgrades mutate (WeaponManager). */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ------------------------------------------------------------------ enemies

/**
 * Godot: `enemy_data.gd`'s `behavior` enum plus the fields each branch reads.
 *
 * The four `aoe_*` numbers live on the `telegraph_aoe` arm rather than on
 * `EnemyData`, which is what deletes them from the grunt: in the `.tres` files
 * the Popup Grunt carries a full set of ogre defaults it never reads.
 */
export type EnemyBehavior =
  | { readonly kind: "chase" }
  | {
      readonly kind: "telegraph_aoe";
      /** Seconds between blasts, counted only while chasing. */
      readonly interval: number;
      /** Seconds the ring pulses before the blast lands — the player's cue. */
      readonly telegraph: number;
      readonly radius: number;
      readonly damage: number;
    };

export interface EnemyData {
  readonly displayName: string;
  readonly maxHp: number;
  readonly speed: number;
  /** Body size — drives both the placeholder circle and the contact reach. */
  readonly radius: number;
  /** XP dropped on death, as an Engagement pickup. */
  readonly engagementValue: number;
  readonly contactDamage: number;
  /** Seconds between contact damage ticks. */
  readonly contactInterval: number;
  readonly behavior: EnemyBehavior;
  /** 0xRRGGBB, fed straight to `setTint`. */
  readonly color: number;
}

// ------------------------------------------------------------------ weapons

interface WeaponBase {
  readonly displayName: string;
  readonly baseDamage: number;
  /** Seconds between auto-fires. */
  readonly cooldown: number;
  readonly knockback: number;
  readonly color: number;
}

export interface MeleeWeaponData extends WeaponBase {
  readonly kind: "melee";
  /** Radius of the cleave. */
  readonly reach: number;
  /** Width of the cleave arc, in degrees. */
  readonly arcDegrees: number;
}

export interface RangedWeaponData extends WeaponBase {
  readonly kind: "ranged";
  readonly projectileSpeed: number;
  /** How far a shot flies before it turns around. */
  readonly travelDistance: number;
  /** Shots per fire, fanned 16deg apart. Raised by the multi-track upgrade. */
  readonly projectileCount: number;
}

export type WeaponData = MeleeWeaponData | RangedWeaponData;

// ----------------------------------------------------------------- upgrades

/**
 * What a level-up pick changes — `upgrade_data.gd`'s `effect` enum, as a
 * discriminated union.
 *
 * This is where issue #3's `target_weapon_id: &""` dies: the two `player_*`
 * arms simply have no weapon field, so the empty StringName that used to stand
 * for "not applicable" is unrepresentable. The one `amount: float` that meant
 * three different things splits into `amount`, `degrees`, and `count` — and
 * `count` being a `number` used as an integer is what deletes `int(u.amount)`.
 *
 * **All six arms are declared, including the two no upgrade reaches yet** —
 * `weapon_cooldown_mult`, which `main.gd`'s pool never used either, and
 * `weapon_projectile_add`, which waits on slice 5's boomerang. That is a
 * deliberate departure from how `EnemyBehavior` and `WeaponData` are handled
 * above: those track *content that does not exist*, so leaving the variant out
 * makes the compiler point at the switches slice 5 must revisit. Effects are
 * not content — the full set is fixed by `upgrade_data.gd` today, and writing
 * every arm now means slice 5 adds a record, not a dispatch branch.
 */
export type UpgradeEffect =
  | { readonly kind: "weapon_damage_add"; readonly weapon: WeaponId; readonly amount: number }
  | { readonly kind: "weapon_cooldown_mult"; readonly weapon: WeaponId; readonly amount: number }
  | { readonly kind: "weapon_arc_add"; readonly weapon: WeaponId; readonly degrees: number }
  | { readonly kind: "weapon_projectile_add"; readonly weapon: WeaponId; readonly count: number }
  | { readonly kind: "player_speed_mult"; readonly amount: number }
  | { readonly kind: "player_cooldown_mult"; readonly amount: number };

export interface UpgradeData {
  readonly title: string;
  readonly description: string;
  readonly effect: UpgradeEffect;
  /** How many times this may be taken in one run — keeps the pool fresh. */
  readonly maxStacks: number;
}
