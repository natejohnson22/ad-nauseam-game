/**
 * The ad-side **procedural UI-construct** render path (map #80) — the family of
 * glowing browser-chrome enemies assembled from the shared kit (`kit.ts`). This
 * is the fourth `Enemy` render path, alongside the tinted circle, the
 * spritesheet art, and The Algorithm's boss rig (#71).
 *
 * Keyed by `displayName` so `content/` stays free of render concerns — exactly
 * like `getEnemyArt` and `isAlgorithm`. Issue #81 ships the first member (the
 * Popup Grunt); tickets #82–#86 add the rest, each a new controller assembled
 * from the same kit.
 */
import Phaser from "phaser";
import { CookieBannerVfx } from "./cookie-banner";
import type { UiConstruct } from "./kit";
import { PaywallVfx } from "./paywall";
import { PopupGruntVfx } from "./popup-grunt";
import { TrackingPixelVfx } from "./tracking-pixel";

export type { UiConstruct } from "./kit";
export { UI } from "./kit";

/** Which archetypes render as a UI construct, and the controller each uses. */
const CONSTRUCTS: Record<string, (scene: Phaser.Scene) => UiConstruct> = {
  "Popup Grunt": (scene) => new PopupGruntVfx(scene),
  "Cookie Banner": (scene) => new CookieBannerVfx(scene),
  "Tracking Pixel": (scene) => new TrackingPixelVfx(scene),
  Paywall: (scene) => new PaywallVfx(scene),
};

/** True when this archetype's body is a procedural UI construct rather than a
 *  spritesheet or tinted circle. */
export const isUiConstruct = (displayName: string): boolean =>
  displayName in CONSTRUCTS;

/** Build the controller for a UI-construct archetype. Caller must have checked
 *  `isUiConstruct` first. */
export function createUiConstruct(
  scene: Phaser.Scene,
  displayName: string,
): UiConstruct {
  const make = CONSTRUCTS[displayName];
  if (make === undefined) {
    throw new Error(`No UI construct registered for "${displayName}"`);
  }
  return make(scene);
}
