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
  /** `player.gd`'s 100, x10 with the rest of the HP/damage family — see the
      note in `content/weapons.ts` (issue #25). Enemy contact damage scaled with
      it, so the number of touches that kill you is unchanged. */
  static readonly MAX_HP = 1000;
  static readonly BASE_SPEED = 220;
  static readonly RADIUS = 16;
  private static readonly PIP_RADIUS = 4;
  private static readonly COLOR = 0x40ccff;

  hp = Player.MAX_HP;
  /** Mutated by the move-speed upgrade in slice 2. */
  speedMult = 1;
  /**
   * Damage is ignored while this is set.
   *
   * Set today only by the playtest harness (issue #30), which needs a phase's
   * spawn pressure to be *watchable* — the Panic phase cannot be judged from
   * the ad break. It is a plain field rather than a debug branch because it is
   * not only a debug idea: i-frames are on the list of survivability upgrades
   * the pool ticket has to design, and that is this same flag on a timer.
   */
  invulnerable = false;

  private alive = true;
  /**
   * This frame's slow field, as a multiplier — the Cookie Banner's aura
   * (issue #31). Rebuilt every frame from scratch: enemies push into it during
   * their own tick and `tick` consumes and clears it, so walking out of a field
   * restores full speed on the next frame with nothing to un-apply. It is
   * separate from `speedMult` for exactly that reason — `speedMult` is the
   * upgrade, permanent and owned by `Progression`, and a transient effect that
   * multiplied into it would leak a permanent nerf the first time an enemy died
   * mid-field.
   *
   * `min` rather than a product: standing in three overlapping fields is as
   * slow as the worst of them, not 0.17x. Overlap is common — banners cluster —
   * and stacking multiplicatively is how the player ends up unable to move at
   * all, which is the death sentence this whole mechanic was chosen to avoid.
   */
  private slowMult = 1;
  /** Seconds of Paywall lockout left — see `silence`. */
  private silenceLeft = 0;
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

  /**
   * Slow the player for this frame — called by `chase_aura` enemies from their
   * own tick, which runs *after* this one in `GameScene.update`. So the field
   * a player is standing in takes effect one frame late, which at 60fps is 4px
   * of travel and not worth reordering the update loop over.
   */
  applySlow(mult: number): void {
    this.slowMult = Math.min(this.slowMult, mult);
  }

  /**
   * Take the player's weapons away for `seconds` — the Paywall's lockout.
   *
   * Ignored while invulnerable, so the playtest harness's `i` really does mean
   * "nothing the enemies do lands on me" rather than "no damage, but still
   * disarmed" (issue #30).
   */
  silence(seconds: number): void {
    if (!this.alive || this.invulnerable) return;
    this.silenceLeft = Math.max(this.silenceLeft, seconds);
  }

  /** Read by `WeaponManager`, which holds fire while it is true. */
  get silenced(): boolean {
    return this.silenceLeft > 0;
  }

  tick(delta: number): void {
    if (!this.alive) return;

    this.silenceLeft = Math.max(0, this.silenceLeft - delta);

    const dir = this.controls.getMoveVector();
    const speed = Player.BASE_SPEED * this.speedMult * this.slowMult;
    // Consumed: this frame's fields have been spent, and the enemies still
    // standing on us will push their own in again before the next one.
    this.slowMult = 1;
    this.x += dir.x * speed * delta;
    this.y += dir.y * speed * delta;

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
    if (!this.alive || this.invulnerable) return;
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
