import Phaser from "phaser";
import { ScaffoldScene } from "./scaffold-scene";

/* Matches the Godot project's viewport (project.godot: 1280x720, stretch
   "canvas_items" / aspect "expand"). FIT + CENTER_BOTH is the closest Phaser
   equivalent; whether the port keeps it is the port-sequencing ticket's call. */
new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 1280,
  height: 720,
  backgroundColor: "#111111",
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ScaffoldScene],
});
