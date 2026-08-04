import Phaser from "phaser";
import { ENEMIES } from "../content/enemies";
import type { EnemyData } from "../content/types";
import type { Enemy, EnemyDeaths } from "../entities/enemy";
import type { Player } from "../entities/player";
import type { Pool } from "../core/pool";

/**
 * Time-driven escalation — the port of `spawn_director.gd`. Enemies arrive on a
 * ring around the player, so the ramp is aspect-ratio-agnostic and the camera
 * just frames a slice of it.
 *
 * `enemy_spawned` is gone: the director owns the pool it spawns into, so there
 * is no longer anyone to notify (issue #7). All `main.gd` ever did with that
 * signal was reach through it to hook `died`, and that half survives as the
 * `EnemyDeaths` sink stamped onto each spawn.
 */
export class SpawnDirector {
  private static readonly SPAWN_RADIUS = 640;
  private static readonly RUN_LENGTH = 300;
  /** No ogre before 1:30 — the first half of the run is grunts only. */
  private static readonly OGRE_START_TIME = 90;

  private time = 0;
  private gruntCd = 0;
  private ogreCd = SpawnDirector.OGRE_START_TIME;
  private running = false;

  constructor(
    private readonly enemies: Pool<Enemy>,
    private readonly player: Player,
    /**
     * Carried, not consumed: the director never hears about a death, but it is
     * the only thing that spawns enemies, so it is where the sink is stamped
     * onto each one. This is what is left of `enemy_spawned`.
     */
    private readonly deaths: EnemyDeaths,
  ) {}

  start(): void {
    this.running = true;
  }

  stop(): void {
    this.running = false;
  }

  tick(delta: number): void {
    if (!this.running) return;
    this.time += delta;

    this.gruntCd -= delta;
    if (this.gruntCd <= 0) {
      this.spawnGruntWave();
      this.gruntCd = this.gruntInterval();
    }

    // Ported exactly as Godot has it, including the part that surprises:
    // `_ogre_cd` is seeded to `OGRE_START_TIME` *and* only starts draining once
    // that time has passed, so the first ogre lands at 3:00 rather than at the
    // 1:30 `spawn_director.gd:5` advertises. Whether that is a Godot bug or the
    // pacing that shipped is a feel call, and feel calls belong to the tuning
    // pass — so it goes on that ticket's list rather than getting fixed here.
    if (this.time >= SpawnDirector.OGRE_START_TIME) {
      this.ogreCd -= delta;
      if (this.ogreCd <= 0) {
        this.spawn(ENEMIES.autoplay_ogre);
        this.ogreCd = this.ogreInterval();
      }
    }
  }

  /** 2.2s between waves at the start, tightening to 0.7s by the 5-minute mark. */
  private gruntInterval(): number {
    return Phaser.Math.Linear(
      2.2,
      0.7,
      Phaser.Math.Clamp(this.time / SpawnDirector.RUN_LENGTH, 0, 1),
    );
  }

  /** 3 grunts per wave early, ~9 late. */
  private gruntWaveSize(): number {
    return 3 + Math.floor(this.time / 45);
  }

  /** 11s between ogres at 1:30, tightening to 5s by the 5-minute mark. */
  private ogreInterval(): number {
    const m = Phaser.Math.Clamp(
      (this.time - SpawnDirector.OGRE_START_TIME) /
        (SpawnDirector.RUN_LENGTH - SpawnDirector.OGRE_START_TIME),
      0,
      1,
    );
    return Phaser.Math.Linear(11, 5, m);
  }

  private spawnGruntWave(): void {
    for (let i = 0; i < this.gruntWaveSize(); i++) {
      this.spawn(ENEMIES.popup_grunt);
    }
  }

  /** Somewhere on the ring around the player, at a uniform random angle. */
  private spawn(data: EnemyData): void {
    const angle = Math.random() * Math.PI * 2;
    this.enemies
      .obtain()
      .spawn(
        data,
        this.player.x + Math.cos(angle) * SpawnDirector.SPAWN_RADIUS,
        this.player.y + Math.sin(angle) * SpawnDirector.SPAWN_RADIUS,
        this.player,
        this.deaths,
      );
  }
}
