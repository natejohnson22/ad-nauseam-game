import type { Upgrade } from "../content/upgrades";
import type { Overlay } from "./overlay";

/**
 * "LEVEL UP — choose an upgrade": pick 1 of 3, and the run stays paused until
 * one is picked. The port of `main.gd`'s `_on_leveled_up`.
 *
 * DOM rather than canvas, per issue #8. What that buys is visible in the
 * diff against `main.gd`: no hand-computed `y` for the title, and three cards
 * whose titles line up because flexbox centres each block rather than each
 * card centring its own wrapped text.
 *
 * The click handler is a DOM event, so it fires while `GameScene` is paused —
 * which is exactly how the modal is able to resume the scene that opened it.
 */
export class LevelUpModal {
  private element: HTMLElement | null = null;

  constructor(private readonly overlay: Overlay) {}

  show(choices: readonly Upgrade[], onPick: (upgrade: Upgrade) => void): void {
    this.hide();

    const modal = document.createElement("div");
    modal.className = "modal";

    const title = document.createElement("h2");
    title.textContent = "LEVEL UP — choose an upgrade";
    modal.appendChild(title);

    const row = document.createElement("div");
    row.className = "choices";
    for (const upgrade of choices) {
      row.appendChild(this.card(upgrade, onPick));
    }
    modal.appendChild(row);

    this.overlay.host.appendChild(modal);
    this.element = modal;
    // Keyboard players never touch the mouse; without this the modal opens with
    // focus still on the body and Enter does nothing.
    row.querySelector("button")?.focus();
  }

  hide(): void {
    this.element?.remove();
    this.element = null;
  }

  private card(
    upgrade: Upgrade,
    onPick: (upgrade: Upgrade) => void,
  ): HTMLButtonElement {
    const card = document.createElement("button");
    card.className = "choice";
    card.type = "button";

    const title = document.createElement("b");
    title.textContent = upgrade.data.title;
    const description = document.createElement("span");
    description.textContent = upgrade.data.description;
    card.append(title, description);

    card.addEventListener("click", () => onPick(upgrade));
    return card;
  }
}
