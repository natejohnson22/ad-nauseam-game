# PROTOTYPE — swordsman playable character (throwaway)

**Question:** does a real animated character read better as the player than the
blue circle + facing pip — and which character?

**Verdict:** the **pixel-art top-down swordsman**. A side-view "tiny style"
minotaur was trialled alongside it and cut, for two reasons: it can only mirror
left/right (no up/down facing — it keeps its last facing when you move
vertically, which reads off in a top-down arena), and its smooth vector art
clashes with the game's pixel look. That comparison lives in this branch's git
history if you want it back.

**Run it (one command + a flag):**

```bash
pnpm dev
```

Then open `http://localhost:5173/ad-nauseum-game/?sprite=swordsman`. Drop the flag
for the unchanged shipping circle. Everything here is `import.meta.env.DEV`-gated —
production builds strip it.

**What it does:** the real `Player` still owns all movement, HP, and collision and
just goes invisible; the avatar is pure follower art that mirrors the player each
frame, picks a facing (down/left/right/up) from the move vector, and plays idle /
run / attack. The attack is wired to the **real swing** — the avatar watches the
scene's `SwordSwing` pool and, when a fresh cleave appears, plays its attack clip
in that cleave's actual aim direction (nearest enemy). No production event or
callback; it just observes the same wedges the player sees, so the hookup stays
decoupled from `WeaponManager`. An on-screen readout shows facing + state.

**Layout:**

- `base-avatar.ts` — shared spine: follow the player, observe the swing pool,
  fire the attack, draw the readout.
- `swordsman-avatar.ts` — the character's art (4-facing idle/run/attack).
- `avatars.ts` — the façade `game-scene.ts` talks to (`avatarKind` /
  `preloadAvatar` / `createAvatar`).

**Blast radius:** everything lives in this folder except three `PROTOTYPE`-labelled
hooks — `preload` + avatar create/tick in `src/scenes/game-scene.ts`, and
`hideDefaultArt()` in `src/entities/player.ts`. Delete this folder and grep
`PROTOTYPE` to remove the hooks; the game is byte-for-byte restored.

**Asset:** craftpix.net free top-down swordsman (lvl1), 64×64 grid, 4 rows =
4 facings (row 0 down, 1 left, 2 right, 3 up). Only idle/run/attack sheets are
copied in.

**Next (see the tracking issue):** fold the swordsman into production properly —
death/hurt animations, and the decision on whether attack-facing should track the
swing (current) or stay locked to movement.
