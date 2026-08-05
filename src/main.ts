import Phaser from "phaser";
import { GameScene } from "./scenes/game-scene";
import { HudScene } from "./scenes/hud-scene";

/* Matches the Godot project's viewport (project.godot: 1280x720, stretch
   "canvas_items" / aspect "expand"). FIT + CENTER_BOTH is the closest Phaser
   equivalent.

   backgroundColor is Godot 4's default clear colour (0.3, 0.3, 0.3) — the
   prototype never sets one, so that grey *is* the reference the tuning pass
   compares against. The letterbox around the canvas stays #111 (index.html).

   Gamepad input is opt-in in Phaser, unlike Godot where it is always polled;
   browsers additionally only expose pads after a user gesture. */
const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#4d4d4d",
  /* `touch` is declared rather than left to Phaser, whose default is the
     browser's own touch detection — false in any desktop-shaped runtime,
     including the agent preview browser, and the thing that would silently
     leave slice 4's joystick mouse-only on a device that reports oddly.
     Listening for touch events on a machine that never fires them costs
     nothing. */
  input: { gamepad: true, touch: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  /* Only the first entry auto-starts; `HudScene` is listed so it is registered
     (and, being second, renders above the game) but is launched by `GameScene`
     with that run's bus. */
  scene: [GameScene, HudScene],
});

/* Dev-only handle for slice 1's verification method. The agent preview browser
   never fires requestAnimationFrame — `document.hidden` is permanently true, so
   the game sits at frame 0 however long you wait — and driving
   `game.step(t, 16.667)` from the console instead makes a run deterministic,
   which turns "looks right" into arithmetic. Vite strips this branch from the
   production bundle. */
if (import.meta.env.DEV) {
  (window as unknown as { game: Phaser.Game }).game = game;
}
