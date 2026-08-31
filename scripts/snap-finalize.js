#!/usr/bin/env node
/**
 * Completa e verifica il pacchetto Snap.
 *
 * `electron-builder` 26.15.x costruisce lo snap dal proprio template
 * precompilato, ma copia nell'immagine l'archivio `snap-template-*.tar` senza
 * estrarlo: nel pacchetto finiscono il tar e non i file che contiene. Il
 * risultato non parte, perche' `command.sh` invoca `$SNAP/desktop-init.sh`,
 * `$SNAP/desktop-common.sh` e `$SNAP/desktop-gnome-specific.sh`, che nel
 * pacchetto non esistono.
 *
 * Questo script apre lo snap, estrae il template al posto giusto, elimina il
 * tar, verifica che l'immagine sia coerente e la ricompatta. Rieseguirlo su uno
 * snap gia' completo non cambia il contenuto: la riparazione e' idempotente.
 *
 *   node scripts/snap-finalize.js release/pdfix_v2.0.1_amd64.snap
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { load } from 'js-yaml'
import { pickArtifact } from './lib/release-meta.js'

/** Compressione richiesta da snapd per le immagini squashfs. */
const COMPRESSION = 'xz'

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} → exit ${result.status}\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

function has(command) {
  return spawnSync('command', ['-v', command], { shell: true, encoding: 'utf8' }).status === 0
}

/** Il template non estratto lasciato nell'immagine da electron-builder. */
export function findTemplateArchive(rootDir) {
  const entry = readdirSync(rootDir).find((name) => /^snap-template-.*\.tar$/.test(name))
  return entry ? path.join(rootDir, entry) : null
}

/** Percorsi `$SNAP/...` richiamati dallo script di avvio. */
export function scriptsReferencedByCommand(commandText) {
  return [...commandText.matchAll(/\$SNAP\/([\w.-]+\.sh)/g)].map((match) => match[1])
}

/**
 * Controlli di coerenza sull'immagine estratta.
 *
 * @param {string} rootDir radice dell'immagine
 * @param {{version?: string}} [expected]
 * @returns {string[]} elenco dei problemi, vuoto se l'immagine e' valida
 */
export function inspectSnapTree(rootDir, expected = {}) {
  const problems = []
  const metaPath = path.join(rootDir, 'meta', 'snap.yaml')
  if (!existsSync(metaPath)) return ['meta/snap.yaml assente']

  let meta
  try {
    meta = load(readFileSync(metaPath, 'utf8'))
  } catch (error) {
    return [`meta/snap.yaml illeggibile: ${error.message}`]
  }

  for (const field of ['name', 'version', 'base', 'confinement', 'grade', 'apps']) {
    if (!meta?.[field]) problems.push(`meta/snap.yaml: campo "${field}" mancante`)
  }
  if (expected.version && meta?.version !== expected.version) {
    problems.push(`meta/snap.yaml: versione ${meta.version}, attesa ${expected.version}`)
  }
  if (meta?.confinement === 'devmode' || meta?.grade === 'devel') {
    problems.push('lo snap e\' marcato devmode/devel: non e\' pubblicabile su un canale stabile')
  }

  const apps = Object.entries(meta?.apps ?? {})
  if (apps.length === 0) problems.push('meta/snap.yaml: nessuna app dichiarata')

  for (const [appName, app] of apps) {
    const command = app?.command
    if (!command) {
      problems.push(`app "${appName}": nessun comando dichiarato`)
      continue
    }
    const commandPath = path.join(rootDir, command)
    if (!existsSync(commandPath)) {
      problems.push(`app "${appName}": comando mancante nell'immagine (${command})`)
      continue
    }
    if ((statSync(commandPath).mode & 0o111) === 0) {
      problems.push(`app "${appName}": comando non eseguibile (${command})`)
    }
    // Gli script di integrazione desktop arrivano dal template: se il template
    // non e' stato estratto, qui manca tutto.
    for (const script of scriptsReferencedByCommand(readFileSync(commandPath, 'utf8'))) {
      if (!existsSync(path.join(rootDir, script))) {
        problems.push(`script di avvio mancante: ${script}`)
      }
    }
  }

  const guiDir = path.join(rootDir, 'meta', 'gui')
  if (!existsSync(guiDir)) {
    problems.push('meta/gui assente: lo snap non avrebbe icona ne\' voce di menu')
  } else {
    const entries = readdirSync(guiDir)
    if (!entries.some((name) => name.endsWith('.desktop'))) problems.push('meta/gui: nessun file .desktop')
    if (!entries.some((name) => /\.(png|svg)$/.test(name))) problems.push('meta/gui: nessuna icona')
  }

  if (findTemplateArchive(rootDir)) {
    problems.push('il template del runtime e\' presente come archivio invece che estratto')
  }

  return problems
}

function finalize(snapPath) {
  if (!existsSync(snapPath)) throw new Error(`Pacchetto inesistente: ${snapPath}`)
  for (const tool of ['unsquashfs', 'mksquashfs']) {
    if (!has(tool)) throw new Error(`${tool} non trovato: installa squashfs-tools.`)
  }

  const workDir = mkdtempSync(path.join(tmpdir(), 'pdfix-snap-'))
  const rootDir = path.join(workDir, 'squashfs-root')
  try {
    sh('unsquashfs', ['-q', '-no-progress', '-d', rootDir, snapPath])

    // Riparazione: il template va estratto nella radice dell'immagine.
    const template = findTemplateArchive(rootDir)
    if (template) {
      sh('tar', ['-xf', template, '-C', rootDir])
      rmSync(template)
      console.log(`Template del runtime estratto (${path.basename(template)}).`)
    }

    const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
    const problems = inspectSnapTree(rootDir, { version })
    if (problems.length > 0) {
      throw new Error(`immagine snap non valida:\n  - ${problems.join('\n  - ')}`)
    }

    const rebuilt = `${snapPath}.new`
    rmSync(rebuilt, { force: true })
    sh('mksquashfs', [
      rootDir,
      rebuilt,
      '-noappend',
      '-comp',
      COMPRESSION,
      '-no-xattrs',
      '-no-fragments',
      '-all-root',
      '-no-progress',
      '-quiet',
    ])
    renameSync(rebuilt, snapPath)

    console.log(`Snap verificato: ${path.basename(snapPath)} (versione ${version})`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

/**
 * Come per il `.deb`: senza argomento si verifica lo snap della versione in
 * corso, non un percorso qualsiasi.
 *
 * @param {string[]} names contenuto della cartella
 * @param {string} version versione attesa
 * @returns {string|null}
 */
export function pickSnap(names, version) {
  return pickArtifact(names, '.snap', version)
}

function resolveTarget() {
  const argument = process.argv[2]
  if (argument) return path.resolve(argument)
  const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version
  const releaseDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'release')
  const candidate = existsSync(releaseDir) ? pickSnap(readdirSync(releaseDir), version) : null
  if (!candidate) {
    throw new Error(`nessuno snap della versione ${version} in release/: esegui prima \`npm run dist:linux\`.`)
  }
  return path.join(releaseDir, candidate)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    finalize(resolveTarget())
  } catch (error) {
    console.error(`snap-finalize: ${error.message}`)
    process.exit(1)
  }
}
