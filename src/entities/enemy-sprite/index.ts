/**
 * Real animated art for the enemy roster — the #60 art path applied to the
 * pooled `Enemy` (issue #67, map #55).
 *
 * Unlike the player, an enemy is **not** a follower sprite: `Enemy` already *is*
 * a `Sprite`, and there are dozens of them pooled, so the art lives on the enemy
 * itself. This module is just the data + setup around that — a per-archetype
 * `EnemyArt` descriptor, the `preload`, and the anim clips. `enemy.ts` reads a
 * descriptor in `spawn()` and, when one exists, swaps the tinted circle for the
 * spritesheet; archetypes with no descriptor keep the primitive path untouched.
 *
 * Descriptors are keyed by `displayName` so `content/` stays free of render
 * concerns. This is the reference for the other four enemy tickets (#68–#71).
 *
 * Assets ride the same craftpix top-down family + licence as the swordsman
 * (royalty-free, no attribution, commercial-OK, no reselling loose files, no
 * AI-training — see research #56 / ADR 0001). **But the row order is not the
 * swordsman's:** each sheet's facing→row map lives on the descriptor because the
 * families differ (the Slime is down/up/left/right, not down/left/right/up).
 */
import Phaser from "phaser";
import type { Facing } from "../player-sprite/facing";

import popupGruntIdle from "./assets/popup-grunt/idle.png";
import popupGruntWalk from "./assets/popup-grunt/walk.png";
import popupGruntDeath from "./assets/popup-grunt/death.png";

import cookieBannerIdle from "./assets/cookie-banner/idle.png";
import cookieBannerWalk from "./assets/cookie-banner/walk.png";
import cookieBannerDeath from "./assets/cookie-banner/death.png";

import trackingPixelIdle from "./assets/tracking-pixel/idle.png";
import trackingPixelWalk from "./assets/tracking-pixel/walk.png";
import trackingPixelDeath from "./assets/tracking-pixel/death.png";

import paywallIdle from "./assets/paywall/idle.png";
import paywallWalk from "./assets/paywall/walk.png";
import paywallDeath from "./assets/paywall/death.png";

/** The three states a chase enemy needs; ranged/aura archetypes reuse the same
 *  set (their telegraph is the shared `ring`, not a body clip). */
export type EnemyAnimName = "idle" | "walk" | "death";

const ANIM_NAMES: readonly EnemyAnimName[] = ["idle", "walk", "death"];
const FACINGS: readonly Facing[] = ["down", "up", "left", "right"];

export interface EnemyArt {
  /** Stable prefix for this archetype's textures + anim keys. */
  readonly key: string;
  /** Loaded spritesheet URLs, one per state. */
  readonly sheets: Record<EnemyAnimName, string>;
  /** Cell size of every sheet in the set. */
  readonly frame: { readonly width: number; readonly height: number };
  /** Columns (frame count) per state — a facing's clip is one row of these. */
  readonly cols: Record<EnemyAnimName, number>;
  /** Which sheet row holds each facing. Per-descriptor because the family's
   *  packs disagree — the Slime is not laid out like the swordsman. */
  readonly row: Record<Facing, number>;
  readonly frameRate: Record<EnemyAnimName, number>;
  /** On-screen scale of the 64px cell — tuned so the body reads at its hitbox. */
  readonly scale: number;
}

/**
 * Popup Grunt — craftpix **Free Slime Mobs** (Aqua). 64×64, rows are
 * down/up/left/right (0/1/2/3); idle 6 / walk 8 / death 10 columns.
 */
const POPUP_GRUNT: EnemyArt = {
  key: "popup_grunt",
  sheets: { idle: popupGruntIdle, walk: popupGruntWalk, death: popupGruntDeath },
  frame: { width: 64, height: 64 },
  cols: { idle: 6, walk: 8, death: 10 },
  row: { down: 0, up: 1, left: 2, right: 3 },
  // Idle breathes slowly; walk pushes the swarm; death is snappy so corpses
  // don't linger under a wave.
  frameRate: { idle: 6, walk: 10, death: 16 },
  // The slime body fills ~40px of its 64px cell; ~0.96 keeps the blob reading
  // clearly larger than its 26px hitbox (Nate eyeballed up 20% from 0.8).
  scale: 0.96,
};

/**
 * Cookie Banner — craftpix **Free Top-Down Orc** family, the brown *ogre* body
 * (Nate's aesthetic call: an ogre reads as the fat, heavy wall better than the
 * orc warrior; fiction/name unchanged). This pack is a **bigger cell than the
 * swordsman/slime — 128×128, not 64** (the research's "larger bodies may use a
 * bigger cell" warning made real), which is exactly why `frame` lives on the
 * descriptor. Rows are down/up/left/right (same as the slime, *not* the
 * swordsman); idle 4 / walk 8 / death 8 columns.
 */
const COOKIE_BANNER: EnemyArt = {
  key: "cookie_banner",
  sheets: {
    idle: cookieBannerIdle,
    walk: cookieBannerWalk,
    death: cookieBannerDeath,
  },
  frame: { width: 128, height: 128 },
  cols: { idle: 4, walk: 8, death: 8 },
  row: { down: 0, up: 1, left: 2, right: 3 },
  // Heavier and more lumbering than the grunt: idle barely stirs, the walk is a
  // slow trudge to match its 52px/s crawl, death stays snappy so the fat corpse
  // doesn't sit under the swarm.
  frameRate: { idle: 5, walk: 8, death: 14 },
  // 128px cell. The body deliberately dwarfs its 30px hitbox — Nate's call: the
  // Cookie Banner should read as a genuine *wall*, towering over the swordsman
  // and the swarm, not a merely-bulky grunt. 2.7 (3× the first 0.9 pass) is the
  // eyeballed size; the hitbox/aura are unchanged, so this is pure presence.
  scale: 2.7,
};

/**
 * Tracking Pixel — craftpix **Free Enemy Pixel Pack** *Sorcerer*, the plain
 * grey-hooded staff-caster (research #56: the family's ranged body). Back to a
 * **64×64 cell** like the slime — the 128 was the ogre's alone — laid out
 * down/up/left/right; idle 4 / walk 6 / death 10 columns. The ranged telegraph
 * is the shared `ring`, not a body clip, so idle/walk/death is the whole set.
 */
const TRACKING_PIXEL: EnemyArt = {
  key: "tracking_pixel",
  sheets: {
    idle: trackingPixelIdle,
    walk: trackingPixelWalk,
    death: trackingPixelDeath,
  },
  frame: { width: 64, height: 64 },
  cols: { idle: 4, walk: 6, death: 10 },
  row: { down: 0, up: 1, left: 2, right: 3 },
  // A nimble plinker (speed 105): idle hovers, walk keeps pace with the kite,
  // death is snappy so a corpse never blocks the shot line it leaves behind.
  frameRate: { idle: 6, walk: 10, death: 14 },
  // The caster fills ~40px of its 64px cell. 1.4 gives it real standoff
  // presence around its 18px hitbox — Nate's eyeball: the first pass at 0.9 read
  // too small, and this is the size the Paywall's first pass had before it grew.
  scale: 1.4,
};

/**
 * Paywall — a **distinct second caster** (Nate's call over a recolour): an
 * ornate crowned red-and-gold armoured sorcerer, so the advanced ranged threat
 * doesn't read as a bigger Tracking Pixel. Same 64×64 four-facing layout and
 * column counts as the Sorcerer; only the sheets and the heavier weighting
 * differ.
 */
const PAYWALL: EnemyArt = {
  key: "paywall",
  sheets: { idle: paywallIdle, walk: paywallWalk, death: paywallDeath },
  frame: { width: 64, height: 64 },
  cols: { idle: 4, walk: 6, death: 10 },
  row: { down: 0, up: 1, left: 2, right: 3 },
  // Heavier and more deliberate than the Pixel (speed 46, a 0.9s wind-up): idle
  // barely stirs, the walk is a slow plant-and-advance, death stays snappy.
  frameRate: { idle: 5, walk: 7, death: 12 },
  // The advanced caster towers over the basic Pixel without becoming a full
  // wall like the Cookie Banner (2.7) — 2.0 on the 64px cell reads as the big,
  // ornate threat around its 48px hitbox, clearly outsizing the 1.4 Pixel.
  scale: 2.0,
};

/** Every archetype with real art, keyed by `EnemyData.displayName`. */
const ENEMY_ART: Record<string, EnemyArt> = {
  "Popup Grunt": POPUP_GRUNT,
  "Cookie Banner": COOKIE_BANNER,
  "Tracking Pixel": TRACKING_PIXEL,
  Paywall: PAYWALL,
};

/** The descriptor for an archetype, or `undefined` if it's still a primitive. */
export function getEnemyArt(displayName: string): EnemyArt | undefined {
  return ENEMY_ART[displayName];
}

/** Spritesheet texture key for a state. */
export const enemySheetKey = (art: EnemyArt, name: EnemyAnimName): string =>
  `${art.key}_${name}`;

/** Anim clip key for a state + facing. */
export const enemyAnimKey = (
  art: EnemyArt,
  name: EnemyAnimName,
  facing: Facing,
): string => `${art.key}_${name}_${facing}`;

/** Load every registered archetype's sheets. Call from a scene `preload`. */
export function preloadEnemyArt(scene: Phaser.Scene): void {
  for (const art of Object.values(ENEMY_ART)) {
    const frame = { frameWidth: art.frame.width, frameHeight: art.frame.height };
    for (const name of ANIM_NAMES) {
      scene.load.spritesheet(enemySheetKey(art, name), art.sheets[name], frame);
    }
  }
}

/**
 * Build every archetype's per-facing clips once. Idempotent (keys are checked),
 * so it's safe to call from every `Enemy` constructor. Death is one-shot; idle
 * and walk loop. A facing's frames are the `cols` cells of its row.
 */
export function ensureEnemyAnims(scene: Phaser.Scene): void {
  for (const art of Object.values(ENEMY_ART)) {
    for (const name of ANIM_NAMES) {
      const cols = art.cols[name];
      for (const facing of FACINGS) {
        const key = enemyAnimKey(art, name, facing);
        if (scene.anims.exists(key)) continue;
        const start = art.row[facing] * cols;
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(enemySheetKey(art, name), {
            start,
            end: start + cols - 1,
          }),
          frameRate: art.frameRate[name],
          repeat: name === "death" ? 0 : -1,
        });
      }
    }
  }
}
