#!/usr/bin/env node
/**
 * Guardia di coerenza, eseguita prima di `electron-builder`.
 *
 * Serve a rendere la pipeline non silenziosa: qualunque manomissione manuale
 * (versione disallineata nel lock, nome artefatto fissato a mano, changelog
 * senza la sezione della versione corrente, icone non generate, build assente)
 * ferma la release prima che il pacchetto venga costruito.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { ARTIFACT_NAME, MAINTAINER, findRelease, isEntrypoint, paths, readJson, readReleaseHistory } from './lib/release-meta.js'

/** @returns {string[]} elenco dei problemi trovati, vuoto se tutto è coerente */
export function collectProblems() {
  const problems = []
  const packageJson = readJson(paths.packageJson)
  const version = packageJson.version

  const lock = readJson(paths.packageLock)
  if (lock.version !== version) {
    problems.push(`package-lock.json: version ${lock.version} ≠ ${version}`)
  }
  if (lock.packages?.['']?.version !== version) {
    problems.push(`package-lock.json: packages[""].version ${lock.packages?.['']?.version} ≠ ${version}`)
  }

  if (packageJson.build?.artifactName !== ARTIFACT_NAME) {
    problems.push(`build.artifactName deve essere la macro letterale ${ARTIFACT_NAME}`)
  }

  const history = readReleaseHistory()
  if (!findRelease(history, version)) {
    problems.push(`release-history.json non ha un record per la versione ${version}`)
  }

  // Il manutentore compare in quattro punti — autore npm, campo Maintainer del
  // .deb, costante della pipeline, storico delle release — e finisce in chiaro
  // dentro il pacchetto: se i quattro divergono, il changelog Debian firma le
  // versioni con un indirizzo e il control ne dichiara un altro.
  const email = MAINTAINER.slice(MAINTAINER.indexOf('<') + 1, MAINTAINER.indexOf('>'))
  if (packageJson.author?.email !== email) {
    problems.push(`package.json: author.email ${packageJson.author?.email} ≠ ${email}`)
  }
  if (packageJson.build?.linux?.maintainer !== MAINTAINER) {
    problems.push(`package.json: build.linux.maintainer deve essere ${MAINTAINER}`)
  }
  for (const release of history.releases ?? []) {
    if (release.maintainer !== MAINTAINER) {
      problems.push(`release-history.json: la versione ${release.version} ha un manutentore diverso`)
    }
  }

  const changelog = readFileSync(paths.changelog, 'utf8')
  if (!changelog.includes(`## [${version}]`)) {
    problems.push(`CHANGELOG.md non ha una sezione per la versione ${version}`)
  }

  for (const [label, filePath] of [
    ['icona PNG', paths.iconPng],
    ['icona Windows', paths.iconIco],
    ['icona macOS', paths.iconIcns],
    ['set icone Linux', path.join(paths.iconsDir, '512x512.png')],
    ['interfaccia compilata', paths.rendererIndex],
    ['motore compilato', paths.engineBundle],
  ]) {
    if (!existsSync(filePath)) problems.push(`${label} mancante: ${path.relative(paths.root, filePath)}`)
  }

  return problems
}

if (isEntrypoint(import.meta.url)) {
  const problems = collectProblems()
  if (problems.length > 0) {
    console.error('verify:packaging ha trovato incoerenze:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('verify:packaging: versioni, changelog, icone e build coerenti.')
}
