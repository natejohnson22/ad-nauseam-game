import { ENEMIES, type EnemyId } from "../content/enemies";
import { phaseAt, progressIn } from "../content/phases";
import type { EnemyData, Phase, Ramp, SpawnTrack } from "../content/types";

/** One track's current rate, as the readout shows it (issue #30). */
export interface TrackReadout {
  readonly enemy: EnemyId;
  readonly displayName: string;
  /** Seconds between waves, at this instant on the ramp. */
  readonly interval: number;
  /** Enemies per wave, rounded as `spawnWave` rounds it. */
  readonly wave: number;
  /** Seconds until this track fires again. */
  readonly nextIn: number;
  /** How many of this archetype are alive right now. */
  readonly live: number;
  /** The track's concurrency cap, or `null` where it has none. */
  readonly max: number | null;
}

/** What the director currently thinks it is doing — see `SpawnDirector.readout`. */
export interface DirectorReadout {
  readonly running: boolean;
  readonly phase: Phase;
  /** Where the run sits inside the phase, 0..1 — what every ramp lerps on. */
  readonly progress: number;
  readonly tracks: readonly TrackReadout[];
}

/**
 * Where a spawned enemy goes. The scene owns the pool, the player, and the
 * damage sink, and satisfies this with one closure at the composition root —
 * so the director never sees a `Pool<Enemy>` and this file imports no Phaser
 * (issue #29). Same trade `Progression` already makes with `SpeedTarget` and
 * `UpgradeTarget`: a narrow interface is both the test seam and the honest
 * statement of what the system may touch.
 */
export interface SpawnSink {
  spawn(data: EnemyData, x: number, y: number): void;
  /**
   * How many of this archetype are alive — what `SpawnTrack.max` is checked
   * against (issue #31), and the one thing the director needs to know about the
   * world it has already made.
   *
   * Counting is the sink's job because the pool is the sink's to hold; the
   * director tracking its own spawns would have to be told about every death,
   * and a director that can be wrong about what is on screen is worse than no
   * cap at all.
   */
  liveCount(data: EnemyData): number;
}

/** What the spawn ring is drawn around. `Player` satisfies it. */
export interface SpawnOrigin {
  readonly x: number;
  readonly y: number;
}

/**
 * Time-driven escalation — the port of `spawn_director.gd`, rebuilt in issue
 * #29 to read the phase table instead of its own constants.
 *
 * What it used to be: two cooldowns lerped against a `RUN_LENGTH = 300`, with
 * the ogre gated by a lone `OGRE_START_TIME` and wave size on a
 * `3 + floor(time / 45)` that had no ceiling. What it is now: a loop over the
 * current phase's tracks. Every number it uses lives in `phases.ts`, which is
 * the point — the seven tuning passes ahead of us edit a table, not this file.
 *
 * It also no longer keeps a clock. `tick` is handed the run's elapsed seconds,
 * so there is exactly one timeline in the game and starting a run part-way
 * through is `Run`'s problem alone.
 */
export class SpawnDirector {
  static readonly SPAWN_RADIUS = 640;

  private running = false;
  /**
   * Seconds until each track's next wave, keyed by enemy rather than by track,
   * because a track is a per-phase object and this has to survive the turnover.
   * A key **absent** here is a track that has not fired yet and therefore fires
   * on sight — which is what makes an arriving archetype announce itself at the
   * top of its phase. Same rule the earlier tuning pass applied to the ogre,
   * seeding `_ogre_cd` to zero so the first one lands at 1:30 rather than
   * Godot's accidental 3:00.
   */
  private readonly cooldowns = new Map<EnemyId, number>();

  constructor(
    private readonly sink: SpawnSink,
    private readonly origin: SpawnOrigin,
    /** Injected so placement is deterministic under test — as `Progression`. */
    private readonly random: () => number = Math.random,
  ) {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  /** `elapsed` is seconds into the run — see `Run.elapsed`. */
  tick(delta: number, elapsed: number): void {
    if (!this.running) return;

    const phase = phaseAt(elapsed);
    const t = progressIn(phase, elapsed);

    // A track that has left the roster forgets its cooldown, so an enemy that
    // returns in a later phase announces itself again rather than resuming
    // mid-count from whenever it was last seen.
    for (const enemy of this.cooldowns.keys())
      if (!phase.tracks.some((track) => track.enemy === enemy))
        this.cooldowns.delete(enemy);

    for (const track of phase.tracks) {
      const remaining = (this.cooldowns.get(track.enemy) ?? 0) - delta;
      if (remaining > 0) {
        this.cooldowns.set(track.enemy, remaining);
        continue;
      }
      this.spawnWave(track, t);
      this.cooldowns.set(track.enemy, lerp(track.interval, t));
    }
  }

  /**
   * The current rates, for the playtest harness's readout (issue #30).
   *
   * A method here rather than arithmetic in the harness: the readout's whole
   * job is to be believed while a phase is being tuned, and a second copy of
   * the phase lookup and the lerp would eventually disagree with the one that
   * actually spawns things. This reads exactly what `tick` reads.
   *
   * `elapsed` is passed in for the same reason `tick` takes it — there is one
   * clock in the game and it is not this object's.
   */
  readout(elapsed: number): DirectorReadout {
    const phase = phaseAt(elapsed);
    const t = progressIn(phase, elapsed);
    return {
      running: this.running,
      phase,
      progress: t,
      tracks: phase.tracks.map((track) => ({
        enemy: track.enemy,
        displayName: ENEMIES[track.enemy].displayName,
        interval: lerp(track.interval, t),
        wave: Math.round(lerp(track.wave, t)),
        nextIn: Math.max(0, this.cooldowns.get(track.enemy) ?? 0),
        live: this.sink.liveCount(ENEMIES[track.enemy]),
        max: track.max ?? null,
      })),
    };
  }

  /**
   * One wave, trimmed to whatever room the track's `max` leaves (issue #31).
   *
   * A full track still resets its cooldown and simply spawns nothing, so it
   * re-checks every interval — which is what makes a mini-boss respawn *some
   * time after* the last one dies rather than the instant the slot frees. A
   * partial trim is deliberate too: a wave of 3 against 1 slot left lands one
   * enemy, because the cap is a statement about how many may be on screen, not
   * about wave sizes.
   */
  private spawnWave(track: SpawnTrack, t: number): void {
    const data = ENEMIES[track.enemy];
    let count = Math.round(lerp(track.wave, t));
    if (track.max !== undefined)
      count = Math.min(count, track.max - this.sink.liveCount(data));
    for (let i = 0; i < count; i++) this.spawn(data);
  }

  /** Somewhere on the ring around the origin, at a uniform random angle. */
  private spawn(data: EnemyData): void {
    const angle = this.random() * Math.PI * 2;
    this.sink.spawn(
      data,
      this.origin.x + Math.cos(angle) * SpawnDirector.SPAWN_RADIUS,
      this.origin.y + Math.sin(angle) * SpawnDirector.SPAWN_RADIUS,
    );
  }
}

/** `Phaser.Math.Linear`, inlined to keep this file Phaser-free. */
function lerp([from, to]: Ramp, t: number): number {
  return from + (to - from) * t;
}
