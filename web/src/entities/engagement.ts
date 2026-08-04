import { PooledSprite } from "../core/pool";
import { circleTexture } from "../core/textures";
import type Phaser from "phaser";
import type { Player } from "./player";

/** Told when a pickup lands. `GameScene` implements it. */
export interface EngagementCollector {
  onEngagementCollected(value: number): void;
}

/**
 * The XP pickup dropped by dead enemies — the port of `engagement.gd`.
 * "Engagement" is the game's satirical name for XP.
 *
 * Pooled like everything else, so `spawn` resets every field. Godot's `_done`
 * flag has no counterpart: `release()` deactivates the sprite and `Pool.each`
 * skips inactive ones, which is the same guard for free.
 */
export class Engagement extends PooledSprite {
  static readonly ATTRACT_RANGE = 95;
  static readonly COLLECT_RANGE = 18;
  static readonly ATTRACT_SPEED = 340;
  private static readonly RADIUS = 5;
  /** Godot's `Color(0.3, 1.0, 0.5)`, rounded to 8-bit channels. */
  private static readonly COLOR = 0x4dff80;

  private value = 0;
  private player!: Player;
  private collector!: EngagementCollector;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0, circleTexture(scene, Engagement.RADIUS));
    // Above the enemies. Godot's draw order here is an accident of spawn order
    // — the drop is added to World last and then buried by the next wave — so
    // it is not a number worth reproducing; a pickup you can see in a swarm is.
    this.setTint(Engagement.COLOR).setDepth(3);
  }

  spawn(
    value: number,
    x: number,
    y: number,
    player: Player,
    collector: EngagementCollector,
  ): void {
    this.value = value;
    this.player = player;
    this.collector = collector;
    this.setPosition(x, y);
  }

  tick(delta: number): void {
    const dx = this.player.x - this.x;
    const dy = this.player.y - this.y;
    const d = Math.hypot(dx, dy);

    if (d <= Engagement.COLLECT_RANGE) {
      const { value, collector } = this;
      // Released before reporting: collecting can open the level-up modal,
      // and a pickup still live at that moment would drift while paused.
      this.release();
      collector.onEngagementCollected(value);
      return;
    }

    if (d <= Engagement.ATTRACT_RANGE) {
      this.x += (dx / d) * Engagement.ATTRACT_SPEED * delta;
      this.y += (dy / d) * Engagement.ATTRACT_SPEED * delta;
    }
  }
}
