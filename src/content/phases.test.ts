import { describe, expect, it } from "vitest";
import { PHASES, RUN_LENGTH, expectedPool, phaseAt, progressIn } from "./phases";
import type { Phase, SpawnTrack } from "./types";

/**
 * `PHASES` is `as const`, so a track whose `max` is absent has no such property
 * *in its type* — the literal type is narrower than `SpawnTrack`. Reading the
 * table back through the declared type is what lets a test ask "is this one
 * capped?" of every row alike.
 */
const tracksOf = (phase: (typeof PHASES)[number]): readonly SpawnTrack[] =>
  phase.tracks;

/**
 * The table is data, so most of what is worth asserting is its *shape* — the
 * invariants `satisfies Phase[]` cannot express. A gap or an overlap between
 * two windows is a hole the director would fall through at exactly one moment,
 * 20 minutes into a run, which is the worst possible place to find it.
 */
describe("the phase table", () => {
  it("is the PDF's seven phases", () => {
    expect(PHASES.map((p) => p.id)).toEqual([
      "quick_start",
      "slow_build",
      "confidence",
      "struggle",
      "panic",
      "pro_struggle",
      "god_tier",
    ]);
  });

  it("opens at zero and tiles the run with no gap or overlap", () => {
    expect(PHASES[0]!.start).toBe(0);
    for (const [i, phase] of PHASES.entries()) {
      expect(phase.end).toBeGreaterThan(phase.start);
      const next = PHASES[i + 1];
      if (next) expect(next.start).toBe(phase.end);
    }
  });

  it("derives the run length from the last phase — 30 minutes", () => {
    expect(RUN_LENGTH).toBe(1800);
    expect(RUN_LENGTH).toBe(PHASES[PHASES.length - 1]!.end);
  });

  it("hands out the PDF's level-up budget, drying up at the end", () => {
    expect(PHASES.map((p) => p.levelUps)).toEqual([
      [3, 3],
      [3, 3],
      [3, 4],
      [2, 3],
      [2, 3],
      [3, 4],
      [0, 0],
    ]);
  });

  /**
   * The roster column is the PDF's brief rather than a tuning number, so unlike
   * the rates it is worth pinning (issue #31). What these protect is the
   * *shape* of the arc: a tuning pass that quietly drops an archetype from a
   * phase has changed the design, not the difficulty.
   */
  it("introduces each archetype at the phase the PDF gives it", () => {
    const arrives = (enemy: string): string =>
      PHASES.find((p) => p.tracks.some((t) => t.enemy === enemy))!.id;

    expect(arrives("popup_grunt")).toBe("quick_start");
    expect(arrives("tracking_pixel")).toBe("confidence");
    expect(arrives("cookie_banner")).toBe("struggle");
    // Promoted to mini-boss, so it opens Panic rather than Struggle.
    expect(arrives("autoplay_ogre")).toBe("panic");
    expect(arrives("paywall")).toBe("pro_struggle");
    expect(arrives("the_algorithm")).toBe("god_tier");
  });

  it("never drops an archetype once it has arrived", () => {
    let previous = new Set<string>();
    for (const phase of PHASES) {
      const roster = new Set(phase.tracks.map((t) => t.enemy));
      for (const enemy of previous) expect(roster).toContain(enemy);
      previous = roster;
    }
  });

  it("caps every archetype that is not swarm texture", () => {
    // The Grunt is the only thing on the board with no ceiling. Everything
    // else is heavy enough that an uncapped track carpets the arena.
    for (const phase of PHASES)
      for (const track of tracksOf(phase)) {
        if (track.enemy === "popup_grunt") expect(track.max).toBeUndefined();
        else expect(track.max).toBeGreaterThanOrEqual(1);
      }
  });

  it("keeps the mini-boss and the boss singular wherever they appear", () => {
    for (const phase of PHASES)
      for (const track of tracksOf(phase))
        if (track.enemy === "autoplay_ogre" || track.enemy === "the_algorithm")
          expect(track.max).toBe(1);
  });

  it("never lets a track's wave size fall to nothing", () => {
    for (const phase of PHASES)
      for (const track of phase.tracks) {
        expect(Math.min(...track.wave)).toBeGreaterThanOrEqual(1);
        expect(Math.min(...track.interval)).toBeGreaterThan(0);
      }
  });
});

/**
 * The B-ii pool (issue #35): the level-up budget divides a phase's own expected
 * drop pool, so `Progression` needs to know coarsely how much a phase throws.
 *
 * "Coarsely" is the whole design: only the **uncapped** swarm tracks are
 * counted. A `max`-capped track's total spawns depend on how fast the player
 * kills it — a circularity not worth resolving, and a small fraction of the
 * pool besides, since the grunt dominates by sheer count. The floor guarantee
 * and the self-correcting threshold absorb the error.
 */
describe("expectedPool", () => {
  /** One uncapped grunt track: 100s / 2s = 50 waves, 5 each, value 1 -> 250. */
  const shaped = (tracks: SpawnTrack[]): Phase => ({
    id: "shaped",
    displayName: "Shaped",
    start: 0,
    end: 100,
    levelUps: [3, 3],
    tracks,
  });

  it("integrates an uncapped track: waves x wave size x engagement value", () => {
    const pool = expectedPool(
      shaped([{ enemy: "popup_grunt", interval: [2, 2], wave: [5, 5] }]),
    );
    expect(pool).toBe(250);
  });

  it("averages a ramp across the window before integrating", () => {
    // interval mean 2.5, wave mean 4: 100 / 2.5 = 40 waves, x4, value 1 = 160.
    const pool = expectedPool(
      shaped([{ enemy: "popup_grunt", interval: [2, 3], wave: [3, 5] }]),
    );
    expect(pool).toBe(160);
  });

  it("ignores capped tracks — their total is circular and small", () => {
    const pool = expectedPool(
      shaped([
        { enemy: "popup_grunt", interval: [2, 2], wave: [5, 5] },
        { enemy: "tracking_pixel", interval: [2, 2], wave: [5, 5], max: 8 },
      ]),
    );
    expect(pool).toBe(250);
  });

  it("sums every uncapped track by its own enemy's value", () => {
    // Two uncapped grunt tracks, 250 each.
    const pool = expectedPool(
      shaped([
        { enemy: "popup_grunt", interval: [2, 2], wave: [5, 5] },
        { enemy: "popup_grunt", interval: [2, 2], wave: [5, 5] },
      ]),
    );
    expect(pool).toBe(500);
  });
});

describe("phaseAt", () => {
  it("returns the phase a moment belongs to", () => {
    expect(phaseAt(0).id).toBe("quick_start");
    expect(phaseAt(179.9).id).toBe("quick_start");
    expect(phaseAt(600).id).toBe("struggle");
    expect(phaseAt(1799).id).toBe("god_tier");
  });

  it("gives a boundary second to the phase it opens", () => {
    expect(phaseAt(180).id).toBe("slow_build");
    expect(phaseAt(1500).id).toBe("god_tier");
  });

  it("clamps outside the run rather than returning nothing", () => {
    expect(phaseAt(-5).id).toBe("quick_start");
    expect(phaseAt(RUN_LENGTH).id).toBe("god_tier");
    expect(phaseAt(RUN_LENGTH + 100).id).toBe("god_tier");
  });
});

describe("progressIn", () => {
  const struggle = PHASES[3]!;

  it("is zero at the open and one at the close", () => {
    expect(progressIn(struggle, 600)).toBe(0);
    expect(progressIn(struggle, 900)).toBe(1);
  });

  it("is phase-local, not run-local", () => {
    expect(progressIn(struggle, 750)).toBe(0.5);
  });

  it("clamps outside its own window", () => {
    expect(progressIn(struggle, 0)).toBe(0);
    expect(progressIn(struggle, 1800)).toBe(1);
  });
});
