import { MODULE_ID } from "../shared/constants.mjs";
import { HubMenu } from "../hub/HubMenu.mjs";
import { JournalStylesSystem } from "./JournalStylesSystem.mjs";
import { JournalStylesReference } from "./apps/JournalStylesReference.mjs";

/**
 * Initialize the Journal Styles feature.
 * Disabled by default: the GM turns it on from the module settings.
 * Adds a custom ProseMirror node so colored boxes in journal pages survive
 * Edit + Save, plus CSS-only classes for pills, tables and page banners.
 */
export function initJournalStyles() {

  /* ---- Settings ---- */

  game.settings.register(MODULE_ID, "journalStylesEnabled", {
    name: "JOURNALSTYLES.Settings.Enabled.Name",
    hint: "JOURNALSTYLES.Settings.Enabled.Hint",
    scope: "world",
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true
  });

  if (!JournalStylesSystem.isEnabled()) return;

  /* ---- Schema ----
   * Must happen once, early, before any editor (journal pages included) is
   * ever created — see JournalStylesSystem.installDefaultSchema() for why. */
  JournalStylesSystem.installDefaultSchema();

  /* ---- CSS activation ----
   * styles/journal-styles.css is always loaded by Foundry, but every rule in
   * it is scoped under this body class so a disabled setting leaves journals
   * exactly as if the feature didn't exist. */
  Hooks.once("ready", () => {
    document.body.classList.add("faundryvtt-journal-styles-active");
  });

  /* ---- Hub registration ---- */

  HubMenu.registerFeature({
    id: "journal-styles",
    icon: "fas fa-palette",
    name: "JOURNALSTYLES.FeatureName",
    description: "JOURNALSTYLES.FeatureDescription",
    open: () => {
      if (!game.user.isGM) return;
      new JournalStylesReference().render(true);
    }
  });

  /* ---- ProseMirror editor extension ---- */

  Hooks.on("createProseMirrorEditor", JournalStylesSystem.initializeEditor);
  Hooks.on("getProseMirrorMenuDropDowns", JournalStylesSystem.addDropDown);

  /* ---- Public API ---- */

  game.faundryvttTools.journalStyles = {
    JournalStylesSystem,
    JournalStylesReference,
    open() {
      if (game.user.isGM) new JournalStylesReference().render(true);
    }
  };

  console.log("Faundryvtt Tools | Journal Styles feature initialized");
}
