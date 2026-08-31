/**
 * Test delle verifiche sui pacchetti costruiti.
 *
 * Coprono i controlli che in CI decidono se una build puo' diventare una
 * release: conformita' del `.deb` e integrita' dell'immagine snap.
 *
 * I test che richiedono squashfs-tools si escludono da soli dove gli strumenti
 * non ci sono.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { PKG_NAME, SECTION, currentVersion } from '../scripts/lib/release-meta.js'
import { parseControl } from '../scripts/deb-finalize.js'
import {
  EXPECTED_LINTIAN_TAGS,
  controlProblems,
  payloadProblems,
  unexpectedLintianTags,
  pickPackage,
} from '../scripts/verify-deb.js'
import { pickSnap } from '../scripts/snap-finalize.js'
import { findTemplateArchive, inspectSnapTree, scriptsReferencedByCommand } from '../scripts/snap-finalize.js'

const hasTool = (command) => spawnSync('command', ['-v', command], { shell: true }).status === 0
const canSquash = hasTool('mksquashfs') && hasTool('unsquashfs')

function workspace(prefix) {
  const dir = mkdtempSync(path.join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

function goodControl(version) {
  return parseControl(
    [
      `Package: ${PKG_NAME}`,
      `Version: ${version}`,
      `Section: ${SECTION}`,
      'Priority: optional',
      'Architecture: amd64',
      'Maintainer: Lorenzo De Marco <lorenzo@example.com>',
      'Description: Unione di PDF e conversione in PDF/A, offline',
      ' Descrizione estesa su una riga sola.',
      '',
    ].join('\n'),
  )
}

// ------------------------------------------------------------------ deb -----

test('un control conforme non produce segnalazioni', () => {
  assert.deepEqual(controlProblems(goodControl('2.0.1'), '2.0.1'), [])
})

test('la versione del control deve coincidere con quella del progetto', () => {
  const problems = controlProblems(goodControl('1.0.0'), '2.0.1')
  assert.equal(problems.length, 1)
  assert.match(problems[0], /Version = "1\.0\.0", atteso "2\.0\.1"/)
})

test('i campi FPM e le sezioni invalide vengono segnalati', () => {
  const fields = goodControl('2.0.1')
  fields.set('License', 'AGPL-3.0')
  fields.set('Vendor', 'Chiunque')
  fields.set('Section', 'default')
  const problems = controlProblems(fields, '2.0.1')
  assert.ok(problems.some((problem) => /campo non Debian presente \(License\)/.test(problem)))
  assert.ok(problems.some((problem) => /campo non Debian presente \(Vendor\)/.test(problem)))
  assert.ok(problems.some((problem) => /Section = "default"/.test(problem)))
})

test('una descrizione malformata viene segnalata', () => {
  const fields = goodControl('2.0.1')
  fields.set('Description', `${'x'.repeat(90)}\n riga valida\nriga non indentata`)
  const problems = controlProblems(fields, '2.0.1')
  assert.ok(problems.some((problem) => /synopsis di 90 caratteri/.test(problem)))
  assert.ok(problems.some((problem) => /non indentata/.test(problem)))
})

test('un maintainer senza indirizzo email viene segnalato', () => {
  const fields = goodControl('2.0.1')
  fields.set('Maintainer', 'Lorenzo De Marco')
  assert.ok(controlProblems(fields, '2.0.1').some((problem) => /Maintainer non nel formato/.test(problem)))
})

test('il payload deve essere root:root con permessi standard', () => {
  const listing = [
    'drwxr-xr-x root/root         0 2026-08-30 18:00 ./opt/PDFix/',
    '-rw-r--r-- root/root      1024 2026-08-30 18:00 ./opt/PDFix/resources.pak',
    '-rwxr-xr-x root/root      2048 2026-08-30 18:00 ./opt/PDFix/pdfix',
  ].join('\n')
  assert.deepEqual(payloadProblems(listing), [])
})

test('proprietario, permessi e librerie eseguibili vengono intercettati', () => {
  const listing = [
    'drwxrwxr-x root/root         0 2026-08-30 18:00 ./opt/PDFix/',
    '-r--r--r-- lorenzo/lorenzo 1024 2026-08-30 18:00 ./opt/PDFix/dati.pak',
    '-rwxr-xr-x root/root      2048 2026-08-30 18:00 ./opt/PDFix/libEGL.so',
  ].join('\n')
  const problems = payloadProblems(listing)
  assert.ok(problems.some((problem) => /permessi non standard \(drwxrwxr-x\)/.test(problem)))
  assert.ok(problems.some((problem) => /proprietario diverso da root:root/.test(problem)))
  assert.ok(problems.some((problem) => /libreria condivisa eseguibile/.test(problem)))
})

test('i tag lintian attesi non fanno fallire la verifica', () => {
  const output = [
    'E: pdfix: dir-or-file-in-opt [opt/PDFix/pdfix]',
    'E: pdfix: embedded-library freetype [opt/PDFix/pdfix]',
    'W: pdfix: maintainer-script-ignores-errors [postinst]',
  ].join('\n')
  assert.deepEqual(unexpectedLintianTags(output), [])
})

test('un tag lintian eliminabile fa fallire la verifica', () => {
  const output = [
    'E: pdfix: dir-or-file-in-opt [opt/PDFix/pdfix]',
    'E: pdfix: unknown-section default',
    'W: pdfix: synopsis-too-long',
    'E: pdfix: unknown-section default',
  ].join('\n')
  const unexpected = unexpectedLintianTags(output)
  assert.deepEqual(unexpected.sort(), ['E: unknown-section', 'W: synopsis-too-long'])
})

test('l elenco dei tag attesi non contiene tag eliminabili', () => {
  for (const eliminabile of [
    'unknown-section',
    'synopsis-too-long',
    'extended-description-line-too-long',
    'wrong-name-for-changelog-of-native-package',
    'non-standard-dir-perm',
    'non-standard-file-perm',
    'shared-library-is-executable',
    'odd-permissions-on-shared-library',
  ]) {
    assert.equal(EXPECTED_LINTIAN_TAGS.has(eliminabile), false, `${eliminabile} non deve essere tollerato`)
  }
})

// ----------------------------------------------------------------- snap -----

function buildSnapTree({ withTemplate, withGui = true } = {}) {
  const { dir, cleanup } = workspace('pdfix-snaptree-')
  const root = path.join(dir, 'image')
  mkdirSync(path.join(root, 'meta', 'gui'), { recursive: true })

  writeFileSync(
    path.join(root, 'meta', 'snap.yaml'),
    [
      'name: pdfix',
      `version: ${currentVersion()}`,
      'base: core22',
      'confinement: strict',
      'grade: stable',
      'summary: Unione di PDF e conversione in PDF/A',
      'description: PDFix unisce documenti PDF.',
      'apps:',
      '  pdfix:',
      '    command: command.sh',
      '',
    ].join('\n'),
    'utf8',
  )
  writeFileSync(
    path.join(root, 'command.sh'),
    '#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/pdfix" "$@"\n',
    'utf8',
  )
  chmodSync(path.join(root, 'command.sh'), 0o755)
  writeFileSync(path.join(root, 'pdfix'), 'binario finto\n', 'utf8')

  if (withGui) {
    writeFileSync(path.join(root, 'meta', 'gui', 'PDFix.desktop'), '[Desktop Entry]\nName=PDFix\n', 'utf8')
    writeFileSync(path.join(root, 'meta', 'gui', 'icon.png'), 'png finto\n', 'utf8')
  }

  // Riproduce il difetto di electron-builder: il template resta un archivio.
  const templateDir = path.join(dir, 'template')
  mkdirSync(templateDir, { recursive: true })
  for (const script of ['desktop-init.sh', 'desktop-common.sh']) {
    writeFileSync(path.join(templateDir, script), '#!/bin/sh\nexec "$@"\n', 'utf8')
    chmodSync(path.join(templateDir, script), 0o755)
  }
  if (withTemplate) {
    spawnSync('tar', ['-cf', path.join(root, 'snap-template-electron-4.0-2-amd64.tar'), '-C', templateDir, '.'])
  }

  return { dir, root, cleanup }
}

test('il template non estratto viene riconosciuto', () => {
  const tree = buildSnapTree({ withTemplate: true })
  try {
    assert.match(path.basename(findTemplateArchive(tree.root)), /^snap-template-.*\.tar$/)
    const problems = inspectSnapTree(tree.root, { version: currentVersion() })
    assert.ok(problems.some((problem) => /script di avvio mancante: desktop-init\.sh/.test(problem)))
    assert.ok(problems.some((problem) => /template del runtime/.test(problem)))
  } finally {
    tree.cleanup()
  }
})

test('un immagine completa non produce segnalazioni', () => {
  const tree = buildSnapTree({ withTemplate: false })
  try {
    for (const script of ['desktop-init.sh', 'desktop-common.sh']) {
      writeFileSync(path.join(tree.root, script), '#!/bin/sh\nexec "$@"\n', 'utf8')
    }
    assert.deepEqual(inspectSnapTree(tree.root, { version: currentVersion() }), [])
    assert.equal(findTemplateArchive(tree.root), null)
  } finally {
    tree.cleanup()
  }
})

test('versione incoerente, devmode e gui mancante vengono segnalati', () => {
  const tree = buildSnapTree({ withTemplate: false, withGui: false })
  try {
    for (const script of ['desktop-init.sh', 'desktop-common.sh']) {
      writeFileSync(path.join(tree.root, script), '#!/bin/sh\n', 'utf8')
    }
    const problems = inspectSnapTree(tree.root, { version: '9.9.9' })
    assert.ok(problems.some((problem) => /versione .*, attesa 9\.9\.9/.test(problem)))
    assert.ok(problems.some((problem) => /nessun file \.desktop/.test(problem)))
    assert.ok(problems.some((problem) => /nessuna icona/.test(problem)))
  } finally {
    tree.cleanup()
  }
})

test('gli script richiamati da command.sh vengono estratti dal testo', () => {
  const scripts = scriptsReferencedByCommand(
    '#!/bin/bash -e\nexec "$SNAP/desktop-init.sh" "$SNAP/desktop-common.sh" "$SNAP/desktop-gnome-specific.sh" "$SNAP/pdfix" "$@"',
  )
  assert.deepEqual(scripts, ['desktop-init.sh', 'desktop-common.sh', 'desktop-gnome-specific.sh'])
})

test('snap-finalize ripara e ricompatta un immagine reale', { skip: !canSquash }, () => {
  const tree = buildSnapTree({ withTemplate: true })
  try {
    const snapPath = path.join(tree.dir, 'pdfix-test.snap')
    const packed = spawnSync('mksquashfs', [tree.root, snapPath, '-noappend', '-quiet', '-no-progress', '-all-root'], {
      encoding: 'utf8',
    })
    assert.equal(packed.status, 0, packed.stderr)

    const finalize = spawnSync(process.execPath, ['scripts/snap-finalize.js', snapPath], { encoding: 'utf8' })
    assert.equal(finalize.status, 0, finalize.stdout + finalize.stderr)
    assert.match(finalize.stdout, /Template del runtime estratto/)

    const extracted = path.join(tree.dir, 'verifica')
    const unpacked = spawnSync('unsquashfs', ['-q', '-no-progress', '-d', extracted, snapPath], { encoding: 'utf8' })
    assert.equal(unpacked.status, 0, unpacked.stderr)

    assert.ok(existsSync(path.join(extracted, 'desktop-init.sh')), 'gli script del template sono nell immagine')
    assert.equal(findTemplateArchive(extracted), null, 'l archivio del template e stato rimosso')
    assert.deepEqual(inspectSnapTree(extracted, { version: currentVersion() }), [])

    // Idempotenza: una seconda esecuzione non trova piu' nulla da riparare.
    const again = spawnSync(process.execPath, ['scripts/snap-finalize.js', snapPath], { encoding: 'utf8' })
    assert.equal(again.status, 0, again.stdout + again.stderr)
    assert.equal(/Template del runtime estratto/.test(again.stdout), false)

    const reextracted = path.join(tree.dir, 'verifica2')
    spawnSync('unsquashfs', ['-q', '-no-progress', '-d', reextracted, snapPath])
    assert.deepEqual(readdirSync(reextracted).sort(), readdirSync(extracted).sort())
  } finally {
    tree.cleanup()
  }
})

// ------------------------------------------- scelta dell'artefatto da verificare -----

test('viene verificato il pacchetto della versione in corso, non il primo in elenco', () => {
  const presenti = [
    'pdfix_v1.0.0_amd64.deb',
    'pdfix_v1.0.1_amd64.deb',
    'pdfix_v1.0.1_x86_64.AppImage',
    'builder-debug.yml',
  ]
  assert.equal(pickPackage(presenti, '1.0.1'), 'pdfix_v1.0.1_amd64.deb')
  assert.equal(pickPackage(presenti, '1.0.0'), 'pdfix_v1.0.0_amd64.deb')
})

test('senza il pacchetto della versione attesa non se ne verifica un altro', () => {
  assert.equal(pickPackage(['pdfix_v1.0.0_amd64.deb'], '2.0.0'), null)
  assert.equal(pickPackage([], '1.0.1'), null)
})

test('la stessa regola vale per lo snap', () => {
  const presenti = ['pdfix_v1.0.0_amd64.snap', 'pdfix_v1.0.1_amd64.snap', 'pdfix_v1.0.1_amd64.deb']
  assert.equal(pickSnap(presenti, '1.0.1'), 'pdfix_v1.0.1_amd64.snap')
  assert.equal(pickSnap(presenti, '9.9.9'), null)
})
