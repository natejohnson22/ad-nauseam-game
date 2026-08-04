/**
 * Content types — the hand-written half of what `.tres` used to be.
 *
 * Issue #3: content is TS object literals checked with `satisfies`, ids are
 * record keys rather than fields, and the variant fields (`kind`, `behavior`)
 * are discriminated unions so every dispatch switch is exhaustive.
 *
 * Only the variants slice 1 ships are declared. Slice 5 adds `ranged` weapons
 * and `telegraph_aoe` behaviour — and when it does, the compiler points at
 * exactly the switches that need a new arm, which is the whole reason these are
 * unions. Declaring dead variants up front would forfeit that.
 */

/** Strips `readonly` for the per-run copies upgrades mutate (WeaponManager). */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// ------------------------------------------------------------------ enemies

/** Godot: `enemy_data.gd`'s `behavior` enum plus the fields each branch reads. */
export type EnemyBehavior = { readonly kind: "chase" };

export interface EnemyData {
  readonly displayName: string;
  readonly maxHp: number;
  readonly speed: number;
  /** Body size — drives both the placeholder circle and the contact reach. */
  readonly radius: number;
  /** XP dropped on death. Unused until slice 2, but it is this enemy's number. */
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

export type WeaponData = MeleeWeaponData;
