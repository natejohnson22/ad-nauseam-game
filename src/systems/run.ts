import { RUN_LENGTH } from "../content/phases";
import type { GameBus } from "../core/event-bus";

/** Why the run stopped. Slice 3 is what turns each into a screen. */
export type RunOutcome = "won" | "lost";

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
    if (this.timeLeft === 0) this.end("won");
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
