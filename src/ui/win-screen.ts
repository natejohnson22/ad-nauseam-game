import { formatNumber } from "../core/format";
import type { RunStats } from "../systems/run";
import type { Overlay } from "./overlay";

/**
 * "YOU SURVIVED" — the port of `main.gd`'s `_show_win`, reached when the
 * 5-minute clock runs out.
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
    title.textContent = "YOU SURVIVED";

    const summary = document.createElement("p");
    summary.textContent =
      `You outlasted the Swarm. Kills: ${formatNumber(stats.kills)} · ` +
      `Damage: ${formatNumber(stats.damage)}`;

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
