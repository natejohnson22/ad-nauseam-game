/**
 * PROTOTYPE — THROWAWAY. Not production code.
 *
 * Question this answers: does a real pixel-art swordsman read well as the
 * playable character, in place of the blue circle + facing pip? (Yes — this is
 * the chosen direction; a side-view minotaur was trialled and cut.)
 *
 * How to run it (one command, then one URL):
 *   pnpm dev  →  open the game with  ?sprite=swordsman  in the query string.
 * Without the flag the game is byte-for-byte the shipping circle.
 *
 * The attack is driven by the real sword — see `BaseAvatar`, which every
 * character variant shares. This module only adds the swordsman's own art: a
 * 64x64 grid, 4 rows = 4 facings (row 0 down, 1 left, 2 right, 3 up), N columns
 * of animation, the row→facing mapping eyeballed from a contact sheet.
 *
 * Asset: craftpix.net free top-down swordsman (lvl1).
 */
import Phaser from "phaser";
import type { Pool } from "../core/pool";
import type { SwordSwing } from "../entities/sword-swing";
import { BaseAvatar, type Facing, facingXY } from "./base-avatar";
import idleUrl from "./swordsman-assets/idle.png";
import runUrl from "./swordsman-assets/run.png";
import attackUrl from "./swordsman-assets/attack.png";

const IDLE = "proto_sword_idle";
const RUN = "proto_sword_run";
const ATTACK = "proto_sword_attack";

/** Row index of each facing within every sheet (all share the layout). */
const ROW: Record<Facing, number> = { down: 0, left: 1, right: 2, up: 3 };

/** Columns per sheet — the frame count of that animation. */
const COLS = { idle: 12, run: 8, attack: 8 } as const;

/** Load the three sheets. Call from a scene `preload`. */
export function preloadSwordsman(scene: Phaser.Scene): void {
  const frame = { frameWidth: 64, frameHeight: 64 };
  scene.load.spritesheet(IDLE, idleUrl, frame);
  scene.load.spritesheet(RUN, runUrl, frame);
  scene.load.spritesheet(ATTACK, attackUrl, frame);
}

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

const dirOf = (v: Phaser.Math.Vector2): Facing => facingXY(v.x, v.y);

/**
 * The top-down swordsman: true 4-directional art, so idle/run/attack each have a
 * dedicated down/left/right/up clip. Attack faces the way the cleave actually
 * swung (`BaseAvatar` observes the swing pool); movement faces the move vector.
 */
export class SwordsmanAvatar extends BaseAvatar {
  private facing: Facing = "down";

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    swings: Pool<SwordSwing>,
  ) {
    ensureAnims(scene);
    super(scene, x, y, IDLE, ROW.down * COLS.idle, swings);
    // ~1.5x reads a touch taller than the 32px circle — a hero, not a token.
    // Origin nudged up so the torso, not the shadow, sits on the logic centre.
    this.setScale(1.5).setOrigin(0.5, 0.58);
    this.play(`${IDLE}_down`);
  }

  protected override onAttack(swing: SwordSwing): void {
    this.facing = facingXY(Math.cos(swing.rotation), Math.sin(swing.rotation));
    this.play(`${ATTACK}_${this.facing}`);
  }

  protected override onMove(moving: boolean, move: Phaser.Math.Vector2): void {
    if (moving) this.facing = dirOf(move);
    this.play(`${moving ? RUN : IDLE}_${this.facing}`, true);
  }

  protected override get label(): string {
    return "swordsman";
  }

  protected override describe(moving: boolean): string {
    const state = this.attacking ? "attack" : moving ? "run" : "idle";
    return `facing: ${this.facing}\nstate:  ${state}`;
  }
}
