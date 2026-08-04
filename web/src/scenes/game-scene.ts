import Phaser from "phaser";
import { WEAPONS } from "../content/weapons";
import { Controls } from "../core/controls";
import { EventBus, type GameBus } from "../core/event-bus";
import { Pool } from "../core/pool";
import { Enemy } from "../entities/enemy";
import { Player } from "../entities/player";
import { SwordSwing } from "../entities/sword-swing";
import { SpawnDirector } from "../systems/spawn-director";
import { WeaponManager } from "../systems/weapon-manager";

/**
 * The composition root — issue #7. Thin by design: it creates the systems, owns
 * the pools and the camera, and its `update` does nothing but tick the systems
 * in a fixed order. `main.gd`'s other two jobs (run orchestration, UI) are not
 * here and do not arrive until slices 2 and 3.
 *
 * Slice 1 has no `Run`, no HUD scene, and no modals, so the pause story is not
 * exercised yet — the only thing standing in for `_run_over` is the director
 * stopping when the player dies.
 */
export class GameScene extends Phaser.Scene {
  static readonly KEY = "GameScene";

  private bus!: GameBus;
  private controls!: Controls;
  private player!: Player;
  private enemies!: Pool<Enemy>;
  private swings!: Pool<SwordSwing>;
  private director!: SpawnDirector;
  private weapons!: WeaponManager;

  constructor() {
    super(GameScene.KEY);
  }

  create(): void {
    // One bus per run: a bus that outlives the run leaks listeners across the
    // restart boundary into the next one.
    this.bus = new EventBus();
    this.controls = new Controls(this.input);

    this.enemies = new Pool(this, Enemy);
    this.swings = new Pool(this, SwordSwing);

    this.player = new Player(this, 0, 0, this.controls, this.bus);
    this.cameras.main.startFollow(this.player, false);

    this.weapons = new WeaponManager(
      this.player,
      this.controls,
      this.enemies,
      this.swings,
    );
    this.weapons.addWeapon("adblock_sword", WEAPONS.adblock_sword);

    this.director = new SpawnDirector(this.enemies, this.player);

    // Slice 3 replaces this with the real lose screen. Until then, death just
    // stops the escalation so the recycling is observable at rest.
    this.bus.on("playerDied", () => this.director.stop());

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.bus.destroy());

    this.director.start();
  }

  override update(_time: number, delta: number): void {
    // Clamped: one frame with a multi-second delta — a resumed tab, or a
    // level-up modal in slice 2 — would teleport every enemy onto the player.
    const dt = Math.min(delta, 100) / 1000;

    this.player.tick(dt);
    this.director.tick(dt);
    this.enemies.each((enemy) => enemy.tick(dt));
    this.weapons.tick(dt);
    this.swings.each((swing) => swing.tick(dt));
  }
}
