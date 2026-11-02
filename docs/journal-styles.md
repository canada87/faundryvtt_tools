# Journal Styles — guida per agenti che scrivono pagine journal

Feature di **faundryvtt_tools** (modulo Foundry, repo `canada87/faundryvtt_tools`). Aggiunge riquadri colorati,
pillole, tabelle e banner alle pagine journal, pensati per **sopravvivere** quando il GM apre una pagina con
Edit e salva (il problema originale: HTML con `style=` inline o tag generici come `div`/`section` veniva
smontato dall'editor ProseMirror di Foundry ad ogni salvataggio).

## Prerequisiti

- Il GM deve avere installato `faundryvtt_tools` v4.14.5 o successiva.
- Impostazioni modulo → **"Stili Journal: abilita"** deve essere attivo (di default è spento; richiede reload
  dopo averlo attivato). Se è spento, tutte le classi qui sotto non hanno alcun effetto visivo.

## Contratto HTML per i riquadri

Scrivi **esattamente** questa struttura — niente `style=` inline, solo le classi indicate. `data-fvtt-box` deve
combaciare con la classe `fvtt-journal-box--<id>`:

```html
<aside class="fvtt-journal-box fvtt-journal-box--read" data-fvtt-box="read">
  <div class="fvtt-journal-box-label"><i class="fas fa-bullhorn fa-fw"></i> Leggi ai giocatori</div>
  <div class="fvtt-journal-box-body">
    <p>Testo da leggere ai giocatori, parola per parola.</p>
  </div>
</aside>
```

Il div `fvtt-journal-box-label` (icona + testo) non è obbligatorio quando scrivi tu l'HTML: il modulo lo
rigenera comunque in automatico ogni volta che la pagina viene aperta in Edit e risalvata (e lo mostra già così
se la pagina non viene mai aperta in Edit). Includerlo comunque è più sicuro per la visualizzazione immediata.
Il contenuto vero e proprio (quello che il GM potrà modificare) va **solo** dentro `fvtt-journal-box-body`.

### Variant disponibili (`data-fvtt-box`)

| id | Icona FA | Uso |
|---|---|---|
| `read` | `fa-bullhorn` | Testo da leggere ai giocatori |
| `gm` | `fa-user-secret` | Nota riservata per il GM |
| `danger` | `fa-triangle-exclamation` | Tiri salvezza, danni, trappole |
| `lesson` | `fa-graduation-cap` | Nota didattica per giocatori nuovi |
| `stop` | `fa-hourglass-end` | Punto di stop della sessione |
| `actor` | `fa-skull` | Scheda rapida PNG/creatura |
| `prompt` | `fa-image` | Prompt immagine da copiare |
| `doc` | `fa-file-lines` | Handout stile documento ufficiale |
| `terminal` | `fa-terminal` | Handout stile schermo di un terminale |
| `note` | `fa-note-sticky` | Handout stile biglietto scritto a mano |

I colori/stile di ogni variante sono definiti in `styles/journal-styles.css` del modulo, non vanno mai scritti
inline.

## Altri elementi (solo classi CSS, nessun wrapper speciale)

Questi usano tag HTML standard che l'editor di Foundry già preserva — bastano le classi, niente attributi
`data-fvtt-box`:

```html
<!-- Pillola inline: danger (rosso), info (blu), special (viola) -->
<span class="fvtt-journal-pill fvtt-journal-pill--danger">CD 15</span>

<!-- Tabella scura a righe alternate -->
<table class="fvtt-journal-table">
  <thead><tr><th>Nome</th><th>Valore</th></tr></thead>
  <tbody><tr><td>Esempio</td><td>1</td></tr></tbody>
</table>

<!-- Banner titolo pagina, con sottotitolo opzionale -->
<h2 class="fvtt-journal-banner">Titolo pagina<span class="fvtt-journal-banner-subtitle">sottotitolo</span></h2>
```

## Nel client Foundry (per il GM, non per agenti)

- **Hub → Stili Journal** (icona tavolozza): cheatsheet con anteprima di ogni riquadro e pulsante "Copia HTML".
- Nell'editor di una pagina journal (Edit), menu **"Riquadri"** nella toolbar: inserisce/avvolge la selezione
  in un riquadro senza scrivere HTML a mano.

## Limiti noti

- Dentro un riquadro, Invio/Backspace non hanno ancora una gestione raffinata (funziona scrivere, ma uscire dal
  riquadro via tastiera può non funzionare: bisogna cliccare sotto). Non è un problema di salvataggio dei dati.
- Le classi su `<span>`/`<h2>`/`<table>` (pillole, banner, tabelle) sono meno testate dal vivo dei riquadri —
  se un domani risultano "mangiate" dall'editor va aperta una issue sul repo, non serve cambiare la sintassi
  usata qui.
- La feature dipende da alcuni dettagli interni di Foundry (lo schema ProseMirror globale viene esteso in-place
  all'avvio del modulo, vedi `scripts/journal-styles/JournalStylesSystem.mjs`). Se una futura versione di
  Foundry cambia questi interni, il modulo potrebbe richiedere un aggiornamento prima di tornare a funzionare —
  non è un problema risolvibile lato contenuto/HTML.

## Riferimenti nel repo

- `scripts/journal-styles/JournalStylesSystem.mjs` — logica (estensione schema, menu editor, HTML di esempio)
- `styles/journal-styles.css` — tutti i colori/stili
- `languages/it.json`, `languages/en.json` — namespace `JOURNALSTYLES`
