import { formatNumber } from "../core/format";
import { purchases } from "../services/monetization";
import type { RunStats } from "../systems/run";
import type { Overlay } from "./overlay";

export interface ReviveChoice {
  onRevive: () => void;
  onDecline: () => void;
}

/**
 * The one-shot offer between death and the ad-break: buy a revive to keep the
 * run going — a fresh purchase every death, nothing carried between runs —
 * or decline into the usual ending. Mirrors `AdBreak`/`WinScreen`'s shape
 * (`Overlay` in, `show`/`hide` out).
 *
 * The purchase is async, so a tap disables both buttons until
 * `buyRevive()` settles; `this.element === null` is checked after — a
 * purchase that settles after a restart is a no-op. Cancel *and* store
 * failure both re-enable the buttons so a rejected SDK call cannot pin
 * the overlay shut.
 */
export class ReviveOffer {
  private element: HTMLElement | null = null;

  constructor(private readonly overlay: Overlay) {}

  show(stats: RunStats, choice: ReviveChoice): void {
    this.hide();

    const modal = document.createElement("div");
    modal.className = "modal revive-offer";

    const title = document.createElement("h1");
    title.textContent = "CONTINUE?";

    const summary = document.createElement("p");
    summary.className = "run-stats";
    summary.textContent =
      `Kills: ${formatNumber(stats.kills)} · ` +
      `Damage: ${formatNumber(stats.damage)}`;

    const buy = document.createElement("button");
    buy.className = "action";
    buy.type = "button";
    buy.textContent = "Buy Revive";

    const decline = document.createElement("button");
    decline.className = "action";
    decline.type = "button";
    decline.textContent = "No Thanks";
    decline.addEventListener("click", choice.onDecline);

    buy.addEventListener("click", () => {
      buy.disabled = true;
      decline.disabled = true;
      const unlock = (): void => {
        // The scene may have restarted while the purchase was in flight —
        // `hide()` already nulled `this.element`.
        if (this.element === null) return;
        buy.disabled = false;
        decline.disabled = false;
        buy.focus();
      };
      void purchases
        .buyRevive()
        .then((bought) => {
          if (this.element === null) return;
          if (bought) {
            choice.onRevive();
            return;
          }
          unlock();
        })
        .catch((error: unknown) => {
          // Store/SDK failures reject rather than resolving `false` — without
          // this the buttons stay disabled and the overlay is a dead end.
          console.warn("[purchases] revive buy failed", error);
          unlock();
        });
    });

    modal.append(title, summary, buy, decline);
    this.overlay.host.appendChild(modal);
    this.element = modal;
    buy.focus();
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
  }
}
