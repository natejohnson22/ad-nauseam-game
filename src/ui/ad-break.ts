import { formatNumber } from "../core/format";
import type { RunStats } from "../systems/run";
import type { Overlay } from "./overlay";

/**
 * The placeholder ad-break on death — the port of `main.gd`'s `_show_ad_break`.
 *
 * Ported as-is and nothing more: the real ad SDK is out of scope for the map,
 * so this is `GAME OVER`, a flavour line, an empty grey frame, and the honest
 * countdown, exactly as the Godot prototype has them.
 *
 * **The countdown is wall-clock, not the game clock.** Issue #7 required every
 * modal timer to run off the always-running UI scene, because a Phaser timer on
 * the paused `GameScene` would never fire and the player would be stuck here
 * forever. Issue #8 moving the modals to DOM dissolves that: `setInterval` does
 * not know the game is paused. It is driven off a `Date.now()` deadline rather
 * than by counting ticks, so a throttled tab can make the countdown *longer*
 * but never shorter — which is the only direction an honest countdown may err.
 */
export class AdBreak {
  /** `main.gd`'s five seconds. The lock is real; that is the joke. */
  private static readonly LOCK_SECONDS = 5;

  private static readonly DEATH_FLAVOR = [
    "You have been converted into 0.0003 ad impressions.",
    "Your attention has been successfully monetized.",
    "Achievement Unlocked: You ARE the Product.",
    "Thank you for your engagement. It was delicious.",
  ] as const;

  private element: HTMLElement | null = null;
  private ticker: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly overlay: Overlay) {}

  show(stats: RunStats, onSkip: () => void): void {
    this.hide();

    const modal = document.createElement("div");
    modal.className = "modal ad-break";

    const title = document.createElement("h1");
    title.textContent = "GAME OVER";

    const flavor = document.createElement("p");
    flavor.textContent =
      AdBreak.DEATH_FLAVOR[
        Math.floor(Math.random() * AdBreak.DEATH_FLAVOR.length)
      ] ?? "";

    /* Death is the ending most runs get, so it is where the tally is most
       worth showing (issue #25). Below the flavour line and above the ad, so
       the gag still lands first. */
    const summary = document.createElement("p");
    summary.className = "run-stats";
    summary.textContent =
      `Kills: ${formatNumber(stats.kills)} · ` +
      `Damage: ${formatNumber(stats.damage)}`;

    const ad = document.createElement("div");
    ad.className = "ad-frame";
    ad.textContent = "[ YOUR AD HERE ]\n(placeholder)";

    const skip = document.createElement("button");
    skip.className = "action";
    skip.type = "button";
    skip.disabled = true;
    skip.textContent = `Skip in ${AdBreak.LOCK_SECONDS}...`;
    skip.addEventListener("click", onSkip);

    modal.append(title, flavor, summary, ad, skip);
    this.overlay.host.appendChild(modal);
    this.element = modal;

    this.runHonestCountdown(skip);
  }

  hide(): void {
    if (this.ticker !== null) clearInterval(this.ticker);
    this.ticker = null;
    this.element?.remove();
    this.element = null;
  }

  private runHonestCountdown(skip: HTMLButtonElement): void {
    const unlocksAt = Date.now() + AdBreak.LOCK_SECONDS * 1000;
    this.ticker = setInterval(() => {
      const remaining = Math.ceil((unlocksAt - Date.now()) / 1000);
      if (remaining > 0) {
        skip.textContent = `Skip in ${remaining}...`;
        return;
      }
      if (this.ticker !== null) clearInterval(this.ticker);
      this.ticker = null;
      skip.textContent = "Skip  ▶";
      skip.disabled = false;
      skip.focus();
    }, 250);
  }
}
