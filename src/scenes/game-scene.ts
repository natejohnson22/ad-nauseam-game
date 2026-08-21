import Phaser from "phaser";
import type { EnemyBehavior } from "../content/types";
import type { Upgrade } from "../content/upgrades";
import { UPGRADE_POOL } from "../content/upgrades";
import { WEAPONS } from "../content/weapons";
import { ENEMIES } from "../content/enemies";
import { Controls } from "../core/controls";
import { EventBus, type GameBus } from "../core/event-bus";
import { Pool } from "../core/pool";
import { DevHarness } from "../dev/dev-harness";
import { ArenaBackground } from "../entities/arena-background";
import { Boomerang } from "../entities/boomerang";
import { DamageNumber } from "../entities/damage-number";
import { Engagement } from "../entities/engagement";
import { Enemy } from "../entities/enemy";
import { preloadEnemyArt } from "../entities/enemy-sprite";
import { EnemyProjectile } from "../entities/enemy-projectile";
import { Impact } from "../entities/impact";
import { Orbiter } from "../entities/orbiter";
import { Player } from "../entities/player";
import { PlayerSprite } from "../entities/player-sprite";
import { SpawnTelegraph } from "../entities/spawn-telegraph";
import { SwordSwing } from "../entities/sword-swing";
import { Progression } from "../systems/progression";
import { Run, type RunOutcome } from "../systems/run";
import { SpawnDirector } from "../systems/spawn-director";
import { WeaponManager } from "../systems/weapon-manager";
import { ads, monetizationSupported } from "../services/monetization";
import { AdBreak } from "../ui/ad-break";
import { LevelUpModal } from "../ui/level-up-modal";
import { Overlay } from "../ui/overlay";
import { ReviveOffer } from "../ui/revive-offer";
import { WinScreen } from "../ui/win-screen";
import { HudScene } from "./hud-scene";

/**
 * The composition root — issue #7. Thin by design: it creates the systems, owns
 * the pools and the camera, and its `update` does nothing but tick the systems
 * in a fixed order. It also stands in for `main.gd`'s wiring, which is why the
 * three small sinks (`onEnemyDamaged`, `onEnemyDied`, `onEngagementCollected`)
 * live here.
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
  /** The orange dots an event telegraphs behind before its enemies land (#34). */
  private spawnTelegraphs!: Pool<SpawnTelegraph>;
  private enemyShots!: Pool<EnemyProjectile>;
  private swings!: Pool<SwordSwing>;
  private boomerangs!: Pool<Boomerang>;
  private orbiters!: Pool<Orbiter>;
  private drops!: Pool<Engagement>;
  private damageNumbers!: Pool<DamageNumber>;
  /** One-shot explosion bursts where shots land (issue #66). */
  private impacts!: Pool<Impact>;
  private director!: SpawnDirector;
  private weapons!: WeaponManager;
  private progression!: Progression;
  private run!: Run;
  private overlay!: Overlay;
  private levelUpModal!: LevelUpModal;
  private winScreen!: WinScreen;
  private adBreak!: AdBreak;
  private reviveOffer!: ReviveOffer;
  /**
   * Whether the boss bar was showing last frame, so its hide (#51) fires exactly
   * once when the boss leaves rather than every frame after.
   */
  private bossShown = false;
  /**
   * The playtest harness (issue #30) — `null` in a production build, where the
   * branch that builds it is compiled away along with the module itself.
   */
  private dev: DevHarness | null = null;

  /**
   * The User's on-screen body (issue #52) — the pixel swordsman that follows the
   * invisible `Player`. `undefined` only under the `?sprite=circle` debug flag,
   * where the placeholder circle + pip stand in instead.
   */
  private playerSprite: PlayerSprite | undefined;

  /** The tiling fantasy-arena floor under the unbounded playfield (issue #63). */
  private background!: ArenaBackground;

  /**
   * The death beat (issue #52): true for the ~0.8s between the killing blow and
   * the revive offer, while the swordsman's collapse plays. The world is frozen
   * (`update` bails on it) but the scene keeps running, so the death clip — and
   * only it — animates before CONTINUE (or "GAME OVER" on web) covers the arena.
   * Reset in `create` because Phaser reuses this Scene instance across a restart,
   * so a field left `true` would freeze the *next* run.
   */
  private dying = false;
  /** How long the collapse gets before the revive offer lands — see `dying`. */
  private static readonly DEATH_BEAT_MS = 800;
  /** Scene timer for the death beat. Cancelled if a win/timeout latches first. */
  private deathBeat: Phaser.Time.TimerEvent | undefined;
  /**
   * A level-up that fired on the death frame (or that death interrupted).
   * Held across the revive offer so a granted continue still gets the pick
   * instead of dropping it, and so `openLevelUp` does not pause the scene
   * out from under the death-beat timer.
   */
  private pendingLevelUp: readonly Upgrade[] | null = null;

  constructor() {
    super(GameScene.KEY);
  }

  /**
   * DEV-only escape hatch: `?sprite=circle` keeps the old placeholder circle +
   * facing pip instead of the swordsman, for eyeballing the logic centre and
   * hitbox against the art. Compiled away in production, where the swordsman is
   * the only player art (issue #52).
   */
  private useDebugCircle(): boolean {
    return (
      import.meta.env.DEV &&
      new URLSearchParams(location.search).get("sprite") === "circle"
    );
  }

  preload(): void {
    // The arena floor is always loaded — it sits under the debug circle too.
    ArenaBackground.preload(this);
    // Load the swordsman sheets before `create`, unless the debug circle is on.
    if (!this.useDebugCircle()) PlayerSprite.preload(this);
    // The DNT Boomerang's carved-wood art and the Firewall's fiery-ring orb,
    // both on the #60 art path (issue #65).
    Boomerang.preload(this);
    Orbiter.preload(this);
    // Enemy bodies with real art (Popup Grunt slime today, issue #67). The
    // circle roster loads nothing here — the registry only holds art archetypes.
    preloadEnemyArt(this);
    // The explosion-burst strip (issue #66). Ad-side projectiles bake from the
    // UI-construct kit on first spawn — no preload, no assets (#86).
    Impact.preload(this);
  }

  create(): void {
    // Phaser reuses this Scene instance across a restart, so per-run flags must
    // be re-seeded here rather than trusted to their field initialisers.
    this.dying = false;
    this.deathBeat = undefined;
    this.pendingLevelUp = null;

    // One bus per run: a bus that outlives the run leaks listeners across the
    // restart boundary into the next one.
    this.bus = new EventBus();
    this.controls = new Controls(this.input);
    this.run = new Run(this.bus);

    this.enemies = new Pool(this, Enemy);
    this.spawnTelegraphs = new Pool(this, SpawnTelegraph);
    this.enemyShots = new Pool(this, EnemyProjectile);
    this.swings = new Pool(this, SwordSwing);
    this.boomerangs = new Pool(this, Boomerang);
    this.orbiters = new Pool(this, Orbiter);
    this.drops = new Pool(this, Engagement);
    this.damageNumbers = new Pool(this, DamageNumber);
    this.impacts = new Pool(this, Impact);

    // A landed shot dresses itself with a burst here, decoupled from the
    // projectile that fired it (issue #66).
    this.bus.on("impact", (x, y) => this.impacts.obtain().spawn(x, y));

    this.player = new Player(this, 0, 0, this.controls, this.bus);
    this.cameras.main.startFollow(this.player, false);

    // The arena floor, under everything (depth -10). Built after the camera it
    // reads, before the entities it sits beneath (issue #63).
    this.background = new ArenaBackground(this);

    // The swordsman is the player's body (issue #52): hide the circle + pip and
    // let the follower sprite stand in. The `?sprite=circle` debug flag skips
    // this and leaves the placeholder art showing.
    if (!this.useDebugCircle()) {
      this.player.hideDefaultArt();
      this.playerSprite = new PlayerSprite(this, 0, 0, this.bus);
    }

    this.weapons = new WeaponManager(
      this.player,
      this.controls,
      this.enemies,
      this.swings,
      this.boomerangs,
      this.orbiters,
      this.bus,
    );
    // The sword alone. The boomerang used to be equipped on this next line and
    // is now a level-up pick gated to Slow build (issue #32), which is the whole
    // of the PDF's "single weak melee weapon" opening — the sword's own numbers
    // did not move, and losing half the opening's damage output *is* the nerf.
    this.weapons.addWeapon("adblock_sword", WEAPONS.adblock_sword);

    this.progression = new Progression(
      this.player,
      this.weapons,
      // `Run` is the clock the phase gates read. The same one the director
      // reads, so a gate and a spawn table can never disagree about the phase —
      // and the playtest harness's seek, being a plain `run.tick(startAt)`,
      // moves the gates with it for free.
      this.run,
      UPGRADE_POOL,
      this.bus,
    );

    // The sink is the whole of what the director knows about the world
    // (issue #29): it decides which archetype lands where, and this closure —
    // the only place that holds the pool, the player, and the damage sink at
    // once — turns that into an actual enemy.
    this.director = new SpawnDirector(
      {
        spawn: (data, x, y) =>
          this.enemies.obtain().spawn(data, x, y, this.player, this),
        // An event's telegraph (issue #34): show the marker, then spawn the
        // enemy the ordinary way when it lands. The scene owns both pools, so
        // it is the one place that can hold the marker and the spawn together.
        telegraph: (data, x, y, delay) =>
          this.spawnTelegraphs
            .obtain()
            .spawn(x, y, delay, () =>
              this.enemies.obtain().spawn(data, x, y, this.player, this),
            ),
        // Compared by reference, which is exactly right: `ENEMIES` records are
        // module singletons and `spawn` hands the same object to the enemy, so
        // identity *is* archetype identity — no id has to be carried around to
        // ask this question (issue #31).
        liveCount: (data) =>
          this.enemies.active().filter((e) => e.archetype === data).length,
      },
      this.player,
    );

    this.overlay = new Overlay(this.game);
    this.levelUpModal = new LevelUpModal(this.overlay);
    this.winScreen = new WinScreen(this.overlay);
    this.adBreak = new AdBreak(this.overlay);
    this.reviveOffer = new ReviveOffer(this.overlay);

    this.bus.on("leveledUp", (choices) => this.openLevelUp(choices));
    this.bus.on("playerDied", () => this.handlePlayerDeath());
    this.bus.on("runEnded", (outcome) => void this.endRun(outcome));

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.bus.destroy();
      this.levelUpModal.hide();
      this.winScreen.hide();
      // Also stops the countdown's interval, which nothing else would.
      this.adBreak.hide();
      this.reviveOffer.hide();
      this.overlay.destroy();
      this.scene.stop(HudScene.KEY);
    });

    // Queued, so the HUD's `create` runs a step after this one — see the note
    // there about why it seeds its own opening values.
    this.scene.launch(HudScene.KEY, { bus: this.bus, controls: this.controls });
    this.director.start();

    /* Issue #30. `import.meta.env.DEV` is a literal after Vite's substitution,
       so a production build drops this branch and, with it, the only import of
       the harness — the same trick `main.ts` uses for its console handle. The
       harness reaches the run through the four things named here and nothing
       else; the seek it performs is an ordinary `run.tick`. */
    if (import.meta.env.DEV) {
      this.dev = DevHarness.attach(this, {
        run: this.run,
        director: this.director,
        player: this.player,
        liveEnemies: () => this.enemies.active().length,
        grantPicks: (n) => this.grantDevPicks(n),
      });
    }
  }

  override update(_time: number, delta: number): void {
    // March the floor with the camera every frame, even during the death beat —
    // it's the one thing under the frozen world that should still track if the
    // camera settles (issue #63). A frame of lag behind the camera is invisible
    // on a repeating ground.
    this.background.tick();

    // The death beat (issue #52): hold the whole simulation still so the only
    // thing moving is the swordsman's collapse, which animates off the sprite's
    // own `preUpdate` and needs nothing from here. The scene is still running
    // (not yet paused), so the timer that ends the beat keeps counting.
    if (this.dying) return;

    // Clamped: one frame with a multi-second delta — a resumed tab, or the
    // level-up modal below — would teleport every enemy onto the player.
    const frame = Math.min(delta, 100) / 1000;
    // The harness scales the frame *after* the clamp, so its 4x is four times a
    // normal frame rather than four times a stall. It is also where a seek
    // lands — see `DevHarness.frame`. `null` in production: `dt` is `frame`.
    const dt = this.dev?.frame(frame) ?? frame;

    this.run.tick(dt);
    this.player.tick(dt);
    // Mirror the swordsman onto the player after the player has moved, so it
    // reads this frame's position and move vector (issue #52).
    this.playerSprite?.tick(
      this.player.x,
      this.player.y,
      this.controls.getMoveVector(),
    );
    // After `run.tick`, so the director reads this frame's elapsed time.
    this.director.tick(dt, this.run.elapsed);
    // Also after `run.tick`: the level-up budget's floor and its phase turnover
    // read the same freshly-advanced clock (issue #35).
    this.progression.tick();
    // After the director, so a marker queued this frame counts down from its
    // full delay; when one lands it spawns an enemy the loop below then ticks,
    // exactly as an ordinary spawn is (issue #34).
    this.spawnTelegraphs.each((telegraph) => telegraph.tick(dt));
    this.enemies.each((enemy) => enemy.tick(dt));
    // Feed the boss bar (#51). Identity is archetype identity, the same check
    // `onEnemyDied` and `liveCount` make, so the boss needs no flag carried
    // around. Emit its HP while it lives; the frame after it leaves, hide once.
    const boss = this.enemies
      .active()
      .find((e) => e.archetype === ENEMIES.the_algorithm);
    if (boss) {
      this.bus.emit("bossHealthChanged", Math.max(0, boss.hp), boss.archetype.maxHp);
      this.bossShown = true;
    } else if (this.bossShown) {
      this.bus.emit("bossHealthChanged", 0, 0);
      this.bossShown = false;
    }
    // After the enemies that fire them, so a shot spawned this frame does not
    // also travel this frame — it would otherwise leave the muzzle already a
    // step out, which is exactly the distance the telegraph promised.
    this.enemyShots.each((shot) => shot.tick(dt));
    this.weapons.tick(dt);
    this.swings.each((swing) => swing.tick(dt));
    this.boomerangs.each((boomerang) => boomerang.tick(dt));
    this.drops.each((drop) => drop.tick(dt));
    this.damageNumbers.each((number) => number.tick(dt));
  }

  /**
   * Every weapon hit lands here (issue #25): bank it on the run, and pop the
   * number above the enemy that took it.
   *
   * Guarded on `isOver` for the same reason `onEngagementCollected` is — a
   * boomerang still in flight when the clock expires must not move the final
   * tally the win screen is about to show. `Run.recordDamage` guards itself
   * too; the floater is what needs the guard here, since a number rising over
   * the frozen world behind the win screen would be a ghost.
   */
  onEnemyDamaged(enemy: Enemy, amount: number): void {
    if (this.run.isOver) return;
    this.run.recordDamage(amount);
    this.damageNumbers
      .obtain()
      .spawn(amount, enemy.x, enemy.y, enemy.archetype.radius);
  }

  /**
   * A standoff enemy's wind-up finished — put a projectile in the world
   * (issue #31).
   *
   * The third of the small sinks that live here for the same reason as the
   * other two: this is the only object that holds both the pool and the player,
   * and an enemy that could reach a pool itself would be a second place
   * spawning happens.
   */
  onEnemyFired(
    enemy: Enemy,
    behavior: Extract<EnemyBehavior, { kind: "ranged_standoff" }>,
    dir: Phaser.Math.Vector2,
  ): void {
    this.enemyShots
      .obtain()
      .spawn(behavior, enemy.x, enemy.y, dir, this.player, this.bus);
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
    // Killing The Algorithm is the win (issue #37). Identity is archetype
    // identity here — the same reference check `liveCount` makes — so the boss
    // needs no id or flag carried around. The dropped engagement above is
    // deliberately still spawned: the tally is banked before the run latches
    // over, and it does no harm on the frame the world stops.
    if (enemy.archetype === ENEMIES.the_algorithm) this.run.defeatBoss();
  }

  onEngagementCollected(value: number): boolean {
    // Refusing leaves the gem: `Engagement.tick` only `release()`s on true.
    // Dead / dying is the continue case — vacuuming on the killing-blow
    // frame would emit `leveledUp` after `playerDied` has already queued
    // the revive timer. `isOver` is the timeout/win case, same rule.
    if (this.run.isOver || this.dying || !this.player.isAlive) return false;
    this.progression.addEngagement(value);
    return true;
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
   *
   * `inputEnabled` is `_joystick.reset()`: a thumb held down when the level-up
   * fires must not leave the player drifting on resume (slice 4).
   */
  private openLevelUp(choices: readonly Upgrade[]): void {
    if (choices.length === 0 || this.run.isOver) return;
    // Stash even when dying: a floor-pick from `progression.tick` can land
    // on the same frame as the killing blow, *before* `dying` is set. Death
    // hides the modal; a granted revive reopens it from this stash.
    this.pendingLevelUp = choices;
    if (this.dying) return;
    // Already paused on the revive overlay — don't pause again (Phaser warns)
    // when a stashed pick is handed back from `reviveAndResume`.
    if (!this.scene.isPaused()) this.scene.pause();
    this.bus.emit("inputEnabled", false);
    this.levelUpModal.show(choices, (upgrade) => {
      this.pendingLevelUp = null;
      this.progression.applyUpgrade(upgrade);
      this.levelUpModal.hide();
      this.bus.emit("inputEnabled", true);
      this.scene.resume();
    });
  }

  /**
   * Grant `n` level-ups back to back — the dev seek-the-build feature (issue
   * #50), called by the harness once, right after a seek. A `?at=struggle` seek
   * otherwise drops Nate at level 1 with the sword alone, which measures spawn
   * pressure and not the difficulty of the ~8-pick build the phase is tuned
   * around; these modals let him assemble that build by hand before playing.
   *
   * The picks are rolled one at a time in `showNextDevPick`, each after the
   * previous is applied, so a weapon picked in one modal unlocks its upgrades
   * and stops re-offering in the next — the same sequence a played run walks.
   */
  private pendingDevPicks = 0;

  private grantDevPicks(n: number): void {
    this.pendingDevPicks = n;
    this.showNextDevPick();
  }

  /**
   * Show the next queued dev pick, or resume once the queue drains. The scene
   * is paused across the whole run of modals — only the last pick resumes it,
   * exactly as a single `openLevelUp` does — so the seeked world stays frozen
   * while Nate builds. An empty roll (the pool exhausted) ends the run early
   * rather than showing an empty modal.
   */
  private showNextDevPick(): void {
    if (this.pendingDevPicks <= 0 || this.run.isOver || this.dying) return;
    this.pendingDevPicks -= 1;

    const choices = this.progression.grantPick();
    if (choices.length === 0) {
      this.pendingDevPicks = 0;
      return;
    }

    this.scene.pause();
    this.bus.emit("inputEnabled", false);
    this.levelUpModal.show(choices, (upgrade) => {
      this.progression.applyUpgrade(upgrade);
      this.levelUpModal.hide();
      if (this.pendingDevPicks > 0) {
        this.showNextDevPick();
      } else {
        this.bus.emit("inputEnabled", true);
        this.scene.resume();
      }
    });
  }

  /**
   * The killing blow, before the run latches over: hold the death beat (issue
   * #52), then offer a revive instead of ending things outright.
   *
   * `Run.end("died")` — the actual latch — is deliberately deferred out of
   * this path entirely. It only runs once the offer is declined or
   * unavailable (`resolveDeath`), so a granted revive never touches `Run` at
   * all: the clock, kill count, and damage tally simply never stopped being
   * live, because the run was never marked over.
   */
  private handlePlayerDeath(): void {
    // A timeout or boss-kill can latch `endRun` earlier in this same frame
    // (`run.tick` / `onEnemyDied`); leftover contact then still emits
    // `playerDied`. Offering a continue on top of a locked ending — and
    // resuming into a stopped director — is the bug this guard closes.
    if (this.run.isOver || this.dying) return;
    this.dying = true;
    // Drop any live cleave first: a sword swing is a 0.18s flicker, and one
    // caught by the freeze would hang as a green wedge over the collapse for
    // the whole beat. The rest of the world holding still reads as drama; a
    // frozen VFX reads as a bug.
    this.swings.each((swing) => swing.release());
    // A same-frame level-up already paused us and put a pick over the
    // corpse. Hide it (choices live on `pendingLevelUp`) and resume so the
    // collapse and this timer actually run — a paused GameScene clock
    // never fires `delayedCall`.
    this.levelUpModal.hide();
    if (this.scene.isPaused()) this.scene.resume();
    this.deathBeat = this.time.delayedCall(GameScene.DEATH_BEAT_MS, () =>
      this.resolveDeath(),
    );
  }

  /**
   * The death beat has played out — pause and either offer a revive or let
   * the run end. This only gates on monetization having anything to offer
   * at all (the deployed web build does not).
   */
  private resolveDeath(): void {
    this.deathBeat = undefined;
    // Win/timeout may have latched during the beat (boss died on the same
    // frame, timer cancelled too late, etc.). Don't stack CONTINUE on it.
    if (this.run.isOver) return;
    this.scene.pause();
    this.bus.emit("inputEnabled", false);

    if (!monetizationSupported()) {
      this.run.end("died");
      return;
    }

    this.reviveOffer.show(this.run.stats, {
      onRevive: () => this.reviveAndResume(),
      onDecline: () => this.run.end("died"),
    });
  }

  /** The offer paid off — undo the death beat and hand the run back. */
  private reviveAndResume(): void {
    this.reviveOffer.hide();
    this.dying = false;
    this.player.revive();
    // Death may have eaten a same-frame pick; hand it back while we're
    // still paused from `resolveDeath` so combat doesn't leak a frame.
    if (this.pendingLevelUp !== null) {
      this.openLevelUp(this.pendingLevelUp);
      return;
    }
    this.bus.emit("inputEnabled", true);
    this.scene.resume();
  }

  /**
   * Both endings, in `main.gd`'s order: stop the world, then put a screen over
   * it. Stopping the director matters beyond tidiness — the scene is paused, so
   * a wave queued for this frame would otherwise be waiting on the far side of
   * a restart that never happens.
   *
   * `"died"` only ever reaches here through `resolveDeath`, which has already
   * paused the scene while the revive offer was up — pausing again here would
   * warn on an already-paused Phaser scene, so only `"timeout"` still needs it.
   *
   * A loss also gets a real AdMob interstitial first, where monetization is
   * available — the fake ad-break lock only appears where there was no real
   * ad to gate on (the web build, or a failed native init).
   */
  private async endRun(outcome: RunOutcome): Promise<void> {
    this.director.stop();
    // A killing blow later in this frame — or a death beat already ticking —
    // must not open CONTINUE over the real ending.
    this.deathBeat?.remove(false);
    this.deathBeat = undefined;
    this.dying = false;
    this.pendingLevelUp = null;
    // A level-up and the last hit can land on the same frame.
    this.levelUpModal.hide();
    // A declined/unaffordable revive offer is still on screen when "died"
    // lands here — without this it would sit stacked under the ad-break.
    this.reviveOffer.hide();
    this.bus.emit("inputEnabled", false);

    const restart = (): void => this.restart();
    // Two losses, two sets of copy (issue #37): the ad break reads the outcome
    // to tell "you died" from "the boss outlasted you." The win screen is now
    // an actual victory — you killed the thing.
    if (outcome === "won") {
      this.scene.pause();
      this.winScreen.show(this.run.stats, restart);
      return;
    }

    if (outcome === "timeout") this.scene.pause();

    const real = monetizationSupported();
    if (real) await ads.showInterstitial();
    this.adBreak.show(outcome, this.run.stats, restart, { instant: real });
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
