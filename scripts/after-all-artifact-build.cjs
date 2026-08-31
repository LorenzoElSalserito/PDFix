/**
 * Hook `afterAllArtifactBuild` di electron-builder.
 *
 * Rende conformi i pacchetti Debian appena prodotti e cancella il marker di
 * release sospesa: da qui in poi la versione è stata effettivamente pubblicata.
 *
 * È CommonJS deliberatamente: electron-builder carica gli hook con `require`,
 * e questo file deve funzionare anche se il progetto è ESM.
 */

const { spawnSync } = require('node:child_process')
const { existsSync, rmSync } = require('node:fs')
const path = require('node:path')

const debFinalizeScript = path.join(__dirname, 'deb-finalize.js')
const snapFinalizeScript = path.join(__dirname, 'snap-finalize.js')
const pendingMarker = path.join(__dirname, '.release-pending.json')

function hasFakeroot() {
  return spawnSync('fakeroot', ['--version'], { encoding: 'utf8' }).status === 0
}

module.exports = async function afterAllArtifactBuild(buildResult) {
  const artifacts = buildResult.artifactPaths || []
  const debs = artifacts.filter((artifact) => artifact.endsWith('.deb'))
  const snaps = artifacts.filter((artifact) => artifact.endsWith('.snap'))

  if (debs.length > 0) {
    if (!hasFakeroot()) {
      throw new Error('fakeroot è richiesto per rendere conforme il .deb: installalo con `apt install fakeroot`.')
    }
    for (const deb of debs) {
      // `dpkg-deb` deve vedere root:root: senza fakeroot il pacchetto
      // installerebbe file di proprietà dell'utente che ha compilato.
      const result = spawnSync('fakeroot', [process.execPath, debFinalizeScript, deb], { stdio: 'inherit' })
      if (result.status !== 0) {
        throw new Error(`deb-finalize fallito su ${path.basename(deb)}.`)
      }
    }
  }

  for (const snap of snaps) {
    // Estrae il template del runtime che electron-builder lascia come archivio
    // e verifica che l'immagine sia avviabile.
    const result = spawnSync(process.execPath, [snapFinalizeScript, snap], { stdio: 'inherit' })
    if (result.status !== 0) {
      throw new Error(`snap-finalize fallito su ${path.basename(snap)}.`)
    }
  }

  if (existsSync(pendingMarker)) rmSync(pendingMarker)

  return []
}
