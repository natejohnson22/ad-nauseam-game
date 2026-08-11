# Dual-path art pipeline (primitives vs full-colour sheets)

Real multi-colour pixel-art cannot use the white-bake + `setTint` contract in `textures.ts` — multiply tint cannot brighten past source pixels, so the old hit-flash lerp only worked on white primitives. We keep **two paths**: white-bake/`setTint` for rings, HUD, telegraphs, damage numbers, and other primitives; full-colour spritesheets for bodies, weapons, and projectiles, with hit-flash as an additive white overlay (same pose, ADD blend). Identity comes from distinct sheets, not tint; loading follows the `player-sprite` per-module `preload` pattern; depth table and the sibling telegraph `ring` stay as they are.

Settled in [Decide how real multi-colour art fits the baked-primitive tint pipeline](https://github.com/natejohnson22/ad-nauseum-game/issues/60).
