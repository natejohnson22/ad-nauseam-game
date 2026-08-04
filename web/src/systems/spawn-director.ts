import Phaser from "phaser";
import { ENEMIES } from "../content/enemies";
import type { Enemy } from "../entities/enemy";
import type { Player } from "../entities/player";
import type { Pool } from "../core/pool";

/**
 * Time-driven escalation — the port of `spawn_director.gd`. Enemies arrive on a
 * ring around the player, so the ramp is aspect-ratio-agnostic and the camera
 * just frames a slice of it.
 *
 * `enemy_spawned` is gone: the director owns the pool it spawns into, so there
 * is no longer anyone to notify (issue #7).
 *
 * Slice 5 adds the ogre ramp — `OGRE_START_TIME` at 90s and its own interval
 * lerp. Only the grunt trickle exists here.
 */
export class SpawnDirector {
  private static readonly SPAWN_RADIUS = 640;
  private static readonly RUN_LENGTH = 300;

  private time = 0;
  private gruntCd = 0;
  private running = false;

  constructor(
    private readonly enemies: Pool<Enemy>,
    private readonly player: Player,
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

  private spawnGruntWave(): void {
    for (let i = 0; i < this.gruntWaveSize(); i++) {
      const angle = Math.random() * Math.PI * 2;
      this.enemies
        .obtain()
        .spawn(
          ENEMIES.popup_grunt,
          this.player.x + Math.cos(angle) * SpawnDirector.SPAWN_RADIUS,
          this.player.y + Math.sin(angle) * SpawnDirector.SPAWN_RADIUS,
          this.player,
        );
    }
  }
}
