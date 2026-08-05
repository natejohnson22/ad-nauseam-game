import type { WeaponData } from "./types";

/**
 * Ported from `data/weapons/*.tres`. Colour (0.6, 1.0, 0.6) -> 153, 255, 153.
 *
 * **Damage is the `.tres` number x10** (issue #25). Floating damage numbers
 * want figures with some weight to them, and the whole HP/damage family — both
 * weapons, both damage upgrades, every enemy's HP and contact damage, the
 * ogre's blast, and `Player.MAX_HP` — was scaled together, so play is unchanged:
 * same hits to kill, same time to die. Nothing outside that family moved.
 * `cooldown`, `knockback`, `reach`, `arcDegrees`, and the projectile numbers are
 * the `.tres` values untouched.
 *
 * The sword's `projectile_*` and `travel_distance` numbers do not appear here —
 * they were ranged fields sitting unused on a melee weapon, and the `kind` union
 * is what deletes them (issue #3). The boomerang's `reach` and `arc_degrees` go
 * the same way, for the same reason.
 */
export const WEAPONS = {
  adblock_sword: {
    kind: "melee",
    displayName: "AdBlock+ Sword",
    baseDamage: 140,
    cooldown: 0.85,
    knockback: 90,
    reach: 130,
    arcDegrees: 100,
    color: 0x99ff99,
  },
  dnt_boomerang: {
    kind: "ranged",
    displayName: "Do Not Track Boomerang",
    baseDamage: 100,
    cooldown: 1.4,
    knockback: 120,
    projectileSpeed: 460,
    travelDistance: 320,
    projectileCount: 1,
    // (0.5, 0.9, 1.0) -> 128, 230, 255.
    color: 0x80e6ff,
  },
} satisfies Record<string, WeaponData>;

export type WeaponId = keyof typeof WEAPONS;
