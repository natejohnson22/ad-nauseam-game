import type { EnemyData } from "./types";

/**
 * The roster — six archetypes for the PDF's six roles (issue #31).
 *
 * The enemies are the machinery of the ad-funded web, and each one's mechanic
 * is what that format actually does to you as a reader: a pop-up gets in your
 * face, a tracking pixel follows you at a distance, a cookie banner makes
 * everything take longer, a paywall stops you mid-sentence and demands money.
 * The fiction is not decoration here — it is where the mechanics came from.
 *
 * | PDF role        | Archetype        | Behaviour         |
 * |-----------------|------------------|-------------------|
 * | Basic melee     | Popup Grunt      | `chase`           |
 * | Basic ranged    | Tracking Pixel   | `ranged_standoff` |
 * | Advanced melee  | Cookie Banner    | `chase_aura`      |
 * | Mini-boss melee | Autoplay Ogre    | `telegraph_aoe`   |
 * | Advanced ranged | Paywall          | `ranged_standoff` |
 * | Final boss      | The Algorithm    | `ranged_standoff` |
 *
 * The Ogre was **promoted** rather than duplicated: 1400 HP, a telegraph, and
 * one at a time is already a mini-boss, so it moved from Struggle to Panic and
 * advanced melee became something new. That kept the invention budget on the
 * two things the game genuinely lacked — an enemy that shoots, and an enemy
 * that isn't solved by walking away.
 *
 * **Every number below except the Ogre's and the Grunt's is provisional**, in
 * the same sense `phases.ts`'s ramps are: placed on the x10 scale (issue #25),
 * sanity-checked against the Grunt, and explicitly there to be replaced by the
 * per-phase tuning passes. Nothing here has been played yet. The Algorithm's HP
 * in particular is a stand-in — it is a DPS check against a real endgame build,
 * which is #37's measurement to make, not this file's guess.
 *
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
  /**
   * Basic ranged. Fast, fragile, and always in your peripheral vision — it
   * never touches you, it just keeps plinking from wherever you aren't looking.
   * Arrives in Confidence to interrupt the kiting circle the player has just
   * got comfortable in.
   */
  tracking_pixel: {
    displayName: "Tracking Pixel",
    maxHp: 120,
    // Faster than the player's 220? No — it must be catchable, or it becomes a
    // permanent tax. It outruns the Grunt, not the User.
    speed: 105,
    radius: 9,
    engagementValue: 2,
    // It is not a melee threat; touching one is a rounding error next to the
    // Grunt's 50. The shot is the enemy.
    contactDamage: 20,
    contactInterval: 0.6,
    behavior: {
      kind: "ranged_standoff",
      range: 280,
      minRange: 190,
      interval: 2.4,
      telegraph: 0.45,
      damage: 60,
      projectileSpeed: 280,
      travelDistance: 520,
      shot: { kind: "bolt" },
    },
    color: 0xff5f9e,
  },
  /**
   * Advanced melee. Slow, fat, and it makes the ground around it sludge —
   * you can cross it, it costs you. A wall you are allowed through.
   *
   * The 0.55 field against the player's 220 leaves 121, which is still faster
   * than everything melee on the board; the danger is not the Banner itself
   * but what catches up while you are wading. That is also why it wants a
   * `max`: a dozen overlapping fields is a different, much worse game.
   */
  cookie_banner: {
    displayName: "Cookie Banner",
    maxHp: 900,
    speed: 52,
    radius: 30,
    engagementValue: 6,
    contactDamage: 60,
    contactInterval: 0.8,
    behavior: { kind: "chase_aura", radius: 150, speedMult: 0.55 },
    color: 0xa9743d,
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
  /**
   * Advanced ranged. Plants close, winds up long, and throws a slow fat shot
   * that takes your weapons away for a moment on top of the damage.
   *
   * Everything about it is built to make the lockout fair: a 0.9s telegraph, a
   * 150px/s projectile the player outruns at 220, and a five-second reload.
   * If you eat it, you were not moving.
   */
  paywall: {
    displayName: "Paywall",
    maxHp: 1600,
    speed: 46,
    radius: 24,
    engagementValue: 10,
    contactDamage: 90,
    contactInterval: 0.7,
    behavior: {
      kind: "ranged_standoff",
      range: 250,
      minRange: 170,
      interval: 5,
      telegraph: 0.9,
      damage: 140,
      projectileSpeed: 150,
      travelDistance: 430,
      shot: { kind: "lockout", seconds: 0.9 },
    },
    color: 0xd94f4f,
  },
  /**
   * The final boss: the thing that decided you should see all of the above.
   * It does not chase. It does not need to.
   *
   * **Deliberately the plainest possible boss** — the shared standoff arm with
   * heavy numbers, no phases, no adds, no arm of its own (issue #31). #37
   * confirmed it stays that way: the god_tier spawn stream (six concurrent
   * tracks) is the chaos, and the boss is a pure HP wall burned down underneath
   * it. The genre research in #33 points the same way: the one sourced dev
   * statement on end-of-run bosses cut HP and escalated behaviour instead. If a
   * later pass wants escalation, that is a fifth behaviour arm, not a number.
   *
   * **`maxHp` is a formula, not a guess (issue #37): `target_TTK × endgame
   * single-target DPS`, with `target_TTK ≈ 90s` of focused fire — a solid build
   * clears it with room, a weak build times out.** The DPS is still *unmeasured*:
   * the map's open "seek the build" problem means the harness can't yet drop you
   * into a representative ~18-pick endgame, so nobody has read a real endgame DPS
   * off the HUD. The number below is a provisional stand-in derived from a rough
   * ~600 focused-DPS estimate (× 90s ≈ 54k); the **god_tier tuning pass owns the
   * real number** once seek-the-build lands. It joins the ×10 HP/damage family
   * (issue #25). The boss enters at god_tier open (25:00) — its track fires on
   * sight — so the whole final 5 minutes is the DPS check.
   */
  the_algorithm: {
    displayName: "The Algorithm",
    // Provisional: ~90s × ~600 focused DPS. Re-measure once seek-the-build lands.
    maxHp: 54000,
    speed: 40,
    radius: 48,
    engagementValue: 100,
    contactDamage: 150,
    contactInterval: 0.6,
    behavior: {
      kind: "ranged_standoff",
      range: 430,
      minRange: 300,
      interval: 1.8,
      telegraph: 0.6,
      damage: 120,
      projectileSpeed: 300,
      travelDistance: 720,
      shot: { kind: "bolt" },
    },
    color: 0xe6e6f0,
  },
} satisfies Record<string, EnemyData>;

export type EnemyId = keyof typeof ENEMIES;
