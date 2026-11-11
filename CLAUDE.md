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
  encounters/
    index.mjs              — Init della feature incontri (settings, hooks, API)
    EncounterSystem.mjs    — Logica core: compendio, filtri, estrazione, spawn
    apps/
      EncounterGenerator.mjs — UI GM: filtro tipi, selezione per gruppo CR, genera
      EncounterSettings.mjs  — UI GM: configura compendio, campo tipo, cartella, gruppi
  saving-throw/
    index.mjs              — Init della feature tiro salvezza (socket, hooks, API)
    SavingThrowSystem.mjs  — Logica core: sessioni, intercettazione tiri, valutazione
    apps/
      SavingThrowRequest.mjs — UI GM: selezione giocatori, CD, modalità, risultati live
  mindmap/
    index.mjs              — Init della feature mind map (settings, API)
    MindMapSystem.mjs      — Logica core: CRUD lavagne, nodi, connessioni
    apps/
      MindMapApp.mjs       — UI GM: lavagna interattiva con pan/zoom, drag-and-drop, connessioni SVG
  resources/
    index.mjs              — Init della feature risorse (settings, hub, API)
    ResourceSystem.mjs     — Logica core: CRUD risorse, valori, visibilità
    ResourcesHUD.mjs       — HUD on-screen in alto al centro, sync via setting
    apps/
      ResourceManager.mjs  — UI GM: lista risorse, +/-, toggle visibilità/attivo
  scene-nav/
    index.mjs              — Init navigatore scene (disattivo di default: setting scenesNavEnabled)
    SceneNavSystem.mjs     — Logica core: cartelle scene di Foundry, preferiti, collegamenti padre/figlio e prosegue
    SceneNavBar.mjs        — Barra GM in alto nella scena: percorso padri, collegamenti, nota, giocatori presenti
    apps/
      SceneNavigator.mjs   — UI GM a tutto schermo: albero cartelle, vista griglia (miniature) e vista mappa (grafo)
      SceneGraph.mjs       — Grafo scene: layout automatico, pan/zoom, trascina nodi, crea/rimuovi collegamenti
      SceneLinksEditor.mjs — UI GM: modifica collegamenti di una scena
      SceneNavDialogs.mjs  — Dialoghi condivisi: nota GM (journal della scena), porta qui i giocatori
  journal-styles/
    index.mjs              — Init stili journal (disattivo di default: setting journalStylesEnabled)
    JournalStylesSystem.mjs — Logica core: nodo ProseMirror "fvttJournalBox", estensione schema, menu editor
    apps/
      JournalStylesReference.mjs — UI GM: cheatsheet con anteprima e HTML copiabile per ogni riquadro
  lighting/
    index.mjs              — Init controllo luci (settings, hook HUD token, API)
    LightingSystem.mjs     — Logica core: preset (CRUD), accesso per giocatore (setting lightingPresetAccess), luce token, oscurità
    TokenHudLighting.mjs   — Pulsante preset nell'HUD del token (i giocatori vedono solo i preset assegnati a loro)
    apps/
      LightingControl.mjs  — UI GM: oscurità, valori custom, preset (applica, crea, modifica, a chi mostrarli)
      LightingDialogs.mjs  — Dialoghi: editor preset e scelta giocatori
      LightingSettings.mjs — UI GM (menu impostazioni): tabella preset e livelli oscurità
  notebook/
    index.mjs              — Init taccuino giocatori (settings, keybinding Shift+B, pulsante controlli token, hook HUD, API)
    NotebookSystem.mjs     — Logica core: appunti/post-it e note sulle creature nei flag User, handout e bestiario in setting world, visibilità {all, users}
    TokenHudNotebook.mjs   — Pulsante GM nell'HUD del token: aggiunge la creatura (nome e immagine dall'attore) al bestiario
    apps/
      NotebookApp.mjs      — UI a forma di taccuino con linguette: Appunti, Bestiario (campi oscurati), Handout; il GM "visualizza come" un giocatore
      NotebookDialogs.mjs  — Dialoghi: post-it, handout, editor creatura, visibilità per giocatore, modello campi
  exploration/
    index.mjs              — Init esplorazione (disattivo di default: setting explorationEnabled; keybinding Shift+V solo GM)
    ExplorationSystem.mjs  — Logica core: quota caselle per token fuori combat, blocco preMoveToken (giocatori), conteggio moveToken, avanzamento tempo e reset
    apps/
      ExplorationTracker.mjs — UI GM: token dei giocatori online con barra quota, escludi token, pulsante turno successivo
styles/
  hub.css                  — Stili dell'hub menu
  crafting.css             — Stili di tutte le UI crafting
  encounters.css           — Stili di tutte le UI incontri
  saving-throw.css         — Stili UI tiro salvezza e messaggi chat
  mindmap.css              — Stili lavagna mind map
  resources.css            — Stili HUD risorse e gestore
  scene-nav.css            — Stili navigatore scene ed editor collegamenti
  lighting.css             — Stili controllo luci, dialoghi preset e palette HUD token
  journal-styles.css       — Riquadri, pill, tabelle e banner per i journal (scoped su classe body)
  notebook.css             — Stili taccuino (copertina, linguette, post-it, scheda creatura, handout) e dialoghi
  exploration.css          — Stili pannello GM esplorazione
templates/
  hub-menu.hbs             — Template hub
  crafting/
    recipe-book.hbs        — Template ricettario giocatore
    recipe-editor.hbs      — Template editor ricetta
    recipe-manager.hbs     — Template gestore ricette
  encounters/
    encounter-generator.hbs — Template generatore incontri
    encounter-settings.hbs  — Template impostazioni incontri
  saving-throw/
    saving-throw-request.hbs — Template richiesta tiro salvezza
  mindmap/
    mindmap.hbs              — Template lavagna mind map
  resources/
    resource-manager.hbs     — Template gestore risorse
  scene-nav/
    scene-navigator.hbs      — Template navigatore scene
    scene-links-editor.hbs   — Template editor collegamenti
  journal-styles/
    journal-styles-reference.hbs — Template cheatsheet riquadri journal
  notebook/
    notebook.hbs             — Template taccuino (pagina + linguette sul bordo)
  exploration/
    exploration-tracker.hbs  — Template pannello GM esplorazione
languages/
  en.json                  — Traduzioni inglese
  it.json                  — Traduzioni italiano
```

## Nomenclatura

Quando l'operatore si riferisce ad un modulo si intende Crafting o simili.
Quando si deve riferire alla parte che li collega lo chiamera Hub.

## Convenzioni

- **Versione Foundry target:** v13
- **Module ID:** `faundryvtt_tools` (definito in `scripts/shared/constants.mjs`)
- **Entry point:** `scripts/module.mjs`
- **API pubblica:** `game.faundryvttTools` (ogni feature aggiunge il suo namespace, es. `game.faundryvttTools.crafting`)
- **Settings namespace:** tutte le settings usano `MODULE_ID` come namespace. I nomi dei setting sono prefissati con la feature (es. `craftingRecipes`)
- **Actor flags:** usano `MODULE_ID` con path dot-notation per feature (es. `crafting.recipes`)
- **UI framework:** ApplicationV2 + HandlebarsApplicationMixin (API v13)
- **Template paths:** `modules/faundryvtt_tools/templates/<feature>/...`
- **Localizzazione:** chiavi organizzate per namespace (`FVTT_TOOLS.*` per l'hub, `CRAFTING.*` per crafting, `ENCOUNTERS.*` per incontri)

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
