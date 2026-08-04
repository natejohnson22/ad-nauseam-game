import Phaser from "phaser";
import type { Controls } from "../core/controls";
import type { GameBus } from "../core/event-bus";
import { circleTexture } from "../core/textures";

/**
 * The User — the port of `player.gd`. Reads only the unified move vector, so it
 * is identical across keyboard, gamepad, and touch. Placeholder art is a circle
 * with a small facing pip, which is why there are two sprites here rather than
 * one: Phaser sprites have no child transforms to hang the pip off.
 *
 * Unpooled — there is exactly one, and it lives as long as the run.
 */
export class Player extends Phaser.GameObjects.Sprite {
  static readonly MAX_HP = 100;
  static readonly BASE_SPEED = 220;
  static readonly RADIUS = 16;
  private static readonly PIP_RADIUS = 4;
  private static readonly COLOR = 0x40ccff;

  hp = Player.MAX_HP;
  /** Mutated by the move-speed upgrade in slice 2. */
  speedMult = 1;

  private alive = true;
  private readonly pip: Phaser.GameObjects.Sprite;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly controls: Controls,
    private readonly bus: GameBus,
  ) {
    super(scene, x, y, circleTexture(scene, Player.RADIUS));
    scene.add.existing(this);
    this.setTint(Player.COLOR).setDepth(0);

    this.pip = scene.add
      .sprite(x, y, circleTexture(scene, Player.PIP_RADIUS))
      .setDepth(0.1)
      .setVisible(false);

    this.bus.emit("healthChanged", this.hp, Player.MAX_HP);
  }

  get radius(): number {
    return Player.RADIUS;
  }

  get isAlive(): boolean {
    return this.alive;
  }

  tick(delta: number): void {
    if (!this.alive) return;

    const dir = this.controls.getMoveVector();
    this.x += dir.x * Player.BASE_SPEED * this.speedMult * delta;
    this.y += dir.y * Player.BASE_SPEED * this.speedMult * delta;

    // The facing pip, drawn toward current movement for readability.
    const moving = dir.length() > 0.1;
    this.pip.setVisible(moving);
    if (moving) {
      const reach = Player.RADIUS - 5;
      this.pip.setPosition(
        this.x + (dir.x / dir.length()) * reach,
        this.y + (dir.y / dir.length()) * reach,
      );
    }
  }

  takeDamage(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.max(0, this.hp - amount);
    this.bus.emit("healthChanged", this.hp, Player.MAX_HP);
    if (this.hp <= 0) {
      this.alive = false;
      this.pip.setVisible(false);
      this.bus.emit("playerDied");
    }
  }

  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(Player.MAX_HP, this.hp + amount);
    this.bus.emit("healthChanged", this.hp, Player.MAX_HP);
  }
}
