import type { EnemyData } from "./types";

/**
 * Ported verbatim from `data/enemies/*.tres`. Colours are the Godot floats
 * rounded to 8-bit channels: (0.95, 0.75, 0.2) -> 242, 191, 51.
 *
 * The grunt's four `aoe_*` numbers do not appear here — they were dead defaults
 * on a `chase` enemy, and the behaviour union is what deletes them (issue #3).
 * The ogre carries the same four as its behaviour's payload, where they are
 * read.
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
  autoplay_ogre: {
    displayName: "Autoplay Video Ogre",
    maxHp: 140,
    speed: 38,
    radius: 26,
    engagementValue: 8,
    contactDamage: 8,
    contactInterval: 0.7,
    behavior: {
      kind: "telegraph_aoe",
      interval: 3.5,
      telegraph: 1.1,
      radius: 95,
      damage: 28,
    },
    // (0.6, 0.2, 0.7) -> 153, 51, 179.
    color: 0x9933b3,
  },
} satisfies Record<string, EnemyData>;

export type EnemyId = keyof typeof ENEMIES;
