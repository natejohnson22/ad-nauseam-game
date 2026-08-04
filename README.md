# AD NAUSEAM

A 2D satirical survivor-action game built in **TypeScript + Phaser 4**. You play against
the machinery of the modern web — enemies are pop-ups and autoplay ads, your XP is
"engagement," and your weapons are the tools you'd use to fight back.

**Play it:** https://natejohnson22.github.io/ad-nauseum-game/

> **Status:** Prototype 1 — core survivor loop only. Ad-break mechanics and later systems
> are deferred to future prototypes.

## The core loop

1. **Move** around a landscape arena, dodging waves of enemies.
2. Your **weapons fire automatically** on a cooldown.
3. Dead enemies drop **Engagement** (XP) that drifts toward you when you're close.
4. Collect enough Engagement to **level up**, which pauses the run and offers a
   **pick 1 of 3 upgrade** choice.
5. Survive five minutes as the spawn director ramps up pressure.

The "pick-under-pressure" upgrade moment is the protected heart of this prototype.

## Content in Prototype 1

**Weapons**
- **AdBlock Sword** — a swinging melee arc.
- **DNT Boomerang** — a returning projectile.

**Enemies**
- **Pop-up Grunt** — basic chaser.
- **Autoplay Ogre** — larger, tankier threat with a telegraphed AoE slam.

**Upgrades** — sword damage, sword arc, boomerang damage, boomerang projectile count,
move speed, and cooldown reduction.

## Running it

Requires **Node 24** and **pnpm 11**. Everything lives in `web/`.

```bash
pnpm --dir web install
pnpm --dir web dev
```

Other scripts: `build`, `preview`, `typecheck` (`tsc --noEmit`), `test` (`vitest run`).

**Controls**
- **Keyboard:** WASD or arrow keys to move.
- **Touch / mouse:** an on-screen virtual joystick.
- **Gamepad:** the left stick (pads appear after a user gesture).

## Project layout

```
web/
  index.html
  src/
    main.ts              Game config and boot
    scenes/
      game-scene.ts        Composition root — owns the pools and systems
      hud-scene.ts         Always-running parallel scene for the HUD
    entities/            player, enemy, engagement, sword-swing, boomerang
    systems/
      progression.ts       Engagement -> level -> upgrade choices (tested)
      run.ts               Run timer, kills, win/lose state (tested)
      spawn-director.ts    Wave / spawn pacing
      weapon-manager.ts    Owns and fires equipped weapons
    core/
      controls.ts          Unified keyboard + joystick input
      event-bus.ts         Typed facade over Phaser's EventEmitter
      pool.ts              Sprite pooling
      textures.ts          Primitives baked to textures at boot
    ui/                  Virtual joystick (canvas) + DOM overlay modals
    content/             Weapon, enemy, and upgrade definitions as typed literals
```

Gameplay content is data-driven: weapons, enemies, and upgrades are hand-written
TypeScript object literals under `src/content/`, checked with `satisfies` against
hand-written types, so tuning and adding content mostly means editing data rather
than code.

## Tech notes

- **Engine:** Phaser 4 (pinned `4.2.1`), TypeScript 5.9, built with Vite 7.
- **No physics engine.** Every actor does manual integration and distance checks —
  the same approach the original prototype took.
- **Rendering:** all primitives (circles, arcs, wedges) are baked to textures at boot
  with `Graphics#generateTexture()` and drawn as pooled, tinted sprites.
- **Display:** 1280×720 design resolution, landscape, scaled to fit.
- **UI:** the HUD is canvas; the three modal screens are a DOM overlay pinned to the
  canvas rect, so they share the same 1280×720 coordinate space.
- **Tests:** narrow and logic-only — progression and run state, run with Vitest, no
  rendering or scene tests.
- **Deploy:** GitHub Pages via Actions on push to `main`, gated by typecheck, tests,
  and build.

## History

This started as a Godot 4 / GDScript prototype and was ported to TypeScript + Phaser.
The Godot tree was removed once the web build reached parity; it remains in this repo's
git history, and the port is documented end to end in
[issue #1](https://github.com/natejohnson22/ad-nauseum-game/issues/1).
