# Changelog

Tutte le modifiche rilevanti a PDFix sono elencate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e la
numerazione segue [Semantic Versioning](https://semver.org/lang/it/).

La sezione delle modifiche non ancora rilasciate è l'unico punto in cui si
scrive a mano: `npm run dist` la consolida in una sezione datata, aggiorna
`release-history.json` e la ricrea vuota.

## [Unreleased]

## [1.0.2] - 2026-08-31

### Added
- Pulsante «Donazioni» nella finestra informazioni: apre nel browser la pagina PayPal del progetto. Il contributo è facoltativo e non sblocca alcuna funzione.
- Configurazioni di avvio di IntelliJ IDEA versionate nel repository: avvio in sviluppo, build e avvio, le tre suite di test e la build dei pacchetti Linux, disponibili come pulsanti appena si apre il progetto.

### Fixed
- L'avvio in sviluppo non partiva più: Vite metteva il server solo su IPv6 mentre lo script lo attendeva su 127.0.0.1, così Electron non veniva mai lanciato e l'attesa non finiva. L'indirizzo del server di sviluppo è ora esplicito.
- Gli script di verifica e di collaudo scelgono l'artefatto della versione in corso: con più build nella cartella `release/` certificavano — o collaudavano — quella precedente.

## [1.0.1] - 2026-08-31

### Added
- Schermata di avvio con logo: resta visibile almeno tre secondi e lascia il posto alla finestra principale solo quando questa è pronta, così l'applicazione non può più sembrare bloccata all'apertura.
- Pulsante «i» nell'intestazione con versione, autore, licenza AGPLv3 e versioni del runtime.
- Comando «Segnala un Bug»: apre il programma di posta predefinito con oggetto `[BUG PDFIX]`, destinatario di contatto e dettagli della versione già nel corpo del messaggio.
- Traduzione inglese completa dell'interfaccia, delle finestre di sistema e dei messaggi del processo principale, con selettore di lingua accanto al pulsante delle impostazioni; la lingua scelta viene ricordata fra le sessioni.

## [1.0.0] - 2026-08-30

### Added
- Manipolazione delle pagine: estrazione, eliminazione, rotazione e divisione in più file.
- Creazione di PDF da immagini JPG e PNG, a dimensione originale o impaginate su A4.
- Filigrana testuale, numerazione delle pagine, modifica dei metadati e ottimizzazione del documento.
- Parametri per operazione: ogni comando che ne ha bisogno chiede i propri valori in una finestra generata dal catalogo.
- Modalità scura e zoom dell'interfaccia dal 10% al 150%, entrambi ricordati fra le sessioni.
- Icona dell'applicazione nell'intestazione e finestra utilizzabile da 800×600 fino al 4K.

### Changed
- La barra dei menu di Chromium non viene più mostrata su Windows e Linux: i comandi sono tutti nell'interfaccia, con le scorciatoie da tastiera corrispondenti.
- L'elenco dei file accetta anche immagini; ogni operazione dichiara i formati che sa trattare e resta disattivata sugli altri.

### Fixed
- La finestra poteva restare invisibile quando il compositore grafico era fermo (schermo bloccato o sessione minima): ora la comparsa è garantita anche dal completamento del caricamento.

## [0.9.0] - 2026-08-30

Versione candidata al rilascio: applicazione completa, verificata e impacchettata
per le tre piattaforme.

### Added
- Applicazione desktop Electron per Windows, macOS e Linux (deb, AppImage, Snap, NSIS, DMG).
- Unione di PDF e conversione in PDF/A-1b con motore interno basato su pdf-lib, eseguito in un processo separato: nessun runtime esterno da installare.
- Impostazioni con limite di memoria dell'elaborazione, timeout, comportamento dei percorsi e attivazione delle singole funzionalità.
- Catalogo delle operazioni come unica fonte di verità: l'interfaccia genera i comandi, non li conosce.
- Pipeline di release con versionamento automatico, changelog Debian conforme e ricostruzione del pacchetto `.deb`.
- Verifica automatica dei pacchetti prodotti: conformità del `.deb` e integrità dell'immagine Snap.
- Workflow di integrazione continua su Linux, Windows e macOS.
- Suite di test su tre livelli: interfaccia, motore e applicazione reale end-to-end.
