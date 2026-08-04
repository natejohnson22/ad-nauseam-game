import Phaser from "phaser";
import "./overlay.css";

/**
 * The DOM half of issue #8's hybrid UI: a 1280x720 design box pinned on top of
 * the canvas, which the modals draw into. The HUD is not here — it stays in
 * game space (slice 3).
 *
 * `sync` is the whole idea. Phaser's FIT scale mode letterboxes the canvas, so
 * an overlay is only correct if it is translated to the canvas's *rendered*
 * top-left and scaled by the same factor. One transform buys that, and in
 * exchange every modal keeps writing `main.gd`'s coordinates.
 *
 * The `ResizeObserver` is load-bearing and was the prototype's one surprise:
 * Phaser's `RESIZE` event fires when the *game* resizes, but the canvas rect
 * also moves when the page lays out around it — including the very first
 * layout, where the rect is still zero-sized at construction.
 */
export class Overlay {
  /** Design width, matching the Phaser game config and `project.godot`. */
  static readonly WIDTH = 1280;

  readonly host: HTMLDivElement;

  private readonly root: HTMLDivElement;
  private readonly observer: ResizeObserver;

  constructor(private readonly game: Phaser.Game) {
    this.root = document.createElement("div");
    this.root.id = "ui-overlay";
    this.host = document.createElement("div");
    this.root.appendChild(this.host);
    document.body.appendChild(this.root);

    this.sync();
    this.game.scale.on(Phaser.Scale.Events.RESIZE, this.sync);
    window.addEventListener("resize", this.sync);
    this.observer = new ResizeObserver(this.sync);
    this.observer.observe(this.game.canvas);
  }

  private sync = (): void => {
    const rect = this.game.canvas?.getBoundingClientRect();
    if (rect === undefined || rect.width === 0) return;
    this.root.style.transform =
      `translate(${rect.left}px, ${rect.top}px) scale(${rect.width / Overlay.WIDTH})`;
  };

  destroy(): void {
    this.observer.disconnect();
    this.game.scale.off(Phaser.Scale.Events.RESIZE, this.sync);
    window.removeEventListener("resize", this.sync);
    this.root.remove();
  }
}
