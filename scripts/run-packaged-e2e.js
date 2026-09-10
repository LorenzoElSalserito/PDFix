#!/usr/bin/env node
/**
 * Esegue la suite end-to-end contro l'applicazione impacchettata invece che
 * sui sorgenti.
 *
 * E' la verifica che conta prima di pubblicare: prova l'archivio asar reale, il
 * motore impacchettato e i percorsi delle risorse cosi' come li vedra' l'utente.
 *
 *   npm run test:e2e:packaged                       # cartella unpacked della piattaforma
 *   npm run test:e2e:snap                           # payload dello .snap prodotto
 *   node scripts/run-packaged-e2e.js --from release/pdfix_v2.0.1_x86_64.AppImage
 *   PDFIX_E2E_EXECUTABLE=/percorso/eseguibile npm run test:e2e:packaged
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { currentVersion, isEntrypoint, paths, pickArtifact } from './lib/release-meta.js'

const releaseDir = path.join(paths.root, 'release')

function sh(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} → exit ${result.status}\n${result.stderr || result.stdout}`)
  }
  return result.stdout
}

/** Eseguibile prodotto da electron-builder per la piattaforma corrente. */
function unpackedExecutable() {
  const candidates = {
    linux: [path.join(releaseDir, 'linux-unpacked', 'pdfix')],
    win32: [path.join(releaseDir, 'win-unpacked', 'PDFix.exe')],
    darwin: [
      path.join(releaseDir, 'mac-arm64', 'PDFix.app', 'Contents', 'MacOS', 'PDFix'),
      path.join(releaseDir, 'mac', 'PDFix.app', 'Contents', 'MacOS', 'PDFix'),
    ],
  }
  return (candidates[process.platform] ?? []).find((candidate) => existsSync(candidate)) ?? null
}

/**
 * Artefatto della versione in corso dentro `release/`.
 *
 * Le build precedenti restano nella cartella: collaudare la prima che capita
 * significherebbe certificare una release vecchia — e i test che coprono le
 * novità fallirebbero senza che nulla sia rotto.
 */
function findArtifact(extension) {
  if (!existsSync(releaseDir)) return null
  const entry = pickArtifact(readdirSync(releaseDir), extension, currentVersion())
  return entry ? path.join(releaseDir, entry) : null
}

/**
 * Estrae il payload di uno .snap o di una AppImage e restituisce l'eseguibile
 * al suo interno: e' il modo di provare l'artefatto vero anche senza snapd o
 * FUSE installati.
 */
function extractArtifact(artifactPath) {
  const workDir = mkdtempSync(path.join(tmpdir(), 'pdfix-artifact-'))
  if (artifactPath.endsWith('.snap')) {
    sh('unsquashfs', ['-q', '-no-progress', '-d', path.join(workDir, 'payload'), artifactPath])
    return { executable: path.join(workDir, 'payload', 'pdfix'), workDir }
  }
  if (artifactPath.endsWith('.AppImage')) {
    sh(artifactPath, ['--appimage-extract'], { cwd: workDir })
    return { executable: path.join(workDir, 'squashfs-root', 'pdfix'), workDir }
  }
  rmSync(workDir, { recursive: true, force: true })
  throw new Error(`estrazione non supportata per ${path.basename(artifactPath)}`)
}

/**
 * Riga di comando di Playwright, eseguita con questo stesso Node.
 *
 * Non si passa da `npx`: su Windows è `npx.cmd`, che `spawnSync` non sa
 * avviare senza shell — il processo non partiva e la suite sull'applicazione
 * impacchettata falliva senza dire perché.
 */
export function playwrightCli() {
  return path.join(paths.root, 'node_modules', 'playwright', 'cli.js')
}

function parseArgs(argv) {
  const options = { from: null }
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--from') options.from = argv[++index]
    else if (argv[index] === '--snap') options.from = findArtifact('.snap') ?? '.snap'
    else if (argv[index] === '--appimage') options.from = findArtifact('.AppImage') ?? '.AppImage'
    else throw new Error(`argomento sconosciuto: ${argv[index]}`)
  }
  return options
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  let temporary = null
  let executable = process.env.PDFIX_E2E_EXECUTABLE ?? null

  if (!executable && options.from) {
    if (!existsSync(options.from)) throw new Error(`artefatto non trovato: ${options.from}`)
    const extracted = extractArtifact(path.resolve(options.from))
    executable = extracted.executable
    temporary = extracted.workDir
  }

  if (!executable) executable = unpackedExecutable()
  if (!executable || !existsSync(executable)) {
    throw new Error('nessuna applicazione impacchettata trovata: esegui prima `npm run dist`.')
  }

  try {
    console.log(`Suite E2E sull'applicazione impacchettata: ${path.relative(paths.root, executable)}`)
    const result = spawnSync(process.execPath, [playwrightCli(), 'test'], {
      cwd: paths.root,
      stdio: 'inherit',
      env: { ...process.env, PDFIX_E2E_EXECUTABLE: executable },
    })
    // Un avvio fallito non ha uno stato d'uscita: senza questo controllo il
    // comando terminava con 1 e nemmeno una riga di spiegazione.
    if (result.error) throw result.error
    process.exitCode = result.status ?? 1
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true })
  }
}

// La guardia non è un dettaglio: senza, importare questo modulo — lo fanno i
// test, per riusarne le funzioni — eseguirebbe l'intera suite, o uscirebbe con
// un errore se non c'è un'applicazione impacchettata. È quello che è successo:
// verde in locale, dove la cartella `release/` esisteva, rosso su ogni runner.
if (isEntrypoint(import.meta.url)) {
  try {
    main()
  } catch (error) {
    console.error(`run-packaged-e2e: ${error.message}`)
    process.exit(1)
  }
}
