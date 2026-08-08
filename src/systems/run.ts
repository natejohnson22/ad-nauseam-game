import { RUN_LENGTH } from "../content/phases";
import type { GameBus } from "../core/event-bus";

/**
 * Why the run stopped, and which screen it turns into (issue #37).
 *
 * The ending changed shape with the boss: winning is no longer surviving to
 * 0:00, it is *killing The Algorithm* before then. So the single `lost` split
 * in two — the two losses want distinct copy (`GameScene.endRun`):
 * - `won`    — the boss was defeated in time. The victory screen.
 * - `died`   — the player's HP reached zero. The ad break, as always.
 * - `timeout` — the clock reached 0:00 with the boss still alive. Its own
 *   ad-break copy: the run you nearly finished, the ad that never ends.
 */
export type RunOutcome = "won" | "died" | "timeout";

/**
 * The tally both end screens report (issue #25). A single object rather than
 * two arguments, because the win screen and the ad break show the same pair and
 * a positional `(kills, damage)` at two call sites is one transposition away
 * from a wrong summary that nothing would catch.
 */
export interface RunStats {
  readonly kills: number;
  readonly damage: number;
}

/**
 * The run's own state — the third of `main.gd`'s three jobs, extracted as a
 * plain Phaser-free class (issue #7).
 *
 * Slice 3 gives it its readouts. It still touches no UI: it announces whole
 * seconds and kill totals on the bus and the HUD scene draws them, because the
 * HUD is a different scene from the one this ticks in. `main.gd` writes both
 * straight into a `Label` from the same object that owns the number.
 */
export class Run {
  /**
   * 30 minutes — but never written here. It is the phase table's last close
   * (issue #29), so the clock and the pacing cannot disagree about when the run
   * ends, and stretching the run stays a one-file edit.
   */
  static readonly LENGTH = RUN_LENGTH;

  timeLeft = Run.LENGTH;
  kills = 0;
  /** Every point the player's weapons dealt, overkill included (issue #25). */
  damageDealt = 0;

  private outcome: RunOutcome | null = null;
  /** The last value `timeChanged` announced — `main.gd`'s `int(ceil(...))`. */
  private announcedSeconds = Run.LENGTH;

  constructor(private readonly bus: Pick<GameBus, "emit">) {}

  get isOver(): boolean {
    return this.outcome !== null;
  }

  /** `null` until the run ends; then why it ended. */
  get result(): RunOutcome | null {
    return this.outcome;
  }

  /** What the end screens report. */
  get stats(): RunStats {
    return { kills: this.kills, damage: this.damageDealt };
  }

  /** Whole seconds remaining, as the readout shows them. */
  get secondsLeft(): number {
    return Math.ceil(this.timeLeft);
  }

  /**
   * Seconds into the run — the only timeline in the game (issue #29).
   * `SpawnDirector` used to accumulate its own, which meant two clocks that
   * could drift and two places a playtest seek would have to reach.
   */
  get elapsed(): number {
    return Run.LENGTH - this.timeLeft;
  }

  tick(delta: number): void {
    if (this.isOver) return;
    this.timeLeft = Math.max(0, this.timeLeft - delta);
    // Announced before the ending, so the clock reads 0:00 behind the win
    // screen rather than 0:01 — `main.gd` updates the label then shows the win.
    if (this.secondsLeft !== this.announcedSeconds) {
      this.announcedSeconds = this.secondsLeft;
      this.bus.emit("timeChanged", this.announcedSeconds);
    }
    // The clock reaching zero is a *loss* now (issue #37): the boss outlasted
    // the player. A run already won by `defeatBoss` is `isOver`, so `end` no-ops
    // here and the win stands.
    if (this.timeLeft === 0) this.end("timeout");
  }

  /**
   * The win, now that winning is a specific act (issue #37): The Algorithm is
   * dead. `GameScene.onEnemyDied` calls this when the boss archetype falls, and
   * the run ends the instant it does — before the clock, and before any respawn
   * the boss's spawn track would otherwise allow.
   *
   * Idempotent through `end`: a boss killed on the same frame the clock expires
   * wins, because this or the timeout — whichever `end` runs first — latches.
   */
  defeatBoss(): void {
    this.end("won");
  }

  /**
   * Bank one weapon hit. `amount` is what the weapon dealt, not the HP removed
   * — see `Enemy.takeDamage`.
   *
   * Announced on every hit, which is thousands of times a run, unlike its
   * neighbours here. That is deliberate: this class stays a plain accumulator
   * with no notion of a refresh rate, and `HudScene` throttles its own redraw.
   * A throttle here would put a UI concern inside the run state and make these
   * tests care about wall-clock timing.
   */
  recordDamage(amount: number): void {
    if (this.isOver) return;
    this.damageDealt += amount;
    this.bus.emit("damageChanged", this.damageDealt);
  }

  recordKill(): void {
    if (this.isOver) return;
    this.kills += 1;
    this.bus.emit("killsChanged", this.kills);
  }

  /** Idempotent: `main.gd` guards every ending path on `_run_over` already. */
  end(outcome: RunOutcome): void {
    if (this.isOver) return;
    this.outcome = outcome;
    this.bus.emit("runEnded", outcome);
  }
}
