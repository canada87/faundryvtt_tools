# Faundryvtt Tools

Modulo modulare per **FoundryVTT v13** che raccoglie diverse funzionalità indipendenti accessibili da un hub centrale.

## Come aprire il modulo

Bisogna creare una macro script con dentro il comando `game.faundryvttTools.openHub();`. Facendo partire la macro si accede al menu del modulo.

### Tramite Macro

Se il pulsante nei scene controls non appare, puoi usare queste macro:

```js
// Apri l'Hub Menu
game.faundryvttTools.openHub();

// Apri direttamente una feature specifica
game.faundryvttTools.crafting.openRecipeManager();
game.faundryvttTools.encounters.openGenerator();
game.faundryvttTools.savingThrow.open();
game.faundryvttTools.mindmap.openMindMap();
game.faundryvttTools.backup.openBackup();
```

---

## Hub Menu

L'hub è il menu principale del modulo. Mostra tutte le funzionalità disponibili come schede cliccabili. Clicca su una feature per aprirla.

**Feature disponibili:**
- Crafting System
- Random Encounters
- Saving Throw
- Mind Map
- Backup & Restore

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

1. Apri il **Recipe Manager** dall'hub
2. Clicca **"Nuova Ricetta"**
3. Si apre il **Recipe Editor**:
   - Trascina un oggetto nella zona **Risultato** (l'oggetto che verrà creato)
   - Trascina uno o più oggetti nella zona **Componenti** (gli ingredienti necessari)
   - Imposta le **quantità** per ogni componente e per il risultato
   - Opzionalmente, aggiungi una **descrizione**
   - Il nome e l'immagine della ricetta vengono derivati automaticamente dall'oggetto risultato
4. Clicca **Salva**

#### 2. Auto-generazione componenti (GM)

Il Recipe Editor offre un pulsante **"Auto-genera"** che genera componenti casuali basandosi su un sistema di rarità:

1. Clicca "Auto-genera" nel Recipe Editor
2. Seleziona un **livello di rarità** (da Molto Comune a Unico)
3. Il sistema pesca componenti casuali da un compendium chiamato **"Crafting & Consumables"**

Il compendium deve avere questa struttura di cartelle:
```
Crafting & Consumables/
  components/
    lv1/    (componenti livello 1)
    lv2/    (componenti livello 2)
    lv3/    (componenti livello 3)
```

**Rarità predefinite:**

| Rarità | Punti | Livello minimo |
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
   - **Verde:** hai abbastanza quantità nell'inventario
   - **Rosso:** ti mancano componenti
4. Se hai tutti i componenti, il pulsante **"Crafta"** è attivo
5. Clicca "Crafta":
   - I componenti vengono rimossi dall'inventario
   - L'oggetto risultato viene aggiunto all'inventario
   - Un messaggio appare in chat

### Impostazioni Rarità (GM)

Accessibile da **Impostazioni Modulo → Faundryvtt Tools → Impostazioni Rarità**.  
Permette di personalizzare punti e livello minimo di ogni tier di rarità usato nell'auto-generazione dei componenti.

### Recipe Manager (GM)

Il pannello di gestione mostra tutte le ricette del world. Per ogni ricetta puoi:

- **Modifica:** riapre il Recipe Editor con i dati della ricetta
- **Assegna:** scegli quali attori conoscono la ricetta
- **Elimina:** rimuove la ricetta (con conferma)

---

## Random Encounters

Il generatore di incontri casuali permette al GM di estrarre mostri da un compendium e piazzarli sulla mappa in modo rapido, filtrando per tipo di creatura, livello e difficoltà.

### Configurazione iniziale (obbligatoria)

Prima di usare il generatore, apri le **impostazioni incontri** (pulsante ingranaggio nell'Encounter Generator) e configura:

| Campo | Descrizione | Esempio |
|---|---|---|
| **Compendium ID** | ID del compendium con i mostri | `canadavtt.Monsters` |
| **Campo tipo creatura** | Path dot-notation al campo tipo | `system.details.creatureType` |
| **Campo livello** | Path dot-notation al campo livello/CR | `system.details.level` |
| **Cartella destinazione** | Nome della cartella world dove importare i mostri | `mostri` |

> I path dei campi dipendono dal sistema di gioco. Per D&D 5e usa `system.details.type.value` e `system.details.cr`. Verifica la struttura degli attori con `game.actors.getName("NomeMostro").system.details`.

#### Gruppi di CR

Nella sezione **Gruppi CR** delle impostazioni puoi definire fasce di livello con etichette (es. "Deboli", "Medi", "Forti"). Il generatore in modalità manuale usa questi gruppi per selezionare quanti mostri per fascia.

#### Configurazione Difficoltà

Nella sezione **Configurazione Difficoltà** puoi modificare le formule che calcolano budget e range di livelli:

**Moltiplicatori Budget**

Il budget base è `livello party × numero giocatori`. Ogni livello di difficoltà moltiplica questo valore:

| Difficoltà | Moltiplicatore default |
|---|---|
| Molto Bassa | `0.3` |
| Bassa | `0.5` |
| Media | `0.8` |
| Alta | `1.0` |
| Molto Alta | `1.4` |

Abbassa i moltiplicatori se i tuoi mostri sono più forti del previsto, alzali se sono più deboli.

**Offset Livello Mostri**

Valore intero (positivo o negativo) aggiunto al range di livelli calcolato automaticamente.  
A difficoltà "Alta" con party livello 5, il range default è `[4, 8]`. Con offset `+2` diventa `[6, 10]`, con `-1` diventa `[3, 7]`.

#### Scenari

Puoi aggiungere testi di scenario (es. "I mostri stanno tendendo un'imboscata") che verranno proposti casualmente con il pulsante **Scenario Casuale**.

### Generare un incontro

1. Apri il **generatore** dall'hub
2. Usa i **filtri per tipo** in cima per includere/escludere categorie di creature (click sinistro = include/esclude, click destro = solo esclude)
3. Scegli la modalità:

**Modalità Difficoltà:**
- Inserisci livello del gruppo e numero di giocatori
- Scegli la difficoltà (Facile / Medio / Difficile / Mortale)
- Il sistema calcola automaticamente il budget di punti e la fascia di livello

**Modalità Manuale:**
- Inserisci manualmente quanti mostri per ogni gruppo di CR

4. Clicca **Genera** per aprire la **preview**

### Preview e piazzamento

Nella preview dell'incontro puoi:

- **Rilanciare un singolo mostro** (icona dado accanto al nome)
- **Rimuovere un mostro** (icona cestino)
- **Rilanciare tutto** (pulsante in fondo)
- **Confermare l'incontro:** clicca il pulsante di conferma, poi clicca sulla scena per piazzare i token nella posizione desiderata

---

## Saving Throw

Permette al GM di richiedere tiri salvezza ai giocatori con risultati in tempo reale e modalità di successo di gruppo configurabili.

### Come usarlo

1. Apri **Saving Throw** dall'hub
2. Nel form di configurazione:
   - Seleziona i **giocatori** da coinvolgere (usa "Tutti" / "Nessuno" per selezione rapida)
   - Imposta la **CD** (Classe Difficoltà)
   - Scegli se **mostrare la CD** ai giocatori nel messaggio di richiesta
   - Seleziona la **modalità di successo**:

| Modalità | Descrizione |
|---|---|
| **Individuale** | Ogni risultato è indipendente |
| **Gruppo — Almeno uno** | Successo se almeno un giocatore supera |
| **Gruppo — Maggioranza** | Successo se più della metà supera |
| **Gruppo — Tutti** | Successo solo se tutti superano |
| **Gruppo — N specifico** | Successo se almeno N giocatori superano (inserisci il numero) |

3. Clicca **Richiedi Tiro**
4. I giocatori ricevono una notifica in chat con il prompt per lanciare il dado
5. La finestra si aggiorna in tempo reale mostrando i risultati man mano che arrivano
6. Al termine, clicca **Nuovo** per resettare il form

> I risultati sono temporanei e non vengono salvati tra le sessioni.

---

## Mind Map

Lavagna interattiva per creare mappe mentali collegando personaggi, luoghi, eventi e note. I dati vengono salvati nel world.

### Concetti chiave

- **Lavagna (Board):** uno spazio di lavoro indipendente. Puoi averne quante vuoi (una per plot, una per fazione, ecc.)
- **Nodo:** un elemento sulla lavagna. Può essere un documento Foundry (attore, journal, oggetto) o una nota libera
- **Connessione:** un collegamento tra due nodi, personalizzabile con etichetta, colore e stile

### Creare e gestire lavagne

- **Nuova lavagna:** pulsante "+" nella toolbar
- **Rinomina:** icona matita accanto al selettore
- **Elimina:** icona cestino (con conferma)
- **Cambia lavagna:** selettore dropdown in alto

### Aggiungere nodi

- **Da Foundry:** trascina un attore, journal entry o oggetto dalla sidebar direttamente sulla lavagna
- **Nota libera:** pulsante "Aggiungi Nota" nella toolbar

### Personalizzare i nodi

Clicca con il tasto destro su un nodo per aprire il menu contestuale:

| Opzione | Descrizione |
|---|---|
| **Modifica testo** | Modifica il testo della nota (solo nodi nota) |
| **Cambia colore** | Apre il color picker |
| **Rinomina** | Rinomina il nodo |
| **Apri journal** | Apre il documento collegato (se il nodo è un journal) |
| **Rimuovi** | Elimina il nodo e le sue connessioni |

### Creare connessioni

1. Clicca il pulsante **Connetti** nella toolbar per attivare la modalità connessione
2. Clicca su un nodo di partenza, poi su un nodo di destinazione
3. La connessione viene creata
4. Clicca di nuovo **Connetti** (o premi Esc) per uscire dalla modalità connessione

### Personalizzare le connessioni

Clicca con il tasto destro su una connessione per:

| Opzione | Descrizione |
|---|---|
| **Modifica etichetta** | Aggiungi o modifica il testo sulla linea |
| **Cambia colore** | Cambia il colore della linea |
| **Stile** | Alterna tra linea continua e tratteggiata |
| **Freccia** | Attiva/disattiva la punta di freccia |
| **Rimuovi** | Elimina la connessione |

### Navigazione

- **Pan:** trascina il canvas in un'area vuota
- **Zoom:** pulsanti **+** / **-** nella toolbar, oppure rotella del mouse
- **Adatta alla vista:** pulsante "Adatta" per centrare tutti i nodi visibili

---

## Backup & Restore

Permette di esportare e importare i dati delle feature del modulo in un file JSON, utile per trasferire configurazioni tra world o per creare backup preventivi.

### Esportare un backup

1. Apri **Backup & Restore** dall'hub
2. Seleziona le **feature** da includere nel backup (puoi selezionarle tutte)
3. Clicca **Download Backup**
4. Viene scaricato un file `.json` con i dati selezionati

**Cosa viene salvato per feature:**

| Feature | Dati esportati |
|---|---|
| **Crafting** | Ricette, configurazione rarità, assegnazioni ricette per attore |
| **Mind Map** | Tutte le lavagne con nodi e connessioni |
| **Encounters** | Configurazione compendium, gruppi CR, scenari, path campi, moltiplicatori difficoltà, offset livello |

### Importare un backup

1. Nella sezione **Importa**, clicca **Scegli file** e seleziona il file `.json` del backup
2. Seleziona le **feature** da ripristinare
3. Clicca **Importa Backup**
4. Conferma nel dialogo di avviso

> **Attenzione:** l'importazione sovrascrive i dati correnti. Non è possibile fare un merge parziale. Esegui sempre un backup prima di importare.

---

## API Pubblica

Il modulo espone le sue funzionalità su `game.faundryvttTools`:

```js
// Hub
game.faundryvttTools.openHub()

// Crafting
game.faundryvttTools.crafting.openRecipeManager()
game.faundryvttTools.crafting.openRecipeBook(actor)
game.faundryvttTools.crafting.CraftingSystem    // metodi statici

// Encounters
game.faundryvttTools.encounters.openGenerator()

// Saving Throw
game.faundryvttTools.savingThrow.open()

// Mind Map
game.faundryvttTools.mindmap.openMindMap()

// Backup
game.faundryvttTools.backup.openBackup()
```

### CraftingSystem — Metodi principali

```js
const cs = game.faundryvttTools.crafting.CraftingSystem;

// Ricette (world-level)
cs.getRecipes()                   // Tutte le ricette
cs.addRecipe(data)                // Crea ricetta
cs.updateRecipe(id, data)         // Modifica ricetta
cs.deleteRecipe(id)               // Elimina ricetta

// Ricette per attore
cs.getActorRecipes(actor)         // Ricette conosciute
cs.assignRecipe(actor, recipeId)  // Assegna ricetta
cs.unassignRecipe(actor, recipeId) // Rimuovi ricetta

// Crafting
cs.canCraft(actor, recipe)        // Controlla componenti
cs.craft(actor, recipeId)         // Esegui crafting
```

---

## Aggiungere una nuova feature

1. Crea `scripts/<feature>/` con un `index.mjs` che esporta una funzione `initFeatureName()`
2. Crea `templates/<feature>/` per i template Handlebars
3. Crea `styles/<feature>.css` e aggiungilo in `module.json`
4. In `index.mjs`, chiama `HubMenu.registerFeature(...)` per aggiungere la feature all'hub
5. In `scripts/module.mjs`, importa e chiama `initFeatureName()` nel hook `init`
6. Aggiungi le traduzioni in `languages/*.json`
