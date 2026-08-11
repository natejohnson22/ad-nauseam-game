/**
 * PROTOTYPE — THROWAWAY. The one door the game opens onto the character
 * experiment, so `game-scene.ts` names this file and nothing deeper.
 *
 * `?sprite=swordsman` (DEV only) swaps the shipping circle for the top-down
 * swordsman; any other value — or none — leaves the circle untouched. A minotaur
 * variant was trialled here too and cut (see the branch history / issue); the
 * façade shape is kept so a future contender is one case below plus its own
 * `*-avatar.ts`.
 */
import type Phaser from "phaser";
import type { Pool } from "../core/pool";
import type { SwordSwing } from "../entities/sword-swing";
import type { BaseAvatar } from "./base-avatar";
import { SwordsmanAvatar, preloadSwordsman } from "./swordsman-avatar";

export type AvatarKind = "swordsman";

/** The selected character, or `null` in production / when the flag is absent. */
export function avatarKind(): AvatarKind | null {
  if (!import.meta.env.DEV) return null;
  return new URLSearchParams(location.search).get("sprite") === "swordsman"
    ? "swordsman"
    : null;
}

/** Load the selected character's art. Call from a scene `preload`. */
export function preloadAvatar(scene: Phaser.Scene): void {
  if (avatarKind() === "swordsman") preloadSwordsman(scene);
}

/** Build the selected avatar, or `undefined` to keep the circle. */
export function createAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  swings: Pool<SwordSwing>,
): BaseAvatar | undefined {
  if (avatarKind() === "swordsman") {
    return new SwordsmanAvatar(scene, x, y, swings);
  }
  return undefined;
}
