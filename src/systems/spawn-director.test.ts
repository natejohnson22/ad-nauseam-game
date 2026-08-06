import { describe, expect, it } from "vitest";
import { ENEMIES } from "../content/enemies";
import { PHASES } from "../content/phases";
import type { EnemyData } from "../content/types";
import { SpawnDirector, type SpawnSink } from "./spawn-director";

/**
 * The director became testable the same way `Progression` did (issue #29): its
 * collaborators narrowed from `Pool<Enemy>` and `Player` to two plain
 * interfaces, so a test hands it objects rather than dragging a canvas in.
 *
 * What is worth asserting is the *timing* — which enemy, on which tick — and
 * above all the phase boundary, where a track carrying its cooldown and a track
 * seeding to zero sit one line apart and look alike.
 */
class FakeSink implements SpawnSink {
  readonly spawned: { name: string; x: number; y: number }[] = [];

  spawn(data: EnemyData, x: number, y: number): void {
    this.spawned.push({ name: data.displayName, x, y });
  }

  /** How many of `name` have landed so far. */
  count(name: string): number {
    return this.spawned.filter((s) => s.name === name).length;
  }

  clear(): void {
    this.spawned.length = 0;
  }
}

const GRUNT = "Popup Grunt";
const OGRE = "Autoplay Video Ogre";

/** A director at the origin, spawning north — placement is not what is tested. */
function director(sink: SpawnSink): SpawnDirector {
  return new SpawnDirector(sink, { x: 0, y: 0 }, () => 0);
}

/** Tick `seconds` of run in 1/60s steps, starting from `from`. */
function play(d: SpawnDirector, from: number, seconds: number): void {
  const step = 1 / 60;
  for (let t = from; t < from + seconds; t += step) d.tick(step, t);
}

describe("SpawnDirector", () => {
  it("spawns nothing until started", () => {
    const sink = new FakeSink();
    const d = director(sink);

    play(d, 0, 10);
    expect(sink.spawned).toHaveLength(0);
  });

  it("opens the run with a wave, rather than waiting one interval", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    d.tick(1 / 60, 0);
    expect(sink.count(GRUNT)).toBe(3);
  });

  it("stops on demand — a queued wave must not survive the ending", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();
    play(d, 0, 10);
    d.stop();
    sink.clear();

    play(d, 10, 60);
    expect(sink.spawned).toHaveLength(0);
  });

  it("spawns only the enemies in the current phase's roster", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    // Quick Start has one track. The ogre does not arrive until Struggle.
    play(d, 0, 120);
    expect(sink.count(GRUNT)).toBeGreaterThan(0);
    expect(sink.count(OGRE)).toBe(0);
  });

  it("tightens the interval across a phase, as its ramp says", () => {
    const early = new FakeSink();
    const late = new FakeSink();
    const a = director(early);
    const b = director(late);
    a.start();
    b.start();

    // Same 60 seconds of run, at opposite ends of God-Tier: 0.95s between
    // waves at the open, 0.70s at the close.
    play(a, 1500, 60);
    play(b, 1740, 60);
    expect(late.count(GRUNT)).toBeGreaterThan(early.count(GRUNT));
  });

  it("grows the wave across a phase, as its ramp says", () => {
    // Struggle runs 5 -> 6 grunts per wave. Two directors rather than one:
    // a single one would still be counting down its first interval.
    const open = new FakeSink();
    const close = new FakeSink();
    const a = director(open);
    const b = director(close);
    a.start();
    b.start();

    a.tick(1 / 60, 600);
    b.tick(1 / 60, 899);
    expect(open.count(GRUNT)).toBe(5);
    expect(close.count(GRUNT)).toBe(6);
  });

  it("announces a newly-arriving track the moment its phase opens", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    // Ticked through Confidence, where there is no ogre track, then one tick
    // into Struggle, where there is.
    play(d, 590, 10);
    expect(sink.count(OGRE)).toBe(0);

    d.tick(1 / 60, 600);
    expect(sink.count(OGRE)).toBe(1);
  });

  it("carries a continuing track's cooldown over the boundary", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    // The grunt track spans Panic and Pro Struggle. Land on the boundary with
    // a cooldown mid-flight: the turnover must not re-fire it.
    play(d, 1199, 1);
    const before = sink.count(GRUNT);

    d.tick(1 / 60, 1200);
    expect(sink.count(GRUNT)).toBe(before);
  });

  it("keeps spawning past the end of the table", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    play(d, 1800, 5);
    expect(sink.count(GRUNT)).toBeGreaterThan(0);
  });

  it("reports the rates it is actually spawning at", () => {
    // The playtest readout (issue #30) is only worth having if it agrees with
    // the spawner, so this asserts against the table rather than a snapshot.
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    // The open of Struggle: both tracks present, both at their `from` values.
    d.tick(1 / 60, 600);
    const view = d.readout(600);
    expect(view.running).toBe(true);
    expect(view.phase.id).toBe("struggle");
    expect(view.progress).toBeCloseTo(0);
    expect(view.tracks.map((t) => t.enemy)).toEqual([
      "popup_grunt",
      "autoplay_ogre",
    ]);

    const grunt = view.tracks[0]!;
    expect(grunt.displayName).toBe(GRUNT);
    expect(grunt.wave).toBe(sink.count(GRUNT));
    expect(grunt.interval).toBeCloseTo(1.7);
    // Fired on that tick, so the cooldown it reports is a full interval.
    expect(grunt.nextIn).toBeCloseTo(1.7);
  });

  it("reports the ramp's far end at the close of a phase", () => {
    const d = director(new FakeSink());
    d.start();

    const grunt = d.readout(899.99).tracks[0]!;
    expect(grunt.interval).toBeCloseTo(1.45, 1);
    expect(grunt.wave).toBe(6);
  });

  it("places spawns on the ring around its origin", () => {
    const sink = new FakeSink();
    // `random` pinned to 0.25 -> a quarter turn: straight up from the origin.
    const d = new SpawnDirector(sink, { x: 100, y: -50 }, () => 0.25);
    d.start();

    d.tick(1 / 60, 0);
    const first = sink.spawned[0]!;
    expect(Math.hypot(first.x - 100, first.y - -50)).toBeCloseTo(
      SpawnDirector.SPAWN_RADIUS,
    );
  });

  it("spawns exactly each phase's roster, no more and no less", () => {
    const sink = new FakeSink();
    const d = director(sink);
    d.start();

    for (const phase of PHASES) {
      sink.clear();
      // 30s clears the longest interval in the table (11s) several times over.
      play(d, phase.start, 30);
      const seen = new Set(sink.spawned.map((s) => s.name));
      const roster = new Set(
        phase.tracks.map((t) => ENEMIES[t.enemy].displayName),
      );
      expect(seen).toEqual(roster);
    }
  });
});
