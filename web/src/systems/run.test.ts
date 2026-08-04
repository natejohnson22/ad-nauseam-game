import { describe, expect, it } from "vitest";
import { Run } from "./run";

/**
 * Slice 2 asserted the state: that `isOver` latches and everything downstream
 * of it stops. Slice 3 adds the announcements the HUD is drawn from — which is
 * the whole of `Run`'s UI contract, since it lives in a different scene from
 * the readouts and can only reach them through the bus.
 */

class FakeBus {
  readonly emitted: { event: string; args: unknown[] }[] = [];

  emit(event: string, ...args: unknown[]): void {
    this.emitted.push({ event, args });
  }

  eventsNamed(event: string): unknown[][] {
    return this.emitted.filter((e) => e.event === event).map((e) => e.args);
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
    expect(bus.eventsNamed("runEnded")).toEqual([["won"]]);
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
    expect(bus.eventsNamed("runEnded")).toEqual([["lost"]]);
  });

  it("counts kills until the run ends", () => {
    const bus = new FakeBus();
    const run = new Run(bus);
    run.recordKill();
    run.recordKill();
    run.end("lost");
    run.recordKill();
    expect(run.kills).toBe(2);
    expect(bus.eventsNamed("killsChanged")).toEqual([[1], [2]]);
  });

  it("announces the clock once per displayed second, not once per frame", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    // Six 100ms frames: 300 -> 299.4, so the readout goes 5:00 -> 4:59 once.
    for (let i = 0; i < 6; i++) run.tick(0.1);
    expect(run.secondsLeft).toBe(300);
    expect(bus.eventsNamed("timeChanged")).toEqual([]);

    for (let i = 0; i < 6; i++) run.tick(0.1);
    expect(run.secondsLeft).toBe(299);
    expect(bus.eventsNamed("timeChanged")).toEqual([[299]]);
  });

  it("reads 0:00 before it announces the win", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.tick(Run.LENGTH);
    expect(run.secondsLeft).toBe(0);
    expect(bus.emitted.map((e) => e.event)).toEqual(["timeChanged", "runEnded"]);
    expect(bus.eventsNamed("timeChanged").at(-1)).toEqual([0]);
  });

  it("says nothing about the clock once the run is over", () => {
    const bus = new FakeBus();
    const run = new Run(bus);
    run.end("lost");

    run.tick(10);
    expect(bus.eventsNamed("timeChanged")).toEqual([]);
  });
});
