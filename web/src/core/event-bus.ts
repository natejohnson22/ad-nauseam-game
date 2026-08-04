import Phaser from "phaser";

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

/** Slice 2 adds `xpChanged` and `leveledUp`. */
export interface GameEventMap {
  healthChanged: [current: number, maximum: number];
  playerDied: [];
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
