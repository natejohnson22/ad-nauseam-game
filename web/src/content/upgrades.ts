import type { UpgradeData } from "./types";

/**
 * Ported verbatim from `data/upgrades/*.tres`.
 *
 * Slice 5 adds `boomerang_damage` and `boomerang_projectile` — they target
 * `dnt_boomerang`, which is not a `WeaponId` until that weapon exists, so the
 * `weapon` field would not typecheck today. Their *effects* are already
 * declared and already dispatched (see `UpgradeEffect`); only the two records
 * are missing, which is the whole point of writing all six arms up front.
 */
export const UPGRADES = {
  sword_damage: {
    title: "Premium Blade",
    description: "+6 AdBlock+ Sword damage",
    effect: { kind: "weapon_damage_add", weapon: "adblock_sword", amount: 6 },
    maxStacks: 6,
  },
  sword_arc: {
    title: "Wider Cleave",
    description: "+25° AdBlock+ Sword arc",
    effect: { kind: "weapon_arc_add", weapon: "adblock_sword", degrees: 25 },
    maxStacks: 4,
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
