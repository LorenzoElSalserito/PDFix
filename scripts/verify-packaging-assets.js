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
import { ARTIFACT_NAME, findRelease, paths, readJson, readReleaseHistory } from './lib/release-meta.js'

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

  if (!findRelease(readReleaseHistory(), version)) {
    problems.push(`release-history.json non ha un record per la versione ${version}`)
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const problems = collectProblems()
  if (problems.length > 0) {
    console.error('verify:packaging ha trovato incoerenze:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }
  console.log('verify:packaging: versioni, changelog, icone e build coerenti.')
}
