/**
 * Suite della pipeline di release.
 *
 * Tre livelli, come prescrive BUILD_DEF:
 *  - unitari: aritmetica delle versioni, changelog, control, permessi, gzip;
 *  - integrazione: `dpkg-parsechangelog`, guardia di coerenza, `--dry-run`;
 *  - end-to-end: un `.deb` sintetico con le stesse patologie dell'output FPM
 *    viene reso conforme dal vero `deb-finalize.js` sotto fakeroot.
 *
 * I test che richiedono dpkg/fakeroot si auto-escludono se gli strumenti non
 * sono installati, cosi' la suite resta verde anche su macOS e Windows.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'

import {
  ARTIFACT_NAME,
  PKG_NAME,
  SECTION,
  bumpVersion,
  consolidateChangelog,
  formatVersion,
  isoDate,
  parseEntries,
  parseVersion,
  paths,
  readJson,
  readReleaseHistory,
  rfc2822,
} from '../scripts/lib/release-meta.js'

import {
  detectLicense,
  expectedMode,
  gzipDeterministic,
  normalizeDescription,
  parseControl,
  renderChangelog,
  renderChangelogEntry,
  renderControl,
  renderCopyright,
  rewriteControl,
  wrapParagraph,
} from '../scripts/deb-finalize.js'

import {
  bumpDisabledByEnvironment,
  parseArgs,
  resolveTargetVersion,
  updatePackageJson,
  updatePackageLock,
} from '../scripts/version-bump.js'

import { collectProblems } from '../scripts/verify-packaging-assets.js'

const hasTool = (command) => spawnSync('command', ['-v', command], { shell: true }).status === 0
const canBuildDeb = hasTool('dpkg-deb') && hasTool('fakeroot')

// =========================================================== unitari =========

test('l aritmetica delle versioni segue semver', () => {
  assert.equal(bumpVersion('2.0.0'), '2.0.1')
  assert.equal(bumpVersion('2.0.9', 'minor'), '2.1.0')
  assert.equal(bumpVersion('2.4.7', 'major'), '3.0.0')
  assert.deepEqual(parseVersion('10.20.30'), { major: 10, minor: 20, patch: 30 })
  assert.equal(formatVersion({ major: 1, minor: 2, patch: 3 }), '1.2.3')
})

test('i pre-release sono rifiutati: dpkg li leggerebbe come revisione Debian', () => {
  assert.throws(() => parseVersion('1.2.3-beta'), /Versione non valida/)
  assert.throws(() => parseVersion('1.2'), /Versione non valida/)
  assert.throws(() => parseVersion('v1.2.3'), /Versione non valida/)
})

test('una versione senza trattino produce un pacchetto nativo', () => {
  // Regola BUILD_DEF 5.4: nativo -> changelog.gz, non changelog.Debian.gz.
  // Poiche' parseVersion accetta solo X.Y.Z, il pacchetto e' sempre nativo.
  assert.equal(/-/.test(formatVersion(parseVersion('2.0.1'))), false)
})

test('parseEntries appiattisce Keep a Changelog', () => {
  const entries = parseEntries(`
### Added
- Prima voce
  che continua su due righe
- Seconda voce

### Fixed
- Terza voce
`)
  assert.deepEqual(entries, [
    'Added: Prima voce che continua su due righe',
    'Added: Seconda voce',
    'Fixed: Terza voce',
  ])
})

test('parseEntries accetta bullet senza sottosezione', () => {
  assert.deepEqual(parseEntries('- Voce libera\n'), ['Voce libera'])
})

test('consolidateChangelog data la sezione e ne ricrea una vuota', () => {
  const source = '# Changelog\n\n## [Unreleased]\n\n### Added\n- Una cosa\n\n## [1.0.0] - 2026-01-01\n\n### Added\n- Prima\n'
  const date = new Date(2026, 7, 30)
  const { text, entries } = consolidateChangelog(source, '1.1.0', date)
  assert.deepEqual(entries, ['Added: Una cosa'])
  assert.match(text, /## \[Unreleased\]\n\n## \[1\.1\.0\] - 2026-08-30/)
  assert.match(text, /## \[1\.0\.0\] - 2026-01-01/, 'le sezioni precedenti restano')
  assert.equal(isoDate(date), '2026-08-30')
})

test('una sezione Unreleased vuota diventa una maintenance release', () => {
  const source = '# Changelog\n\n## [Unreleased]\n\n## [1.0.0] - 2026-01-01\n\n- Prima\n'
  const { entries, text } = consolidateChangelog(source, '1.0.1')
  assert.deepEqual(entries, ['Maintenance release.'])
  assert.match(text, /Maintenance release\./)
})

test('il titolo di sezione viene cercato solo a inizio riga', () => {
  // Il testo introduttivo del changelog reale cita "## [Unreleased]" dentro una
  // frase: una ricerca testuale libera troncherebbe la prosa.
  const source = [
    '# Changelog',
    '',
    'La sezione `## [Unreleased]` e l unico punto scritto a mano.',
    '',
    '## [Unreleased]',
    '',
    '### Added',
    '- Una cosa',
    '',
    '## [1.0.0] - 2026-01-01',
    '',
    '- Prima',
    '',
  ].join('\n')
  const { text, entries } = consolidateChangelog(source, '1.1.0', new Date(2026, 7, 30))
  assert.deepEqual(entries, ['Added: Una cosa'])
  assert.match(text, /La sezione `## \[Unreleased\]` e l unico punto scritto a mano\./)
  assert.equal(text.split('## [Unreleased]').length - 1, 2, 'una citazione e una sola sezione')
  assert.match(text, /## \[1\.1\.0\] - 2026-08-30/)
})

test('consolidateChangelog rifiuta un changelog senza sezione Unreleased', () => {
  assert.throws(() => consolidateChangelog('# Changelog\n', '1.0.1'), /Unreleased/)
})

test('la data RFC 2822 ha il giorno della settimana coerente', () => {
  assert.match(rfc2822(new Date(2026, 7, 30, 10, 0, 0)), /^Sun, 30 Aug 2026 10:00:00 [+-]\d{4}$/)
  assert.match(rfc2822(new Date(2026, 0, 1, 0, 0, 0)), /^Thu, 01 Jan 2026 /)
})

test('la voce di changelog Debian rispetta il formato richiesto', () => {
  const entry = renderChangelogEntry({
    version: '1.2.3',
    distribution: 'unstable',
    urgency: 'medium',
    maintainer: 'Tizio Caio <tizio@example.com>',
    date: 'Sun, 30 Aug 2026 10:00:00 +0200',
    entries: ['Fixed: una voce sufficientemente lunga da dover essere mandata a capo perche supera le ottanta colonne consentite'],
  })
  const lines = entry.split('\n')
  assert.equal(lines[0], 'pdfix (1.2.3) unstable; urgency=medium')
  assert.equal(lines[1], '')
  assert.ok(lines[2].startsWith('  * '), 'voce con due spazi e asterisco')
  assert.ok(lines[3].startsWith('    '), 'continuazione con quattro spazi')
  assert.match(lines[lines.length - 1], /^ -- Tizio Caio <tizio@example\.com>  Sun, 30 Aug 2026 10:00:00 \+0200$/)
  assert.ok(lines.every((line) => line.length <= 80), 'nessuna riga oltre 80 colonne')
})

test('il changelog completo elenca tutte le release', () => {
  const history = {
    releases: [
      { version: '1.1.0', distribution: 'unstable', urgency: 'medium', maintainer: 'A <a@b.c>', date: 'Sun, 30 Aug 2026 10:00:00 +0200', entries: ['Added: nuova'] },
      { version: '1.0.0', distribution: 'unstable', urgency: 'low', maintainer: 'A <a@b.c>', date: 'Thu, 01 Jan 2026 09:00:00 +0100', entries: ['Prima release.'] },
    ],
  }
  const text = renderChangelog(history)
  assert.ok(text.startsWith('pdfix (1.1.0)'), 'la piu recente e in cima')
  assert.match(text, /\npdfix \(1\.0\.0\) unstable; urgency=low\n/)
  assert.ok(text.endsWith('\n'))
})

test('il gzip del changelog e deterministico', () => {
  const first = gzipDeterministic('contenuto\n')
  const second = gzipDeterministic('contenuto\n')
  assert.deepEqual(first, second)
  assert.equal(zlib.gunzipSync(first).toString('utf8'), 'contenuto\n')
  assert.equal(first.readUInt32LE(4), 0, 'mtime azzerato')
})

test('i campi del control sono riordinati con Description in fondo', () => {
  const fields = parseControl('Description: sinossi\n corpo\nPackage: pdfix\nVersion: 2.0.0\nMaintainer: A <a@b.c>\n')
  const rendered = renderControl(fields)
  const order = rendered.split('\n').filter((line) => /^[A-Za-z-]+:/.test(line)).map((line) => line.split(':')[0])
  assert.deepEqual(order, ['Package', 'Version', 'Maintainer', 'Description'])
  assert.ok(rendered.trimEnd().split('\n').at(-1).startsWith(' corpo'))
})

test('rewriteControl elimina i campi FPM e impone sezione e priorita', () => {
  const rewritten = rewriteControl(
    'Package: pdfix\nVersion: 1.0.0\nSection: default\nLicense: AGPL\nVendor: nessuno\nMaintainer: A <a@b.c>\nDescription: sinossi\n',
    { version: '2.0.0' },
  )
  const fields = parseControl(rewritten)
  assert.equal(fields.get('Section'), SECTION)
  assert.equal(fields.get('Priority'), 'optional')
  assert.equal(fields.get('Version'), '2.0.0')
  assert.equal(fields.has('License'), false)
  assert.equal(fields.has('Vendor'), false)
})

test('una synopsis troppo lunga viene troncata senza perdere testo', () => {
  const long = 'Questa sinossi e volutamente lunghissima per superare il limite di ottanta caratteri imposto dalla policy Debian'
  const normalized = normalizeDescription(`${long}\n corpo esistente\n`)
  const [synopsis, ...body] = normalized.split('\n')
  assert.ok(synopsis.length <= 80)
  assert.ok(long.startsWith(synopsis.trim()), 'troncata su confine di parola')
  const flattened = body.join(' ').replace(/\s+/g, ' ').trim()
  assert.ok(flattened.startsWith(long), 'il testo integrale della sinossi finisce nel corpo')
  assert.ok(body.every((line) => line.length <= 80))
})

test('i paragrafi della descrizione estesa restano separati da " ."', () => {
  const normalized = normalizeDescription('sinossi breve\n primo paragrafo\n .\n secondo paragrafo\n')
  assert.match(normalized, /\n \.\n/)
  assert.ok(normalized.split('\n').slice(1).every((line) => line.startsWith(' ')))
})

test('wrapParagraph non spezza le parole', () => {
  const lines = wrapParagraph('parola '.repeat(30).trim())
  assert.ok(lines.every((line) => line.length <= 80))
  assert.equal(lines.join(' ').replace(/\s+/g, ' ').trim(), 'parola '.repeat(30).trim())
})

test('la sezione scelta esiste nell archivio Debian', () => {
  const database = '/usr/share/lintian/data/fields/archive-sections'
  if (!existsSync(database)) return
  const sections = readFileSync(database, 'utf8').split('\n').map((line) => line.trim())
  assert.ok(sections.includes(SECTION), `${SECTION} deve essere una sezione valida`)
})

test('il copyright ha forma DEP-5 e rimanda alle licenze comuni', () => {
  const copyright = renderCopyright(readFileSync(paths.license, 'utf8'))
  assert.ok(copyright.startsWith('Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/'))
  assert.match(copyright, /^Files: \*$/m)
  assert.match(copyright, /^License: AGPL-3\+$/m)
  assert.match(copyright, /\/usr\/share\/common-licenses\/AGPL-3/)
  assert.match(copyright, /^ \.$/m, 'righe vuote scritte come " ."')
  assert.equal(detectLicense('licenza sconosciuta'), null)
})

test('una licenza non riconosciuta viene incorporata integralmente', () => {
  const copyright = renderCopyright('Licenza personalizzata\n\nSeconda riga.\n')
  assert.match(copyright, /^License: other$/m)
  assert.match(copyright, /^ Licenza personalizzata$/m)
  assert.match(copyright, /^ \.$/m)
})

test('i permessi attesi seguono la tabella BUILD_DEF', () => {
  const work = '/work'
  assert.equal(expectedMode({ mode: 0o775, type: 'd', filePath: '/work/opt' }, work), 0o755)
  assert.equal(expectedMode({ mode: 0o775, type: 'f', filePath: '/work/opt/pdfix' }, work), 0o755)
  assert.equal(expectedMode({ mode: 0o444, type: 'f', filePath: '/work/opt/dati.pak' }, work), 0o644)
  assert.equal(expectedMode({ mode: 0o775, type: 'f', filePath: '/work/opt/libEGL.so' }, work), 0o644)
  assert.equal(expectedMode({ mode: 0o775, type: 'f', filePath: '/work/opt/libvulkan.so.1' }, work), 0o644)
  assert.equal(expectedMode({ mode: 0o664, type: 'f', filePath: '/work/DEBIAN/postinst' }, work), 0o755)
  assert.equal(expectedMode({ mode: 0o664, type: 'f', filePath: '/work/DEBIAN/control' }, work), 0o644)
  assert.equal(
    expectedMode({ mode: 0o4755, type: 'f', filePath: '/work/opt/chrome-sandbox' }, work),
    0o4755,
    'il bit setuid viene preservato',
  )
})

test('il nome degli artefatti resta una macro', () => {
  assert.equal(readJson(paths.packageJson).build.artifactName, ARTIFACT_NAME)
  assert.match(ARTIFACT_NAME, /\$\{version\}/)
  assert.match(ARTIFACT_NAME, /\$\{ext\}/)
})

test('gli argomenti di version-bump sono interpretati correttamente', () => {
  assert.deepEqual(parseArgs([]), { kind: 'patch', set: null, bump: true, dryRun: false, force: false })
  assert.equal(parseArgs(['--minor']).kind, 'minor')
  assert.equal(parseArgs(['--set', '3.2.1']).set, '3.2.1')
  assert.equal(parseArgs(['--no-bump']).bump, false)
  assert.equal(parseArgs(['--dry-run']).dryRun, true)
  assert.throws(() => parseArgs(['--boh']), /Argomento sconosciuto/)
})

test('in CI la versione non avanza', () => {
  assert.equal(bumpDisabledByEnvironment({ CI: 'true' }), true)
  assert.equal(bumpDisabledByEnvironment({ PDFIX_NO_BUMP: '1' }), true)
  assert.equal(bumpDisabledByEnvironment({}), false)

  const options = parseArgs([])
  assert.equal(resolveTargetVersion({ current: '2.0.0', options, pending: null, env: { CI: '1' } }).version, '2.0.0')
  assert.equal(resolveTargetVersion({ current: '2.0.0', options, pending: null, env: {} }).version, '2.0.1')
})

test('il marker di release sospesa fa riusare la stessa versione', () => {
  const options = parseArgs([])
  const pending = { version: '2.0.0' }
  assert.equal(resolveTargetVersion({ current: '2.0.0', options, pending, env: {} }).version, '2.0.0')
  const forced = parseArgs(['--force'])
  assert.equal(resolveTargetVersion({ current: '2.0.0', options: forced, pending, env: {} }).version, '2.0.1')
})

test('la propagazione della versione tocca tutti i riferimenti', () => {
  const updated = updatePackageJson({ version: '1.0.0', build: { artifactName: 'fisso.deb', appId: 'x' } }, '1.0.1')
  assert.equal(updated.version, '1.0.1')
  assert.equal(updated.build.artifactName, ARTIFACT_NAME, 'un nome fissato a mano viene corretto')
  assert.equal(updated.build.appId, 'x', 'gli altri campi restano')

  const lock = updatePackageLock({ version: '1.0.0', packages: { '': { version: '1.0.0', name: 'pdfix' }, 'node_modules/vue': { version: '3.4.0' } } }, '1.0.1')
  assert.equal(lock.version, '1.0.1')
  assert.equal(lock.packages[''].version, '1.0.1')
  assert.equal(lock.packages['node_modules/vue'].version, '3.4.0', 'le dipendenze non vengono toccate')
})

// ====================================================== integrazione =========

test('la guardia di coerenza non segnala nulla sul repository reale', () => {
  const problems = collectProblems()
  assert.deepEqual(problems, [], problems.join('\n'))
})

test('version-bump --dry-run non scrive nulla', () => {
  const before = [paths.packageJson, paths.packageLock, paths.changelog, paths.releaseHistory].map((file) => readFileSync(file))
  const result = spawnSync(process.execPath, ['scripts/version-bump.js', '--dry-run'], { cwd: paths.root, encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  const after = [paths.packageJson, paths.packageLock, paths.changelog, paths.releaseHistory].map((file) => readFileSync(file))
  for (const [index, content] of before.entries()) assert.deepEqual(after[index], content)
})

test('dpkg-parsechangelog accetta il changelog generato', { skip: !hasTool('dpkg-parsechangelog') }, () => {
  const history = readReleaseHistory()
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-changelog-'))
  try {
    const file = path.join(dir, 'changelog')
    writeFileSync(file, renderChangelog(history), 'utf8')
    const head = spawnSync('dpkg-parsechangelog', ['-l', file], { encoding: 'utf8' })
    assert.equal(head.status, 0, head.stderr)
    assert.match(head.stdout, new RegExp(`^Version: ${history.releases[0].version}$`, 'm'))
    assert.match(head.stdout, /^Source: pdfix$/m)

    if (history.releases.length > 1) {
      const previous = spawnSync('dpkg-parsechangelog', ['-l', file, '--offset', '1', '--count', '1'], { encoding: 'utf8' })
      assert.equal(previous.status, 0, previous.stderr)
      assert.match(previous.stdout, new RegExp(`^Version: ${history.releases[1].version}$`, 'm'))
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

// ============================================================== e2e ==========

/**
 * Costruisce un `.deb` con le stesse patologie prodotte da FPM: campi
 * `License`/`Vendor`, `Section: default`, stub di changelog, LICENSE grezzo,
 * directory 0775, libreria condivisa eseguibile e file a 0444.
 */
function buildSyntheticDeb({ version, withEtc }) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-synth-'))
  const root = path.join(dir, 'pkg')
  const debianDir = path.join(root, 'DEBIAN')
  const optDir = path.join(root, 'opt', 'PDFix')
  const docDir = path.join(root, 'usr', 'share', 'doc', PKG_NAME)

  mkdirSync(debianDir, { recursive: true })
  mkdirSync(optDir, { recursive: true })
  mkdirSync(docDir, { recursive: true })

  writeFileSync(
    path.join(debianDir, 'control'),
    [
      'Package: pdfix',
      `Version: ${version}`,
      'License: AGPL-3.0',
      'Vendor: Lorenzo De Marco',
      'Architecture: amd64',
      'Maintainer: Lorenzo De Marco <lorenzo@example.com>',
      'Installed-Size: 1',
      'Section: default',
      'Priority: extra',
      'Homepage: https://example.com',
      'Description: Una sinossi deliberatamente lunghissima che supera le ottanta colonne previste dalla policy Debian per il campo synopsis',
      ' Corpo della descrizione.',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(path.join(debianDir, 'postinst'), '#!/bin/sh\nexit 0\n', 'utf8')
  chmodSync(path.join(debianDir, 'postinst'), 0o775)

  writeFileSync(path.join(optDir, 'pdfix'), 'binario finto\n', 'utf8')
  chmodSync(path.join(optDir, 'pdfix'), 0o775)
  writeFileSync(path.join(optDir, 'libEGL.so'), 'libreria finta\n', 'utf8')
  chmodSync(path.join(optDir, 'libEGL.so'), 0o775)
  writeFileSync(path.join(optDir, 'risorse.pak'), 'dati\n', 'utf8')
  chmodSync(path.join(optDir, 'risorse.pak'), 0o444)

  writeFileSync(path.join(docDir, 'changelog.gz'), zlib.gzipSync(Buffer.from('pdfix\n\n  * Package created with FPM.\n')))
  writeFileSync(path.join(docDir, 'LICENSE'), 'testo grezzo della licenza\n', 'utf8')

  if (withEtc) {
    const autostartDir = path.join(root, 'etc', 'xdg', 'autostart')
    mkdirSync(autostartDir, { recursive: true })
    writeFileSync(path.join(autostartDir, 'pdfix.desktop'), '[Desktop Entry]\nHidden=true\n', 'utf8')
  }

  chmodSync(optDir, 0o775)
  chmodSync(root, 0o775)

  const debPath = path.join(dir, `pdfix_v${version}_amd64.deb`)
  const built = spawnSync('fakeroot', ['dpkg-deb', '--build', root, debPath], { encoding: 'utf8' })
  assert.equal(built.status, 0, built.stderr)
  return { dir, debPath, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function finalize(debPath) {
  return spawnSync('fakeroot', [process.execPath, path.join(paths.root, 'scripts', 'deb-finalize.js'), debPath], {
    encoding: 'utf8',
    cwd: paths.root,
  })
}

function extract(debPath) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-extract-'))
  const result = spawnSync('dpkg-deb', ['-R', debPath, dir], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr)
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('deb-finalize rende conforme un pacchetto FPM', { skip: !canBuildDeb }, () => {
  const version = readReleaseHistory().releases[0].version
  const synthetic = buildSyntheticDeb({ version, withEtc: true })
  try {
    const result = finalize(synthetic.debPath)
    assert.equal(result.status, 0, result.stderr)

    const extracted = extract(synthetic.debPath)
    try {
      const control = parseControl(readFileSync(path.join(extracted.dir, 'DEBIAN', 'control'), 'utf8'))
      assert.equal(control.get('Section'), SECTION)
      assert.equal(control.get('Priority'), 'optional')
      assert.equal(control.has('License'), false)
      assert.equal(control.has('Vendor'), false)
      assert.ok(control.get('Description').split('\n')[0].length <= 80)

      const docDir = path.join(extracted.dir, 'usr', 'share', 'doc', PKG_NAME)
      assert.ok(existsSync(path.join(docDir, 'copyright')), 'copyright presente')
      assert.equal(existsSync(path.join(docDir, 'LICENSE')), false, 'LICENSE grezzo rimosso')
      assert.equal(existsSync(path.join(docDir, 'changelog.Debian.gz')), false, 'nome nativo, non Debian')

      const changelog = zlib.gunzipSync(readFileSync(path.join(docDir, 'changelog.gz'))).toString('utf8')
      assert.ok(changelog.startsWith(`pdfix (${version})`))
      assert.equal(/Package created with FPM/.test(changelog), false)

      assert.ok(existsSync(path.join(extracted.dir, 'usr', 'share', 'pixmaps', `${PKG_NAME}.png`)), 'icona pixmaps')

      const conffiles = readFileSync(path.join(extracted.dir, 'DEBIAN', 'conffiles'), 'utf8')
      assert.equal(conffiles.trim(), '/etc/xdg/autostart/pdfix.desktop')

      const contents = spawnSync('dpkg-deb', ['-c', synthetic.debPath], { encoding: 'utf8' })
      assert.equal(contents.status, 0, contents.stderr)
      const rows = contents.stdout.trim().split('\n')
      for (const row of rows) {
        assert.match(row, /\sroot\/root\s/, `proprieta root:root: ${row}`)
        const mode = row.slice(0, 10)
        assert.ok(
          ['drwxr-xr-x', '-rw-r--r--', '-rwxr-xr-x'].includes(mode),
          `permesso inatteso ${mode} in ${row}`,
        )
      }
      assert.match(contents.stdout, /-rw-r--r--.*libEGL\.so/, 'le librerie condivise non sono eseguibili')

      const md5sums = readFileSync(path.join(extracted.dir, 'DEBIAN', 'md5sums'), 'utf8').trim().split('\n')
      assert.ok(md5sums.every((line) => /^[0-9a-f]{32} {2}[^/]/.test(line)), 'formato md5sums')
      assert.ok(md5sums.some((line) => line.endsWith('usr/share/doc/pdfix/copyright')))
      assert.equal(md5sums.some((line) => line.includes('DEBIAN/')), false)
      const check = spawnSync('md5sum', ['-c', '--quiet', path.join(extracted.dir, 'DEBIAN', 'md5sums')], {
        cwd: extracted.dir,
        encoding: 'utf8',
      })
      assert.equal(check.status, 0, check.stdout + check.stderr)

      if (hasTool('dpkg-parsechangelog')) {
        const changelogFile = path.join(extracted.dir, 'changelog-riletto')
        writeFileSync(changelogFile, changelog, 'utf8')
        const parsed = spawnSync('dpkg-parsechangelog', ['-l', changelogFile], { encoding: 'utf8' })
        assert.equal(parsed.status, 0, parsed.stderr)
      }
    } finally {
      extracted.cleanup()
    }
  } finally {
    synthetic.cleanup()
  }
})

test('deb-finalize e idempotente', { skip: !canBuildDeb }, () => {
  const version = readReleaseHistory().releases[0].version
  const synthetic = buildSyntheticDeb({ version, withEtc: false })
  try {
    assert.equal(finalize(synthetic.debPath).status, 0)
    const first = extract(synthetic.debPath)
    const firstControl = readFileSync(path.join(first.dir, 'DEBIAN', 'control'), 'utf8')
    const firstMd5 = readFileSync(path.join(first.dir, 'DEBIAN', 'md5sums'), 'utf8')
    const firstChangelog = readFileSync(path.join(first.dir, 'usr', 'share', 'doc', PKG_NAME, 'changelog.gz'))
    first.cleanup()

    assert.equal(finalize(synthetic.debPath).status, 0)
    const second = extract(synthetic.debPath)
    try {
      assert.equal(readFileSync(path.join(second.dir, 'DEBIAN', 'control'), 'utf8'), firstControl)
      assert.equal(readFileSync(path.join(second.dir, 'DEBIAN', 'md5sums'), 'utf8'), firstMd5)
      assert.deepEqual(readFileSync(path.join(second.dir, 'usr', 'share', 'doc', PKG_NAME, 'changelog.gz')), firstChangelog)
      assert.equal(existsSync(path.join(second.dir, 'DEBIAN', 'conffiles')), false, 'senza /etc niente conffiles')
    } finally {
      second.cleanup()
    }
  } finally {
    synthetic.cleanup()
  }
})

test('una versione assente dallo storico ferma la build', { skip: !canBuildDeb }, () => {
  const synthetic = buildSyntheticDeb({ version: '99.99.99', withEtc: false })
  try {
    const result = finalize(synthetic.debPath)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /release-history\.json non ha un record/)
  } finally {
    synthetic.cleanup()
  }
})

test('deb-finalize rifiuta di girare senza fakeroot', () => {
  const result = spawnSync(process.execPath, [path.join(paths.root, 'scripts', 'deb-finalize.js'), 'inesistente.deb'], {
    encoding: 'utf8',
    env: { ...process.env, FAKEROOTKEY: '' },
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /fakeroot/)
})

test('i permessi sono letti con find, non con fs.stat', { skip: !canBuildDeb }, () => {
  // Regressione BUILD_DEF 5.5: sotto fakeroot Node legge i modi reali via statx
  // mentre dpkg-deb usa il database di fakeroot. Un file a 0444 nel pacchetto
  // sintetico deve uscire a 0644.
  const version = readReleaseHistory().releases[0].version
  const synthetic = buildSyntheticDeb({ version, withEtc: false })
  try {
    assert.equal(finalize(synthetic.debPath).status, 0)
    const contents = spawnSync('dpkg-deb', ['-c', synthetic.debPath], { encoding: 'utf8' })
    const row = contents.stdout.split('\n').find((line) => line.includes('risorse.pak'))
    assert.ok(row, 'il file di sola lettura e nel pacchetto')
    assert.ok(row.startsWith('-rw-r--r--'), `atteso 0644, trovato ${row.slice(0, 10)}`)
  } finally {
    synthetic.cleanup()
  }
})

test('il pacchetto sintetico riflette i permessi reali su disco', { skip: !canBuildDeb }, () => {
  const version = readReleaseHistory().releases[0].version
  const synthetic = buildSyntheticDeb({ version, withEtc: false })
  try {
    assert.equal(finalize(synthetic.debPath).status, 0)
    const extracted = extract(synthetic.debPath)
    try {
      const mode = statSync(path.join(extracted.dir, 'DEBIAN', 'postinst')).mode & 0o777
      assert.equal(mode, 0o755, 'gli script del maintainer restano eseguibili')
    } finally {
      extracted.cleanup()
    }
  } finally {
    synthetic.cleanup()
  }
})
