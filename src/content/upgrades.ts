import type { UpgradeData } from "./types";

/**
 * Ported from `data/upgrades/*.tres`, in `main.gd`'s `_upgrade_pool`
 * order — which is the pool's order, since `UPGRADE_POOL` is derived from this
 * record rather than hand-listed.
 *
 * Slice 5's two boomerang records cost exactly what writing all six
 * `UpgradeEffect` arms up front promised they would: two literals and no
 * dispatch branch. `weapon_projectile_add` had been declared and dispatched
 * since slice 2 with nothing to route to.
 *
 * **The two damage amounts are the `.tres` numbers x10** (issue #25) — see the
 * note in `weapons.ts`. `player_speed_mult` and `player_cooldown_mult` multiply
 * numbers outside the HP/damage family, so they are untouched.
 */
export const UPGRADES = {
  sword_damage: {
    title: "Premium Blade",
    description: "+60 AdBlock+ Sword damage",
    effect: { kind: "weapon_damage_add", weapon: "adblock_sword", amount: 60 },
    maxStacks: 6,
  },
  sword_arc: {
    title: "Wider Cleave",
    description: "+25° AdBlock+ Sword arc",
    effect: { kind: "weapon_arc_add", weapon: "adblock_sword", degrees: 25 },
    maxStacks: 4,
  },
  /**
   * How the Do Not Track Boomerang arrives (issue #32) — a pick, not a grant.
   *
   * `unlockedFrom` puts it in the PDF's 3–5 window and `guaranteed` makes it the
   * first thing offered in every roll from then until taken, so the ranged
   * weapon cannot simply fail to come up. Its arrival is therefore only as
   * prompt as the player's next level-up, which is on purpose: the weapon
   * showing up is a consequence of how the opening was played rather than an
   * appointment the director keeps.
   *
   * `maxStacks: 1` is belt and braces — the weapon gate stops offering a grant
   * for a weapon already owned, so this can never be taken twice anyway.
   */
  grant_boomerang: {
    title: "Do Not Track",
    description: "Gain the Do Not Track Boomerang",
    effect: { kind: "grant_weapon", weapon: "dnt_boomerang" },
    maxStacks: 1,
    unlockedFrom: "slow_build",
    guaranteed: true,
  },
  boomerang_damage: {
    title: "Sharper Signal",
    description: "+50 Do Not Track Boomerang damage",
    effect: { kind: "weapon_damage_add", weapon: "dnt_boomerang", amount: 50 },
    maxStacks: 6,
  },
  /**
   * The PDF's "multi-shot becomes available" at 5–10, which is a phase gate and
   * nothing more (issue #32) — no guarantee, because *available* is not
   * *promised*.
   *
   * The only record carrying both gates: `unlockedFrom` holds it to Confidence,
   * and the inferred weapon gate holds it until the boomerang is actually in
   * hand. A player who declined the grant through Slow build does not get
   * offered a second boomerang shot in Confidence.
   */
  boomerang_projectile: {
    title: "Multi-Track",
    description: "+1 Do Not Track Boomerang",
    effect: { kind: "weapon_projectile_add", weapon: "dnt_boomerang", count: 1 },
    maxStacks: 3,
    unlockedFrom: "confidence",
  },
  move_speed: {
    title: "Bandwidth Boost",
    description: "+12% move speed",
    effect: { kind: "player_speed_mult", amount: 1.12 },
    maxStacks: 5,
  },
  cooldown: {
    title: "Battery Saver",
    description: "-10% all weapon cooldowns",
    effect: { kind: "player_cooldown_mult", amount: 0.9 },
    maxStacks: 5,
  },
} satisfies Record<string, UpgradeData>;

export type UpgradeId = keyof typeof UPGRADES;

/**
 * A pool entry: a record key rejoined to its data.
 *
 * Ids became keys in issue #3, which is right for authoring and wrong for the
 * one place that needs both at once — `Progression` counts stacks by id while
 * the modal renders the title and description. Rejoining them here beats
 * threading `Object.entries` pairs through every signature.
 */
export interface Upgrade {
  readonly id: UpgradeId;
  readonly data: UpgradeData;
}

/** `main.gd`'s hand-listed `_upgrade_pool`, derived rather than maintained. */
export const UPGRADE_POOL: readonly Upgrade[] = Object.entries(UPGRADES).map(
  ([id, data]) => ({ id: id as UpgradeId, data }),
);
