import Phaser from "phaser";
import type { Controls } from "../core/controls";
import type { GameBus } from "../core/event-bus";
import { rectTexture } from "../core/textures";
import { Player } from "../entities/player";
import { Progression } from "../systems/progression";
import { Run } from "../systems/run";
import { VirtualJoystick } from "../ui/virtual-joystick";

/**
 * The always-running UI scene from issue #7, reduced by issue #8 to exactly one
 * job: the HUD. The three modal screens are DOM, on the `Overlay`.
 *
 * It runs in parallel with `GameScene` and survives `scene.pause()`, which is
 * why the readouts stay legible behind the level-up modal. Its camera never
 * moves, so `main.gd`'s HUD coordinates are literal here — the only thing that
 * needed rewriting is Godot's anchors, which resolve to plain numbers against a
 * fixed 1280x720 box.
 *
 * **It never touches `GameScene`.** Everything it draws arrives on the bus, so
 * a HUD that renders a stale value is a missing `emit`, not a missing poll.
 *
 * Slice 4 adds the one thing here that is not a readout: the virtual joystick.
 * It belongs to this scene for the same reason the HUD does — it has to keep
 * receiving input while `GameScene` is paused, or a press during a modal would
 * be swallowed rather than ignored.
 */
export class HudScene extends Phaser.Scene {
  static readonly KEY = "HudScene";

  /** `main.gd`'s HP bar: 260x22 at (20, 18), modulate Color(1, 0.5, 0.5). */
  private static readonly HP = {
    x: 20,
    y: 18,
    width: 260,
    height: 22,
    color: 0xff8080,
  } as const;

  /** The XP bar: 260x12 at (20, 46), modulate Color(0.4, 1, 0.6). */
  private static readonly XP = {
    x: 20,
    y: 46,
    width: 260,
    height: 12,
    color: 0x66ff99,
  } as const;

  private bus!: GameBus;
  private controls!: Controls;
  private joystick!: VirtualJoystick;
  private hpFill!: Phaser.GameObjects.Sprite;
  private xpFill!: Phaser.GameObjects.Sprite;
  private levelLabel!: Phaser.GameObjects.Text;
  private timerLabel!: Phaser.GameObjects.Text;
  private killsLabel!: Phaser.GameObjects.Text;

  constructor() {
    super({ key: HudScene.KEY, active: false });
  }

  init(data: { bus: GameBus; controls: Controls }): void {
    this.bus = data.bus;
    this.controls = data.controls;
  }

  create(): void {
    this.hpFill = this.bar(HudScene.HP);
    this.xpFill = this.bar(HudScene.XP);

    this.levelLabel = this.label("LVL 1", 20, 62);
    this.timerLabel = this.label(formatClock(Run.LENGTH), 640 - 40, 14, 32);
    this.killsLabel = this.label("Kills: 0", 1280 - 140, 18);

    /* The starting values are written here rather than waited for. `Player` and
       `Progression` emit their opening state from their constructors, which run
       inside `GameScene.create` — and `scene.launch` is queued, so this scene's
       `create` is always a step behind them. Godot has the same gap and lands on
       the same answer: `_build_ui` hardcodes "LVL 1" / "5:00" / "Kills: 0". */
    this.setBar(this.hpFill, HudScene.HP, Player.MAX_HP, Player.MAX_HP);
    this.setBar(this.xpFill, HudScene.XP, 0, Progression.FIRST_LEVEL_XP);

    this.bus.on("healthChanged", (current, maximum) => {
      this.setBar(this.hpFill, HudScene.HP, current, maximum);
    });
    this.bus.on("xpChanged", (current, needed, level) => {
      this.setBar(this.xpFill, HudScene.XP, current, needed);
      this.levelLabel.setText(`LVL ${level}`);
    });
    this.bus.on("timeChanged", (secondsLeft) => {
      this.timerLabel.setText(formatClock(secondsLeft));
    });
    this.bus.on("killsChanged", (kills) => {
      this.killsLabel.setText(`Kills: ${kills}`);
    });

    /* Last, so it draws over the readouts — `main.gd` adds it to `_ui` last for
       the same reason. */
    this.joystick = new VirtualJoystick(this, this.controls);
    this.bus.on("inputEnabled", (enabled) => this.joystick.setEnabled(enabled));
  }

  /**
   * A track and a fill, both the same baked white rectangle (issue #4). Returns
   * the fill, which is the only half that ever changes.
   *
   * Godot's `ProgressBar` draws its track from the default theme, which is not
   * in this repo — the dark translucent track below is the one piece of the HUD
   * that is an approximation rather than a port, and it is on the tuning list.
   */
  private bar(spec: BarSpec): Phaser.GameObjects.Sprite {
    const texture = rectTexture(this, spec.width, spec.height);
    this.add
      .sprite(spec.x, spec.y, texture)
      .setOrigin(0, 0)
      .setTint(0x000000)
      .setAlpha(0.55);
    return this.add
      .sprite(spec.x, spec.y, texture)
      .setOrigin(0, 0)
      .setTint(spec.color);
  }

  private setBar(
    fill: Phaser.GameObjects.Sprite,
    spec: BarSpec,
    current: number,
    maximum: number,
  ): void {
    const fraction =
      maximum > 0 ? Phaser.Math.Clamp(current / maximum, 0, 1) : 0;
    fill.setDisplaySize(spec.width * fraction, spec.height);
    // A zero-width sprite still renders a hairline; hide it instead.
    fill.setVisible(fraction > 0);
  }

  /**
   * `_make_label`: white text with a 4px black outline. Godot's `outline_size`
   * and Phaser's `strokeThickness` are both the full outline width, so the 4
   * ports across verbatim.
   */
  private label(
    text: string,
    x: number,
    y: number,
    fontSize = 16,
  ): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, {
      fontFamily: "system-ui, sans-serif",
      fontSize: `${fontSize}px`,
      color: "#ffffff",
      stroke: "#000000",
      strokeThickness: 4,
    });
  }
}

interface BarSpec {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly color: number;
}

/** `"%d:%02d" % [t / 60, t % 60]`. */
function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}
