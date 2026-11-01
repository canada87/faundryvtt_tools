import { MODULE_ID } from "../shared/constants.mjs";

const NODE_NAME = "fvttJournalBox";
const BOX_TAG = "aside";
const BOX_ATTR = "data-fvtt-box";

/**
 * Visual variants for the journal box node. Colors/typography live entirely
 * in styles/journal-styles.css — the node itself only carries the variant id.
 */
export const JOURNAL_BOX_VARIANTS = [
  { id: "read", icon: "fas fa-bullhorn", labelKey: "JOURNALSTYLES.Variant.Read.Label", descriptionKey: "JOURNALSTYLES.Variant.Read.Description" },
  { id: "gm", icon: "fas fa-user-secret", labelKey: "JOURNALSTYLES.Variant.Gm.Label", descriptionKey: "JOURNALSTYLES.Variant.Gm.Description" },
  { id: "danger", icon: "fas fa-triangle-exclamation", labelKey: "JOURNALSTYLES.Variant.Danger.Label", descriptionKey: "JOURNALSTYLES.Variant.Danger.Description" },
  { id: "lesson", icon: "fas fa-graduation-cap", labelKey: "JOURNALSTYLES.Variant.Lesson.Label", descriptionKey: "JOURNALSTYLES.Variant.Lesson.Description" },
  { id: "stop", icon: "fas fa-hourglass-end", labelKey: "JOURNALSTYLES.Variant.Stop.Label", descriptionKey: "JOURNALSTYLES.Variant.Stop.Description" },
  { id: "actor", icon: "fas fa-skull", labelKey: "JOURNALSTYLES.Variant.Actor.Label", descriptionKey: "JOURNALSTYLES.Variant.Actor.Description" },
  { id: "prompt", icon: "fas fa-image", labelKey: "JOURNALSTYLES.Variant.Prompt.Label", descriptionKey: "JOURNALSTYLES.Variant.Prompt.Description" },
  { id: "doc", icon: "fas fa-file-lines", labelKey: "JOURNALSTYLES.Variant.Doc.Label", descriptionKey: "JOURNALSTYLES.Variant.Doc.Description" },
  { id: "terminal", icon: "fas fa-terminal", labelKey: "JOURNALSTYLES.Variant.Terminal.Label", descriptionKey: "JOURNALSTYLES.Variant.Terminal.Description" },
  { id: "note", icon: "fas fa-note-sticky", labelKey: "JOURNALSTYLES.Variant.Note.Label", descriptionKey: "JOURNALSTYLES.Variant.Note.Description" }
];

/**
 * Core logic for the Journal Styles feature: a custom ProseMirror node
 * ("aside[data-fvtt-box]") that survives Foundry's journal editor, plus the
 * dropdown menu entries used to insert it. CSS-only pieces (pills, table,
 * banner) need no schema changes and live only in styles/journal-styles.css.
 *
 * Node shape (also the HTML contract for externally-authored pages, e.g. the
 * MCP server mentioned in the project notes):
 *   <aside class="fvtt-journal-box fvtt-journal-box--<id>" data-fvtt-box="<id>">
 *     <div class="fvtt-journal-box-label"><i class="..."></i> Label</div>
 *     <div class="fvtt-journal-box-body"> ...block content... </div>
 *   </aside>
 * The label div is regenerated from the node's attrs every time it is
 * rendered/saved, so only the body div is ever parsed back as editable
 * content (see `contentElement` below) — the label never needs to survive
 * the editor on its own.
 */
export class JournalStylesSystem {

  static isEnabled() {
    return game.settings.get(MODULE_ID, "journalStylesEnabled");
  }

  static getVariant(id) {
    return JOURNAL_BOX_VARIANTS.find(v => v.id === id) ?? JOURNAL_BOX_VARIANTS[0];
  }

  /** Full HTML for one variant, used by the reference sheet and safe to hand to external tools. */
  static getExampleHTML(id, bodyText) {
    const variant = this.getVariant(id);
    const label = game.i18n.localize(variant.labelKey);
    return `<aside class="fvtt-journal-box fvtt-journal-box--${variant.id}" ${BOX_ATTR}="${variant.id}">\n`
      + `  <div class="fvtt-journal-box-label"><i class="${variant.icon} fa-fw"></i> ${label}</div>\n`
      + `  <div class="fvtt-journal-box-body">\n    <p>${bodyText}</p>\n  </div>\n`
      + `</aside>`;
  }

  static #getProseMirror() {
    return globalThis.foundry?.prosemirror ?? globalThis.ProseMirror;
  }

  /** Returns a copy of `schema` with the box node added, if it isn't already there. */
  static #extendSchema(schema) {
    const nodes = schema.spec.nodes.addToEnd(NODE_NAME, {
      content: "block+",
      group: "block",
      isolating: true,
      defining: true,
      attrs: { variant: { default: JOURNAL_BOX_VARIANTS[0].id } },
      parseDOM: [{
        tag: `${BOX_TAG}[${BOX_ATTR}]`,
        contentElement: "div.fvtt-journal-box-body",
        getAttrs: element => ({ variant: element.getAttribute(BOX_ATTR) || JOURNAL_BOX_VARIANTS[0].id })
      }],
      toDOM: node => {
        const variant = JournalStylesSystem.getVariant(node.attrs.variant);
        const label = game.i18n.localize(variant.labelKey);
        return [BOX_TAG, { class: `fvtt-journal-box fvtt-journal-box--${variant.id}`, [BOX_ATTR]: variant.id },
          ["div", { class: "fvtt-journal-box-label", contenteditable: "false" },
            ["i", { class: `${variant.icon} fa-fw`, "aria-hidden": "true" }],
            ` ${label}`
          ],
          ["div", { class: "fvtt-journal-box-body" }, 0]
        ];
      }
    });
    return new schema.constructor({ nodes, marks: schema.spec.marks });
  }

  /**
   * Hook: createProseMirrorEditor(uuid, plugins, options)
   * Extends the editor's schema with the box node the first time it's needed,
   * rebuilding the current document/menu against the extended schema so
   * existing content survives.
   */
  static initializeEditor(uuid, plugins, options) {
    const state = options?.state;
    if (!state || state.schema.nodes[NODE_NAME]) return;

    const schema = JournalStylesSystem.#extendSchema(state.schema);
    const doc = schema.nodeFromJSON(state.doc.toJSON());
    options.state = state.constructor.create({ doc });

    const pm = JournalStylesSystem.#getProseMirror();
    const Menu = pm?.plugins?.ProseMirrorMenu ?? pm?.ProseMirrorMenu;
    if (plugins?.menu && Menu) plugins.menu = Menu.build(schema);
  }

  /**
   * Hook: getProseMirrorMenuDropDowns(menu, dropDowns)
   * Adds a "Boxes" dropdown so the GM can insert/wrap a selection in a box
   * without typing HTML.
   */
  static addDropDown(menu, dropDowns) {
    const boxNode = menu?.schema?.nodes?.[NODE_NAME];
    if (!boxNode) return;

    const entries = JOURNAL_BOX_VARIANTS.map(variant => ({
      action: `${MODULE_ID}-journal-box-${variant.id}`,
      title: `<i class="${variant.icon} fa-fw" aria-hidden="true"></i> ${game.i18n.localize(variant.labelKey)}`,
      cmd: (state, dispatch, view) => {
        const editorView = view ?? menu.view ?? menu.editorView ?? menu.options?.view;
        return JournalStylesSystem.#insertBox(variant, state ?? editorView?.state, dispatch, editorView);
      }
    }));
    if (!entries.length) return;

    dropDowns.faundryvttJournalBoxes = {
      title: game.i18n.localize("JOURNALSTYLES.MenuGroup"),
      cssClass: "faundryvtt-journal-boxes",
      icon: '<i class="fas fa-palette"></i>',
      entries
    };
  }

  static #insertBox(variant, state, dispatch, view) {
    if (!state?.schema.nodes[NODE_NAME]) return false;
    const { schema, selection } = state;
    const paragraph = schema.nodes.paragraph?.createAndFill();
    if (!paragraph) return false;

    let box;
    try {
      const body = [];
      if (!selection.empty) selection.content().content.forEach(node => body.push(this.#closeSelectedNode(node)));
      if (!body.length) body.push(paragraph);
      box = schema.nodes[NODE_NAME].createChecked({ variant: variant.id }, body);
    } catch (error) {
      console.warn(`${MODULE_ID} | Journal Styles | cannot wrap this selection in a box`, error);
      return false;
    }

    const tr = state.tr.replaceSelectionWith(box, false);
    const send = dispatch ?? (view ? transaction => view.dispatch(transaction) : null);
    if (!send) return false;
    send(tr.scrollIntoView());
    view?.focus();
    return true;
  }

  /** Closes a selection's node (and its descendants) into a standalone, schema-valid copy. */
  static #closeSelectedNode(node) {
    if (node.isLeaf) return node;
    const children = [];
    node.forEach(child => children.push(this.#closeSelectedNode(child)));
    const closed = node.type.createAndFill(node.attrs, children, node.marks);
    if (!closed) throw new Error(`Cannot close selected ${node.type.name}`);
    return closed;
  }
}
