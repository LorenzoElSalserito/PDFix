/**
 * Composizione della segnalazione di un problema.
 *
 * Il modulo non importa Electron: costruisce solo l'indirizzo `mailto:`, così
 * il formato della segnalazione è verificabile senza aprire una finestra.
 */

/** Indirizzo a cui arrivano le segnalazioni. */
export const CONTACT_EMAIL = 'commercial.lorenzodm@gmail.com'

/** Oggetto fisso: rende le segnalazioni filtrabili senza chiedere nulla all'utente. */
export const BUG_SUBJECT_PREFIX = '[BUG PDFIX]'

/**
 * @param {{version: string, electron: string, chrome: string, node: string, platform: string}} info
 * @param {(key: string) => string} translate
 * @returns {string} URL `mailto:` con oggetto e corpo già compilati
 */
export function buildBugReportUrl(info, translate) {
  const subject = `${BUG_SUBJECT_PREFIX} `
  const body = [
    translate('bug.body.intro'),
    '',
    '',
    translate('bug.body.details'),
    `PDFix ${info.version}`,
    `Electron ${info.electron} · Chromium ${info.chrome} · Node ${info.node}`,
    info.platform,
  ].join('\n')

  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}
