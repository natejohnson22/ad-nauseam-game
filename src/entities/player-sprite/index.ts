/**
 * The User's on-screen body — a top-down pixel-art swordsman (issue #52).
 *
 * The real `Player` still owns movement, HP, and collision and goes invisible
 * (`Player.hideDefaultArt`); this sprite is pure follower art that mirrors the
 * player's position each frame, faces its move vector, and plays idle / run /
 * attack. It replaces the placeholder blue circle + facing pip, which survives
 * only behind a DEV-only `?sprite=circle` flag in `GameScene` for debugging the
 * logic centre.
 *
 * The attack is driven by the *real* weapon rather than a timer: the scene
 * emits `weaponFired` with the cleave's aim on every melee swing (see
 * `WeaponManager`), and this sprite plays its attack clip facing that aim. So
 * the swing the player sees and the pose the avatar strikes can never drift —
 * and the sprite stays decoupled from `WeaponManager`, hearing only the bus.
 *
 * Asset: craftpix.net free top-down swordsman (lvl1). Each sheet is a 64x64
 * grid, 4 rows = 4 facings (row 0 down, 1 left, 2 right, 3 up), N columns of
 * animation. Only idle / run / attack are wired; death / hurt (issue #52) wait
 * on their sheets being added to `./assets`.
 */
import Phaser from "phaser";
import type { WeaponData } from "../../content/types";
import type { GameBus } from "../../core/event-bus";
import { type Facing, facingXY } from "./facing";
import idleUrl from "./assets/idle.png";
import runUrl from "./assets/run.png";
import attackUrl from "./assets/attack.png";

/** The weapon kinds `weaponFired` can carry — the avatar only poses for melee. */
type WeaponKind = WeaponData["kind"];

const IDLE = "player_idle";
const RUN = "player_run";
const ATTACK = "player_attack";

/** Row index of each facing within every sheet (all share the layout). */
const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Columns per sheet — the frame count of that animation. */
const COLS = { idle: 12, run: 8, attack: 8 } as const;

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
}

export class PlayerSprite extends Phaser.GameObjects.Sprite {
  private facing: Facing = "down";
  /** True while the one-shot attack clip is playing; cleared on its completion,
   *  so movement drives the pose again the next frame. */
  private attacking = false;
  /** Kept so `destroy` can unsubscribe the exact handler it registered. */
  private readonly onWeaponFired: (
    kind: WeaponKind,
    dirX: number,
    dirY: number,
  ) => void;

  /** Load the three sheets. Call from a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    const frame = { frameWidth: 64, frameHeight: 64 };
    scene.load.spritesheet(IDLE, idleUrl, frame);
    scene.load.spritesheet(RUN, runUrl, frame);
    scene.load.spritesheet(ATTACK, attackUrl, frame);
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

    // The attack clips are the only non-looping ones, so any completion is the
    // end of an attack — drop back to move/idle next frame.
    this.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.attacking = false;
    });

    // Face the swing and play the attack clip on every melee fire (issue #52).
    // Ranged weapons announce too (orbitals never fire discretely, so they
    // don't), but a sword-swing avatar only poses for the sword — the rest are
    // ignored here.
    this.onWeaponFired = (kind, dirX, dirY): void => {
      if (kind !== "melee") return;
      this.facing = facingXY(dirX, dirY);
      this.attacking = true;
      this.play(`${ATTACK}_${this.facing}`);
    };
    bus.on("weaponFired", this.onWeaponFired);
  }

  /** Mirror the player and pick a pose. `move` is the frame's move vector. */
  tick(x: number, y: number, move: Phaser.Math.Vector2): void {
    this.setPosition(x, y);
    // A one-shot attack owns the sprite until it completes; movement waits.
    if (this.attacking) return;

    const moving = move.length() > 0.1;
    if (moving) this.facing = facingXY(move.x, move.y);
    this.play(`${moving ? RUN : IDLE}_${this.facing}`, true);
  }

  override destroy(fromScene?: boolean): void {
    // The bus outlives nothing past the run, but drop the listener explicitly so
    // a torn-down sprite never poses on a stray late emit.
    this.bus.off("weaponFired", this.onWeaponFired);
    super.destroy(fromScene);
  }
}
