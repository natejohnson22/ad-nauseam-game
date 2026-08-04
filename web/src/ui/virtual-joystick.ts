import Phaser from "phaser";
import type { Controls } from "../core/controls";
import { circleTexture, ringTexture } from "../core/textures";

/**
 * The floating on-screen stick — the port of `virtual_joystick.gd`. First press
 * anywhere spawns the base under the thumb; dragging steers; release ends it.
 * Its only output is `Controls.touchVector`, so the player controller still
 * never learns where its movement came from.
 *
 * **It lives on the canvas, in `HudScene`** — issue #8 put the modals on the DOM
 * overlay but explicitly excluded the joystick, which is per-frame input in game
 * space. `HudScene` is also the scene that keeps running while `GameScene` is
 * paused, which is what makes the gating below necessary rather than free:
 * Godot's `Control` stops receiving `_unhandled_input` when the tree pauses, so
 * a modal freezes the stick for nothing. Here nothing freezes on its own.
 *
 * Two Phaser deltas from the Godot original. Pointer events already unify mouse
 * and touch, so `emulate_touch_from_mouse` has no equivalent — the mouse works
 * because there is nothing to emulate. And the modal overlay is DOM, sitting
 * *above* the canvas, so a press on an open modal never reaches this at all;
 * `_unhandled_input`'s "only events the GUI didn't consume" comes for free from
 * the stacking order rather than from an input phase.
 */
export class VirtualJoystick {
  /** `MAX_RADIUS` — the throw at which the vector reaches length 1. */
  static readonly MAX_RADIUS = 90;
  private static readonly KNOB_RADIUS = 28;
  private static readonly STROKE = 2;

  private enabled = true;
  /** The pointer id owning the drag, or -1 — Godot's `_touch_index`. */
  private pointerId = -1;
  private readonly base: Phaser.Math.Vector2;
  private readonly knob: Phaser.Math.Vector2;
  /** Scratch for the drag maths — `onMove` runs per pointer event. */
  private readonly offset = new Phaser.Math.Vector2();

  private readonly baseFill: Phaser.GameObjects.Sprite;
  private readonly baseRing: Phaser.GameObjects.Sprite;
  private readonly knobFill: Phaser.GameObjects.Sprite;
  private readonly knobRing: Phaser.GameObjects.Sprite;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly controls: Controls,
  ) {
    this.base = new Phaser.Math.Vector2();
    this.knob = new Phaser.Math.Vector2();

    /* `_draw`'s four shapes, baked once (issue #4) instead of redrawn per drag
       event. Alpha carries what Godot's per-shape Color did; the fills are
       white, so nothing needs tinting. */
    const R = VirtualJoystick.MAX_RADIUS;
    const K = VirtualJoystick.KNOB_RADIUS;
    const S = VirtualJoystick.STROKE;
    this.baseFill = this.shape(circleTexture(scene, R), 0.06);
    this.baseRing = this.shape(ringTexture(scene, R, S), 0.22);
    this.knobFill = this.shape(circleTexture(scene, K), 0.22);
    this.knobRing = this.shape(ringTexture(scene, K, S), 0.4);

    /* A second pointer so a stray finger gets its own object rather than
       reusing — and so hijacking — the one driving the stick. Phaser allocates
       one touch pointer by default; Godot's per-event `index` is the same
       guard by another name. */
    scene.input.addPointer(1);
    scene.input.on(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    scene.input.on(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    scene.input.on(Phaser.Input.Events.POINTER_UP_OUTSIDE, this.onUp, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  private get active(): boolean {
    return this.pointerId !== -1;
  }

  /**
   * Accept or refuse input, and drop any drag in progress either way.
   *
   * `false` is what a modal opening means here: `reset()` alone would clear the
   * vector and then let the same held thumb set it straight back, since a drag
   * that began before the modal keeps delivering `pointermove` (Phaser listens
   * on the window, not just the canvas). The stick is dead until the modal
   * closes, and the next press starts a fresh one.
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.end();
  }

  private onDown(pointer: Phaser.Input.Pointer): void {
    if (!this.enabled || this.active) return;
    this.pointerId = pointer.id;
    this.base.set(pointer.x, pointer.y);
    this.knob.set(pointer.x, pointer.y);
    this.update();
  }

  private onMove(pointer: Phaser.Input.Pointer): void {
    if (!this.active || pointer.id !== this.pointerId) return;
    // Clamp the knob to the ring; past it the vector saturates at length 1.
    const offset = this.offset
      .set(pointer.x, pointer.y)
      .subtract(this.base)
      .limit(VirtualJoystick.MAX_RADIUS);
    this.knob.set(this.base.x + offset.x, this.base.y + offset.y);
    this.update();
  }

  private onUp(pointer: Phaser.Input.Pointer): void {
    if (pointer.id !== this.pointerId) return;
    this.end();
  }

  /** `_update_vector` plus the redraw `queue_redraw()` used to schedule. */
  private update(): void {
    this.controls.touchVector.set(
      (this.knob.x - this.base.x) / VirtualJoystick.MAX_RADIUS,
      (this.knob.y - this.base.y) / VirtualJoystick.MAX_RADIUS,
    );
    this.baseFill.setPosition(this.base.x, this.base.y).setVisible(true);
    this.baseRing.setPosition(this.base.x, this.base.y).setVisible(true);
    this.knobFill.setPosition(this.knob.x, this.knob.y).setVisible(true);
    this.knobRing.setPosition(this.knob.x, this.knob.y).setVisible(true);
  }

  private end(): void {
    this.pointerId = -1;
    this.controls.touchVector.set(0, 0);
    for (const sprite of this.sprites()) sprite.setVisible(false);
  }

  private destroy(): void {
    this.scene.input.off(Phaser.Input.Events.POINTER_DOWN, this.onDown, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_MOVE, this.onMove, this);
    this.scene.input.off(Phaser.Input.Events.POINTER_UP, this.onUp, this);
    this.scene.input.off(
      Phaser.Input.Events.POINTER_UP_OUTSIDE,
      this.onUp,
      this,
    );
  }

  private shape(texture: string, alpha: number): Phaser.GameObjects.Sprite {
    return this.scene.add
      .sprite(0, 0, texture)
      .setAlpha(alpha)
      .setVisible(false);
  }

  private sprites(): readonly Phaser.GameObjects.Sprite[] {
    return [this.baseFill, this.baseRing, this.knobFill, this.knobRing];
  }
}
