import type { GameBus } from "../core/event-bus";

/** Why the run stopped. Slice 3 is what turns each into a screen. */
export type RunOutcome = "won" | "lost";

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
  /** 5 minutes, from `main.gd`'s `RUN_LENGTH`. */
  static readonly LENGTH = 300;

  timeLeft = Run.LENGTH;
  kills = 0;

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

  /** Whole seconds remaining, as the readout shows them. */
  get secondsLeft(): number {
    return Math.ceil(this.timeLeft);
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
