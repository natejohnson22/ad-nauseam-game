import { PHASES, RUN_LENGTH } from "../content/phases";

/**
 * The playtest harness's opening state, read off the URL (issue #30).
 *
 * **Why the URL and not a dev key or a debug menu.** The bar this map tunes
 * against is Nate playing a phase and saying yes, which means playing the same
 * phase five times in a row and moving one number between attempts. A URL is
 * the only one of the three that survives that loop: `scene.restart()` keeps
 * it, Vite's HMR reload keeps it, and the phone reading the dev server over the
 * LAN gets the same setup by pasting the same string. It is also the only one
 * that makes a report reproducible — "panic feels wrong" arrives as a link that
 * *is* the configuration, rather than as a list of keys to re-press. A debug
 * menu is an overlay to build, keep out of production, and navigate before
 * every attempt; dev keys have to be re-pressed after each restart and have to
 * dodge the movement bindings.
 *
 * Live *adjustment* still wants keys — see `DevHarness`, which binds a few for
 * the two settings you change while watching rather than before starting. The
 * URL is the declaration; the keys are the nudge.
 *
 * This half is deliberately Phaser-free and tested: the seek grammar has three
 * spellings and a clamp, and getting `?at=15:00` wrong by a factor of sixty is
 * exactly the kind of thing that would be blamed on the pacing.
 */
export interface DevConfig {
  /** Seconds into the run to start at. 0 — the real opening — by default. */
  readonly startAt: number;
  /** Multiplier on the frame delta. 1 is real time. */
  readonly timeScale: number;
  readonly invulnerable: boolean;
  /**
   * What could not be understood, in the order it was written. Surfaced in the
   * readout rather than thrown: a typo'd param should not blank the game, but a
   * silently-ignored `?at=panci` would be tuned against by mistake.
   */
  readonly problems: readonly string[];
}

/** Neither the fastest nor the slowest scale is useful, and both break physics. */
export const MIN_TIME_SCALE = 0.05;
export const MAX_TIME_SCALE = 16;

export const DEV_DEFAULTS: DevConfig = {
  startAt: 0,
  timeScale: 1,
  invulnerable: false,
  problems: [],
};

/**
 * Read `?at=`, `?speed=`, and `?invuln` out of a query string.
 *
 * `at` takes three spellings, all of which someone reaching for this would
 * try: a phase id (`?at=panic` — the reason `Phase.displayName` exists), a
 * clock reading (`?at=15:00`), or plain seconds (`?at=900`). It is clamped
 * inside the run, one second short of the end, because seeking to `RUN_LENGTH`
 * would trip the ending on the first frame.
 *
 * `invuln` is a bare flag: `?invuln` and `?invuln=1` both mean on, and only an
 * explicit `0`/`false` means off — a value-less param is what a URL-typing
 * human reaches for first.
 */
export function parseDevConfig(search: string): DevConfig {
  const params = new URLSearchParams(search);
  const problems: string[] = [];

  return {
    startAt: readStartAt(params.get("at"), problems),
    timeScale: readTimeScale(params.get("speed"), problems),
    invulnerable: readFlag(params.get("invuln")),
    problems,
  };
}

/** Whether anything at all was asked for — an unconfigured dev run is normal. */
export function isConfigured(config: DevConfig): boolean {
  return (
    config.startAt !== 0 ||
    config.timeScale !== 1 ||
    config.invulnerable ||
    config.problems.length > 0
  );
}

function readStartAt(raw: string | null, problems: string[]): number {
  if (raw === null || raw === "") return DEV_DEFAULTS.startAt;

  const seconds = phaseStart(raw) ?? clockSeconds(raw) ?? plainSeconds(raw);
  if (seconds === null) {
    problems.push(`at=${raw}: not a phase id, m:ss, or a number of seconds`);
    return DEV_DEFAULTS.startAt;
  }
  return Math.min(Math.max(0, seconds), RUN_LENGTH - 1);
}

function phaseStart(raw: string): number | null {
  const phase = PHASES.find((p) => p.id === raw);
  return phase === undefined ? null : phase.start;
}

function clockSeconds(raw: string): number | null {
  const match = /^(\d+):([0-5]\d)$/.exec(raw);
  if (match === null) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function plainSeconds(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

function readTimeScale(raw: string | null, problems: string[]): number {
  if (raw === null || raw === "") return DEV_DEFAULTS.timeScale;

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    problems.push(`speed=${raw}: not a positive number`);
    return DEV_DEFAULTS.timeScale;
  }
  return Math.min(Math.max(MIN_TIME_SCALE, value), MAX_TIME_SCALE);
}

function readFlag(raw: string | null): boolean {
  if (raw === null) return false;
  return raw !== "0" && raw.toLowerCase() !== "false";
}
