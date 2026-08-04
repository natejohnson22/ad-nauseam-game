import Phaser from "phaser";
import type { Upgrade } from "../content/upgrades";
import { UPGRADE_POOL } from "../content/upgrades";
import { WEAPONS } from "../content/weapons";
import { Controls } from "../core/controls";
import { EventBus, type GameBus } from "../core/event-bus";
import { Pool } from "../core/pool";
import { Engagement } from "../entities/engagement";
import { Enemy } from "../entities/enemy";
import { Player } from "../entities/player";
import { SwordSwing } from "../entities/sword-swing";
import { Progression } from "../systems/progression";
import { Run, type RunOutcome } from "../systems/run";
import { SpawnDirector } from "../systems/spawn-director";
import { WeaponManager } from "../systems/weapon-manager";
import { AdBreak } from "../ui/ad-break";
import { LevelUpModal } from "../ui/level-up-modal";
import { Overlay } from "../ui/overlay";
import { WinScreen } from "../ui/win-screen";
import { HudScene } from "./hud-scene";

/**
 * The composition root — issue #7. Thin by design: it creates the systems, owns
 * the pools and the camera, and its `update` does nothing but tick the systems
 * in a fixed order. It also stands in for `main.gd`'s wiring, which is why the
 * two small sinks (`onEnemyDied`, `onEngagementCollected`) live here.
 *
 * Slice 3 closes the run: the parallel `HudScene` draws the readouts, and both
 * endings land on a DOM screen whose button restarts this scene in place —
 * `reload_current_scene()`'s replacement, and the reason `create` builds every
 * per-run object (bus included) rather than reusing anything.
 */
export class GameScene extends Phaser.Scene {
  static readonly KEY = "GameScene";

  private bus!: GameBus;
  private controls!: Controls;
  private player!: Player;
  private enemies!: Pool<Enemy>;
  private swings!: Pool<SwordSwing>;
  private drops!: Pool<Engagement>;
  private director!: SpawnDirector;
  private weapons!: WeaponManager;
  private progression!: Progression;
  private run!: Run;
  private overlay!: Overlay;
  private levelUpModal!: LevelUpModal;
  private winScreen!: WinScreen;
  private adBreak!: AdBreak;

  constructor() {
    super(GameScene.KEY);
  }

  create(): void {
    // One bus per run: a bus that outlives the run leaks listeners across the
    // restart boundary into the next one.
    this.bus = new EventBus();
    this.controls = new Controls(this.input);
    this.run = new Run(this.bus);

    this.enemies = new Pool(this, Enemy);
    this.swings = new Pool(this, SwordSwing);
    this.drops = new Pool(this, Engagement);

    this.player = new Player(this, 0, 0, this.controls, this.bus);
    this.cameras.main.startFollow(this.player, false);

    this.weapons = new WeaponManager(
      this.player,
      this.controls,
      this.enemies,
      this.swings,
    );
    this.weapons.addWeapon("adblock_sword", WEAPONS.adblock_sword);

    this.progression = new Progression(
      this.player,
      this.weapons,
      UPGRADE_POOL,
      this.bus,
    );

    this.director = new SpawnDirector(this.enemies, this.player, this);

    this.overlay = new Overlay(this.game);
    this.levelUpModal = new LevelUpModal(this.overlay);
    this.winScreen = new WinScreen(this.overlay);
    this.adBreak = new AdBreak(this.overlay);

    this.bus.on("leveledUp", (choices) => this.openLevelUp(choices));
    this.bus.on("playerDied", () => this.run.end("lost"));
    this.bus.on("runEnded", (outcome) => this.endRun(outcome));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.destroy();
      this.levelUpModal.hide();
      this.winScreen.hide();
      // Also stops the countdown's interval, which nothing else would.
      this.adBreak.hide();
      this.overlay.destroy();
      this.scene.stop(HudScene.KEY);
    });

    // Queued, so the HUD's `create` runs a step after this one — see the note
    // there about why it seeds its own opening values.
    this.scene.launch(HudScene.KEY, { bus: this.bus });
    this.director.start();
  }

  override update(_time: number, delta: number): void {
    // Clamped: one frame with a multi-second delta — a resumed tab, or the
    // level-up modal below — would teleport every enemy onto the player.
    const dt = Math.min(delta, 100) / 1000;

    this.run.tick(dt);
    this.player.tick(dt);
    this.director.tick(dt);
    this.enemies.each((enemy) => enemy.tick(dt));
    this.weapons.tick(dt);
    this.swings.each((swing) => swing.tick(dt));
    this.drops.each((drop) => drop.tick(dt));
  }

  /** `main.gd`'s `_on_enemy_died`: count the kill, drop the engagement. */
  onEnemyDied(enemy: Enemy): void {
    this.run.recordKill();
    this.drops
      .obtain()
      .spawn(
        enemy.archetype.engagementValue,
        enemy.x,
        enemy.y,
        this.player,
        this,
      );
  }

  onEngagementCollected(value: number): void {
    if (this.run.isOver) return;
    this.progression.addEngagement(value);
  }

  /**
   * Pause and hand over to the modal — issue #7's `scene.pause('GameScene')`,
   * triggered by `GameScene` subscribing to the bus rather than by anything
   * reaching in from outside.
   *
   * Resuming is the modal's click handler, which is a DOM event and therefore
   * still fires with this scene stopped. That is the half of issue #8's
   * decision that matters here: a canvas modal would need something still
   * running to be clickable at all.
   */
  private openLevelUp(choices: readonly Upgrade[]): void {
    if (choices.length === 0 || this.run.isOver) return;
    this.scene.pause();
    this.levelUpModal.show(choices, (upgrade) => {
      this.progression.applyUpgrade(upgrade);
      this.levelUpModal.hide();
      this.scene.resume();
    });
  }

  /**
   * Both endings, in `main.gd`'s order: stop the world, then put a screen over
   * it. Stopping the director matters beyond tidiness — the scene is paused, so
   * a wave queued for this frame would otherwise be waiting on the far side of
   * a restart that never happens.
   */
  private endRun(outcome: RunOutcome): void {
    this.director.stop();
    // A level-up and the last hit can land on the same frame.
    this.levelUpModal.hide();
    this.scene.pause();

    const restart = (): void => this.restart();
    if (outcome === "won") this.winScreen.show(this.run.kills, restart);
    else this.adBreak.show(restart);
  }

  /**
   * `_restart`, without `reload_current_scene()`. Phaser has no direct
   * equivalent, but it does not need one: restarting this scene tears it down
   * through `SHUTDOWN` and runs `create` again, and every per-run object —
   * bus, controls, pools, systems, overlay — is built there. Nothing survives
   * the boundary, which is the property `reload_current_scene()` was bought for.
   *
   * `resume` first because a stopped-while-paused scene starts back up paused.
   */
  private restart(): void {
    this.scene.resume();
    this.scene.restart();
  }
}
