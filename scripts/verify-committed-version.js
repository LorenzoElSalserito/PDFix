#!/usr/bin/env node
/**
 * Coerenza della versione in ciò che si sta per consegnare a git.
 *
 * `verify:packaging` controlla la cartella di lavoro, e quella è quasi sempre
 * in ordine: il numero di versione vive in quattro file e `version:bump` li
 * riscrive insieme. Il guaio nasce dopo, quando al commit ne finisce dentro
 * solo una parte — l'albero pubblicato dichiara allora una versione che il lock
 * o lo storico non conoscono, e la release si ferma sul runner invece che qui.
 *
 * Per questo il confronto non guarda i file su disco ma il loro contenuto
 * *nell'indice* (o in HEAD), cioè esattamente quello che il commit conterrà.
 *
 *   node scripts/verify-committed-version.js --staged   # prima del commit
 *   node scripts/verify-committed-version.js --head     # prima del push
 */

import { spawnSync } from 'node:child_process'
import { isEntrypoint } from './lib/release-meta.js'

/** File in cui la versione compare, con il nome usato nei messaggi. */
export const VERSION_FILES = ['package.json', 'package-lock.json', 'release-history.json', 'CHANGELOG.md']

/**
 * Contenuto di un file come git lo vede, non come sta sul disco.
 *
 * @param {string} ref `:` per l'indice, `HEAD:` per l'ultimo commit
 * @param {string} file percorso relativo alla radice del repository
 * @returns {string|null} `null` se git non conosce quel file
 */
export function readFromGit(ref, file) {
  const result = spawnSync('git', ['show', `${ref}${file}`], { encoding: 'utf8' })
  return result.status === 0 ? result.stdout : null
}

/**
 * Le quattro dichiarazioni di versione concordano?
 *
 * @param {{packageJson: string, packageLock: string, releaseHistory: string, changelog: string}} sources
 * @returns {string[]} problemi trovati, vuoto se tutto combacia
 */
export function versionProblems(sources) {
  const problems = []
  const manifest = JSON.parse(sources.packageJson)
  const version = manifest.version

  const lock = JSON.parse(sources.packageLock)
  if (lock.version !== version) {
    problems.push(`package-lock.json dichiara ${lock.version}, package.json ${version}`)
  }
  if (lock.packages?.['']?.version !== version) {
    problems.push(`package-lock.json: packages[""].version è ${lock.packages?.['']?.version}, non ${version}`)
  }

  const history = JSON.parse(sources.releaseHistory)
  if (!history.releases?.some((release) => release.version === version)) {
    problems.push(`release-history.json non ha un record per ${version}`)
  }

  if (!sources.changelog.includes(`## [${version}]`)) {
    problems.push(`CHANGELOG.md non ha la sezione ## [${version}]`)
  }

  return problems
}

/** Legge le quattro fonti da git; `null` se il repository non le conosce ancora. */
export function sourcesFrom(ref) {
  const [packageJson, packageLock, releaseHistory, changelog] = VERSION_FILES.map((file) =>
    readFromGit(ref, file),
  )
  if (!packageJson || !packageLock || !releaseHistory || !changelog) return null
  return { packageJson, packageLock, releaseHistory, changelog }
}

if (isEntrypoint(import.meta.url)) {
  const staged = !process.argv.includes('--head')
  const ref = staged ? ':' : 'HEAD:'
  const dove = staged ? 'nel commit che stai per fare' : 'in HEAD'

  const sources = sourcesFrom(ref)
  if (!sources) process.exit(0) // repository incompleto: non c'è niente da confrontare

  const problems = versionProblems(sources)
  if (problems.length > 0) {
    console.error(`La versione non è coerente ${dove}:`)
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('')
    console.error(`I quattro file della versione vanno insieme: ${VERSION_FILES.join(' ')}`)
    console.error('Aggiungili tutti e riprova (oppure `git commit --no-verify` per forzare).')
    process.exit(1)
  }
}
