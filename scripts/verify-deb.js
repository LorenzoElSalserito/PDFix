#!/usr/bin/env node
/**
 * Certifica un pacchetto Debian gia' costruito.
 *
 * `deb-finalize.js` rende conforme il pacchetto; questo script verifica, su un
 * artefatto reale, che lo sia davvero — ed e' il controllo che gira in CI dopo
 * la build, cosi' una regressione nel packaging non arriva mai a una release.
 *
 *   node scripts/verify-deb.js                       # primo .deb in release/
 *   node scripts/verify-deb.js percorso/al/file.deb
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import { PKG_NAME, SECTION, currentVersion, isEntrypoint, paths, pickArtifact } from './lib/release-meta.js'
import { parseControl } from './deb-finalize.js'

/**
 * Tag lintian attesi per un bundle Electron di terze parti: sono conseguenza
 * del formato di distribuzione, non difetti del pacchetto. Qualunque altro tag
 * fa fallire la verifica.
 */
export const EXPECTED_LINTIAN_TAGS = new Set([
  'dir-or-file-in-opt',
  'embedded-library',
  'unstripped-binary-or-object',
  'missing-dependency-on-libc',
  'maintainer-script-ignores-errors',
  'postrm-removes-alternative',
  'command-with-path-in-maintainer-script',
  'no-manual-page',
  'extra-license-file',
  'national-encoding',
  'desktop-entry-lacks-keywords-entry',
  'appstream-metadata-missing',
  'package-contains-documentation-outside-usr-share-doc',
  'binary-without-english-manpage',
  'executable-not-elf-or-script',
  'setuid-binary',
  'elevated-privileges',
])

/** Modi ammessi nel payload, come li stampa `dpkg-deb -c`. */
const ALLOWED_MODES = new Set(['drwxr-xr-x', '-rw-r--r--', '-rwxr-xr-x'])

const MAX_LINE = 80

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

// ------------------------------------------------------------- controlli ----

/** @returns {string[]} problemi trovati nei campi del control */
export function controlProblems(fields, expectedVersion) {
  const problems = []
  const require = (field, expected) => {
    const value = fields.get(field)
    if (value === undefined) problems.push(`control: campo ${field} mancante`)
    else if (expected !== undefined && value !== expected) {
      problems.push(`control: ${field} = "${value}", atteso "${expected}"`)
    }
  }

  require('Package', PKG_NAME)
  require('Version', expectedVersion)
  require('Section', SECTION)
  require('Priority', 'optional')
  require('Architecture')
  require('Maintainer')
  require('Description')

  for (const foreign of ['License', 'Vendor']) {
    if (fields.has(foreign)) problems.push(`control: campo non Debian presente (${foreign})`)
  }

  const maintainer = fields.get('Maintainer') ?? ''
  if (!/^.+ <[^<>@\s]+@[^<>@\s]+>$/.test(maintainer)) {
    problems.push(`control: Maintainer non nel formato "Nome <email>" (${maintainer})`)
  }

  const description = fields.get('Description') ?? ''
  const [synopsis, ...body] = description.split('\n')
  if (synopsis.length > MAX_LINE) problems.push(`control: synopsis di ${synopsis.length} caratteri (max ${MAX_LINE})`)
  if (body.length === 0) problems.push('control: descrizione estesa assente')
  for (const line of body) {
    if (line.length > MAX_LINE) problems.push(`control: riga della descrizione oltre ${MAX_LINE} colonne`)
    if (!line.startsWith(' ')) problems.push(`control: riga della descrizione non indentata ("${line}")`)
  }

  return problems
}

/**
 * Controlla proprietario e permessi di ogni voce del payload.
 *
 * @param {string} listing output di `dpkg-deb -c`
 */
export function payloadProblems(listing) {
  const problems = []
  for (const row of listing.trim().split('\n')) {
    if (row.trim() === '') continue
    const mode = row.slice(0, 10)
    if (!/\sroot\/root\s/.test(row)) problems.push(`proprietario diverso da root:root → ${row}`)
    if (!ALLOWED_MODES.has(mode)) problems.push(`permessi non standard (${mode}) → ${row}`)
    if (/\.so(\.\d+)*$/.test(row) && mode === '-rwxr-xr-x') {
      problems.push(`libreria condivisa eseguibile → ${row}`)
    }
  }
  return problems
}

/** Tag lintian non previsti per questo tipo di pacchetto. */
export function unexpectedLintianTags(output) {
  const found = new Map()
  for (const line of output.split('\n')) {
    const match = /^([EWIP]):\s+\S+:\s+(\S+)/.exec(line.trim())
    if (!match) continue
    const [, severity, tag] = match
    if (EXPECTED_LINTIAN_TAGS.has(tag)) continue
    if (!found.has(tag)) found.set(tag, `${severity}: ${tag}`)
  }
  return [...found.values()]
}

// ------------------------------------------------------------- verifica -----

function verify(debPath) {
  const version = currentVersion()
  const problems = []

  const control = parseControl(sh('dpkg-deb', ['-f', debPath]))
  problems.push(...controlProblems(control, version))
  problems.push(...payloadProblems(sh('dpkg-deb', ['-c', debPath])))

  const workDir = mkdtempSync(path.join(tmpdir(), 'pdfix-verify-'))
  try {
    sh('dpkg-deb', ['-R', debPath, workDir])

    const docDir = path.join(workDir, 'usr', 'share', 'doc', PKG_NAME)
    const required = [
      [path.join(docDir, 'copyright'), 'copyright DEP-5'],
      [path.join(docDir, 'changelog.gz'), 'changelog Debian'],
      [path.join(workDir, 'usr', 'share', 'pixmaps', `${PKG_NAME}.png`), 'icona in pixmaps'],
      [path.join(workDir, 'DEBIAN', 'md5sums'), 'md5sums'],
    ]
    for (const [filePath, label] of required) {
      if (!existsSync(filePath)) problems.push(`${label} mancante (${path.relative(workDir, filePath)})`)
    }
    for (const stale of ['LICENSE', 'LICENSE.txt', 'changelog.Debian.gz']) {
      if (existsSync(path.join(docDir, stale))) problems.push(`file ridondante in usr/share/doc: ${stale}`)
    }

    const applications = path.join(workDir, 'usr', 'share', 'applications')
    if (!existsSync(applications) || readdirSync(applications).every((name) => !name.endsWith('.desktop'))) {
      problems.push('voce di menu (.desktop) mancante')
    }

    const copyrightPath = path.join(docDir, 'copyright')
    if (existsSync(copyrightPath)) {
      const copyright = readFileSync(copyrightPath, 'utf8')
      if (!copyright.startsWith('Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/')) {
        problems.push('copyright: intestazione DEP-5 assente')
      }
      if (!/^Files: \*$/m.test(copyright)) problems.push('copyright: paragrafo "Files: *" assente')
      if (!/^License: \S+$/m.test(copyright)) problems.push('copyright: licenza non dichiarata')
    }

    const changelogPath = path.join(docDir, 'changelog.gz')
    if (existsSync(changelogPath)) {
      const compressed = readFileSync(changelogPath)
      if (compressed.readUInt32LE(4) !== 0) {
        problems.push('changelog.gz: compressione non deterministica (mtime non azzerato)')
      }
      const changelog = zlib.gunzipSync(compressed).toString('utf8')
      if (!changelog.startsWith(`${PKG_NAME} (${version})`)) {
        problems.push(`changelog: la voce in cima non e' ${PKG_NAME} (${version})`)
      }
      if (has('dpkg-parsechangelog')) {
        const plain = path.join(workDir, 'changelog-verifica')
        sh('sh', ['-c', `gzip -dc ${JSON.stringify(changelogPath)} > ${JSON.stringify(plain)}`])
        const parsed = sh('dpkg-parsechangelog', ['-l', plain])
        if (!new RegExp(`^Version: ${version.replace(/\./g, '\\.')}$`, 'm').test(parsed)) {
          problems.push('dpkg-parsechangelog non riconosce la versione in cima al changelog')
        }
        rmSync(plain)
      }
    }

    const md5sumsPath = path.join(workDir, 'DEBIAN', 'md5sums')
    if (existsSync(md5sumsPath)) {
      const lines = readFileSync(md5sumsPath, 'utf8').trim().split('\n')
      if (lines.some((line) => !/^[0-9a-f]{32} {2}\S/.test(line))) problems.push('md5sums: formato non valido')
      if (lines.some((line) => line.includes('DEBIAN/'))) problems.push('md5sums: include file di DEBIAN/')
      const check = spawnSync('md5sum', ['-c', '--quiet', md5sumsPath], { cwd: workDir, encoding: 'utf8' })
      if (check.status !== 0) problems.push(`md5sums non verificati:\n${check.stdout}${check.stderr}`)
    }

    if (existsSync(path.join(workDir, 'DEBIAN', 'conffiles')) && !existsSync(path.join(workDir, 'etc'))) {
      problems.push('conffiles presente ma il pacchetto non installa nulla sotto /etc')
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }

  if (has('lintian')) {
    const result = spawnSync('lintian', ['--no-tag-display-limit', debPath], { encoding: 'utf8' })
    const unexpected = unexpectedLintianTags(`${result.stdout}\n${result.stderr}`)
    problems.push(...unexpected.map((tag) => `lintian: tag non previsto → ${tag}`))
  } else {
    console.log('lintian non installato: controllo dei tag saltato.')
  }

  if (problems.length > 0) {
    console.error(`Il pacchetto ${path.basename(debPath)} non e' conforme:`)
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  console.log(`Pacchetto certificato: ${path.basename(debPath)} (versione ${version})`)
}

/**
 * Sceglie fra i pacchetti presenti quello della versione in corso.
 *
 * In `release/` convivono gli artefatti delle build precedenti: prendere il
 * primo nome in ordine alfabetico significa verificare la release sbagliata e
 * dichiarare non conforme un pacchetto perfetto.
 *
 * @param {string[]} names contenuto della cartella
 * @param {string} version versione attesa
 * @returns {string|null} nome del pacchetto da verificare
 */
export function pickPackage(names, version) {
  return pickArtifact(names, '.deb', version)
}

function resolveTarget() {
  const argument = process.argv[2]
  if (argument) return path.resolve(argument)
  const version = currentVersion()
  const releaseDir = path.join(paths.root, 'release')
  const candidate = existsSync(releaseDir) ? pickPackage(readdirSync(releaseDir), version) : null
  if (!candidate) {
    throw new Error(`nessun .deb della versione ${version} in release/: esegui prima \`npm run dist:linux\`.`)
  }
  return path.join(releaseDir, candidate)
}

if (isEntrypoint(import.meta.url)) {
  try {
    const target = resolveTarget()
    if (!has('dpkg-deb')) throw new Error('dpkg-deb non trovato: installa dpkg-dev.')
    verify(target)
  } catch (error) {
    console.error(`verify-deb: ${error.message}`)
    process.exit(1)
  }
}
