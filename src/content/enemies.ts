import type { EnemyData } from "./types";

/**
 * Ported from `data/enemies/*.tres`. Colours are the Godot floats rounded to
 * 8-bit channels: (0.95, 0.75, 0.2) -> 242, 191, 51.
 *
 * **`maxHp`, `contactDamage`, and the ogre's blast `damage` are the `.tres`
 * numbers x10** (issue #25) — see the note in `weapons.ts` for why, and for the
 * rest of the family that moved with them. `speed`, `radius`, `contactInterval`,
 * `engagementValue`, and the ogre's `interval` / `telegraph` / `radius` did not
 * move: those are what would have changed the difficulty.
 *
 * The grunt's four `aoe_*` numbers do not appear here — they were dead defaults
 * on a `chase` enemy, and the behaviour union is what deletes them (issue #3).
 * The ogre carries the same four as its behaviour's payload, where they are
 * read.
 */
export const ENEMIES = {
  popup_grunt: {
    displayName: "Popup Grunt",
    maxHp: 180,
    speed: 68,
    radius: 13,
    engagementValue: 1,
    contactDamage: 50,
    contactInterval: 0.6,
    behavior: { kind: "chase" },
    color: 0xf2bf33,
  },
  autoplay_ogre: {
    displayName: "Autoplay Video Ogre",
    maxHp: 1400,
    speed: 38,
    radius: 26,
    engagementValue: 8,
    contactDamage: 80,
    contactInterval: 0.7,
    behavior: {
      kind: "telegraph_aoe",
      interval: 3.5,
      telegraph: 1.1,
      radius: 95,
      damage: 280,
    },
    // (0.6, 0.2, 0.7) -> 153, 51, 179.
    color: 0x9933b3,
  },
} satisfies Record<string, EnemyData>;

export type EnemyId = keyof typeof ENEMIES;
