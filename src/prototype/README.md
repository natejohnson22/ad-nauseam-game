# PROTOTYPE — playable character (throwaway)

**Question:** does a real animated character read better as the player than the
blue circle + facing pip — and which character? Two contenders, switchable so you
can A/B them on the same run:

| flag | character | art style |
| --- | --- | --- |
| `?sprite=swordsman` | top-down swordsman | **4 true facings** (down/left/right/up) |
| `?sprite=minotaur` | side-view brute | **flip-only** (faces left/right; keeps flip on vertical moves) |

That art difference is the whole comparison: the swordsman turns to face any
direction; the minotaur is a "tiny style" side character that can only mirror
left/right, so moving up or down it keeps whichever way it last faced. Feel which
one you mind less in a top-down arena.

**Run it (one command + a flag):**

```bash
pnpm dev
```

Then open, e.g. `http://localhost:5173/ad-nauseum-game/?sprite=minotaur` (swap the
value, or drop it entirely for the unchanged shipping circle). Everything here is
`import.meta.env.DEV`-gated — production builds strip it.

**What it does:** the real `Player` still owns all movement, HP, and collision and
just goes invisible; the avatar is pure follower art that mirrors the player each
frame. The attack is wired to the **real swing** — the avatar watches the scene's
`SwordSwing` pool and, when a fresh cleave appears, plays its attack clip in that
cleave's actual aim direction (nearest enemy). No production event or callback; it
just observes the same wedges the player sees, so the hookup stays decoupled from
`WeaponManager`. An on-screen readout shows character + facing + state.

**Layout:**

- `base-avatar.ts` — shared spine: follow the player, observe the swing pool,
  fire the attack, draw the readout. Subclasses only say how their art poses.
- `swordsman-avatar.ts` / `minotaur-avatar.ts` — the two characters.
- `avatars.ts` — the façade `game-scene.ts` talks to (`avatarKind` /
  `preloadAvatar` / `createAvatar`). A third contender is one case here + its own
  `*-avatar.ts`.

**Blast radius:** everything lives in this folder except three `PROTOTYPE`-labelled
hooks — `preload` + avatar create/tick in `src/scenes/game-scene.ts`, and
`hideDefaultArt()` in `src/entities/player.ts`. Delete this folder and grep
`PROTOTYPE` to remove the hooks; the game is byte-for-byte restored.

**Assets (both craftpix.net free):**

- Swordsman (lvl1): 64×64 grid, 4 rows = 4 facings; idle/run/attack sheets copied
  into `swordsman-assets/`.
- Minotaur (Minotaur_01, "tiny style"): source is per-frame PNG sequences at
  720×490. Cropped to a shared box and packed as downscaled 90×73 strips (idle 12
  / walk 18 / attack 12) under `minotaur-assets/` so the character never jitters
  between states.
