/**
 * PROTOTYPE — THROWAWAY. The one door the game opens onto the character
 * experiments, so `game-scene.ts` names this file and nothing deeper.
 *
 * Pick a character with `?sprite=<kind>` (DEV only): `swordsman` (top-down, four
 * facings) or `minotaur` (side-view, flip-only). Any other value — or none —
 * leaves the shipping circle untouched. Adding a third contender is one case in
 * each switch below plus its own `*-avatar.ts`.
 */
import type Phaser from "phaser";
import type { Pool } from "../core/pool";
import type { SwordSwing } from "../entities/sword-swing";
import type { BaseAvatar } from "./base-avatar";
import { MinotaurAvatar, preloadMinotaur } from "./minotaur-avatar";
import { SwordsmanAvatar, preloadSwordsman } from "./swordsman-avatar";

export type AvatarKind = "swordsman" | "minotaur";

/** The selected character, or `null` in production / when the flag is absent. */
export function avatarKind(): AvatarKind | null {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get("sprite");
  return v === "swordsman" || v === "minotaur" ? v : null;
}

/** Load the selected character's art. Call from a scene `preload`. */
export function preloadAvatar(scene: Phaser.Scene): void {
  switch (avatarKind()) {
    case "swordsman":
      preloadSwordsman(scene);
      break;
    case "minotaur":
      preloadMinotaur(scene);
      break;
    case null:
      break;
  }
}

/** Build the selected avatar, or `undefined` to keep the circle. */
export function createAvatar(
  scene: Phaser.Scene,
  x: number,
  y: number,
  swings: Pool<SwordSwing>,
): BaseAvatar | undefined {
  switch (avatarKind()) {
    case "swordsman":
      return new SwordsmanAvatar(scene, x, y, swings);
    case "minotaur":
      return new MinotaurAvatar(scene, x, y, swings);
    case null:
      return undefined;
  }
}
