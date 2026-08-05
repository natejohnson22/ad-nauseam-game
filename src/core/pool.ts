import Phaser from "phaser";

/**
 * Object pooling — issue #7's "nothing is ever destroyed".
 *
 * `queue_free()` becomes `killAndHide()`, so every field a Godot `_ready()` or
 * `setup()` used to initialise on a fresh node must be reset explicitly in
 * `spawn()`: a recycled sprite remembers its last life. That reset is the one
 * piece of genuinely new code in the port, and the classic pooling bug.
 *
 * Sized by nothing — the pool grows to its high-water mark and stops
 * allocating, which is the behaviour the late-run ramp (~13 spawns/sec) wants.
 */

export interface Releasable {
  release(): void;
}

/** What a pooled sprite needs from whatever pool it came out of. */
export interface PoolOwner {
  release(entity: PooledSprite): void;
}

export abstract class PooledSprite
  extends Phaser.GameObjects.Sprite
  implements Releasable
{
  /** Assigned by `Pool.obtain`; a pooled sprite is never constructed loose. */
  declare owner: PoolOwner;

  /** Return this sprite to its pool. The port's `queue_free()`. */
  release(): void {
    this.owner.release(this);
  }
}

export class Pool<T extends PooledSprite> implements PoolOwner {
  private readonly group: Phaser.GameObjects.Group;

  /**
   * Depth is *not* set here: `Group#setDepth` only touches children that
   * already exist, and this pool creates them lazily. Each entity sets its own
   * depth in its constructor instead.
   */
  constructor(scene: Phaser.Scene, classType: new (scene: Phaser.Scene) => T) {
    this.group = scene.add.group({ classType, runChildUpdate: false });
  }

  /**
   * A recycled-or-new sprite, already re-activated. Callers still have to reset
   * every stateful field — see the class comment.
   */
  obtain(): T {
    const entity = this.group.get() as T;
    entity.owner = this;
    entity.setActive(true).setVisible(true);
    return entity;
  }

  release(entity: PooledSprite): void {
    this.group.killAndHide(entity);
  }

  /**
   * Iterate the live sprites. Snapshots first, so a sprite released mid-tick
   * cannot shuffle the array out from under the loop.
   */
  each(fn: (entity: T) => void): void {
    for (const child of this.group.getChildren().slice()) {
      const entity = child as T;
      if (entity.active) fn(entity);
    }
  }

  /** Live sprites, for queries that scan rather than tick. */
  active(): T[] {
    return this.group.getMatching("active", true) as T[];
  }
}
