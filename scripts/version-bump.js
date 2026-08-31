#!/usr/bin/env node
/**
 * Versionamento automatico.
 *
 * `package.json` → `version` è l'unica fonte di verità. Ogni altro riferimento
 * (lock file, nome degli artefatti, changelog, storico delle release) viene
 * riscritto qui, in blocco e con ripristino in caso di errore.
 *
 *   node scripts/version-bump.js              bump di patch
 *   node scripts/version-bump.js --minor
 *   node scripts/version-bump.js --major
 *   node scripts/version-bump.js --set 1.2.3
 *   node scripts/version-bump.js --no-bump    risincronizza, versione invariata
 *   node scripts/version-bump.js --dry-run    stampa e non scrive
 *   node scripts/version-bump.js --force      ignora il marker di release sospesa
 */

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import {
  ARTIFACT_NAME,
  DISTRIBUTION,
  MAINTAINER,
  URGENCY,
  bumpVersion,
  consolidateChangelog,
  findRelease,
  flush,
  paths,
  parseVersion,
  readJson,
  readReleaseHistory,
  rfc2822,
  stringifyJson,
} from './lib/release-meta.js'

export function parseArgs(argv) {
  const options = { kind: 'patch', set: null, bump: true, dryRun: false, force: false }
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]
    if (arg === '--major' || arg === '--minor' || arg === '--patch') options.kind = arg.slice(2)
    else if (arg === '--set') options.set = argv[++index]
    else if (arg === '--no-bump') options.bump = false
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--force') options.force = true
    else throw new Error(`Argomento sconosciuto: ${arg}`)
  }
  return options
}

/**
 * In CI la versione arriva dal commit: una matrice di runner che bumpa in
 * parallelo produrrebbe versioni divergenti per la stessa release.
 */
export function bumpDisabledByEnvironment(env = process.env) {
  return Boolean(env.CI) || env.PDFIX_NO_BUMP === '1'
}

function readPendingMarker() {
  if (!existsSync(paths.pendingMarker)) return null
  try {
    return readJson(paths.pendingMarker)
  } catch {
    return null
  }
}

/**
 * Decide la versione della build corrente.
 *
 * Se una build precedente ha già consumato un numero senza produrre artefatti,
 * quel numero viene riusato: dieci build fallite non bruciano dieci versioni.
 */
export function resolveTargetVersion({ current, options, pending, env = process.env }) {
  if (options.set) {
    parseVersion(options.set)
    return { version: options.set, reason: 'richiesta esplicita' }
  }
  if (!options.bump) return { version: current, reason: 'risincronizzazione' }
  if (bumpDisabledByEnvironment(env)) return { version: current, reason: 'ambiente CI' }
  if (!options.force && pending?.version === current) {
    return { version: current, reason: 'release sospesa da una build precedente' }
  }
  return { version: bumpVersion(current, options.kind), reason: `bump ${options.kind}` }
}

/** Riscrive `version` e `build.artifactName` in package.json. */
export function updatePackageJson(packageJson, version) {
  const next = { ...packageJson, version }
  next.build = { ...next.build, artifactName: ARTIFACT_NAME }
  return next
}

/** Riscrive entrambi i campi versione del lock file. */
export function updatePackageLock(lock, version) {
  const next = { ...lock, version }
  if (next.packages?.['']) {
    next.packages = { ...next.packages, '': { ...next.packages[''], version } }
  }
  return next
}

function main(argv) {
  const options = parseArgs(argv)
  const packageJson = readJson(paths.packageJson)
  const current = packageJson.version
  const pending = readPendingMarker()
  const { version, reason } = resolveTargetVersion({ current, options, pending })

  const date = new Date()
  const changelogText = readFileSync(paths.changelog, 'utf8')
  const history = readReleaseHistory()

  const writes = [
    { file: paths.packageJson, content: stringifyJson(updatePackageJson(packageJson, version)) },
    { file: paths.packageLock, content: stringifyJson(updatePackageLock(readJson(paths.packageLock), version)) },
  ]

  // Changelog e storico si toccano solo quando la versione è nuova: una
  // risincronizzazione non deve consumare la sezione [Unreleased].
  if (!findRelease(history, version)) {
    const { text, entries } = consolidateChangelog(changelogText, version, date)
    history.releases.unshift({
      version,
      date: rfc2822(date),
      distribution: DISTRIBUTION,
      urgency: URGENCY,
      maintainer: MAINTAINER,
      entries,
    })
    writes.push({ file: paths.changelog, content: text })
    writes.push({ file: paths.releaseHistory, content: stringifyJson(history) })
  }

  if (options.dryRun) {
    console.log(`Versione corrente : ${current}`)
    console.log(`Versione di build : ${version} (${reason})`)
    console.log(`File che verrebbero riscritti:\n  ${writes.map((write) => write.file).join('\n  ')}`)
    return
  }

  flush(writes)
  writeFileSync(paths.pendingMarker, stringifyJson({ version, createdAt: date.toISOString() }), 'utf8')
  console.log(`Versione ${version} (${reason}) propagata a ${writes.length} file.`)
}

/** Rimuove il marker di release sospesa: la release è andata a buon fine. */
export function clearPendingMarker() {
  if (existsSync(paths.pendingMarker)) rmSync(paths.pendingMarker)
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main(process.argv.slice(2))
  } catch (error) {
    console.error(`version-bump: ${error.message}`)
    process.exit(1)
  }
}
