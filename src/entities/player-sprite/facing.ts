/**
 * Four-way facing for the top-down player sprite (issue #52).
 *
 * Kept in its own module — free of Phaser and of the sheet imports the sprite
 * carries — so the one piece of real logic in the avatar (which way does an
 * arbitrary vector point?) is a pure function that unit-tests without a canvas.
 */
export type Facing = "down" | "left" | "right" | "up";

/**
 * Dominant-axis facing from any (x, y) — a move vector, or a swing's aim.
 *
 * Ties (|x| === |y|, the pure diagonals) fall to the vertical axis, matching the
 * prototype: a diagonal reads as up/down rather than left/right.
 */
export const facingXY = (x: number, y: number): Facing =>
  Math.abs(x) > Math.abs(y) ? (x > 0 ? "right" : "left") : y > 0 ? "down" : "up";
