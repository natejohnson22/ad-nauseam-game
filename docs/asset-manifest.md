# AD NAUSEAM — Art & Audio Asset Manifest

A production checklist of every character, item, screen, and sound the game needs,
derived from the current data-driven content (`src/content/`) and the placeholder
primitives it renders today (`src/core/textures.ts`). Everything below is currently
a tinted white shape — a circle, a ring, or a wedge — so this list is the full
from-scratch art and audio brief, not a gap analysis.

**Art direction north star:** the fiction *is* the mechanic. Enemies are the
machinery of the ad-funded web; the player is "The User"; XP is "Engagement." A
flat, satirical UI-chrome look (browser buttons, banners, modal dialogs, cursors)
reads truer than fantasy-monster art. Everything is tinted by a single `color`
field, so each asset should read clearly as a white/greyscale silhouette that
takes a tint cleanly.

---

## 1. Characters

### 1.1 Player

| Character | Fiction | Current placeholder | Art needed |
|-----------|---------|---------------------|------------|
| **The User** | You, fighting back against the modern web | Blue circle (`#40ccff`) + facing pip | Player sprite (idle + 4/8-way facing or directional pip), hit/hurt flash frame, death frame |

- **States to cover:** idle, moving, taking damage (hit-flash), invulnerable (i-frame shimmer), silenced/locked-out (Paywall effect — weapons greyed), death.
- **Facing:** movement is a unified vector; art needs a clear facing indicator (the current "pip" or a full directional set).

### 1.2 Enemies — the roster (six archetypes, four behaviour arms)

| ID | Display name | Role | Behaviour | Placeholder colour | Art needed |
|----|--------------|------|-----------|--------------------|------------|
| `popup_grunt` | **Popup Grunt** | Basic melee, the run's "texture" | `chase` | `#f2bf33` yellow | Small pop-up window sprite (close-button "×", nagging tone), hit-flash, death poof |
| `tracking_pixel` | **Tracking Pixel** | Basic ranged | `ranged_standoff` (bolt) | `#ff5f9e` pink | Tiny crosshair/pixel/eye sprite, telegraph/muzzle flare, its projectile (bolt) |
| `cookie_banner` | **Cookie Banner** | Advanced melee | `chase_aura` (slow field) | `#a9743d` brown | Wide "we value your privacy" banner sprite + the drag-behind slow-field aura visual |
| `autoplay_ogre` | **Autoplay Video Ogre** | Mini-boss melee | `telegraph_aoe` (slam) | `#9933b3` purple | Large autoplay video-player sprite (play ▶ button face), wind-up pose, telegraph ring, blast/impact |
| `paywall` | **Paywall** | Advanced ranged | `ranged_standoff` (lockout shot) | `#d94f4f` red | "Subscribe to continue" wall sprite, long wind-up pose, the slow fat lockout projectile |
| `the_algorithm` | **The Algorithm** | Final boss | `ranged_standoff` (bolt, heavy) | `#e6e6f0` near-white | Large abstract "feed/algorithm" boss sprite, telegraph, bolt volley |

**Shared per-enemy states each archetype needs:** spawn/arrive, idle/move,
telegraph/wind-up (ranged + AoE only), attack/fire, hit-flash (tint lerp — no
redraw needed, tint handles it), death.

---

## 2. Items, weapons & projectiles

### 2.1 Weapons (player)

| ID | Display name | Kind | Placeholder | Art needed |
|----|--------------|------|-------------|------------|
| `adblock_sword` | **AdBlock+ Sword** | melee cleave (wedge) | White wedge, 100°→200° arc | Sword sprite + swing/cleave arc VFX (scales with arc upgrade) |
| `dnt_boomerang` | **Do Not Track Boomerang** | ranged returning projectile | Blue circle (`#80e6ff`) | Boomerang/"DNT" disc sprite, spin animation, return trail |

### 2.2 Projectiles & attack VFX

| Element | Source | Art needed |
|---------|--------|------------|
| **Sword cleave arc** | AdBlock+ Sword | Sweep/slash VFX, 5 arc widths (100°, +25° ×4) |
| **Boomerang shot** | DNT Boomerang | Disc sprite + spin + outgoing/return trail; multi-track fan (up to +3 extra) |
| **Enemy bolt** | Tracking Pixel, The Algorithm | Small aimed projectile sprite + impact |
| **Enemy lockout shot** | Paywall | Slow, fat, distinct "subscribe" projectile + on-hit "weapons disabled" burst |
| **Ogre AoE blast** | Autoplay Video Ogre | Telegraph ring (pulsing) + ground-slam impact |
| **Cookie Banner aura** | Cookie Banner | Persistent slow-field ground decal (radius 150) |

### 2.3 Pickups & world items

| Item | Fiction | Current placeholder | Art needed |
|------|---------|---------------------|------------|
| **Engagement** | XP dropped by dead enemies, drifts to player | small shape | Engagement gem/orb (small/medium/large tiers by value 1→100), magnet-drift trail, collect pop |
| **Floating damage numbers** | Deterministic hit feedback | Baked text texture | Style pass for damage-number typography (sword 140–500, boomerang 100–400) |

---

## 3. Environment & arena

| Element | Notes | Art needed |
|---------|-------|------------|
| **Arena floor / background** | 2D survivor arena, landscape-locked | Tiling ground texture ("the web" — could be a page/scroll/feed motif), edge/vignette |
| **Arena bounds** | Play-space limits | Boundary treatment (browser chrome frame? off-page fade?) |
| **Ambient world dressing** | Optional | Scrolling background feed, parallax banners, drifting UI detritus |

---

## 4. UI, HUD & screens

### 4.1 HUD (always-on parallel scene)

- **Health bar** — "The User" HP (max 1000). Currently a scaled white rect.
- **Engagement / XP bar** — progress to next level.
- **Level indicator**, **run timer** (counts toward 30:00), **kill counter**.
- **Phase readout** (optional) — Quick Start → God-Tier Survival.
- **Silence/lockout indicator** — when Paywall disables weapons.
- **Virtual joystick** — canvas thumbstick base + nub (touch/mouse).
- **On-screen art needed:** bar frames/fills, iconography for HP/Engagement/timer/kills, joystick skin.

### 4.2 Modal & full-screen states (DOM overlay)

| Screen | Trigger | Art needed |
|--------|---------|------------|
| **Level-Up Modal** ("choose an upgrade") | On level-up, pick 1 of 3 | Card frames, upgrade icons (see §5), rarity/selection states, pause backdrop |
| **Ad-Break / Game Over** | On death | "GAME OVER" treatment, fake ad frame, 5-second countdown UI, death flavour text styling |
| **Win Screen** ("YOU SURVIVED") | Clock runs out / boss killed | Victory treatment, run-stats readout, "Play Again" button |
| **Title / boot screen** | App launch | Logo, "AD NAUSEAM" wordmark, start button |
| **Phase transition** (optional) | Phase boundary | Phase-name banner (Quick Start, Slow Build, Confidence, Struggle, Panic, Pro Struggle, God-Tier Survival) |

### 4.3 App / platform assets

- **App icon** (iOS + Android via Capacitor), splash screen, store screenshots.
- **Favicon** for the web build.
- **Cursor** (desktop) — could be themed as an ad-blocker cursor.

---

## 5. Upgrade icons (level-up cards)

One icon per upgrade record in `src/content/upgrades.ts`:

| Upgrade | Title | Icon concept |
|---------|-------|--------------|
| `sword_damage` | **Premium Blade** | +damage sword |
| `sword_arc` | **Wider Cleave** | widening arc |
| `grant_boomerang` | **Do Not Track** | boomerang unlock (guaranteed offer) |
| `boomerang_damage` | **Sharper Signal** | sharpened disc |
| `boomerang_projectile` | **Multi-Track** | fanned discs |
| `move_speed` | **Bandwidth Boost** | speed/bandwidth |
| `cooldown` | **Battery Saver** | battery / faster-fire |

---

## 6. Sound effects (SFX)

### 6.1 Player
- Move/footstep loop (subtle, or omit for arcade feel)
- Take damage / hurt
- Low-health warning heartbeat/loop
- Death sting
- Invulnerable/i-frame shimmer (optional)
- Weapons-silenced (Paywall lockout) engage + expire

### 6.2 Weapons
- AdBlock+ Sword swing (whoosh) + hit/impact
- DNT Boomerang throw + spin loop + return catch + hit
- Multi-track fan (layered variant)

### 6.3 Enemies (per archetype — spawn / attack / hit / death)
- **Popup Grunt** — pop-up "blip" spawn, nagging chase, satisfying "close" pop on death
- **Tracking Pixel** — telegraph blip, bolt fire, whiz-by, death
- **Cookie Banner** — deploy/unfurl, aura hum loop (slow field), death
- **Autoplay Video Ogre** — unmute/autoplay sting, AoE wind-up telegraph, ground slam, death
- **Paywall** — long wind-up, "subscribe" lockout shot, lockout impact ("subscribe to continue"), death
- **The Algorithm** — boss arrival stinger, bolt volley, hit, defeat sequence

### 6.4 Pickups & progression
- Engagement pickup (pitch-rising with value/tier, combo escalation)
- Engagement magnet/drift shimmer
- Level-up chime (pauses run)
- Upgrade card hover + select/confirm

### 6.5 UI / meta
- Menu navigate / confirm / back
- Modal open / close
- Ad-break countdown ticks + "you may skip" (satirical) + resume
- Win jingle / lose sting
- Damage-number tick (optional, very light or muted at volume)

### 6.6 Ambient / phase
- Phase-transition sweep (7 phases ramping intensity)
- Arena ambience / drone bed

---

## 7. Music & audio design

- **Menu / title theme** — sets the satirical tone.
- **Gameplay music** — ideally intensity-layered across the 7 phases (Quick
  Start calm → God-Tier Survival frantic); stems that add layers as pressure ramps.
- **Boss music** — The Algorithm (final phase).
- **Ad-break "music"** — deliberately obnoxious jingle for the death screen (the joke).
- **Win theme / stinger.**
- **Mix & tech:** ducking so level-up chime and hit feedback cut through swarm
  noise; voice/instance limiting for the Popup Grunt swarm (uncapped, can carpet
  the arena — pool and cap concurrent pop sounds); consistent bus routing
  (SFX/Music/UI) for a master volume + mute; short, punchy, high-legibility SFX
  since dozens of hits land per second.

---

## 8. Priority notes for production

- **Tint-friendly silhouettes:** every entity is drawn white and tinted by one
  `color` value, including the hit-flash (a tint lerp, not a redraw). Author art
  as clean white/greyscale so a single tint reads correctly.
- **Telegraphs are gameplay, not decoration:** the Pixel (0.45s), Ogre (1.1s),
  Paywall (0.9s), and Algorithm (0.6s) all wind up before firing — the telegraph
  VFX + audio cue are what make each attack fair. Prioritise these.
- **Swarm legibility:** the Popup Grunt is uncapped and is the whole arena's
  "texture." Its art and sound must survive dozens on screen at once.
- **Damage numbers stay a fixed, small value set** (deterministic damage), so a
  baked-texture typography pass is enough — no dynamic text system required.
