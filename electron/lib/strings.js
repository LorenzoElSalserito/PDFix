/**
 * Testi del processo principale.
 *
 * Sono pochi ma non traducibili dal renderer: titoli dei dialog nativi, voci di
 * menu su macOS, finestra «Informazioni». Il dizionario vive qui, quello
 * dell'interfaccia in `client/src/i18n`; la lingua è la stessa, letta dalle
 * preferenze.
 */

/** Lingue supportate dall'applicazione. */
export const LANGUAGES = ['it', 'en']

const DICTIONARY = {
  it: {
    'dialog.open.title': 'Seleziona documenti o immagini',
    'dialog.open.documentsAndImages': 'Documenti e immagini',
    'dialog.open.documents': 'Documenti PDF',
    'dialog.open.images': 'Immagini',
    'dialog.save.title': 'Salva PDF',
    'dialog.save.filter': 'Documento PDF',
    'dialog.save.filterData': 'File di dati',
    'dialog.file.title': 'Scegli un file',
    'dialog.file.filter': 'File accettati',
    'dialog.directory.title': 'Cartella di destinazione',
    'about.title': 'Informazioni su PDFix',
    'about.summary': 'Unione, modifica e conversione di PDF, interamente in locale.',
    'about.privacy': 'Nessun file lascia il computer e nessun componente esterno è richiesto.',
    'about.author': 'Sviluppato da Lorenzo De Marco — licenza AGPLv3',
    'about.close': 'Chiudi',
    'menu.file': 'File',
    'menu.addFiles': 'Aggiungi documenti…',
    'menu.clear': 'Svuota elenco',
    'menu.settings': 'Impostazioni…',
    'menu.quit': 'Esci',
    'menu.closeWindow': 'Chiudi finestra',
    'menu.edit': 'Modifica',
    'menu.undo': 'Annulla',
    'menu.redo': 'Ripeti',
    'menu.cut': 'Taglia',
    'menu.copy': 'Copia',
    'menu.paste': 'Incolla',
    'menu.selectAll': 'Seleziona tutto',
    'menu.view': 'Visualizza',
    'menu.reload': 'Ricarica',
    'menu.devTools': 'Strumenti di sviluppo',
    'menu.resetZoom': 'Zoom originale',
    'menu.zoomIn': 'Aumenta zoom',
    'menu.zoomOut': 'Riduci zoom',
    'menu.fullscreen': 'Schermo intero',
    'menu.help': 'Aiuto',
    'menu.about': 'Informazioni su PDFix',
    'menu.website': 'Sito del progetto',
    'menu.hide': 'Nascondi PDFix',
    'menu.hideOthers': 'Nascondi altre',
    'menu.unhide': 'Mostra tutte',
    'menu.services': 'Servizi',
    'bug.subject': '[BUG PDFIX] ',
    'bug.body.intro': 'Descrivi il problema e come riprodurlo.',
    'bug.body.details': 'Dati tecnici (non modificare):',
  },
  en: {
    'dialog.open.title': 'Select documents or images',
    'dialog.open.documentsAndImages': 'Documents and images',
    'dialog.open.documents': 'PDF documents',
    'dialog.open.images': 'Images',
    'dialog.save.title': 'Save PDF',
    'dialog.save.filter': 'PDF document',
    'dialog.save.filterData': 'Data file',
    'dialog.file.title': 'Choose a file',
    'dialog.file.filter': 'Accepted files',
    'dialog.directory.title': 'Destination folder',
    'about.title': 'About PDFix',
    'about.summary': 'Merge, edit and convert PDFs, entirely on your computer.',
    'about.privacy': 'No file ever leaves your computer and nothing else needs installing.',
    'about.author': 'Developed by Lorenzo De Marco — AGPLv3 licence',
    'about.close': 'Close',
    'menu.file': 'File',
    'menu.addFiles': 'Add documents…',
    'menu.clear': 'Clear list',
    'menu.settings': 'Settings…',
    'menu.quit': 'Quit',
    'menu.closeWindow': 'Close window',
    'menu.edit': 'Edit',
    'menu.undo': 'Undo',
    'menu.redo': 'Redo',
    'menu.cut': 'Cut',
    'menu.copy': 'Copy',
    'menu.paste': 'Paste',
    'menu.selectAll': 'Select all',
    'menu.view': 'View',
    'menu.reload': 'Reload',
    'menu.devTools': 'Developer tools',
    'menu.resetZoom': 'Actual size',
    'menu.zoomIn': 'Zoom in',
    'menu.zoomOut': 'Zoom out',
    'menu.fullscreen': 'Full screen',
    'menu.help': 'Help',
    'menu.about': 'About PDFix',
    'menu.website': 'Project website',
    'menu.hide': 'Hide PDFix',
    'menu.hideOthers': 'Hide others',
    'menu.unhide': 'Show all',
    'menu.services': 'Services',
    'bug.subject': '[BUG PDFIX] ',
    'bug.body.intro': 'Describe the problem and how to reproduce it.',
    'bug.body.details': 'Technical details (please leave as is):',
  },
}

/** Lingua valida più vicina a quella richiesta. */
export function resolveLanguage(language) {
  return LANGUAGES.includes(language) ? language : LANGUAGES[0]
}

/**
 * Traduttore per una lingua.
 *
 * Una chiave sconosciuta torna com'è: un testo brutto è meglio di una finestra
 * vuota, e in fase di sviluppo si vede subito.
 */
export function translator(language) {
  const dictionary = DICTIONARY[resolveLanguage(language)]
  return (key) => dictionary[key] ?? DICTIONARY.it[key] ?? key
}

export const dictionaries = DICTIONARY
