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
  /**
   * The three new weapons (issue #44), each a grant + a damage line + a signature
   * line, mirroring the sword/boomerang shape. All three are **available not
   * guaranteed** — `unlockedFrom` gates the grant to a phase, no `guaranteed`
   * flag — so a fresh weapon becomes offerable roughly every five minutes and the
   * player specialises rather than being force-fed five. Weapon-touching lines
   * carry no gate of their own: the inferred weapon gate (#32) holds them until
   * the weapon is owned. Every number is provisional.
   */

  // Weapon A — Popup Blocker (pierce-ranged), from Confidence.
  grant_popup_blocker: {
    title: "Popup Blocker",
    description: "Gain the Popup Blocker",
    effect: { kind: "grant_weapon", weapon: "popup_blocker" },
    maxStacks: 1,
    unlockedFrom: "confidence",
  },
  popup_blocker_damage: {
    title: "Aggressive Filtering",
    description: "+50 Popup Blocker damage",
    effect: { kind: "weapon_damage_add", weapon: "popup_blocker", amount: 50 },
    maxStacks: 6,
  },
  popup_blocker_projectile: {
    title: "Split Blocker",
    description: "+1 Popup Blocker shot",
    effect: { kind: "weapon_projectile_add", weapon: "popup_blocker", count: 1 },
    maxStacks: 4,
  },

  // Weapon B — Spam Filter (spin-melee), from Struggle.
  grant_spam_filter: {
    title: "Spam Filter",
    description: "Gain the Spam Filter",
    effect: { kind: "grant_weapon", weapon: "spam_filter" },
    maxStacks: 1,
    unlockedFrom: "struggle",
  },
  spam_filter_damage: {
    title: "Bulk Sender Rules",
    description: "+55 Spam Filter damage",
    effect: { kind: "weapon_damage_add", weapon: "spam_filter", amount: 55 },
    maxStacks: 6,
  },
  spam_filter_reach: {
    title: "Wider Net",
    description: "+22 Spam Filter reach",
    effect: { kind: "weapon_reach_add", weapon: "spam_filter", amount: 22 },
    maxStacks: 4,
  },

  // The orbital — Firewall, from Pro Struggle.
  grant_firewall: {
    title: "Firewall",
    description: "Gain the Firewall",
    effect: { kind: "grant_weapon", weapon: "firewall" },
    maxStacks: 1,
    unlockedFrom: "pro_struggle",
  },
  firewall_damage: {
    title: "Deep Packet Inspection",
    description: "+40 Firewall damage",
    effect: { kind: "weapon_damage_add", weapon: "firewall", amount: 40 },
    maxStacks: 6,
  },
  firewall_orbiter: {
    title: "Extra Port",
    description: "+1 Firewall orbiter",
    effect: { kind: "weapon_orbiter_add", weapon: "firewall", count: 1 },
    maxStacks: 3,
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
  /**
   * The run's first survivability axis (issue #43) — three independent, ungated
   * upgrades, available from 0:00. Every number is provisional; the per-phase
   * tuning passes own them. The `+150` joins the x10 HP/damage family (issue #25).
   */
  max_hp: {
    title: "Unlimited Data",
    description: "+150 max HP",
    effect: { kind: "player_max_hp_add", amount: 150 },
    maxStacks: 4,
  },
  regen: {
    title: "Auto-Renewal",
    description: "+20 HP/sec regeneration",
    effect: { kind: "player_regen_add", amount: 20 },
    maxStacks: 3,
  },
  /**
   * `0.88` per stack, capped at 4: 0.88⁴ ≈ 0.6, a 40% damage floor that never
   * reaches immunity — the cap is what keeps the multiplier off zero.
   */
  damage_reduction: {
    title: "Incognito Mode",
    description: "-12% damage taken",
    effect: { kind: "player_damage_reduction_mult", amount: 0.88 },
    maxStacks: 4,
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
