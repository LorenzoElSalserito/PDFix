/**
 * Metadati condivisi dalla pipeline di release.
 *
 * Percorsi, aritmetica delle versioni, date in formato Debian e lettura o
 * riscrittura del changelog vivono qui: `version-bump`, `deb-finalize` e
 * `verify-packaging-assets` non duplicano nulla di tutto ciò.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const paths = {
  root: repoRoot,
  packageJson: path.join(repoRoot, 'package.json'),
  packageLock: path.join(repoRoot, 'package-lock.json'),
  changelog: path.join(repoRoot, 'CHANGELOG.md'),
  releaseHistory: path.join(repoRoot, 'release-history.json'),
  pendingMarker: path.join(repoRoot, 'scripts', '.release-pending.json'),
  license: path.join(repoRoot, 'LICENSE'),
  iconPng: path.join(repoRoot, 'build', 'icon.png'),
  iconsDir: path.join(repoRoot, 'build', 'icons'),
  iconIco: path.join(repoRoot, 'build', 'icon.ico'),
  iconIcns: path.join(repoRoot, 'build', 'icon.icns'),
  rendererIndex: path.join(repoRoot, 'dist', 'renderer', 'index.html'),
  engineBundle: path.join(repoRoot, 'dist', 'engine', 'engine.cjs'),
}

/**
 * Nome degli artefatti. È una macro letterale: `electron-builder` espande
 * `${version}`, `${arch}` ed `${ext}`. `version-bump` riscrive sempre questo
 * campo, così un valore fissato a mano viene corretto alla build successiva.
 */
export const ARTIFACT_NAME = 'pdfix_v${version}_${arch}.${ext}'

/** Nome del pacchetto Debian: coincide con `build.executableName`. */
export const PKG_NAME = 'pdfix'

/** Sezione valida dell'archivio Debian (vedi lintian archive-sections). */
export const SECTION = 'utils'

export const MAINTAINER = 'Lorenzo De Marco <LorenzoElSalserito@users.noreply.github.com>'
export const DISTRIBUTION = 'unstable'
export const URGENCY = 'medium'
export const UPSTREAM_NAME = 'PDFix'
export const SOURCE_URL = 'https://github.com/LorenzoElSalserito/PDFix'

export function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf8'))
}

export function stringifyJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

export function currentVersion() {
  return readJson(paths.packageJson).version
}

/**
 * Solo versioni `X.Y.Z` piane: un pre-release verrebbe letto da dpkg come
 * revisione Debian e cambierebbe il nome del changelog nel pacchetto.
 */
/**
 * Sceglie, fra i file di `release/`, l'artefatto della versione richiesta.
 *
 * La cartella conserva anche le build precedenti: prendere il primo nome
 * disponibile significa certificare — o collaudare — la release sbagliata, con
 * esiti tanto più ingannevoli quanto più le due versioni si somigliano.
 *
 * @param {string[]} names contenuto della cartella
 * @param {string} extension estensione cercata, punto compreso
 * @param {string} version versione attesa
 * @returns {string|null} nome dell'artefatto, se presente
 */
export function pickArtifact(names, extension, version) {
  const candidates = names.filter((name) => name.endsWith(extension))
  return candidates.find((name) => name.includes(`_v${version}_`)) ?? null
}

export function parseVersion(value) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim())
  if (!match) throw new Error(`Versione non valida (atteso X.Y.Z): ${value}`)
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) }
}

export function formatVersion({ major, minor, patch }) {
  return `${major}.${minor}.${patch}`
}

/**
 * @param {string} version
 * @param {'major'|'minor'|'patch'} kind
 */
export function bumpVersion(version, kind = 'patch') {
  const { major, minor, patch } = parseVersion(version)
  if (kind === 'major') return formatVersion({ major: major + 1, minor: 0, patch: 0 })
  if (kind === 'minor') return formatVersion({ major, minor: minor + 1, patch: 0 })
  return formatVersion({ major, minor, patch: patch + 1 })
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Data RFC 2822 come la vuole il changelog Debian. Il giorno della settimana è
 * calcolato: scriverlo a mano è la causa più comune di `changelog: parse error`.
 */
export function rfc2822(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const offset = `${sign}${pad(Math.trunc(Math.abs(offsetMinutes) / 60))}${pad(Math.abs(offsetMinutes) % 60)}`
  return (
    `${WEEKDAYS[date.getDay()]}, ${pad(date.getDate())} ${MONTHS[date.getMonth()]} ${date.getFullYear()} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offset}`
  )
}

/** Data ISO breve usata nelle intestazioni di CHANGELOG.md. */
export function isoDate(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/**
 * Appiattisce una sezione Keep a Changelog in voci singole.
 *
 * `### Added` + `- Foo` diventa `Added: Foo`; le righe di continuazione di un
 * elenco vengono unite alla voce precedente.
 *
 * @param {string} body testo della sezione
 * @returns {string[]}
 */
export function parseEntries(body) {
  const entries = []
  let group = ''
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trimEnd()
    if (line.trim() === '') continue
    const heading = /^###\s+(.+)$/.exec(line.trim())
    if (heading) {
      group = heading[1].trim()
      continue
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line)
    if (bullet) {
      const text = bullet[1].trim()
      entries.push(group ? `${group}: ${text}` : text)
      continue
    }
    if (entries.length > 0) entries[entries.length - 1] += ` ${line.trim()}`
  }
  return entries
}

/**
 * Indice della riga che apre una sezione `## [titolo]`.
 *
 * Il confronto e' ancorato a inizio riga: il testo introduttivo del changelog
 * cita la sezione `## [Unreleased]` in mezzo a una frase, e una ricerca
 * testuale libera troncherebbe la prosa al posto della sezione.
 *
 * @returns {number} posizione nel testo, -1 se la sezione non esiste
 */
export function headingIndex(changelogText, heading) {
  const marker = `## [${heading}]`
  let offset = 0
  for (const line of changelogText.split('\n')) {
    if (line.startsWith(marker)) return offset
    offset += line.length + 1
  }
  return -1
}

/** Estrae il corpo di una sezione `## [titolo]`, escluso il titolo stesso. */
export function sectionBody(changelogText, heading) {
  const start = headingIndex(changelogText, heading)
  if (start === -1) return ''
  const afterHeader = changelogText.indexOf('\n', start) + 1
  if (afterHeader === 0) return ''
  const next = changelogText.indexOf('\n## [', afterHeader)
  return next === -1 ? changelogText.slice(afterHeader) : changelogText.slice(afterHeader, next)
}

/**
 * Consolida `## [Unreleased]` in una sezione datata e ne ricrea una vuota.
 *
 * @returns {{text: string, entries: string[]}}
 */
export function consolidateChangelog(changelogText, version, date = new Date()) {
  const start = headingIndex(changelogText, 'Unreleased')
  if (start === -1) {
    throw new Error('CHANGELOG.md non contiene la sezione "## [Unreleased]".')
  }

  const body = sectionBody(changelogText, 'Unreleased')
  const entries = parseEntries(body)
  const finalEntries = entries.length > 0 ? entries : ['Maintenance release.']
  const rendered = entries.length > 0 ? body.replace(/^\n+|\n+$/g, '') : '### Changed\n- Maintenance release.'

  const afterHeader = changelogText.indexOf('\n', start) + 1
  const next = changelogText.indexOf('\n## [', afterHeader)
  const head = changelogText.slice(0, start)
  const tail = next === -1 ? '' : changelogText.slice(next + 1)
  const replacement = `## [Unreleased]\n\n## [${version}] - ${isoDate(date)}\n\n${rendered}\n\n`

  return { text: `${head}${replacement}${tail}`, entries: finalEntries }
}

export function readReleaseHistory() {
  if (!existsSync(paths.releaseHistory)) return { releases: [] }
  const history = readJson(paths.releaseHistory)
  return Array.isArray(history.releases) ? history : { releases: [] }
}

export function findRelease(history, version) {
  return history.releases.find((release) => release.version === version) ?? null
}

export function writeReleaseHistory(history) {
  writeFileSync(paths.releaseHistory, stringifyJson(history), 'utf8')
}

/**
 * Scrittura in blocco con ripristino: se una scrittura fallisce, tutte le
 * precedenti tornano al contenuto originale. Una release a metà è peggio di una
 * release non fatta.
 *
 * @param {{file: string, content: string}[]} writes
 */
export function flush(writes) {
  const backups = []
  try {
    for (const write of writes) {
      const existed = existsSync(write.file)
      backups.push({ file: write.file, existed, content: existed ? readFileSync(write.file) : null })
      writeFileSync(write.file, write.content)
    }
  } catch (error) {
    for (const backup of backups.reverse()) {
      if (backup.existed) writeFileSync(backup.file, backup.content)
    }
    throw error
  }
  return writes.map((write) => write.file)
}
