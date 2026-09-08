#!/usr/bin/env node
/**
 * Generazione di tutte le icone a partire da un'unica sorgente.
 *
 * Sorgente, in ordine di preferenza:
 *   build/icon-source.svg, build/icon-source.png, build/icon.svg, build/icon.png
 *
 * Sostituire il file sorgente e rilanciare `npm run icons` è l'unico passaggio
 * necessario per cambiare l'icona di tutti i formati distribuiti.
 *
 * Prodotti:
 *   build/icon.png              1024×1024, usato dalla finestra e da AppImage
 *   build/icons/*.png           set completo per il pacchetto Debian
 *   build/icon.ico              Windows (NSIS ed eseguibile)
 *   build/icon.icns             macOS (bundle .app e DMG)
 *   client/src/assets/app-icon.png  icona mostrata nell'intestazione dell'app
 */

import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { isEntrypoint } from './lib/release-meta.js'
import sharp from 'sharp'
import pngToIco from 'png-to-ico'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const buildDir = path.join(repoRoot, 'build')
const iconsDir = path.join(buildDir, 'icons')
const rendererAssetsDir = path.join(repoRoot, 'client', 'src', 'assets')

/** Dimensione dell'icona incorporata nell'interfaccia. */
export const RENDERER_ICON_SIZE = 256

/** Dimensioni richieste dai pacchetti Linux (hicolor) e dall'icona di finestra. */
export const LINUX_SIZES = [16, 24, 32, 48, 64, 96, 128, 256, 512, 1024]

/** Dimensioni incluse nell'archivio .ico di Windows. */
export const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

/**
 * Tipi ICNS basati su PNG, con la dimensione corrispondente.
 * `icp*` sono le varianti compatte, `ic0*`/`ic1*` quelle moderne e retina.
 */
export const ICNS_TYPES = [
  ['icp4', 16],
  ['icp5', 32],
  ['icp6', 64],
  ['ic07', 128],
  ['ic08', 256],
  ['ic09', 512],
  ['ic10', 1024],
  ['ic11', 32],
  ['ic12', 64],
  ['ic13', 256],
  ['ic14', 512],
]

export function resolveSource(dir = buildDir) {
  const candidates = ['icon-source.svg', 'icon-source.png', 'icon.svg', 'icon.png']
  for (const candidate of candidates) {
    const filePath = path.join(dir, candidate)
    if (existsSync(filePath)) return filePath
  }
  throw new Error(`Nessuna icona sorgente in ${dir} (attesi: ${candidates.join(', ')}).`)
}

/**
 * Costruisce un archivio ICNS dalle immagini PNG fornite.
 *
 * Formato: intestazione `icns` + dimensione totale, poi un blocco per tipo con
 * firma, lunghezza comprensiva degli 8 byte di intestazione e payload PNG.
 *
 * @param {{type: string, data: Buffer}[]} entries
 * @returns {Buffer}
 */
export function buildIcns(entries) {
  const blocks = entries.map(({ type, data }) => {
    const header = Buffer.alloc(8)
    header.write(type, 0, 4, 'ascii')
    header.writeUInt32BE(data.length + 8, 4)
    return Buffer.concat([header, data])
  })
  const body = Buffer.concat(blocks)
  const header = Buffer.alloc(8)
  header.write('icns', 0, 4, 'ascii')
  header.writeUInt32BE(body.length + 8, 4)
  return Buffer.concat([header, body])
}

async function renderPng(source, size) {
  return sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
}

async function main() {
  const source = resolveSource()
  const metadata = await sharp(source).metadata()
  console.log(`Icona sorgente: ${path.relative(repoRoot, source)} (${metadata.width}×${metadata.height})`)

  if (!source.endsWith('.svg') && Math.min(metadata.width ?? 0, metadata.height ?? 0) < 512) {
    console.warn('Attenzione: sorgente inferiore a 512×512, le icone grandi saranno interpolate.')
  }

  mkdirSync(iconsDir, { recursive: true })
  for (const file of readdirSync(iconsDir)) {
    if (file.endsWith('.png')) rmSync(path.join(iconsDir, file))
  }

  const rendered = new Map()
  for (const size of new Set([...LINUX_SIZES, ...ICO_SIZES, RENDERER_ICON_SIZE, ...ICNS_TYPES.map(([, size]) => size)])) {
    rendered.set(size, await renderPng(source, size))
  }

  for (const size of LINUX_SIZES) {
    writeFileSync(path.join(iconsDir, `${size}x${size}.png`), rendered.get(size))
  }
  writeFileSync(path.join(buildDir, 'icon.png'), rendered.get(1024))
  console.log(`PNG: build/icon.png e ${LINUX_SIZES.length} dimensioni in build/icons/`)

  const ico = await pngToIco(ICO_SIZES.map((size) => rendered.get(size)))
  writeFileSync(path.join(buildDir, 'icon.ico'), ico)
  console.log(`ICO: build/icon.ico (${ICO_SIZES.join(', ')} px)`)

  const icns = buildIcns(ICNS_TYPES.map(([type, size]) => ({ type, data: rendered.get(size) })))
  writeFileSync(path.join(buildDir, 'icon.icns'), icns)
  console.log(`ICNS: build/icon.icns (${ICNS_TYPES.length} varianti)`)

  // L'intestazione dell'applicazione mostra la stessa icona dei pacchetti:
  // una sola sorgente, nessuna copia da tenere allineata a mano.
  mkdirSync(rendererAssetsDir, { recursive: true })
  writeFileSync(path.join(rendererAssetsDir, 'app-icon.png'), rendered.get(RENDERER_ICON_SIZE))
  console.log(`Interfaccia: client/src/assets/app-icon.png (${RENDERER_ICON_SIZE} px)`)
}

if (isEntrypoint(import.meta.url)) {
  main().catch((error) => {
    console.error(`Generazione icone fallita: ${error.message}`)
    process.exit(1)
  })
}
