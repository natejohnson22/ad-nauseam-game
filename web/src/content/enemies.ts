import type { EnemyData } from "./types";

/**
 * Ported verbatim from `data/enemies/*.tres`. Colours are the Godot floats
 * rounded to 8-bit channels: (0.95, 0.75, 0.2) -> 242, 191, 51.
 *
 * The grunt's four `aoe_*` numbers do not appear here — they were dead defaults
 * on a `chase` enemy, and the behaviour union is what deletes them (issue #3).
 *
 * Slice 5 adds `autoplay_ogre`.
 */
export const ENEMIES = {
  popup_grunt: {
    displayName: "Popup Grunt",
    maxHp: 18,
    speed: 68,
    radius: 13,
    engagementValue: 1,
    contactDamage: 5,
    contactInterval: 0.6,
    behavior: { kind: "chase" },
    color: 0xf2bf33,
  },
} satisfies Record<string, EnemyData>;

export type EnemyId = keyof typeof ENEMIES;
