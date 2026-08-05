import type { Phase } from "./types";

/**
 * The pacing table — the run's spine, and the one place its shape is tuned
 * (issue #29).
 *
 * `Ad Nauseum.pdf` describes the run as seven named phases, each with a roster,
 * a spawn pressure, and a level-up budget. Before this, none of that existed:
 * `SpawnDirector` was two cooldowns lerped against a 300-second run with the
 * ogre gated by a lone `OGRE_START_TIME`, and `Progression` had no notion of
 * time at all. Every downstream ticket is a play-and-adjust pass on one phase,
 * so the phases have to be a thing you can edit one row of.
 *
 * **The numbers here are provisional.** They are today's five-minute curve
 * stretched 6× and sliced at the phase boundaries — grunt interval 2.2→0.7 and
 * wave 3→9 spread over 1800s instead of 300s, ogre interval 11→5. Pressure per
 * minute is therefore identical to the tuned five-minute run, which makes this
 * a baseline to react to rather than a design, and sidesteps the wave-size
 * blow-up the old `3 + floor(t/45)` would have reached by 30:00 (~43 per wave).
 * What the middle of a 30-minute run should actually feel like is still open.
 *
 * The one departure from the mechanical stretch: 1:30 × 6 puts the first ogre
 * at 9:00, sixty seconds inside `confidence`. A track spans a whole phase, so
 * the ogre starts at the top of `struggle` instead — which is also where the
 * PDF's advanced melee arrives.
 */
export const PHASES = [
  {
    id: "quick_start",
    displayName: "Quick Start",
    start: 0,
    end: 180,
    levelUps: [3, 3],
    tracks: [{ enemy: "popup_grunt", interval: [2.2, 2.05], wave: [3, 4] }],
  },
  {
    id: "slow_build",
    displayName: "Slow Build",
    start: 180,
    end: 300,
    levelUps: [3, 3],
    tracks: [{ enemy: "popup_grunt", interval: [2.05, 1.95], wave: [4, 4] }],
  },
  {
    id: "confidence",
    displayName: "Confidence",
    start: 300,
    end: 600,
    levelUps: [3, 4],
    tracks: [{ enemy: "popup_grunt", interval: [1.95, 1.7], wave: [4, 5] }],
  },
  {
    id: "struggle",
    displayName: "Struggle",
    start: 600,
    end: 900,
    levelUps: [2, 3],
    tracks: [
      { enemy: "popup_grunt", interval: [1.7, 1.45], wave: [5, 6] },
      { enemy: "autoplay_ogre", interval: [11, 9.5], wave: [1, 1] },
    ],
  },
  {
    id: "panic",
    displayName: "Panic",
    start: 900,
    end: 1200,
    levelUps: [2, 3],
    tracks: [
      { enemy: "popup_grunt", interval: [1.45, 1.2], wave: [6, 7] },
      { enemy: "autoplay_ogre", interval: [9.5, 8], wave: [1, 1] },
    ],
  },
  {
    id: "pro_struggle",
    displayName: "Pro Struggle",
    start: 1200,
    end: 1500,
    levelUps: [3, 4],
    tracks: [
      { enemy: "popup_grunt", interval: [1.2, 0.95], wave: [7, 8] },
      { enemy: "autoplay_ogre", interval: [8, 6.5], wave: [1, 1] },
    ],
  },
  {
    id: "god_tier",
    displayName: "God-Tier Survival",
    start: 1500,
    end: 1800,
    /** No further upgrades — the PDF's last stand. */
    levelUps: [0, 0],
    tracks: [
      { enemy: "popup_grunt", interval: [0.95, 0.7], wave: [8, 9] },
      { enemy: "autoplay_ogre", interval: [6.5, 5], wave: [1, 1] },
    ],
  },
] as const satisfies readonly Phase[];

export type PhaseId = (typeof PHASES)[number]["id"];

/**
 * How long a run lasts, **derived** rather than declared: the last phase's
 * close. `Run.LENGTH` reads this, so the clock and the table cannot disagree
 * about when the run ends, and stretching the run is one file.
 */
export const RUN_LENGTH: number = PHASES[PHASES.length - 1]!.end;

/**
 * The phase containing `elapsed` seconds.
 *
 * Clamped at both ends: negative time reads as the opening phase, and anything
 * at or past `RUN_LENGTH` as the closing one. The run is over by then, but the
 * director may still be ticked on the frame the clock expires, and "off the end
 * of the table" is not a case worth making every caller handle.
 */
export function phaseAt(elapsed: number): Phase {
  for (const phase of PHASES) if (elapsed < phase.end) return phase;
  return PHASES[PHASES.length - 1]!;
}

/** Where `elapsed` sits inside `phase`, as 0..1 — what every ramp lerps on. */
export function progressIn(phase: Phase, elapsed: number): number {
  const t = (elapsed - phase.start) / (phase.end - phase.start);
  return Math.min(1, Math.max(0, t));
}
