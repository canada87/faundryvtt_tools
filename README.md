# Faundryvtt Tools

Modulo modulare per **FoundryVTT v13** che raccoglie diverse funzionalita indipendenti accessibili da un hub centrale. Attualmente include un **sistema di crafting** agnostico rispetto al sistema di gioco (compatibile con dnd5e, pf2e e altri).

**Autore:** jacassia
**Versione:** 1.0.0
**Lingue:** Italiano, English

---

## Installazione

1. Copia la cartella `faundryvtt_tools` nella directory `Data/modules/` della tua installazione Foundry
2. Avvia FoundryVTT e attiva il modulo nelle impostazioni del world

---

## Come aprire il modulo

### Tramite Scene Controls

Il modulo aggiunge un pulsante nella barra dei controlli del layer Token. Cliccalo per aprire l'**Hub Menu**, da cui puoi accedere a tutte le funzionalita.

### Tramite Macro

Se il pulsante nei scene controls non appare (problema noto in Foundry v13 con alcuni moduli), puoi usare queste macro:

```js
// Apri l'Hub Menu
game.faundryvttTools.openHub();

// Apri direttamente il Recipe Manager (solo GM)
game.faundryvttTools.crafting.openRecipeManager();

// Apri il Recipe Book di un attore specifico
game.faundryvttTools.crafting.openRecipeBook(actor);
```

### Tramite Header dell'Actor Sheet

Ogni scheda attore mostra un pulsante **"Recipe Book"** nell'header, che apre il ricettario dell'attore.

---

## Hub Menu

L'hub e il menu principale del modulo. Mostra tutte le funzionalita disponibili come schede cliccabili. Ogni feature del modulo si registra automaticamente nell'hub.

Attualmente l'unica feature disponibile e il **Crafting System**.

---

## Crafting System

Il sistema di crafting permette al GM di creare ricette con componenti e risultati, assegnarle ai giocatori, e ai giocatori di creare oggetti quando hanno i componenti necessari.

### Concetti chiave

- **Ricetta:** definisce quali componenti servono e quale oggetto viene prodotto
- **Componenti:** oggetti necessari per il crafting (vengono consumati)
- **Risultato:** l'oggetto prodotto dal crafting
- **Ricettario (Recipe Book):** la vista del giocatore con le ricette che conosce

### Flusso di lavoro

#### 1. Creare una ricetta (GM)

1. Apri il **Recipe Manager** (dall'hub o via macro)
2. Clicca **"Nuova Ricetta"**
3. Si apre il **Recipe Editor**:
   - Trascina un oggetto nella zona **Risultato** (l'oggetto che verra creato)
   - Trascina uno o piu oggetti nella zona **Componenti** (gli ingredienti necessari)
   - Imposta le **quantita** per ogni componente e per il risultato
   - Opzionalmente, aggiungi una **descrizione**
   - Il nome e l'immagine della ricetta vengono derivati automaticamente dall'oggetto risultato
4. Clicca **Salva**

#### 2. Auto-generazione componenti (GM)

Il Recipe Editor offre un pulsante **"Auto-genera"** che genera componenti casuali basandosi su un sistema di rarita:

1. Clicca "Auto-genera" nel Recipe Editor
2. Seleziona un **livello di rarita** (da Molto Comune a Unico)
3. Il sistema pesca componenti casuali da un compendium chiamato **"Crafting & Consumables"**

Il compendium deve avere questa struttura di cartelle:
```
Crafting & Consumables/
  components/
    lv1/    (componenti livello 1)
    lv2/    (componenti livello 2)
    lv3/    (componenti livello 3)
```

Ogni rarita ha un budget di punti e un livello minimo di componenti da includere. I punti e i livelli sono configurabili nelle **Impostazioni Rarita**.

**Rarita predefinite:**

| Rarita | Punti | Livello minimo |
|---|---|---|
| Molto Comune | 1 | 1 |
| Comune | 2 | 1 |
| Non Comune | 3 | 1 |
| Raro | 4 | 2 |
| Molto Raro | 6 | 2 |
| Leggendario | 8 | 2 |
| Molto Leggendario | 12 | 3 |
| Unico | 20 | 3 |

#### 3. Assegnare ricette ai giocatori (GM)

1. Nel **Recipe Manager**, clicca l'icona **Assegna** su una ricetta
2. Si apre un dialogo con la lista degli attori posseduti dai giocatori
3. Spunta gli attori che devono conoscere questa ricetta
4. Clicca **Salva**

#### 4. Creare un oggetto (Giocatore)

1. Apri il **Recipe Book** dal pulsante nell'header della scheda attore
2. Vedi le ricette conosciute dal tuo attore
3. Per ogni ricetta, i componenti sono colorati:
   - **Verde:** hai abbastanza quantita nell'inventario
   - **Rosso:** ti mancano componenti
4. Se hai tutti i componenti, il pulsante **"Crafta"** e attivo
5. Clicca "Crafta":
   - I componenti vengono rimossi dall'inventario
   - L'oggetto risultato viene aggiunto all'inventario
   - Un messaggio appare in chat

### Configurazione Rarita (GM)

Accessibile dalle impostazioni del modulo, permette di personalizzare i punti e il livello minimo di ogni tier di rarita usato nell'auto-generazione dei componenti.

### Recipe Manager (GM)

Il pannello di gestione mostra tutte le ricette del world. Per ogni ricetta puoi:

- **Modifica:** riapre il Recipe Editor con i dati della ricetta
- **Assegna:** scegli quali attori conoscono la ricetta
- **Elimina:** rimuove la ricetta (con conferma)

---

## Struttura del progetto

```
faundryvtt_tools/
├── module.json                     # Manifest del modulo
├── scripts/
│   ├── module.mjs                  # Entry point e registrazione hooks
│   ├── shared/
│   │   └── constants.mjs           # MODULE_ID condiviso
│   ├── hub/
│   │   └── HubMenu.mjs             # Menu hub con sistema di registrazione feature
│   └── crafting/
│       ├── index.mjs               # Init crafting: settings, hooks, API pubblica
│       ├── CraftingSystem.mjs      # Logica core: CRUD ricette, inventario, crafting
│       ├── ComponentGenerator.mjs  # Generazione casuale componenti per rarita
│       └── apps/
│           ├── RecipeBook.mjs      # UI giocatore: ricettario con stato componenti
│           ├── RecipeEditor.mjs    # UI GM: crea/modifica ricette con drag-and-drop
│           ├── RecipeManager.mjs   # UI GM: lista ricette, assegna, elimina
│           └── RaritySettings.mjs  # UI GM: configurazione rarita
├── templates/
│   ├── hub-menu.hbs                # Template hub
│   └── crafting/
│       ├── recipe-book.hbs         # Template ricettario
│       ├── recipe-editor.hbs       # Template editor ricetta
│       ├── recipe-manager.hbs      # Template gestore ricette
│       └── rarity-settings.hbs    # Template impostazioni rarita
├── styles/
│   ├── hub.css                     # Stili hub
│   └── crafting.css                # Stili crafting
└── languages/
    ├── en.json                     # Traduzioni inglese
    └── it.json                     # Traduzioni italiano
```

---

## API Pubblica

Il modulo espone le sue funzionalita su `game.faundryvttTools`:

```js
// Hub
game.faundryvttTools.openHub()

// Crafting
game.faundryvttTools.crafting.CraftingSystem    // Classe con metodi statici
game.faundryvttTools.crafting.RecipeBook        // Classe UI
game.faundryvttTools.crafting.RecipeEditor      // Classe UI
game.faundryvttTools.crafting.RecipeManager     // Classe UI
game.faundryvttTools.crafting.openRecipeBook(actor)    // Apri ricettario attore
game.faundryvttTools.crafting.openRecipeManager()      // Apri gestore ricette
```

### CraftingSystem - Metodi principali

```js
// Ricette (world-level)
CraftingSystem.getRecipes()                  // Tutte le ricette
CraftingSystem.addRecipe(data)               // Crea ricetta
CraftingSystem.updateRecipe(id, data)        // Modifica ricetta
CraftingSystem.deleteRecipe(id)              // Elimina ricetta

// Ricette per attore
CraftingSystem.getActorRecipes(actor)        // Ricette conosciute
CraftingSystem.assignRecipe(actor, recipeId) // Assegna ricetta
CraftingSystem.unassignRecipe(actor, recipeId) // Rimuovi ricetta

// Crafting
CraftingSystem.canCraft(actor, recipe)       // Controlla componenti
CraftingSystem.craft(actor, recipeId)        // Esegui crafting
```

---

## Aggiungere una nuova feature

1. Crea `scripts/<feature>/` con un `index.mjs` che esporta una funzione `initFeatureName()`
2. Crea `templates/<feature>/` per i template Handlebars
3. Crea `styles/<feature>.css` e aggiungilo in `module.json`
4. In `index.mjs`, chiama `HubMenu.registerFeature(...)` per aggiungere la feature all'hub
5. In `scripts/module.mjs`, importa e chiama `initFeatureName()` nel hook `init`
6. Aggiungi le traduzioni in `languages/*.json`
