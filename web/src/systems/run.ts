import type { GameBus } from "../core/event-bus";

/** Why the run stopped. Slice 3 is what turns each into a screen. */
export type RunOutcome = "won" | "lost";

/**
 * The run's own state — the third of `main.gd`'s three jobs, extracted as a
 * plain Phaser-free class (issue #7).
 *
 * Slice 2 ships the state and none of its UI: the timer runs and the run ends,
 * but the clock, the kill counter, and the two end screens are slice 3. What
 * slice 2 actually needs from it is `isOver`, which `main.gd` spells `_run_over`
 * and consults before banking engagement or opening a level-up modal.
 */
export class Run {
  /** 5 minutes, from `main.gd`'s `RUN_LENGTH`. */
  static readonly LENGTH = 300;

  timeLeft = Run.LENGTH;
  kills = 0;

  private outcome: RunOutcome | null = null;

  constructor(private readonly bus: Pick<GameBus, "emit">) {}

  get isOver(): boolean {
    return this.outcome !== null;
  }

  /** `null` until the run ends; then why it ended. */
  get result(): RunOutcome | null {
    return this.outcome;
  }

  tick(delta: number): void {
    if (this.isOver) return;
    this.timeLeft = Math.max(0, this.timeLeft - delta);
    if (this.timeLeft === 0) this.end("won");
  }

  recordKill(): void {
    if (this.isOver) return;
    this.kills += 1;
  }

  /** Idempotent: `main.gd` guards every ending path on `_run_over` already. */
  end(outcome: RunOutcome): void {
    if (this.isOver) return;
    this.outcome = outcome;
    this.bus.emit("runEnded", outcome);
  }
}
