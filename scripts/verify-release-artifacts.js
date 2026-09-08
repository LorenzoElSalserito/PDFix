#!/usr/bin/env node
/**
 * Controllo degli artefatti appena costruiti.
 *
 * `electron-builder` può concludere con successo pur non avendo prodotto tutto
 * quello che il manifesto dichiara: un target che fallisce in silenzio — il
 * DMG di macOS è il caso classico, perché dipende da `hdiutil` e dalla firma —
 * lascia una cartella `release/` incompleta e la pipeline se ne accorgerebbe
 * solo al momento della pubblicazione, o mai.
 *
 * Le attese non sono scritte qui: si leggono dai target dichiarati in
 * `package.json`, così aggiungere o togliere un formato non richiede di
 * aggiornare anche questo controllo.
 *
 *   npm run verify:artifacts            # piattaforma corrente
 */

import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { currentVersion, isEntrypoint, paths, pickArtifact, readJson } from './lib/release-meta.js'

/** Estensione del file prodotto da ciascun target di electron-builder. */
export const TARGET_EXTENSIONS = {
  deb: '.deb',
  AppImage: '.AppImage',
  appimage: '.AppImage',
  snap: '.snap',
  portable: '.exe',
  nsis: '.exe',
  dmg: '.dmg',
  zip: '.zip',
  mas: '.pkg',
}

/** Chiave della configurazione `build` che riguarda la piattaforma indicata. */
const PLATFORM_KEYS = { linux: 'linux', win32: 'win', darwin: 'mac' }

/**
 * Formati attesi sulla piattaforma indicata, letti dal manifesto.
 *
 * Ogni voce è `{ target, extension, arches }`: le architetture servono a
 * macOS, dove lo stesso formato viene prodotto una volta per architettura e
 * una sola delle due non basta.
 *
 * @param {object} packageJson
 * @param {NodeJS.Platform} platform
 */
export function expectedArtifacts(packageJson, platform = process.platform) {
  const key = PLATFORM_KEYS[platform]
  const targets = key ? (packageJson.build?.[key]?.target ?? []) : []
  const expected = []

  for (const entry of targets) {
    const target = typeof entry === 'string' ? entry : entry.target
    const extension = TARGET_EXTENSIONS[target]
    if (!extension) continue
    const arches = typeof entry === 'string' ? [] : (entry.arch ?? [])
    const found = expected.find((candidate) => candidate.extension === extension)
    if (found) found.arches = [...new Set([...found.arches, ...arches])]
    else expected.push({ target, extension, arches: [...arches] })
  }

  return expected
}

/**
 * Artefatti dichiarati ma non presenti fra i nomi indicati.
 *
 * Il confronto passa da `pickArtifact`: nella cartella restano anche le build
 * precedenti, e un `.dmg` della versione scorsa non è la prova che questa sia
 * stata costruita.
 *
 * @param {string[]} names contenuto della cartella `release/`
 * @param {string} version versione attesa
 * @param {{target: string, extension: string, arches: string[]}[]} expected
 * @returns {string[]} descrizione di ciò che manca
 */
export function missingArtifacts(names, version, expected) {
  const problems = []

  for (const { target, extension, arches } of expected) {
    if (!pickArtifact(names, extension, version)) {
      problems.push(`${target}: nessun file ${extension} per la versione ${version}`)
      continue
    }
    // Più architetture significa più file: su macOS un solo DMG vorrebbe dire
    // che una delle due build è fallita senza fermare electron-builder.
    for (const arch of arches.length > 1 ? arches : []) {
      const wanted = `_v${version}_${arch}${extension}`
      if (!names.some((name) => name.endsWith(wanted))) {
        problems.push(`${target}: manca l'artefatto ${arch} (atteso un nome che finisce con ${wanted})`)
      }
    }
  }

  return problems
}

/** Nomi presenti nella cartella `release/`, vuota o inesistente compresa. */
export function releaseNames(dir = path.join(paths.root, 'release')) {
  return existsSync(dir) ? readdirSync(dir) : []
}

if (isEntrypoint(import.meta.url)) {
  const version = currentVersion()
  const expected = expectedArtifacts(readJson(paths.packageJson))
  if (expected.length === 0) {
    console.log(`verify:artifacts: nessun target dichiarato per ${process.platform}, niente da verificare.`)
    process.exit(0)
  }

  const names = releaseNames()
  const problems = missingArtifacts(names, version, expected)
  if (problems.length > 0) {
    console.error(`verify:artifacts: la cartella release/ non contiene tutto quello che ${process.platform} dichiara:`)
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error(`  contenuto: ${names.length > 0 ? names.join(', ') : '(vuota)'}`)
    process.exit(1)
  }

  const riepilogo = expected.map(({ extension }) => extension).join(', ')
  console.log(`verify:artifacts: ${riepilogo} presenti per la versione ${version}.`)
}
