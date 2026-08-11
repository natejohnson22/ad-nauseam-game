/**
 * The User's on-screen body — a top-down pixel-art swordsman (issue #52).
 *
 * The real `Player` still owns movement, HP, and collision and goes invisible
 * (`Player.hideDefaultArt`); this sprite is pure follower art that mirrors the
 * player's position each frame, faces its move vector, and plays idle / run /
 * attack / hurt / death. It replaces the placeholder blue circle + facing pip,
 * which survives only behind a DEV-only `?sprite=circle` flag in `GameScene`
 * for debugging the logic centre.
 *
 * Three of the five states are event-driven off the real game rather than a
 * timer of the sprite's own: `weaponFired` plays the attack facing the cleave's
 * actual aim (so the swing and the pose can never drift), `playerHurt` plays a
 * flinch, and `playerDied` plays the collapse. The sprite hears only the bus,
 * so it stays decoupled from `WeaponManager` and `Player`.
 *
 * Asset: craftpix.net free top-down swordsman (lvl1). Each sheet is a 64x64
 * grid, 4 rows = 4 facings (row 0 down, 1 left, 2 right, 3 up), N columns of
 * animation.
 */
import Phaser from "phaser";
import type { WeaponData } from "../../content/types";
import type { GameBus } from "../../core/event-bus";
import { type Facing, facingXY } from "./facing";
import idleUrl from "./assets/idle.png";
import runUrl from "./assets/run.png";
import attackUrl from "./assets/attack.png";
import hurtUrl from "./assets/hurt.png";
import deathUrl from "./assets/death.png";

/** The weapon kinds `weaponFired` can carry — the avatar only poses for melee. */
type WeaponKind = WeaponData["kind"];

const IDLE = "player_idle";
const RUN = "player_run";
const ATTACK = "player_attack";
const HURT = "player_hurt";
const DEATH = "player_death";

/** Row index of each facing within every sheet (all share the layout). */
const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Columns per sheet — the frame count of that animation. */
const COLS = { idle: 12, run: 8, attack: 8, hurt: 5, death: 7 } as const;

/** Build every facing's clip once per scene. Frames are row-major, so a facing
 *  starts at `row * cols` and runs `cols` frames. */
function ensureAnims(scene: Phaser.Scene): void {
  const build = (
    sheet: string,
    cols: number,
    frameRate: number,
    repeat: number,
  ): void => {
    for (const [facing, row] of Object.entries(ROW)) {
      const key = `${sheet}_${facing}`;
      if (scene.anims.exists(key)) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(sheet, {
          start: row * cols,
          end: row * cols + cols - 1,
        }),
        frameRate,
        repeat,
      });
    }
  };
  build(IDLE, COLS.idle, 8, -1);
  build(RUN, COLS.run, 14, -1);
  build(ATTACK, COLS.attack, 20, 0); // one-shot
  build(HURT, COLS.hurt, 14, 0); // one-shot — a quick ~0.35s flinch
  build(DEATH, COLS.death, 12, 0); // one-shot — holds its last frame (the body)
}

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private facing: Facing = "down";
  /** True while the one-shot attack clip is playing; cleared on its completion,
   *  so movement drives the pose again the next frame. */
  private attacking = false;
  /** True while the one-shot hurt flinch plays — same deal as `attacking`. */
  private hurting = false;
  /** Latches on `playerDied`: the collapse plays once and holds its last frame,
   *  and nothing (move, attack, hurt) poses over it again for the run. */
  private dead = false;

  /** Kept so `destroy` can unsubscribe the exact handlers it registered. */
  private readonly onWeaponFired: (
    kind: WeaponKind,
    dirX: number,
    dirY: number,
  ) => void;
  private readonly onHurt: () => void;
  private readonly onDied: () => void;

  /** Load every sheet. Call from a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    const frame = { frameWidth: 64, frameHeight: 64 };
    scene.load.spritesheet(IDLE, idleUrl, frame);
    scene.load.spritesheet(RUN, runUrl, frame);
    scene.load.spritesheet(ATTACK, attackUrl, frame);
    scene.load.spritesheet(HURT, hurtUrl, frame);
    scene.load.spritesheet(DEATH, deathUrl, frame);
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly bus: GameBus,
  ) {
    ensureAnims(scene);
    super(scene, x, y, IDLE, ROW.down * COLS.idle);
    scene.add.existing(this);
    // Just above the player's own depth (0) so the body reads over the floor,
    // still below the sword cleave (depth 1).
    this.setDepth(0.05);
    // ~1.5x reads a touch taller than the 32px circle — a hero, not a token.
    // Origin nudged up so the torso, not the shadow, sits on the logic centre.
    this.setScale(1.5).setOrigin(0.5, 0.58);
    this.play(`${IDLE}_down`);

    // attack / hurt / death are the only non-looping clips; clear their state on
    // completion so movement drives the pose again — except death, which holds.
    this.on(
      Phaser.Animations.Events.ANIMATION_COMPLETE,
      (anim: Phaser.Animations.Animation) => {
        if (anim.key.startsWith(ATTACK)) this.attacking = false;
        else if (anim.key.startsWith(HURT)) this.hurting = false;
      },
    );

    // Face the swing and play the attack clip on every melee fire (issue #52).
    // Ranged weapons announce too (orbitals never fire discretely, so they
    // don't), but a sword-swing avatar only poses for the sword — the rest are
    // ignored here. Attack takes the sprite from a flinch but never from death.
    this.onWeaponFired = (kind, dirX, dirY): void => {
      if (this.dead || kind !== "melee") return;
      this.facing = facingXY(dirX, dirY);
      this.attacking = true;
      this.hurting = false;
      this.play(`${ATTACK}_${this.facing}`);
    };
    // A flinch on taking (non-lethal) damage — but never mid-swing, so the
    // player's own offense stays readable under constant contact damage.
    this.onHurt = (): void => {
      if (this.dead || this.attacking) return;
      this.hurting = true;
      this.play(`${HURT}_${this.facing}`);
    };
    // The collapse, in whatever direction the body last faced.
    this.onDied = (): void => {
      if (this.dead) return;
      this.dead = true;
      this.play(`${DEATH}_${this.facing}`);
    };

    bus.on("weaponFired", this.onWeaponFired);
    bus.on("playerHurt", this.onHurt);
    bus.on("playerDied", this.onDied);
  }

  /** Mirror the player and pick a pose. `move` is the frame's move vector. */
  tick(x: number, y: number, move: Phaser.Math.Vector2): void {
    this.setPosition(x, y);
    // Death holds; the one-shot attack/hurt clips own the sprite until they
    // complete. Only when nothing is claiming it does movement drive the pose.
    if (this.dead || this.attacking || this.hurting) return;

    const moving = move.length() > 0.1;
    if (moving) this.facing = facingXY(move.x, move.y);
    this.play(`${moving ? RUN : IDLE}_${this.facing}`, true);
  }

  override destroy(fromScene?: boolean): void {
    // The bus outlives nothing past the run, but drop the listeners explicitly
    // so a torn-down sprite never poses on a stray late emit.
    this.bus.off("weaponFired", this.onWeaponFired);
    this.bus.off("playerHurt", this.onHurt);
    this.bus.off("playerDied", this.onDied);
    super.destroy(fromScene);
  }
}
