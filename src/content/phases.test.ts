import { describe, expect, it } from "vitest";
import { PHASES, RUN_LENGTH, phaseAt, progressIn } from "./phases";

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

  it("never lets a track's wave size fall to nothing", () => {
    for (const phase of PHASES)
      for (const track of phase.tracks) {
        expect(Math.min(...track.wave)).toBeGreaterThanOrEqual(1);
        expect(Math.min(...track.interval)).toBeGreaterThan(0);
      }
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
