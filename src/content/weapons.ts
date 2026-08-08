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
    returns: true,
    // (0.5, 0.9, 1.0) -> 128, 230, 255.
    color: 0x80e6ff,
  },
  /**
   * The three new weapons from the upgrade-pool design (#36), built in #44.
   * Available-not-guaranteed, gated to a phase apiece so a fresh toy lands
   * roughly every five minutes; the numbers here are **provisional**, owned by
   * the per-phase tuning passes. Damage joins the x10 HP/damage family (#25).
   * Names are placeholder ad-dystopia flavour — Nate owns the finals.
   */

  /**
   * Weapon A — pierce-ranged. The `ranged` entity with `returns: false`: a shot
   * that flies a straight committed line through the swarm and expires at
   * `travelDistance` instead of arcing back. Faster and longer than the
   * boomerang so the line reads as a clean punch-through. Signature is Multi-Track
   * (`weapon_projectile_add`): a wider fan of piercing shots, "through the swarm."
   */
  popup_blocker: {
    kind: "ranged",
    displayName: "Popup Blocker",
    baseDamage: 90,
    cooldown: 1.1,
    knockback: 60,
    projectileSpeed: 620,
    travelDistance: 460,
    projectileCount: 1,
    returns: false,
    // (1.0, 0.75, 0.3) -> 255, 191, 77.
    color: 0xffbf4d,
  },
  /**
   * Weapon B — spin-melee. A `melee` weapon whose whole trick is `arcDegrees:
   * 360`: the sword's wedge and hit test already read the arc, so a full-circle
   * cleave is content, not code (issue #44). Shorter reach and a slower swing
   * than the frontal sword — it clears a crowd all around rather than punching
   * ahead. Signature is `weapon_reach_add`, since the arc cannot open past 360°.
   */
  spam_filter: {
    kind: "melee",
    displayName: "Spam Filter",
    baseDamage: 110,
    cooldown: 1.2,
    knockback: 70,
    reach: 95,
    arcDegrees: 360,
    // (0.7, 0.5, 1.0) -> 179, 128, 255.
    color: 0xb380ff,
  },
  /**
   * The orbital — circling passive area-denial, the pool's new `kind`. Two orbs
   * revolving at `orbitRadius`, dealing contact damage on their own re-hit
   * cooldown; no aim, no fire timing. Signature is `weapon_orbiter_add`.
   */
  firewall: {
    kind: "orbital",
    displayName: "Firewall",
    baseDamage: 80,
    // Carried by `WeaponBase`, unread by an orbital (see types.ts).
    cooldown: 1,
    knockback: 90,
    orbitRadius: 90,
    angularSpeed: 2.4,
    orbiterCount: 2,
    orbiterRadius: 12,
    hitInterval: 0.4,
    // (1.0, 0.35, 0.35) -> 255, 89, 89.
    color: 0xff5959,
  },
} satisfies Record<string, WeaponData>;

export type WeaponId = keyof typeof WEAPONS;
