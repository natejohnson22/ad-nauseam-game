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
import { Run } from "../systems/run";
import { SpawnDirector } from "../systems/spawn-director";
import { WeaponManager } from "../systems/weapon-manager";
import { LevelUpModal } from "../ui/level-up-modal";
import { Overlay } from "../ui/overlay";

/**
 * The composition root — issue #7. Thin by design: it creates the systems, owns
 * the pools and the camera, and its `update` does nothing but tick the systems
 * in a fixed order. It also stands in for `main.gd`'s wiring, which is why the
 * two small sinks (`onEnemyDied`, `onEngagementCollected`) live here.
 *
 * Slice 2 closes the pick-under-pressure loop: kills drop engagement, engagement
 * levels you up, the scene pauses, and the pick lands on the player or the
 * weapon. The HUD, the run clock, and the win/lose screens are slice 3 — `Run`
 * ticks underneath all of them already, it just has nothing to draw itself on.
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

    this.bus.on("leveledUp", (choices) => this.openLevelUp(choices));
    this.bus.on("playerDied", () => this.run.end("lost"));
    // Slice 3 replaces this with the real end screens. Until then, ending just
    // stops the escalation so the recycling is observable at rest.
    this.bus.on("runEnded", () => this.director.stop());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.destroy();
      this.overlay.destroy();
    });

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
}
