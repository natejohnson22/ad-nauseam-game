import Phaser from "phaser";
import type { Upgrade } from "../content/upgrades";
import type { RunOutcome } from "../systems/run";

/**
 * Tier-2 signals — issue #7.
 *
 * A typed facade over Phaser's own `EventEmitter`, not a hand-rolled one: it
 * inherits `on`/`once`/`off` and adds a declared event map, so a wrong event
 * name or payload is a compile error rather than a listener that silently never
 * fires. Raw Phaser events are stringly-typed, which is the exact bug class
 * TypeScript is here to buy out.
 *
 * Only cross-system *state* rides this bus. Pooled entities call their owner
 * directly — a recycled sprite carrying a stale listener is the pooling bug
 * this split makes unrepresentable.
 *
 * **Lifetime: one bus per run, discarded on restart.** A bus that outlives the
 * run leaks listeners across the boundary into the next one.
 */

/**
 * Godot's four state signals, plus one.
 *
 * `runEnded` has no Godot counterpart — `main.gd` owns `_run_over` as a bare
 * field and calls the screen directly. Splitting `Run` out as its own class
 * (issue #7) is what makes an ending something to *announce*, and it carries
 * the outcome because a win and a death are different screens in slice 3.
 *
 * `timeChanged` and `killsChanged` are the same story one level down. `main.gd`
 * owns both the number and the `Label` and writes one into the other
 * (`_update_timer_label`, `_update_kills`); here the HUD is a *different scene*
 * from the one `Run` ticks in, so the only way it hears about either is the bus.
 * `timeChanged` carries whole seconds, not `timeLeft`, because that is what the
 * readout shows — so it fires 300 times a run rather than every frame.
 *
 * `damageChanged` (issue #25) is the one event that does **not** get that
 * treatment: it carries the running total and fires on every hit, thousands of
 * times a run. `Run` is a plain accumulator with no notion of a refresh rate,
 * so the coalescing lives at the other end — `HudScene` holds the latest value
 * and rewrites its label on a cadence of its own. The alternative, throttling
 * at the source, would bake a redraw budget into the run state. Note this is
 * still the *total* rather than the per-hit amount: individual hits never reach
 * the bus at all, because a pooled enemy reports those straight to its owner.
 *
 * `inputEnabled` is the one event Godot replaces with a direct call: `main.gd`
 * holds the joystick and calls `_joystick.reset()` at each of its three modal
 * openings. Here the joystick is in `HudScene` and the modals are DOM, so that
 * reset crosses two boundaries — hence an announcement rather than a reach-in
 * (slice 4). It carries a boolean rather than being a bare "cancel" because a
 * paused `GameScene` does not stop `HudScene` from hearing pointer events: the
 * stick has to be held off for the modal's duration, not merely emptied once.
 */
export interface GameEventMap {
  healthChanged: [current: number, maximum: number];
  playerDied: [];
  xpChanged: [current: number, needed: number, level: number];
  leveledUp: [choices: readonly Upgrade[]];
  timeChanged: [secondsLeft: number];
  killsChanged: [kills: number];
  damageChanged: [totalDamage: number];
  /**
   * The final boss's remaining HP (#51). Fires every frame the boss is alive so
   * the HUD can render the DPS check's progress; a `maximum` of 0 means the boss
   * is gone and the bar should hide.
   */
  bossHealthChanged: [current: number, maximum: number];
  runEnded: [outcome: RunOutcome];
  inputEnabled: [enabled: boolean];
}

/**
 * Any listener, once the map's per-event payload has been checked at the edge.
 * The `unknown` hop is unavoidable: the emitter underneath is untyped, and a
 * generic payload tuple never converts to a concrete signature directly.
 */
type Listener = (...args: never[]) => void;
const erase = (fn: unknown): Listener => fn as Listener;

export class EventBus<M extends Record<keyof M, readonly unknown[]>> {
  private readonly emitter = new Phaser.Events.EventEmitter();

  on<K extends keyof M & string>(event: K, fn: (...args: M[K]) => void): this {
    this.emitter.on(event, erase(fn));
    return this;
  }

  once<K extends keyof M & string>(event: K, fn: (...args: M[K]) => void): this {
    this.emitter.once(event, erase(fn));
    return this;
  }

  off<K extends keyof M & string>(event: K, fn?: (...args: M[K]) => void): this {
    this.emitter.off(event, fn === undefined ? undefined : erase(fn));
    return this;
  }

  emit<K extends keyof M & string>(event: K, ...args: M[K]): void {
    this.emitter.emit(event, ...args);
  }

  destroy(): void {
    this.emitter.removeAllListeners();
  }
}

export type GameBus = EventBus<GameEventMap>;
