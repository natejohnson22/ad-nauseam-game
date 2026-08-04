import { describe, expect, it } from "vitest";
import { Run } from "./run";

/**
 * `Run` ships its state in slice 2 and its UI in slice 3, so these assert the
 * two things slice 2 leans on: that `isOver` latches, and that everything
 * downstream of it stops.
 */

class FakeBus {
  readonly emitted: { event: string; args: unknown[] }[] = [];

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }
}

describe("Run", () => {
  it("starts at the full 5 minutes, unfinished", () => {
    const run = new Run(new FakeBus());
    expect(run.timeLeft).toBe(Run.LENGTH);
    expect(run.isOver).toBe(false);
    expect(run.result).toBeNull();
  });

  it("wins when the clock runs out, and clamps at zero", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.tick(Run.LENGTH - 1);
    expect(run.isOver).toBe(false);

    run.tick(5);
    expect(run.timeLeft).toBe(0);
    expect(run.result).toBe("won");
    expect(bus.emitted).toEqual([{ event: "runEnded", args: ["won"] }]);
  });

  it("stops the clock once the run is over", () => {
    const run = new Run(new FakeBus());
    run.end("lost");

    run.tick(10);
    expect(run.timeLeft).toBe(Run.LENGTH);
  });

  it("announces an ending exactly once", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.end("lost");
    run.end("won");
    expect(run.result).toBe("lost");
    expect(bus.emitted).toHaveLength(1);
  });

  it("counts kills until the run ends", () => {
    const run = new Run(new FakeBus());
    run.recordKill();
    run.recordKill();
    run.end("lost");
    run.recordKill();
    expect(run.kills).toBe(2);
  });
});
