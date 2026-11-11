import { ImageShareSystem } from "./ImageShareSystem.mjs";

/**
 * Adds a "share fullscreen" button that appears when the GM hovers an image
 * inside a journal. The button is a single floating element positioned over the
 * hovered image, so the journal DOM is never modified (safe across re-renders
 * and with the ProseMirror editor).
 */
export class JournalImageShare {

  /** Images inside journals (image pages and images embedded in text pages). */
  static IMAGE_SELECTOR = ".journal-entry-page img, .journal-page-content img";

  /** Ignore decorative / tiny images. */
  static MIN_SIZE = 48;

  static #button = null;
  static #currentImg = null;

  /**
   * Install the delegated listeners. GM only. Call once, after ready.
   */
  static init() {
    if (!game.user.isGM) return;

    document.addEventListener("mouseover", (ev) => JournalImageShare.#onOver(ev), true);
    document.addEventListener("mouseout", (ev) => JournalImageShare.#onOut(ev), true);
    // Capture phase: catches scrolling of any container inside the journal
    document.addEventListener("scroll", () => JournalImageShare.#hide(), true);
  }

  /* ---------------------------------------- */

  static #onOver(ev) {
    const img = ev.target instanceof Element ? ev.target.closest("img") : null;
    if (!img || !img.matches(JournalImageShare.IMAGE_SELECTOR)) return;
    if (img.closest("prose-mirror")) return; // not while editing

    const rect = img.getBoundingClientRect();
    if (rect.width < JournalImageShare.MIN_SIZE || rect.height < JournalImageShare.MIN_SIZE) return;

    JournalImageShare.#show(img, rect);
  }

  static #onOut(ev) {
    if (!JournalImageShare.#currentImg) return;
    const leaving = ev.target;
    const to = ev.relatedTarget;

    // Moving between the image and the button keeps it visible
    if (to instanceof Element
      && (to === JournalImageShare.#button || to === JournalImageShare.#currentImg
        || JournalImageShare.#button?.contains(to))) return;

    if (leaving === JournalImageShare.#currentImg || leaving === JournalImageShare.#button
      || JournalImageShare.#button?.contains(leaving)) {
      JournalImageShare.#hide();
    }
  }

  /* ---------------------------------------- */

  static #ensureButton() {
    if (JournalImageShare.#button?.isConnected) return JournalImageShare.#button;

    const btn = document.createElement("button");
    btn.type = "button";
    btn.id = "journal-image-share-btn";
    btn.innerHTML = '<i class="fas fa-expand"></i>';
    btn.title = game.i18n.localize("IMAGE_SHARE.ShareFullscreen");
    btn.setAttribute("aria-label", btn.title);
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      JournalImageShare.#share();
    });
    document.body.appendChild(btn);
    JournalImageShare.#button = btn;
    return btn;
  }

  static #show(img, rect) {
    const btn = JournalImageShare.#ensureButton();
    JournalImageShare.#currentImg = img;

    // Top-right corner of the image, clamped to the visible part of the image
    const size = 32;
    const margin = 6;
    const left = Math.min(rect.right, window.innerWidth) - size - margin;
    const top = Math.max(rect.top, 0) + margin;
    btn.style.left = `${Math.max(left, rect.left + margin)}px`;
    btn.style.top = `${top}px`;
    btn.classList.add("visible");
  }

  static #hide() {
    JournalImageShare.#currentImg = null;
    JournalImageShare.#button?.classList.remove("visible");
  }

  static #share() {
    const img = JournalImageShare.#currentImg;
    if (!img) return;

    const src = img.getAttribute("src") || img.currentSrc;
    if (!src) {
      ui.notifications.warn(game.i18n.localize("IMAGE_SHARE.Warn.NoImage"));
      return;
    }

    ImageShareSystem.shareFullscreen(src, JournalImageShare.#resolveTitle(img));
    JournalImageShare.#hide();
  }

  /**
   * Title: image alt text, otherwise the name of the journal page it belongs to.
   */
  static #resolveTitle(img) {
    if (img.alt?.trim()) return img.alt.trim();
    try {
      const appEl = img.closest(".application");
      const app = appEl ? foundry.applications.instances.get(appEl.id) : null;
      const pageId = img.closest("[data-page-id]")?.dataset.pageId;
      const page = pageId ? app?.document?.pages?.get(pageId) : null;
      return page?.name ?? app?.document?.name ?? "";
    } catch (err) {
      return "";
    }
  }
}
