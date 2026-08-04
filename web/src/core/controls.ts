import Phaser from "phaser";

/**
 * Unified movement input — the port of `controls.gd`, minus the globalness.
 *
 * Game code asks for a move vector and never learns whether it came from the
 * keyboard, a gamepad stick, or (slice 4) the on-screen joystick. That
 * abstraction survives; the autoload does not. `main.gd:347` has to manually
 * zero `Controls.touch_vector` on restart precisely because the singleton
 * outlives the scene reload — an injected instance dies with the run instead
 * (issue #7).
 *
 * Two Phaser deltas from the Godot input map: pointer events already unify
 * mouse and touch, so `emulate_touch_from_mouse` has no equivalent; and gamepad
 * support is opt-in, both in the game config and in the browser, which only
 * exposes pads after a user gesture.
 */
export class Controls {
  private static readonly STICK_DEADZONE = 0.2;

  /** Set every frame by the virtual joystick (slice 4). Zero until then. */
  readonly touchVector = new Phaser.Math.Vector2();

  private readonly left: Keys;
  private readonly right: Keys;
  private readonly up: Keys;
  private readonly down: Keys;
  private readonly gamepad: Phaser.Input.Gamepad.GamepadPlugin | null;
  private readonly move = new Phaser.Math.Vector2();

  constructor(input: Phaser.Input.InputPlugin) {
    const keyboard = input.keyboard;
    if (keyboard === null) throw new Error("Controls needs a keyboard plugin");

    const key = (code: string): Phaser.Input.Keyboard.Key =>
      keyboard.addKey(code, true, false);

    // WASD and arrows, matching project.godot's four move_* actions.
    this.left = [key("A"), key("LEFT")];
    this.right = [key("D"), key("RIGHT")];
    this.up = [key("W"), key("UP")];
    this.down = [key("S"), key("DOWN")];
    this.gamepad = input.gamepad;
  }

  /**
   * The frame's movement direction, length clamped to 1.
   *
   * Returns a vector owned by this instance — read it, do not keep it. Callers
   * run every frame and there is no reason to allocate for them.
   */
  getMoveVector(): Phaser.Math.Vector2 {
    const v = this.move.set(
      axis(this.left, this.right),
      axis(this.up, this.down),
    );
    // Godot's Input.get_vector normalises, so diagonals are not faster.
    if (v.length() > 1) v.normalize();

    const pad = this.gamepad?.getPad(0);
    if (pad !== undefined) {
      const stick = pad.leftStick;
      if (stick.length() > Controls.STICK_DEADZONE) v.add(stick);
    }

    v.add(this.touchVector);
    return v.limit(1);
  }
}

/** The two bindings for one direction — WASD and the matching arrow. */
type Keys = readonly [Phaser.Input.Keyboard.Key, Phaser.Input.Keyboard.Key];

function axis(negative: Keys, positive: Keys): number {
  const held = (keys: Keys): number => (keys.some((k) => k.isDown) ? 1 : 0);
  return held(positive) - held(negative);
}
