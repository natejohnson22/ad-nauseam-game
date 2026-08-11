/**
 * PROTOTYPE — THROWAWAY. Not production code.
 *
 * Question this answers: how does a chunky side-view brute read as the player,
 * next to the top-down swordsman? Run with `?sprite=minotaur` (vs
 * `?sprite=swordsman`) — see `avatars.ts`.
 *
 * The interesting contrast is baked into the art: this is a **single-direction**
 * "tiny style" character (it only ever faces the screen edge, not up/down), so
 * facing is a horizontal flip and vertical movement keeps the last flip. That is
 * the honest limitation to feel against the swordsman's four true facings.
 *
 * The attack is driven by the real sword — see `BaseAvatar`, shared by both
 * variants. This module only adds the minotaur's art.
 *
 * Asset: craftpix.net free "tiny style" minotaur (Minotaur_01). Source is
 * per-frame PNG sequences at 720x490; a build step (`scripts`-free, done once by
 * hand) cropped them to a shared box and packed downscaled 90x73 strips under
 * ./minotaur-assets so the character never jitters between states.
 */
import Phaser from "phaser";
import type { Pool } from "../core/pool";
import type { SwordSwing } from "../entities/sword-swing";
import { BaseAvatar } from "./base-avatar";
import idleUrl from "./minotaur-assets/idle.png";
import walkUrl from "./minotaur-assets/walk.png";
import attackUrl from "./minotaur-assets/attack.png";

const IDLE = "proto_mino_idle";
const WALK = "proto_mino_walk";
const ATTACK = "proto_mino_attack";

/** Frame counts of the packed strips (single row each). */
const COUNT = { idle: 12, walk: 18, attack: 12 } as const;
const FRAME = { frameWidth: 90, frameHeight: 73 };

/** The art is drawn facing right; flip for left. Vertical-only motion keeps the
    current flip — there is no up/down art to switch to. */
const FLIP_RIGHT = false;

export function preloadMinotaur(scene: Phaser.Scene): void {
  scene.load.spritesheet(IDLE, idleUrl, FRAME);
  scene.load.spritesheet(WALK, walkUrl, FRAME);
  scene.load.spritesheet(ATTACK, attackUrl, FRAME);
}

function ensureAnims(scene: Phaser.Scene): void {
  const build = (
    key: string,
    frames: number,
    frameRate: number,
    repeat: number,
  ): void => {
    if (scene.anims.exists(key)) return;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(key, {
        start: 0,
        end: frames - 1,
      }),
      frameRate,
      repeat,
    });
  };
  build(IDLE, COUNT.idle, 9, -1);
  build(WALK, COUNT.walk, 20, -1);
  build(ATTACK, COUNT.attack, 24, 0); // one-shot, finishes inside the 0.85s cd
}

export class MinotaurAvatar extends BaseAvatar {
  /** Last horizontal facing — flipX. Persists through vertical-only movement. */
  private faceLeft = false;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    swings: Pool<SwordSwing>,
  ) {
    ensureAnims(scene);
    super(scene, x, y, IDLE, 0, swings);
    // The brute reads bigger than the swordsman on purpose. Feet sit low in the
    // frame, so the origin drops below centre to plant them on the logic point.
    this.setScale(0.85).setOrigin(0.5, 0.62);
    this.play(IDLE);
  }

  /** Only a horizontal swing changes the flip; a mostly-vertical one keeps it. */
  private faceBy(x: number): void {
    if (Math.abs(x) > 0.001) this.faceLeft = x < 0;
    this.setFlipX(this.faceLeft !== FLIP_RIGHT);
  }

  protected override onAttack(swing: SwordSwing): void {
    this.faceBy(Math.cos(swing.rotation));
    this.play(ATTACK);
  }

  protected override onMove(moving: boolean, move: Phaser.Math.Vector2): void {
    if (moving) this.faceBy(move.x);
    this.play(moving ? WALK : IDLE, true);
  }

  protected override get label(): string {
    return "minotaur";
  }

  protected override describe(moving: boolean): string {
    const state = this.attacking ? "attack" : moving ? "walk" : "idle";
    return `facing: ${this.faceLeft ? "left" : "right"}\nstate:  ${state}`;
  }
}
