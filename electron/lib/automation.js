/**
 * Punti di aggancio per l'automazione dei test end-to-end.
 *
 * I test pilotano un'applicazione reale, non un mock: le uniche parti che non
 * possono essere guidate da Playwright sono le finestre di dialogo native del
 * sistema operativo. Quando le variabili d'ambiente qui sotto sono valorizzate,
 * i dialog vengono sostituiti da percorsi fissi; in tutti gli altri casi il
 * codice di produzione è identico.
 */

import path from 'node:path'

/** Percorsi restituiti al posto della finestra "apri file". */
export function fixtureOpenPaths() {
  const value = process.env.PDFIX_E2E_FIXTURES
  return value ? value.split(path.delimiter).filter(Boolean) : null
}

/** Percorso restituito al posto della finestra "salva con nome". */
export function fixtureSavePath() {
  return process.env.PDFIX_E2E_OUTPUT || null
}

/** Cartella restituita al posto della finestra "scegli cartella". */
export function fixtureSaveDir() {
  return process.env.PDFIX_E2E_OUTPUT_DIR || null
}

/**
 * Durata alternativa dello splash, in millisecondi.
 *
 * I test end-to-end non possono permettersi tre secondi per ciascuno dei
 * trentacinque casi: la schermata resta, ma la sua durata viene azzerata. Un
 * test dedicato la verifica invece con il valore reale.
 */
export function splashDurationOverride() {
  const value = Number(process.env.PDFIX_SPLASH_MS)
  return Number.isFinite(value) && value >= 0 ? value : null
}

/** L'applicazione sta girando sotto un test end-to-end? */
export function isAutomated() {
  return Boolean(process.env.PDFIX_E2E_FIXTURES || process.env.PDFIX_E2E_OUTPUT || process.env.PDFIX_USER_DATA)
}

/** Cartella dati alternativa, per isolare le preferenze dei test. */
export function overriddenUserDataDir() {
  return process.env.PDFIX_USER_DATA || null
}
