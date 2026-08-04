import Phaser from "phaser";
import { GameScene } from "./scenes/game-scene";

/* Matches the Godot project's viewport (project.godot: 1280x720, stretch
   "canvas_items" / aspect "expand"). FIT + CENTER_BOTH is the closest Phaser
   equivalent.

   backgroundColor is Godot 4's default clear colour (0.3, 0.3, 0.3) — the
   prototype never sets one, so that grey *is* the reference the tuning pass
   compares against. The letterbox around the canvas stays #111 (index.html).

   Gamepad input is opt-in in Phaser, unlike Godot where it is always polled;
   browsers additionally only expose pads after a user gesture. */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#4d4d4d",
  input: { gamepad: true },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [GameScene],
});
