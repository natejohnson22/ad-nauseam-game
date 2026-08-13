/**
 * The arena floor — a tiling fantasy-ground plane under the unbounded
 * camera-follow playfield (issue #63, decided in #61).
 *
 * `GameScene` follows the player with no `setBounds`, so the field scrolls
 * arbitrarily far in every direction. Rather than a finite tilemap (which would
 * need chunk-streaming) or a large static layer (which breaks once the player
 * outruns it), this is a single viewport-sized `TileSprite` pinned to the
 * camera (`scrollFactor 0`) whose `tilePosition` tracks the camera scroll each
 * frame — the classic infinite-scroll-ground trick. One draw call, no seams, no
 * streaming, genuinely infinite.
 *
 * The texture is a pre-composed **seamless super-tile** (1024×1024, a 64×64 of
 * the pack's 16px grass fill) rather than a single tile, so the repeat reads
 * as a field instead of an obvious grid. It sits at depth -10, below every
 * entity (the player logic centre is depth 0) and above the scene's clear
 * colour. World-dressing and parallax are deferred (issue #61).
 *
 * Follows the #60 dual-path art contract: a full-colour sheet on the art path
 * (no identity tint), loaded via this module's own `preload`, exactly as
 * `player-sprite` does.
 *
 * Asset: `assets/ground.png` is a composed bed from CraftPix "Grassland Top
 * Down Tileset Pixel Art" (product 189510) — the #87 / #88 pick. Flat
 * yellow-green fill, sparse Details.png tufts/pebbles/flowers, and a few
 * wrap-stamped trees and bushes from Objects_separated.
 * Licence: https://craftpix.net/file-licenses/ (premium/paid) — commercial-OK,
 * no attribution required, no reselling loose source, no AI-training. Same
 * house as the swordsman. Wiring unchanged from #63.
 */
import Phaser from "phaser";
import groundUrl from "./assets/ground.png";

const GROUND = "arena_ground";

export class ArenaBackground {
  private readonly tile: Phaser.GameObjects.TileSprite;
  private readonly camera: Phaser.Cameras.Scene2D.Camera;

  /** Load the ground texture. Call from a scene `preload`. */
  static preload(scene: Phaser.Scene): void {
    scene.load.image(GROUND, groundUrl);
  }

  constructor(scene: Phaser.Scene) {
    this.camera = scene.cameras.main;
    // Sized to the camera, origin at the top-left, pinned to the view so it
    // covers the viewport whatever the player does. `tilePosition` (below) is
    // what actually moves, so the sprite itself never has to.
    this.tile = scene.add
      .tileSprite(0, 0, this.camera.width, this.camera.height, GROUND)
      .setOrigin(0, 0)
      .setScrollFactor(0)
      // Below every entity (player logic centre is depth 0), above the clear
      // colour — the floor the whole world stands on.
      .setDepth(-10);
  }

  /**
   * March the texture offset with the camera so the ground reads as
   * world-locked: as the camera scrolls +x, the tiles slide the same amount,
   * so a given patch of floor stays put in world space. Call each frame after
   * the camera has followed the player.
   */
  tick(): void {
    this.tile.tilePositionX = this.camera.scrollX;
    this.tile.tilePositionY = this.camera.scrollY;
  }
}
