import { formatNumber } from "../core/format";
import type { RunStats } from "../systems/run";
import type { Overlay } from "./overlay";

/**
 * The victory screen — reached by *killing The Algorithm* before 30:00 (issue
 * #37), no longer by outlasting a clock. The copy changed with the win: it now
 * names the kill, because winning is a specific act the player pulled off, not
 * a timer that expired in their favour.
 *
 * DOM per issue #8, on the same overlay as the level-up modal. Its click
 * handler fires with `GameScene` paused, which is what lets Play Again restart
 * the scene that is currently stopped.
 */
export class WinScreen {
  private element: HTMLElement | null = null;

  constructor(private readonly overlay: Overlay) {}

  show(stats: RunStats, onPlayAgain: () => void): void {
    this.hide();

    const modal = document.createElement("div");
    modal.className = "modal win";

    const title = document.createElement("h1");
    title.textContent = "THE ALGORITHM IS DEAD";

    const summary = document.createElement("p");
    summary.textContent =
      `You killed The Algorithm and logged off for good. ` +
      `Kills: ${formatNumber(stats.kills)} · Damage: ${formatNumber(stats.damage)}`;

    const again = document.createElement("button");
    again.className = "action";
    again.type = "button";
    again.textContent = "Play Again";
    again.addEventListener("click", onPlayAgain);

    modal.append(title, summary, again);
    this.overlay.host.appendChild(modal);
    this.element = modal;
    again.focus();
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
  }
}
