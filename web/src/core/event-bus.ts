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
 */
export interface GameEventMap {
  healthChanged: [current: number, maximum: number];
  playerDied: [];
  xpChanged: [current: number, needed: number, level: number];
  leveledUp: [choices: readonly Upgrade[]];
  runEnded: [outcome: RunOutcome];
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
