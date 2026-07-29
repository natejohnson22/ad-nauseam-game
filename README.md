# AD NAUSEAM

A 2D satirical survivor-action game built in **Godot 4.6** (GDScript). You play against
the machinery of the modern web — enemies are pop-ups and autoplay ads, your XP is
"engagement," and your weapons are the tools you'd use to fight back.

> **Status:** Prototype 1 — core survivor loop only. Ad-break mechanics and later systems
> are deferred to future prototypes.

## The core loop

1. **Move** around a landscape arena, dodging waves of enemies.
2. Your **weapons fire automatically** on a cooldown.
3. Dead enemies drop **Engagement** (XP) that drifts toward you when you're close.
4. Collect enough Engagement to **level up**, which pauses the run and offers a
   **pick 1 of 3 upgrade** choice.
5. Survive as the spawn director ramps up pressure.

The "pick-under-pressure" upgrade moment is the protected heart of this prototype.

## Content in Prototype 1

**Weapons**
- **AdBlock Sword** — a swinging melee arc.
- **DNT Boomerang** — a returning projectile.

**Enemies**
- **Pop-up Grunt** — basic chaser.
- **Autoplay Ogre** — larger, tankier threat.

**Upgrades** include weapon damage, sword arc, boomerang projectile count, cooldown
reduction, and move speed.

## Running it

1. Open the project in **Godot 4.6** (Forward+/Compatibility — the project uses the
   `gl_compatibility` renderer, so it runs on low-end and mobile targets).
2. Press **Play** (the main scene is `scenes/Main.tscn`).

**Controls**
- **Keyboard:** WASD or arrow keys to move.
- **Touch / mouse:** an on-screen virtual joystick (mouse emulates touch).

## Project layout

```
scenes/          Main.tscn — the single gameplay scene
scripts/
  main.gd            Run setup and orchestration
  player.gd          Player movement and stats
  enemy.gd           Enemy behavior
  spawn_director.gd  Wave / spawn pacing
  weapon_manager.gd  Owns and fires equipped weapons
  engagement.gd      XP pickup that drifts to the player
  progression.gd     Engagement -> level -> upgrade choices
  controls.gd        Input autoload (keyboard + virtual joystick)
  weapons/           sword_swing.gd, boomerang.gd
  ui/                virtual_joystick.gd
  data/              *_data.gd resource script definitions
data/
  weapons/         Weapon definitions (.tres)
  enemies/         Enemy definitions (.tres)
  upgrades/        Upgrade definitions (.tres)
```

Gameplay content is data-driven: weapons, enemies, and upgrades are defined as Godot
`.tres` resources under `data/`, so tuning and adding content mostly means editing
resources rather than code.

## Tech notes

- **Engine:** Godot 4.6, GDScript (no C# / .NET — the `[dotnet]` block in
  `project.godot` is inert).
- **Display:** 1280×720, landscape, `canvas_items` stretch with `expand` aspect.
- **Renderer:** `gl_compatibility` for broad device support.
