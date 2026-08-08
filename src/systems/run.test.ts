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
  it("starts at the phase table's full length, unfinished", () => {
    const run = new Run(new FakeBus());
    expect(run.timeLeft).toBe(Run.LENGTH);
    expect(run.isOver).toBe(false);
    expect(run.result).toBeNull();
  });

  it("times out when the clock runs out with the boss alive, and clamps at zero", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.tick(Run.LENGTH - 1);
    expect(run.isOver).toBe(false);

    run.tick(5);
    expect(run.timeLeft).toBe(0);
    // Reaching 0:00 is no longer the win — killing the boss is (issue #37). The
    // clock expiring with the boss still alive is the timeout loss.
    expect(run.result).toBe("timeout");
    expect(bus.eventsNamed("runEnded")).toEqual([["timeout"]]);
  });

  it("wins the instant the boss is defeated, before the clock", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.tick(60);
    run.defeatBoss();
    expect(run.result).toBe("won");
    expect(bus.eventsNamed("runEnded")).toEqual([["won"]]);
  });

  it("does not time out a run already won by killing the boss", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.defeatBoss();
    run.tick(Run.LENGTH); // the clock runs all the way out afterwards
    expect(run.result).toBe("won");
    expect(bus.eventsNamed("runEnded")).toEqual([["won"]]);
  });

  it("stops the clock once the run is over", () => {
    const run = new Run(new FakeBus());
    run.end("died");

    run.tick(10);
    expect(run.timeLeft).toBe(Run.LENGTH);
  });

  it("announces an ending exactly once", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.end("died");
    run.defeatBoss();
    expect(run.result).toBe("died");
    expect(bus.eventsNamed("runEnded")).toEqual([["died"]]);
  });

  it("counts kills until the run ends", () => {
    const bus = new FakeBus();
    const run = new Run(bus);
    run.recordKill();
    run.recordKill();
    run.end("died");
    run.recordKill();
    expect(run.kills).toBe(2);
    expect(bus.eventsNamed("killsChanged")).toEqual([[1], [2]]);
  });

  it("totals damage until the run ends, announcing the running total", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    run.recordDamage(140);
    run.recordDamage(100);
    run.defeatBoss();
    run.recordDamage(500);

    expect(run.damageDealt).toBe(240);
    // The *total* each time, not the hit — the HUD draws it without adding up.
    expect(bus.eventsNamed("damageChanged")).toEqual([[140], [240]]);
  });

  it("counts overkill in full", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    // A maxed sword landing on a grunt with 180 HP left: `Enemy.takeDamage`
    // reports what the weapon dealt, and nothing here clamps it down to the HP
    // actually removed. The number the player saw and the number banked here
    // are the same number.
    run.recordDamage(500);
    expect(run.damageDealt).toBe(500);
  });

  it("hands both totals to the end screens together", () => {
    const run = new Run(new FakeBus());
    run.recordKill();
    run.recordDamage(140);
    expect(run.stats).toEqual({ kills: 1, damage: 140 });
  });

  it("announces the clock once per displayed second, not once per frame", () => {
    const bus = new FakeBus();
    const run = new Run(bus);

    // Six 100ms frames: 1800 -> 1799.4, so the readout ticks over exactly once.
    for (let i = 0; i < 6; i++) run.tick(0.1);
    expect(run.secondsLeft).toBe(Run.LENGTH);
    expect(bus.eventsNamed("timeChanged")).toEqual([]);

    for (let i = 0; i < 6; i++) run.tick(0.1);
    expect(run.secondsLeft).toBe(Run.LENGTH - 1);
    expect(bus.eventsNamed("timeChanged")).toEqual([[Run.LENGTH - 1]]);
  });

  it("reads 0:00 before it announces the ending", () => {
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
    run.end("died");

    run.tick(10);
    expect(bus.eventsNamed("timeChanged")).toEqual([]);
  });
});
