/**
 * Test dell'ambiente di sviluppo.
 *
 * Coprono i due modi in cui si avvia l'applicazione fuori dal pacchetto: lo
 * script `dev` di npm e i pulsanti di avvio di IntelliJ IDEA. Sono controlli di
 * coerenza fra file diversi, quelli che nessuna suite funzionale intercetta:
 * lo script resta valido, ma punta a un indirizzo o a un comando che non esiste
 * piu' e l'avvio si blocca senza un errore leggibile.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('..', import.meta.url))
const readText = (...parts) => readFileSync(path.join(repoRoot, ...parts), 'utf8')
const manifest = JSON.parse(readText('package.json'))

const runConfigDir = path.join(repoRoot, '.idea', 'runConfigurations')

/** Estrae il valore di un attributo `value` dall'elemento XML richiesto. */
function xmlValue(xml, element) {
  const match = xml.match(new RegExp(`<${element}\\s+value="([^"]*)"`))
  return match ? match[1] : null
}

/** Legge una proprieta' letterale dal blocco `server` della configurazione di Vite. */
function viteServerOption(source, key) {
  const block = source.match(/server:\s*\{([\s\S]*?)\n\s*\},/)?.[1] ?? ''
  const match = block.match(new RegExp(`${key}:\\s*'?([^,'\\n]+)'?`))
  return match ? match[1].trim() : null
}

test("lo script dev attende il server all'indirizzo su cui Vite ascolta", () => {
  const dev = manifest.scripts.dev
  const url = dev.match(/wait-on (\S+)/)?.[1]
  assert.ok(url, 'lo script dev deve attendere il server di sviluppo')

  const { hostname, port } = new URL(url)
  const viteConfig = readText('vite.renderer.config.js')

  // Il valore predefinito di Vite, `localhost`, si risolve in IPv6 su alcune
  // distribuzioni: se la configurazione non fissa l'indirizzo, `wait-on` resta
  // in attesa per sempre ed Electron non parte mai.
  assert.equal(viteServerOption(viteConfig, 'host'), hostname)
  assert.equal(viteServerOption(viteConfig, 'port'), port)
})

test("lo script dev passa a Electron lo stesso indirizzo che attende", () => {
  const dev = manifest.scripts.dev
  const waited = dev.match(/wait-on (\S+)/)?.[1]
  const passed = dev.match(/PDFIX_DEV_SERVER_URL=(\S+)/)?.[1]
  assert.equal(passed, waited)
})

test('ogni configurazione di avvio di IntelliJ richiama uno script esistente', () => {
  assert.ok(existsSync(runConfigDir), 'le configurazioni di avvio devono essere versionate')

  const files = readdirSync(runConfigDir).filter((name) => name.endsWith('.xml'))
  assert.ok(files.length > 0, 'deve esistere almeno una configurazione di avvio')

  for (const file of files) {
    const xml = readFileSync(path.join(runConfigDir, file), 'utf8')
    const script = xmlValue(xml, 'script')
    assert.ok(script, `${file}: la configurazione deve indicare uno script npm`)
    assert.ok(
      Object.hasOwn(manifest.scripts, script),
      `${file}: lo script "${script}" non esiste in package.json`,
    )
  }
})

test('le configurazioni di avvio puntano al package.json del progetto', () => {
  for (const file of readdirSync(runConfigDir).filter((name) => name.endsWith('.xml'))) {
    const xml = readFileSync(path.join(runConfigDir, file), 'utf8')
    assert.equal(xmlValue(xml, 'package-json'), '$PROJECT_DIR$/package.json', file)
    assert.match(xml, /type="js\.build_tools\.npm"/, file)
  }
})

test("esiste un pulsante di avvio dell'applicazione", () => {
  const scripts = readdirSync(runConfigDir)
    .filter((name) => name.endsWith('.xml'))
    .map((name) => xmlValue(readFileSync(path.join(runConfigDir, name), 'utf8'), 'script'))

  assert.ok(scripts.includes('dev'), 'manca la configurazione di avvio in sviluppo')
  assert.ok(scripts.includes('start'), "manca la configurazione di build e avvio")
})
