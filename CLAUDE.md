# Faundryvtt Tools

Modulo FoundryVTT modulare che raccoglie diverse funzionalità indipendenti accessibili da un hub centrale.

## Struttura del progetto

```
scripts/
  module.mjs              — Entry point. Registra l'hub e inizializza le feature
  shared/
    constants.mjs          — Costanti condivise (MODULE_ID)
  hub/
    HubMenu.mjs            — Menu di alto livello per scegliere la funzionalità
  crafting/
    index.mjs              — Init della feature crafting (settings, hooks, API)
    CraftingSystem.mjs     — Logica core: CRUD ricette, inventario, crafting
    apps/
      RecipeBook.mjs       — UI giocatore: ricettario con stato componenti
      RecipeEditor.mjs     — UI GM: crea/modifica ricette con drag-and-drop
      RecipeManager.mjs    — UI GM: lista ricette, assegna, elimina
styles/
  hub.css                  — Stili dell'hub menu
  crafting.css             — Stili di tutte le UI crafting
templates/
  hub-menu.hbs             — Template hub
  crafting/
    recipe-book.hbs        — Template ricettario giocatore
    recipe-editor.hbs      — Template editor ricetta
    recipe-manager.hbs     — Template gestore ricette
languages/
  en.json                  — Traduzioni inglese
  it.json                  — Traduzioni italiano
```

## Convenzioni

- **Versione Foundry target:** v13
- **Module ID:** `faundryvtt_tools` (definito in `scripts/shared/constants.mjs`)
- **Entry point:** `scripts/module.mjs`
- **API pubblica:** `game.faundryvttTools` (ogni feature aggiunge il suo namespace, es. `game.faundryvttTools.crafting`)
- **Settings namespace:** tutte le settings usano `MODULE_ID` come namespace. I nomi dei setting sono prefissati con la feature (es. `craftingRecipes`)
- **Actor flags:** usano `MODULE_ID` con path dot-notation per feature (es. `crafting.recipes`)
- **UI framework:** ApplicationV2 + HandlebarsApplicationMixin (API v13)
- **Template paths:** `modules/faundryvtt_tools/templates/<feature>/...`
- **Localizzazione:** chiavi organizzate per namespace (`FVTT_TOOLS.*` per l'hub, `CRAFTING.*` per crafting)

## Come aggiungere una nuova feature

1. Crea una directory `scripts/<feature-name>/` con:
   - `index.mjs` — funzione `initFeatureName()` che registra settings, hooks e API
   - File di logica e UI specifici della feature
2. Crea `templates/<feature-name>/` per i template Handlebars
3. Crea `styles/<feature-name>.css` per gli stili
4. Aggiungi il CSS in `module.json` sotto `styles`
5. In `scripts/<feature-name>/index.mjs`, chiama `HubMenu.registerFeature(...)` per aggiungere la feature all'hub
6. In `scripts/module.mjs`, importa e chiama `initFeatureName()` dentro il hook `init`
7. Aggiungi le chiavi di traduzione in `languages/*.json` sotto un nuovo namespace (es. `FEATURE_NAME.*`)

## Note per Claude

- Quando lavori su una feature specifica (es. crafting), i file rilevanti sono `scripts/<feature>/`, `templates/<feature>/`, `styles/<feature>.css` e `scripts/shared/`
- Non modificare `scripts/shared/` senza considerare l'impatto su tutte le feature
- L'hub (`scripts/hub/HubMenu.mjs`) è il punto di ingresso comune — ogni feature si registra con `HubMenu.registerFeature()`
- Il `MODULE_ID` è `"faundryvtt_tools"` — importalo sempre da `scripts/shared/constants.mjs`, non hardcodarlo
- Le feature sono indipendenti tra loro ma condividono il namespace del modulo per settings e flags
