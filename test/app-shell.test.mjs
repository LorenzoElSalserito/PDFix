/**
 * Test della scocca dell'applicazione: schermata di avvio, testi del processo
 * principale e segnalazione di un problema.
 *
 * Sono le parti che vivono nel main e non passano dal renderer: qui si
 * verificano le regole, mentre l'integrazione con Electron è coperta dai test
 * end-to-end.
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SPLASH_DURATION_MS,
  SPLASH_SIZE,
  remainingDelay,
  splashWindowOptions,
} from '../electron/lib/startup.js'
import { LANGUAGES, dictionaries, resolveLanguage, translator } from '../electron/lib/strings.js'
import { BUG_SUBJECT_PREFIX, CONTACT_EMAIL, buildBugReportUrl } from '../electron/lib/bug-report.js'
import { DONATION_URL } from '../electron/lib/donation.js'

// --------------------------------------------------------------- splash -----

test('lo splash dura tre secondi', () => {
  assert.equal(SPLASH_DURATION_MS, 3000)
})

test('l attesa residua copre il tempo che manca, mai di più', () => {
  assert.equal(remainingDelay(0), 3000)
  assert.equal(remainingDelay(1200), 1800)
  assert.equal(remainingDelay(3000), 0)
  assert.equal(remainingDelay(9000), 0, 'una finestra lenta non allunga lo splash')
  assert.equal(remainingDelay(500, 1000), 500, 'la durata è configurabile')
})

test('la finestra di avvio nasce centrata sull area utile', () => {
  const options = splashWindowOptions({ workArea: { width: 1920, height: 1080 } })
  assert.equal(options.width, SPLASH_SIZE.width)
  assert.equal(options.x, Math.round((1920 - SPLASH_SIZE.width) / 2))
  assert.equal(options.y, Math.round((1080 - SPLASH_SIZE.height) / 2))
  assert.equal(options.frame, false)
})

test('la finestra di avvio porta l icona e il nome dell applicazione', () => {
  const options = splashWindowOptions({
    workArea: { width: 1280, height: 720 },
    icon: '/opt/pdfix/build/icon.png',
  })
  assert.equal(options.icon, '/opt/pdfix/build/icon.png', 'senza icona il gestore di finestre ne inventa una')
  assert.equal(options.title, 'PDFix')
})

test('senza icona sul disco la chiave non viene inventata', () => {
  const options = splashWindowOptions({ workArea: { width: 1280, height: 720 }, icon: null })
  assert.equal('icon' in options, false)
})

// ---------------------------------------------------------------- testi -----

test('i dizionari del processo principale hanno le stesse chiavi', () => {
  const italiane = Object.keys(dictionaries.it).sort()
  const inglesi = Object.keys(dictionaries.en).sort()
  assert.deepEqual(inglesi, italiane)
})

test('il traduttore risponde nella lingua richiesta', () => {
  assert.equal(translator('it')('about.author'), 'Sviluppato da Lorenzo De Marco — licenza AGPLv3')
  assert.equal(translator('en')('about.author'), 'Developed by Lorenzo De Marco — AGPLv3 licence')
})

test('una lingua sconosciuta ricade sull italiano', () => {
  assert.deepEqual(LANGUAGES, ['it', 'en'])
  assert.equal(resolveLanguage('de'), 'it')
  assert.equal(translator('de')('dialog.save.title'), 'Salva PDF')
})

test('una chiave inesistente non produce una stringa vuota', () => {
  assert.equal(translator('en')('chiave.inventata'), 'chiave.inventata')
})

// ------------------------------------------------------ segnalazione bug -----

test('la segnalazione apre un mailto con oggetto e destinatario giusti', () => {
  const info = {
    version: '1.0.0',
    electron: '43.2.0',
    chrome: '130.0.0',
    node: '20.19.2',
    platform: 'linux x64 (6.1.0)',
  }
  const url = buildBugReportUrl(info, translator('it'))

  assert.ok(url.startsWith(`mailto:${CONTACT_EMAIL}?`), url)
  const parsed = new URL(url)
  const params = new URLSearchParams(parsed.search)
  assert.equal(params.get('subject').trim(), BUG_SUBJECT_PREFIX)

  const body = params.get('body')
  assert.match(body, /PDFix 1\.0\.0/)
  assert.match(body, /Electron 43\.2\.0/)
  assert.match(body, /linux x64/)
  assert.match(body, /Descrivi il problema/)
})

test('il corpo della segnalazione segue la lingua scelta', () => {
  const info = { version: '1.0.0', electron: '43', chrome: '130', node: '20', platform: 'win32 x64' }
  const body = new URLSearchParams(new URL(buildBugReportUrl(info, translator('en'))).search).get('body')
  assert.match(body, /Describe the problem/)
})

test('l oggetto della segnalazione e sempre riconoscibile', () => {
  assert.equal(BUG_SUBJECT_PREFIX, '[BUG PDFIX]')
  assert.match(CONTACT_EMAIL, /^[^@\s]+@[^@\s]+\.[a-z]{2,}$/)
})

test('il collegamento per le donazioni e una pagina PayPal in HTTPS', () => {
  const url = new URL(DONATION_URL)
  assert.equal(url.protocol, 'https:')
  assert.equal(url.hostname, 'www.paypal.com')
  assert.equal(url.pathname, '/paypalme/lorenzodemarco92')
})
