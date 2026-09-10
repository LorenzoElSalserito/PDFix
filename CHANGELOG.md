# Changelog

Tutte le modifiche rilevanti a PDFix sono elencate in questo file.

Il formato segue [Keep a Changelog](https://keepachangelog.com/it/1.1.0/) e la
numerazione segue [Semantic Versioning](https://semver.org/lang/it/).

La sezione delle modifiche non ancora rilasciate è l'unico punto in cui si
scrive a mano: `npm run dist` la consolida in una sezione datata, aggiorna
`release-history.json` e la ricrea vuota.

## [Unreleased]

## [1.3.3] - 2026-09-10

### Added
- Due guardie di git versionate in `.githooks/`, attivate da sole dopo `npm install`. Prima del commit e prima del push verificano che le quattro dichiarazioni di versione — `package.json`, `package-lock.json`, `release-history.json`, `CHANGELOG.md` — combacino **nell'indice**, cioè in quello che il commit conterrà davvero, non nella cartella di lavoro. Tre release di fila si sono fermate sul runner per un commit che ne conteneva solo una parte: ora la cosa si ferma prima di partire, dicendo quali file mancano. `npm run verify:version` esegue lo stesso controllo a mano.

### Fixed
- Il controllo sui permessi delle guardie di git legge la modalità registrata nell'indice (`100755`) invece di quella del filesystem: Windows non ha il bit di esecuzione e `statSync` lì rispondeva sempre di no, facendo cadere la suite su quel solo sistema. È anche il controllo giusto, perché è l'indice a decidere se dopo un checkout l'aggancio sarà eseguibile.
- `run-packaged-e2e.js` non esegue più la suite quando viene semplicemente importato. Il suo `main()` stava al primo livello del modulo, senza la guardia di ingresso che hanno tutti gli altri script: importarlo — cosa che fa un test per riusarne una funzione — avviava l'intera suite o usciva con un errore se non c'era un'applicazione impacchettata. In locale la cartella `release/` esisteva e i test passavano; su ogni runner cadeva l'intero file di test. Un test nuovo pretende ora la guardia da qualunque script abbia un `main()`.
- Il marker di release sospesa non viene più armato da una risincronizzazione (`version:bump --no-bump`) né da una build in CI: nessuna delle due consuma un numero di versione, e trovarselo armato inchiodava il bump successivo alla versione corrente.
- `version:bump` elenca i file appena riscritti: la versione vive in quattro posti e committarne solo una parte fa fallire la guardia di coerenza a release già avviata.

## [1.3.2] - 2026-09-10

### Fixed
- La release non tenta più di pubblicare i pacchetti. Con `publish: null` nel manifesto electron-builder risolve comunque il publisher dello Snap Store quando la build parte da un tag: sul runner cercava `snapcraft`, non lo trovava e faceva fallire una release già costruita e verificata. Gli script passano ora `--publish never` — gli artefatti li carica il workflow, non electron-builder.
- La build macOS produce di nuovo entrambe le architetture. I nomi dei target passati a `electron-builder` sulla riga di comando (`--mac dmg zip`) sostituiscono l'elenco del manifesto, architetture comprese: la CI costruiva solo quella del runner e il DMG Intel non nasceva mai. Ora gli script indicano soltanto il sistema (`--mac`, `--win`, `--linux`) e i formati restano dichiarati in un posto solo, `package.json`.
- La suite end-to-end sull'applicazione impacchettata parte anche su Windows: veniva avviata tramite `npx`, che lì è `npx.cmd` e `spawnSync` non sa eseguire senza shell. Playwright non partiva e il comando usciva con 1 senza stampare nulla — nemmeno un file di traccia da caricare. Ora si usa direttamente questo Node con la riga di comando di Playwright, e un avvio fallito viene riportato invece di essere ingoiato.

## [1.3.1] - 2026-09-08

### Fixed
- Le finestre di dialogo non si chiudono più quando un trascinamento cominciato dentro il pannello finisce sullo sfondo. Collocare la firma vicino al bordo e rilasciare il puntatore fuori dal riquadro faceva sparire la finestra con tutto il lavoro fatto — e faceva fallire i test end-to-end sui runner macOS, dove la finestra è più piccola e il gesto esce prima. Un clic vero sullo sfondo continua a chiudere.
- I gesti dei test end-to-end si misurano in frazioni dell'anteprima invece che in pixel fissi: la stessa prova vale su qualunque dimensione di finestra.

### Changed
- Il manutentore dei pacchetti è `Lorenzo De Marco <commercial.lorenzodm@gmail.com>` ovunque — autore npm, campo `Maintainer` del `.deb`, costante della pipeline e tutte e sette le voci dello storico delle release. L'alias no-reply di GitHub usato prima non riceve posta: come manutentore Debian era un indirizzo irraggiungibile. La guardia di coerenza ora controlla che i quattro punti restino allineati, e un test rifiuta esplicitamente un indirizzo `users.noreply.github.com`.

## [1.3.0] - 2026-09-08

### Added
- **Firma su foglio**: l'immagine della propria firma — un PNG o un JPG — appoggiata sul documento. La finestra mostra l'anteprima della pagina vera, disegnata in locale, e la firma si colloca trascinandola: la maniglia la ridimensiona, le frecce la spostano di poco, il selettore cambia pagina. Quello che si vede nell'anteprima è quello che il documento riceve, perché la posizione viaggia in frazioni della pagina e non in pixel dello schermo.
- Le pagine ruotate sono gestite: su un foglio con `/Rotate` la firma resta dritta e dentro il margine invece di comparire coricata.
- Test end-to-end mirati: la firma trascinata, spostata con le frecce, ridimensionata dalla maniglia e messa su una pagina diversa viene ritrovata nel PDF prodotto rileggendo le coordinate scritte nel file, con la tolleranza di due pixel dell'anteprima.

### Changed
- La firma digitale con certificato PKCS#12 non è più fra i comandi: richiede un certificato valido e una spiegazione che l'interfaccia non dà ancora. Il motore e i suoi test restano al loro posto, la funzione torna visibile togliendo un flag nel catalogo.
- I parametri strutturati attraversano il confine IPC come dati semplici: la reattività di Vue avvolge anche gli oggetti annidati e la chiamata sarebbe fallita con «An object could not be cloned».

## [1.2.0] - 2026-09-08

### Added
- La pulsantiera delle funzionalità è ora divisa per gruppi — Documento, Pagine, Impaginazione, Contenuto, Moduli, Sicurezza — con schede che ne mostrano il numero e filtrano i comandi. Ventisei pulsanti affiancati erano un muro: il raggruppamento vive nel catalogo, accanto ai descrittori, così una funzionalità nuova nasce già al suo posto.
- Ogni comando è una scheda con il simbolo del suo gruppo; un punto verde segnala le operazioni che producono sempre un PDF/A, e l'interruttore PDF/A è diventato una pastiglia accanto alle schede.
- Test end-to-end del trascinamento: file rilasciati nell'area di caricamento, immagini, doppioni, file rifiutati, evidenziazione dell'area e riordino dell'elenco con tre documenti, compresa la verifica che si trascini solo dalla maniglia.
- Test end-to-end della pulsantiera guidati dal catalogo: ogni operazione ha un pulsante nel gruppo che dichiara, ogni pulsante apre la sua finestra o avvia davvero l'elaborazione, le schede filtrano, Esc chiude senza eseguire nulla.
- Le voci degli elenchi a discesa dei parametri sono tradotte, e un test verifica la copertura delle traduzioni sull'intero catalogo: etichette, descrizioni, parametri, aiuti, voci degli elenchi, gruppi, campi e sezioni delle impostazioni. Una chiave mancante ora fa fallire la suite invece di comparire in italiano in mezzo all'inglese.

### Fixed
- **Il trascinamento dei file non caricava nulla.** Il `FileList` dell'evento di rilascio attraversava il ponte di contesto di Electron come oggetto vuoto: il processo principale riceveva un elenco senza percorsi e l'applicazione non aggiungeva né file né errori. Il componente passa ora un array di `File`, che il ponte consegna intatto.
- La sezione «Funzionalità» delle impostazioni restava in italiano con l'interfaccia in inglese: mancava la sua chiave di traduzione.

### Changed
- La build Windows è **portabile**: `pdfix_vX.Y.Z_x64.exe` si esegue senza installazione e senza privilegi di amministratore, coerente con un'applicazione che non lascia nulla sul sistema. L'installer NSIS non viene più prodotto.
- Il pacchetto macOS non viene firmato in modo implicito: l'identità è dichiarata nulla nel manifesto. Senza certificato la firma falliva e con essa la costruzione del DMG.
- La pipeline verifica gli artefatti appena costruiti (`npm run verify:artifacts`): per ogni target dichiarato nel manifesto deve esistere il file della versione in corso, con entrambe le architetture dove il manifesto ne dichiara due. Un DMG che non si costruisce ferma la release invece di lasciare una cartella incompleta.
- Integrazione continua: sui runner Linux vengono installati anche `fakeroot`, `dpkg-dev` e `squashfs-tools`, così i test del pacchetto Debian e dello snap girano davvero invece di escludersi da soli — erano proprio quei controlli a mancare quando la release falliva.
- `.gitattributes` fissa i fine riga a LF al checkout: su Windows la conversione automatica in CRLF avrebbe fatto fallire i confronti di contenuto e le impronte del pacchetto solo su quel sistema.

## [1.1.0] - 2026-08-31

### Added
- **Più pagine per foglio**: due o quattro pagine su ogni foglio, con margine regolabile e cornice di taglio facoltativa.
- **Libretto**: imposizione a sella per la rilegatura a punto metallico, con le facciate bianche aggiunte quando le pagine non sono un multiplo di quattro.
- **Uniforma formato**: porta un documento con pagine di misure diverse a un unico formato (A3, A4, A5, Letter o quello della prima pagina), scalando il contenuto senza deformarlo.
- **Ritaglia margini**: restringe l'area visibile delle pagine scelte. Il contenuto tagliato resta nel file: serve a inquadrare una scansione, non a nascondere informazioni, e la descrizione lo dice.
- **Filigrana con immagine**: sovrappone un logo o un timbro PNG o JPG alle pagine scelte, con posizione, larghezza e opacità regolabili.
- **Numerazione Bates**: numera un fascicolo di più documenti con una sequenza unica e continua, con prefisso, suffisso e cifre fisse, come richiede l'uso legale.
- **Moduli PDF**: elenco dei campi compilabili in un file JSON, compilazione guidata — la finestra chiede un valore per ogni campo che il documento ha davvero — e blocco dei campi compilati.
- Le operazioni possono chiedere un file come parametro (l'immagine di un timbro) e possono produrre un file che non è un PDF: la finestra di salvataggio segue l'operazione.
- **Allega un file**: incorpora un file di qualunque tipo nel documento e produce un PDF/A-3b, la parte dello standard che l'archiviazione a norma richiede per un documento accompagnato dai propri dati — la fattura elettronica con il suo XML, per esempio.
- **Crea segnalibri**: costruisce l'indice navigabile del documento da un elenco di pagine e titoli scritto nella finestra.
- **Dividi per segnalibro**: un file per ogni segnalibro di primo livello, intitolato come il segnalibro invece che numerato.
- **Proteggi con password**: cifratura AES-256 con password di apertura e del proprietario, e permessi separati per stampa, copia, modifica, annotazioni e compilazione dei moduli.
- **Togli la protezione**: produce una copia libera a partire dalla password con cui è stata applicata.
- **Firma digitalmente**: firma PAdES con un certificato PKCS#12 dell'utente, senza marca temporale e senza alcuna connessione.
- Il profilo PDF/A ora accetta la parte dello standard: la conversione resta PDF/A-1b, gli allegati richiedono e producono PDF/A-3b.

### Changed
- Il motore usa `@cantoo/pdf-lib` al posto di `pdf-lib`: stessa API, con in più la cifratura. Il bundle del motore passa da 0,95 MB a 2,02 MB, per la maggior parte dovuti a `node-forge`, necessario alla firma digitale.

### Fixed
- Gli script della pipeline riconoscono di essere stati lanciati da riga di comando anche su Windows e nei percorsi con spazi: il confronto fatto concatenando `file://` al percorso non combaciava mai, così `version-bump`, `deb-finalize` e le altre utilità venivano importate senza eseguire nulla e l'integrazione continua falliva su Windows.
- I nomi dei file dentro il pacchetto Debian sono sempre in forma POSIX: il confronto con `DEBIAN/` usava il separatore del sistema e sbagliava i permessi attesi fuori da Linux.
- La guardia di coerenza non fa più fallire i test del motore su una copia appena clonata: la build assente resta un problema segnalato, ma non viene confusa con un'incoerenza del repository. Il flusso di release compila prima di eseguire le suite.

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
