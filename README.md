# AD NAUSEAM

A 2D satirical survivor-action game built in **TypeScript + Phaser 4**. You play
against the machinery of the modern web — enemies are pop-ups, cookie banners,
and paywalls; your XP is "engagement"; your weapons are the tools you'd use to
fight back.

**Play it:** https://natejohnson22.github.io/ad-nauseam-game/

> **Status:** Playable 30-minute prototype. The full roster, weapon pool, phase
> table, and boss ending are in. Numbers are still being tuned per phase. The
> death screen is a placeholder ad-break (no real ad SDK).

## The core loop

1. **Move** around an unbounded landscape arena, dodging waves of enemies.
2. You start with the **AdBlock+ Sword**. Weapons fire automatically on a
   cooldown; later weapons arrive as level-up picks, not grants on a timer.
3. Dead enemies drop **Engagement** (XP) that drifts toward you when you're close.
4. Collect enough Engagement to **level up**, which pauses the run and offers a
   **pick 1 of 3 upgrade** choice.
5. Survive **30 minutes** across seven named phases as the spawn director ramps
   pressure. **Winning means killing The Algorithm** before the clock hits 0:00
   — outlasting the timer with the boss still up is a loss.

The "pick-under-pressure" upgrade moment is the protected heart of the prototype.

## Weapons

You start with the sword. Everything else is **available, not guaranteed**,
except the boomerang, whose offer is pinned until you take it (or decline it).

| Weapon | Kind | Arrives |
| --- | --- | --- |
| **AdBlock+ Sword** | Frontal melee cleave | Equipped at 0:00 |
| **Do Not Track Boomerang** | Returning projectile | Guaranteed offer from Slow Build (3:00) |
| **Popup Blocker** | Pierce shot — a straight line through the swarm | Available from Confidence (5:00) |
| **Spam Filter** | 360° spin melee | Available from Struggle (10:00) |
| **Firewall** | Orbiting contact orbs | Available from Pro Struggle (20:00) |

A weapon's damage / signature upgrades only appear once you own it. Declining a
grant is a real choice: you never see that weapon's upgrade line.

## Enemies

Six archetypes on four behaviour arms. The fiction *is* the mechanic: each
enemy does to you what that format does to a reader.

| Enemy | Role | Behaviour |
| --- | --- | --- |
| **Popup Grunt** | Basic melee, the run's texture | Chases |
| **Tracking Pixel** | Basic ranged | Holds at range, fires aimed bolts |
| **Cookie Banner** | Advanced melee | Chases with a slow field you can wade through |
| **Autoplay Video Ogre** | Mini-boss | Telegraphed AoE slam; at most one alive |
| **Paywall** | Advanced ranged | Slow lockout shot that silences your weapons |
| **The Algorithm** | Final boss | Immovable HP wall; killing it is the win |

Shots are aimed, not homing — movement stays the answer to everything. Paywall
lockout is short, telegraphed, and rare on purpose.

## The run

Seven phases in `src/content/phases.ts`. That table is the spine: spawn tracks,
event bursts, and the per-phase level-up budget all read from it. Stretching
the run is a one-file edit.

| Phase | Clock | What changes |
| --- | --- | --- |
| Quick Start | 0:00–3:00 | Popup Grunts |
| Slow Build | 3:00–5:00 | Boomerang offered |
| Confidence | 5:00–10:00 | Tracking Pixel; Popup Blocker available |
| Struggle | 10:00–15:00 | Cookie Banner; grunt **hordes** and **trapping rings** (with an escape gap); Spam Filter available |
| Panic | 15:00–20:00 | Autoplay Video Ogre |
| Pro Struggle | 20:00–25:00 | Paywall; Firewall available |
| God-Tier Survival | 25:00–30:00 | The Algorithm; no further upgrades |

**Win:** kill The Algorithm. **Lose:** HP hits zero (ad-break) or the clock
expires with the boss still alive (a distinct timeout ad-break). Play Again
restarts the run in place.

## Upgrades

Level-ups are a pick of 3 from a pool gated by phase and by which weapons you
own. The pool has three jobs:

- **Weapon grants** — how new weapons arrive (see above).
- **Weapon lines** — damage plus a signature (wider sword arc, extra boomerang /
  blocker shots, Spam Filter reach, extra Firewall orbs).
- **Survivability** — max HP, regen, and damage reduction, available from 0:00.
  Damage reduction compounds and is capped so it never reaches immunity.

Also in the pool from the start: move speed and global cooldown reduction.

## Look

Two render paths, by design ([ADR 0001](docs/adr/0001-dual-path-art-pipeline.md)):

- **Full-colour sheets** for the player (pixel-art swordsman), the DNT
  Boomerang, Popup Blocker pierce shot, Firewall orbs, and the tiling CraftPix
  grasslands floor.
- **Procedural primitives** for the ad-side: every regular enemy is a glowing
  browser-chrome construct (pop-up window, blinking crosshair, consent bar,
  locked modal, autoplay video player) assembled from a shared kit. The
  Algorithm is a separate procedural VFX rig — a tracking lens ringed by data
  shards. Telegraphs, rings, and damage numbers stay on the white-bake + tint
  path.

## Running it

Requires **Node 24** and **pnpm 11**. The web project is the repo root.

```bash
pnpm install
pnpm dev
```

Other scripts: `build`, `preview`, `typecheck` (`tsc --noEmit`), `test`
(`vitest run`).

`pnpm build` hardcodes the GitHub Pages base path (`/ad-nauseam-game/`). Local
`pnpm dev` uses that same base, so the deployed URL layout is what you develop
against.

### Playtest harness (dev only)

Stripped from production builds. Start a run anywhere in the 30 minutes via the
URL, then nudge it with keys:

```
http://localhost:5173/ad-nauseam-game/?at=panic&speed=2&invuln&picks=8
```

- `at` — phase id (`panic`), clock (`15:00`), or seconds (`900`)
- `speed` — time scale (also `[` / `]` while running)
- `invuln` — god mode (also `I`)
- `picks` — grant that many level-up modals after the seek, so you can build
  the arsenal the phase is tuned around
- `` ` `` — hide the readout panel

### Native (Capacitor)

The same web build is wrapped for iOS and Android with Capacitor 8. The native
projects live in `ios/` and `android/` and are committed.

```bash
pnpm ios      # build:native + cap sync + open Xcode
pnpm android  # build:native + cap sync + open Android Studio
```

`pnpm sync` alone rebuilds and copies assets without opening an IDE. Note the
native build is `build:native`, not `build` — the Pages build hardcodes a
`/ad-nauseam-game/` base path that a webview would 404 on, so `build:native`
overrides it to `./`. Both platforms are pinned to landscape.

**Controls**
- **Keyboard:** WASD or arrow keys to move.
- **Touch / mouse:** an on-screen virtual joystick.
- **Gamepad:** the left stick (pads appear after a user gesture).

## Project layout

```
index.html
capacitor.config.ts    Capacitor app id, name, webDir
ios/ android/          Capacitor native projects (generated, committed)
src/
  main.ts              Game config and boot
  scenes/
    game-scene.ts        Composition root — owns the pools and systems
    hud-scene.ts         Always-running parallel scene for the HUD
  entities/            player, enemy, engagement, sword-swing, damage numbers
    player-sprite/       Pixel-art swordsman (follower art)
    boomerang/           Returning + pierce projectiles
    orbiter/             Firewall orbs
    arena-background/    Infinite tiling ground
    ui-construct/        Procedural ad-side enemy family + shared kit
    algorithm-vfx/       Procedural boss rig
    enemy-projectile/    Aimed bolts and lockout shots
  systems/
    progression.ts       Engagement -> level -> upgrade choices (tested)
    run.ts               Run timer, kills, win/lose/timeout (tested)
    spawn-director.ts    Phase tracks, hordes, trapping rings (tested)
    weapon-manager.ts    Owns and fires equipped weapons
  core/
    controls.ts          Unified keyboard + joystick input
    event-bus.ts         Typed facade over Phaser's EventEmitter
    pool.ts              Sprite pooling
    textures.ts          Primitives baked to textures at boot
  ui/                  Virtual joystick + DOM overlay modals (level-up, win, ad-break)
  content/             Weapons, enemies, upgrades, and the phase table
  dev/                 Playtest harness — compiled out of production
```

Gameplay content is data-driven: weapons, enemies, upgrades, and phases are
hand-written TypeScript object literals under `src/content/`, checked with
`satisfies` against hand-written types, so tuning and adding content mostly
means editing data rather than code.

## Tech notes

- **Engine:** Phaser 4 (pinned `4.2.1`), TypeScript 5.9, built with Vite 7.
- **No physics engine.** Every actor does manual integration and distance checks —
  the same approach the original prototype took.
- **Rendering:** dual-path (see Look). White primitives are baked with
  `Graphics#generateTexture()`; full-colour sheets load per-module via `preload`.
- **Display:** 1280×720 design resolution, landscape, scaled to fit. The arena
  has no camera bounds — the ground is a viewport-sized tile sprite whose
  `tilePosition` tracks the camera.
- **UI:** the HUD is canvas (HP, XP, timer, kills, damage, boss bar); the three
  modal screens are a DOM overlay pinned to the canvas rect, so they share the
  same 1280×720 coordinate space.
- **Tests:** narrow and logic-only — progression, run state, phases, spawn
  director, playtest URL grammar — run with Vitest, no rendering or scene tests.
- **Deploy:** GitHub Pages via Actions on push to `main`, gated by typecheck,
  tests, and build. PRs run the same gates but never deploy.
- **Native:** Capacitor 8 (`ios/`, `android/`) wrapping the same Vite build. No
  Capacitor plugins yet — `@capacitor/core` is not imported by game code, so the
  web and native builds are byte-identical apart from the base path.

## History

This started as a Godot 4 / GDScript prototype and was ported to TypeScript +
Phaser. The Godot tree was removed once the web build reached parity; it remains
in this repo's git history, and the port is documented end to end in
[issue #1](https://github.com/natejohnson22/ad-nauseam-game/issues/1).
