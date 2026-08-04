import Phaser from "phaser";

/**
 * Throwaway. Its only job is to prove the toolchain runs end to end — and, while
 * it is here, to exercise the technique issue #4 settled on: bake a texture once
 * with Graphics#generateTexture(), then render every entity as a Sprite and drive
 * colour through setTint. Nothing is drawn per frame.
 *
 * The port replaces this entirely; see issue #7 for the real scene layout.
 */
export class ScaffoldScene extends Phaser.Scene {
  static readonly KEY = "ScaffoldScene";

  constructor() {
    super(ScaffoldScene.KEY);
  }

  create(): void {
    const RADIUS = 16;
    const g = this.add.graphics();
    g.fillStyle(0xffffff, 1);
    g.fillCircle(RADIUS, RADIUS, RADIUS);
    g.generateTexture("dot", RADIUS * 2, RADIUS * 2);
    g.destroy();

    const tints = [0x4ec9b0, 0xd16969, 0xdcdcaa];
    for (let i = 0; i < tints.length; i++) {
      const sprite = this.add.sprite(440 + i * 200, 360, "dot");
      sprite.setTint(tints[i]!);
      this.tweens.add({
        targets: sprite,
        y: 300,
        duration: 700,
        delay: i * 120,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    this.add
      .text(640, 480, "scaffold ok — phaser + vite + ts", {
        fontFamily: "monospace",
        fontSize: "20px",
        color: "#888888",
      })
      .setOrigin(0.5);
  }
}
