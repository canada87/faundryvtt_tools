import { MODULE_ID } from "../../shared/constants.mjs";
import { JournalStylesSystem, JOURNAL_BOX_VARIANTS } from "../JournalStylesSystem.mjs";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * GM-only cheatsheet: shows every journal box variant with a live preview and
 * the exact HTML to paste by hand, or to hand to an external tool (e.g. an
 * MCP server authoring journal pages).
 */
export class JournalStylesReference extends HandlebarsApplicationMixin(ApplicationV2) {

  static DEFAULT_OPTIONS = {
    id: "faundryvtt-journal-styles-reference",
    classes: ["faundryvtt-tools", "journal-styles-reference"],
    window: {
      icon: "fas fa-palette",
      title: "JOURNALSTYLES.Reference.Title",
      resizable: true
    },
    position: {
      width: 760,
      height: 800
    },
    actions: {
      copyHtml: JournalStylesReference.#onCopyHtml
    }
  };

  static PARTS = {
    reference: {
      template: `modules/${MODULE_ID}/templates/journal-styles/journal-styles-reference.hbs`,
      scrollable: [""]
    }
  };

  async _prepareContext() {
    const exampleText = game.i18n.localize("JOURNALSTYLES.Reference.ExampleText");
    const variants = JOURNAL_BOX_VARIANTS.map(variant => ({
      id: variant.id,
      icon: variant.icon,
      label: game.i18n.localize(variant.labelKey),
      description: game.i18n.localize(variant.descriptionKey),
      html: JournalStylesSystem.getExampleHTML(variant.id, exampleText)
    }));
    return { variants };
  }

  static async #onCopyHtml(event, target) {
    const card = target.closest(".journal-styles-reference-card");
    const textarea = card?.querySelector("textarea.journal-styles-reference-code");
    if (!textarea) return;

    // navigator.clipboard requires a secure context (HTTPS or localhost) and
    // is simply undefined on a plain-http world (e.g. a LAN/Tailscale IP) —
    // fall back to the legacy selection-based copy in that case.
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(textarea.value);
        ui.notifications.info(game.i18n.localize("JOURNALSTYLES.Reference.Copied"));
        return;
      } catch (error) {
        console.warn(`${MODULE_ID} | Journal Styles | navigator.clipboard failed, falling back to execCommand`, error);
      }
    }

    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch (error) {
      console.warn(`${MODULE_ID} | Journal Styles | execCommand copy failed`, error);
    }
    if (copied) ui.notifications.info(game.i18n.localize("JOURNALSTYLES.Reference.Copied"));
    else ui.notifications.warn(game.i18n.localize("JOURNALSTYLES.Reference.CopyFailed"));
  }
}
