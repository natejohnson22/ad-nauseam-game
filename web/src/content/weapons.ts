import type { WeaponData } from "./types";

/**
 * Ported verbatim from `data/weapons/*.tres`. Colour (0.6, 1.0, 0.6) -> 153,
 * 255, 153.
 *
 * The sword's `projectile_*` and `travel_distance` numbers do not appear here —
 * they were ranged fields sitting unused on a melee weapon, and the `kind` union
 * is what deletes them (issue #3).
 *
 * Slice 5 adds `dnt_boomerang`.
 */
export const WEAPONS = {
  adblock_sword: {
    kind: "melee",
    displayName: "AdBlock+ Sword",
    baseDamage: 14,
    cooldown: 0.85,
    knockback: 90,
    reach: 130,
    arcDegrees: 100,
    color: 0x99ff99,
  },
} satisfies Record<string, WeaponData>;

export type WeaponId = keyof typeof WEAPONS;
