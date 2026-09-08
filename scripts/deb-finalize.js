#!/usr/bin/env node
/**
 * Ricostruzione conforme del pacchetto Debian.
 *
 * `electron-builder` costruisce il `.deb` tramite FPM: il pacchetto funziona ma
 * non rispetta la policy Debian — changelog fittizio, nessun `copyright`,
 * sezione invalida, campi non standard nel `control`, permessi ereditati
 * dall'umask di chi compila. Questo script lo smonta, lo corregge e lo
 * ricostruisce.
 *
 * Va eseguito sotto `fakeroot`, altrimenti `dpkg-deb` registrerebbe i file come
 * proprietà dell'utente che ha compilato:
 *
 *   fakeroot node scripts/deb-finalize.js release/pdfix_v2.0.1_amd64.deb
 */

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import {
  MAINTAINER,
  PKG_NAME,
  SECTION,
  SOURCE_URL,
  UPSTREAM_NAME,
  findRelease,
  isEntrypoint,
  paths,
  readReleaseHistory,
} from './lib/release-meta.js'

/** Ordine canonico dei campi di un control binario Debian. */
const FIELD_ORDER = [
  'Package', 'Source', 'Version', 'Section', 'Priority', 'Architecture', 'Essential',
  'Pre-Depends', 'Depends', 'Recommends', 'Suggests', 'Enhances', 'Breaks', 'Conflicts',
  'Provides', 'Replaces', 'Installed-Size', 'Maintainer', 'Homepage', 'Description',
]

/** Campi generati da FPM che non esistono nel formato Debian. */
const FOREIGN_FIELDS = ['License', 'Vendor']

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

// ---------------------------------------------------------------- control ---

export function parseControl(text) {
  const fields = new Map()
  let currentField = null
  for (const line of text.split('\n')) {
    if (line === '') continue
    if (/^\s/.test(line) && currentField) {
      fields.set(currentField, `${fields.get(currentField)}\n${line}`)
      continue
    }
    const match = /^([A-Za-z0-9-]+):\s?(.*)$/.exec(line)
    if (!match) continue
    currentField = match[1]
    fields.set(currentField, match[2])
  }
  return fields
}

/** Manda a capo un paragrafo entro `MAX_LINE` colonne, con indentazione. */
export function wrapParagraph(text, indent = ' ') {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = indent
  for (const word of words) {
    if (line.length > indent.length && line.length + 1 + word.length > MAX_LINE) {
      lines.push(line)
      line = `${indent}${word}`
    } else {
      line = line.length > indent.length ? `${line} ${word}` : `${indent}${word}`
    }
  }
  if (line.trim() !== '') lines.push(line)
  return lines
}

/**
 * Normalizza `Description`: synopsis entro 80 caratteri, corpo indentato di uno
 * spazio, righe vuote come ` .`. Se la synopsis è troppo lunga viene troncata su
 * confine di parola e il testo integrale finisce in cima alla descrizione
 * estesa: nessun contenuto va perso.
 */
export function normalizeDescription(value) {
  const [rawSynopsis, ...rest] = value.split('\n')
  let synopsis = rawSynopsis.trim()
  const extended = rest.map((line) => line.replace(/^\s/, '').trimEnd())

  const paragraphs = []
  if (synopsis.length > MAX_LINE) {
    const words = synopsis.split(' ')
    let short = ''
    for (const word of words) {
      if (`${short} ${word}`.trim().length > MAX_LINE - 3) break
      short = `${short} ${word}`.trim()
    }
    paragraphs.push(synopsis)
    synopsis = short
  }

  let buffer = []
  for (const line of extended) {
    if (line.trim() === '' || line.trim() === '.') {
      if (buffer.length > 0) paragraphs.push(buffer.join(' '))
      buffer = []
    } else {
      buffer.push(line.trim())
    }
  }
  if (buffer.length > 0) paragraphs.push(buffer.join(' '))

  const body = []
  for (const [index, paragraph] of paragraphs.entries()) {
    if (index > 0) body.push(' .')
    body.push(...wrapParagraph(paragraph))
  }

  return [synopsis, ...body].join('\n')
}

export function renderControl(fields) {
  const ordered = [
    ...FIELD_ORDER.filter((field) => fields.has(field)),
    ...[...fields.keys()].filter((field) => !FIELD_ORDER.includes(field)).sort(),
  ]
  // `Description` chiude sempre il file: le sue righe di continuazione
  // romperebbero qualunque campo scritto dopo.
  const withoutDescription = ordered.filter((field) => field !== 'Description')
  const lines = withoutDescription.map((field) => `${field}: ${fields.get(field)}`)
  if (fields.has('Description')) lines.push(`Description: ${fields.get('Description')}`)
  return `${lines.join('\n')}\n`
}

export function rewriteControl(text, { version }) {
  const fields = parseControl(text)
  for (const field of FOREIGN_FIELDS) fields.delete(field)
  fields.set('Section', SECTION)
  fields.set('Priority', 'optional')
  fields.set('Version', version)
  fields.set('Maintainer', fields.get('Maintainer') || MAINTAINER)
  if (fields.has('Description')) fields.set('Description', normalizeDescription(fields.get('Description')))
  return renderControl(fields)
}

// -------------------------------------------------------------- changelog ---

/** Voce di changelog Debian, nel formato che `dpkg-parsechangelog` accetta. */
export function renderChangelogEntry(release, packageName = PKG_NAME) {
  const lines = [`${packageName} (${release.version}) ${release.distribution}; urgency=${release.urgency}`, '']
  for (const entry of release.entries) {
    const wrapped = wrapParagraph(entry, '    ')
    const first = `  * ${wrapped[0].trimStart()}`
    lines.push(first, ...wrapped.slice(1))
  }
  lines.push('', ` -- ${release.maintainer}  ${release.date}`)
  return lines.join('\n')
}

export function renderChangelog(history, packageName = PKG_NAME) {
  return `${history.releases.map((release) => renderChangelogEntry(release, packageName)).join('\n\n')}\n`
}

/**
 * Compressione deterministica: senza `mtime: 0` ogni build produrrebbe byte
 * diversi a parità di contenuto e gli `md5sums` non sarebbero riproducibili.
 */
export function gzipDeterministic(text) {
  return zlib.gzipSync(Buffer.from(text, 'utf8'), { level: 9, mtime: 0 })
}

// -------------------------------------------------------------- copyright ---

const KNOWN_LICENSES = [
  { test: /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/i, id: 'AGPL-3+', common: 'AGPL-3' },
  { test: /GNU GENERAL PUBLIC LICENSE\s+Version 3/i, id: 'GPL-3+', common: 'GPL-3' },
  { test: /Apache License\s+Version 2\.0/i, id: 'Apache-2.0', common: 'Apache-2.0' },
  { test: /MIT License/i, id: 'MIT', common: null },
]

export function detectLicense(licenseText) {
  return KNOWN_LICENSES.find((license) => license.test.test(licenseText)) ?? null
}

export function renderCopyright(licenseText) {
  const detected = detectLicense(licenseText)
  const header = [
    'Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/',
    `Upstream-Name: ${UPSTREAM_NAME}`,
    `Upstream-Contact: ${MAINTAINER}`,
    `Source: ${SOURCE_URL}`,
    '',
    'Files: *',
    `Copyright: 2026 ${MAINTAINER}`,
    `License: ${detected?.id ?? 'other'}`,
    '',
    `License: ${detected?.id ?? 'other'}`,
  ]

  if (detected?.common) {
    header.push(
      ...wrapParagraph(
        'This program is free software: you can redistribute it and/or modify it under the terms of the license named above, either version 3 of the License, or (at your option) any later version.',
      ),
      ' .',
      ...wrapParagraph(
        'This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the license for more details.',
      ),
      ' .',
      ...wrapParagraph(
        `On Debian systems, the complete text of the license can be found in "/usr/share/common-licenses/${detected.common}".`,
      ),
    )
  } else {
    // Licenza non riconosciuta: il testo integrale viaggia dentro il pacchetto.
    for (const line of licenseText.split('\n')) {
      header.push(line.trim() === '' ? ' .' : ` ${line.replace(/\s+$/, '')}`)
    }
  }

  return `${header.join('\n')}\n`
}

// ------------------------------------------------------------- permessi -----

/**
 * Legge i permessi con `find`.
 *
 * Sotto fakeroot, `fs.statSync` di Node usa `statx`, che fakeroot non
 * intercetta: Node vedrebbe i modi reali su disco mentre `dpkg-deb` scrive
 * nell'archivio quelli del database di fakeroot. `find` è intercettato, quindi
 * è l'unica lettura affidabile. `chmodSync` invece è intercettato e resta in
 * Node.
 */
export function readModes(workDir) {
  return sh('find', [workDir, '-mindepth', '0', '-printf', '%m %y %p\n'])
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [mode, type, ...rest] = line.split(' ')
      return { mode: parseInt(mode, 8), type, filePath: rest.join(' ') }
    })
}

/** Modo atteso per una voce del pacchetto, bit speciali preservati. */
/**
 * Percorso relativo con separatori POSIX.
 *
 * Dentro un `.deb` i nomi hanno sempre la barra: `path.relative` invece usa il
 * separatore del sistema, e su Windows i confronti con `DEBIAN/` fallirebbero
 * in silenzio — anche solo eseguendo i test della pipeline.
 */
function posixRelative(base, filePath) {
  return path.relative(base, filePath).split(path.sep).join('/')
}

export function expectedMode({ mode, type, filePath }, workDir) {
  const special = mode & 0o7000
  const relative = posixRelative(workDir, filePath)
  if (type === 'd') return special | 0o755
  if (relative.startsWith('DEBIAN/')) {
    const name = path.basename(relative)
    return special | (['preinst', 'postinst', 'prerm', 'postrm', 'config'].includes(name) ? 0o755 : 0o644)
  }
  // Gli oggetti condivisi si caricano con dlopen, non si eseguono.
  if (/\.so(\.\d+)*$/.test(filePath)) return special | 0o644
  if (mode & 0o111) return special | 0o755
  return special | 0o644
}

export function normalizePermissions(workDir) {
  let changed = 0
  for (const entry of readModes(workDir)) {
    const target = expectedMode(entry, workDir)
    if (entry.mode !== target) {
      chmodSync(entry.filePath, target)
      changed++
    }
  }
  return changed
}

// -------------------------------------------------------------- md5sums -----

function walkFiles(dir, base = dir) {
  const results = []
  for (const name of readdirSync(dir)) {
    const filePath = path.join(dir, name)
    const stats = statSync(filePath)
    if (stats.isDirectory()) results.push(...walkFiles(filePath, base))
    else if (stats.isFile()) results.push(posixRelative(base, filePath))
  }
  return results
}

export function renderMd5sums(workDir) {
  const files = walkFiles(workDir)
    .filter((relative) => !relative.startsWith('DEBIAN/'))
    .sort()
  return `${files
    .map((relative) => `${createHash('md5').update(readFileSync(path.join(workDir, relative))).digest('hex')}  ${relative}`)
    .join('\n')}\n`
}

// ------------------------------------------------------------- finalize -----

function finalize(debPath) {
  if (!process.env.FAKEROOTKEY) {
    throw new Error('fakeroot è obbligatorio: usa `fakeroot node scripts/deb-finalize.js <deb>`.')
  }
  if (!existsSync(debPath)) throw new Error(`Pacchetto inesistente: ${debPath}`)

  const workDir = mkdtempSync(path.join(tmpdir(), 'pdfix-deb-'))
  try {
    sh('dpkg-deb', ['-R', debPath, workDir])

    const controlPath = path.join(workDir, 'DEBIAN', 'control')
    const version = parseControl(readFileSync(controlPath, 'utf8')).get('Version')
    writeFileSync(controlPath, rewriteControl(readFileSync(controlPath, 'utf8'), { version }), 'utf8')

    const history = readReleaseHistory()
    const release = findRelease(history, version)
    if (!release) {
      throw new Error(`release-history.json non ha un record per la versione ${version}.`)
    }

    const docDir = path.join(workDir, 'usr', 'share', 'doc', PKG_NAME)
    mkdirSync(docDir, { recursive: true })

    // `copyright` è il file canonico: un LICENSE grezzo accanto è ridondanza
    // non conforme.
    for (const stale of ['LICENSE', 'LICENSE.txt', 'copyright', 'changelog.gz', 'changelog.Debian.gz']) {
      const filePath = path.join(docDir, stale)
      if (existsSync(filePath)) rmSync(filePath)
    }
    writeFileSync(path.join(docDir, 'copyright'), renderCopyright(readFileSync(paths.license, 'utf8')), 'utf8')

    const changelogText = renderChangelog(history)
    const changelogPath = path.join(workDir, 'changelog-check')
    writeFileSync(changelogPath, changelogText, 'utf8')
    if (has('dpkg-parsechangelog')) {
      const parsed = sh('dpkg-parsechangelog', ['-l', changelogPath])
      const parsedVersion = /^Version:\s*(.+)$/m.exec(parsed)?.[1]?.trim()
      if (parsedVersion !== version) {
        throw new Error(`Changelog incoerente: in cima c'è ${parsedVersion}, attesa ${version}.`)
      }
    }
    rmSync(changelogPath)
    // Versione senza revisione Debian ⇒ pacchetto nativo ⇒ `changelog.gz`.
    writeFileSync(path.join(docDir, 'changelog.gz'), gzipDeterministic(changelogText))

    const pixmapsDir = path.join(workDir, 'usr', 'share', 'pixmaps')
    mkdirSync(pixmapsDir, { recursive: true })
    copyFileSync(paths.iconPng, path.join(pixmapsDir, `${PKG_NAME}.png`))

    // `conffiles` elenca i file sotto /etc: se non ce ne sono, il file va
    // omesso — un `conffiles` vuoto è una violazione di policy.
    const etcDir = path.join(workDir, 'etc')
    const conffilesPath = path.join(workDir, 'DEBIAN', 'conffiles')
    if (existsSync(etcDir)) {
      const entries = walkFiles(etcDir).map((relative) => `/etc/${relative}`).sort()
      writeFileSync(conffilesPath, `${entries.join('\n')}\n`, 'utf8')
    } else if (existsSync(conffilesPath)) {
      rmSync(conffilesPath)
    }

    normalizePermissions(workDir)

    const md5sumsPath = path.join(workDir, 'DEBIAN', 'md5sums')
    writeFileSync(md5sumsPath, renderMd5sums(workDir), 'utf8')
    chmodSync(md5sumsPath, 0o644)
    sh('md5sum', ['-c', '--quiet', md5sumsPath], { cwd: workDir })

    const rebuilt = `${debPath}.new`
    sh('dpkg-deb', ['--build', workDir, rebuilt])
    renameSync(rebuilt, debPath)

    if (has('lintian')) {
      // Informativo: i tag attesi per un bundle Electron non devono bloccare
      // una release.
      const result = spawnSync('lintian', ['--no-tag-display-limit', debPath], { encoding: 'utf8' })
      const output = (result.stdout || '').trim()
      if (output) console.log(output)
    }

    console.log(`Pacchetto conforme: ${path.basename(debPath)} (versione ${version})`)
  } finally {
    rmSync(workDir, { recursive: true, force: true })
  }
}

if (isEntrypoint(import.meta.url)) {
  try {
    finalize(path.resolve(process.argv[2] ?? ''))
  } catch (error) {
    console.error(`deb-finalize: ${error.message}`)
    process.exit(1)
  }
}
