import { MODULE_ID } from "../shared/constants.mjs";

/**
 * Core system for fullscreen image sharing between GM and players.
 * The GM shares an image that appears as a fullscreen overlay on all clients,
 * covering the canvas but not the Foundry UI chrome.
 */
export class ImageShareSystem {

  static #overlayElement = null;
  static #isSharing = false;

  /* ---------------------------------------- */
  /*  Socket                                   */
  /* ---------------------------------------- */

  /**
   * Register the socket listener for image-share events.
   * Must be called after game.ready.
   */
  static setupSocket() {
    game.socket.on(`module.${MODULE_ID}`, (data) => {
      if (data.type === "showFullscreenImage") {
        ImageShareSystem.#showOverlay(data.src, data.title);
      } else if (data.type === "hideFullscreenImage") {
        ImageShareSystem.#hideOverlay();
      }
    });
  }

  /* ---------------------------------------- */
  /*  Public API                               */
  /* ---------------------------------------- */

  /**
   * Share an image fullscreen to all connected clients. GM only.
   * @param {string} src    Image URL / path
   * @param {string} title  Optional display title
   */
  static shareFullscreen(src, title = "") {
    if (!game.user.isGM) return;

    // Show locally
    ImageShareSystem.#showOverlay(src, title);

    // Broadcast to every other client
    game.socket.emit(`module.${MODULE_ID}`, {
      type: "showFullscreenImage",
      src,
      title
    });
  }

  /**
   * Remove the fullscreen overlay for all clients. GM only.
   */
  static stopSharing() {
    if (!game.user.isGM) return;

    ImageShareSystem.#hideOverlay();

    game.socket.emit(`module.${MODULE_ID}`, {
      type: "hideFullscreenImage"
    });
  }

  /**
   * Whether an image is currently being shared.
   * @type {boolean}
   */
  static get isSharing() {
    return ImageShareSystem.#isSharing;
  }

  /* ---------------------------------------- */
  /*  Overlay DOM                              */
  /* ---------------------------------------- */

  /**
   * Build and display the fullscreen overlay.
   */
  static #showOverlay(src, title) {
    // Remove any existing overlay first
    ImageShareSystem.#removeOverlayElement();

    const overlay = document.createElement("div");
    overlay.id = "fullscreen-image-overlay";

    // Image
    const img = document.createElement("img");
    img.src = src;
    img.alt = title || "";
    overlay.appendChild(img);

    // Optional title
    if (title) {
      const titleEl = document.createElement("div");
      titleEl.className = "image-title";
      titleEl.textContent = title;
      overlay.appendChild(titleEl);
    }

    // GM-only stop button
    if (game.user.isGM) {
      const stopBtn = document.createElement("button");
      stopBtn.type = "button";
      stopBtn.className = "stop-sharing-btn";
      stopBtn.innerHTML =
        `<i class="fas fa-times-circle"></i> ${game.i18n.localize("IMAGE_SHARE.StopSharing")}`;
      stopBtn.addEventListener("click", () => ImageShareSystem.stopSharing());
      overlay.appendChild(stopBtn);
    }

    document.body.appendChild(overlay);

    // Trigger the CSS fade-in transition after the element is in the DOM
    requestAnimationFrame(() => {
      requestAnimationFrame(() => overlay.classList.add("active"));
    });

    ImageShareSystem.#overlayElement = overlay;
    ImageShareSystem.#isSharing = true;
  }

  /**
   * Animate-out and remove the overlay.
   */
  static #hideOverlay() {
    const overlay = ImageShareSystem.#overlayElement;
    if (!overlay) {
      ImageShareSystem.#isSharing = false;
      return;
    }

    overlay.classList.remove("active");
    overlay.addEventListener("transitionend", () => overlay.remove(), { once: true });

    // Safety fallback if transitionend never fires
    setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 600);

    ImageShareSystem.#overlayElement = null;
    ImageShareSystem.#isSharing = false;
  }

  /**
   * Immediately remove the overlay element (no animation).
   */
  static #removeOverlayElement() {
    if (ImageShareSystem.#overlayElement) {
      ImageShareSystem.#overlayElement.remove();
      ImageShareSystem.#overlayElement = null;
    }
    // Clean up any orphaned overlay from a previous session
    document.getElementById("fullscreen-image-overlay")?.remove();
  }
}
