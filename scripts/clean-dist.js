#!/usr/bin/env node
/**
 * Svuota `dist/` prima di una build.
 *
 * Interfaccia e motore scrivono in due sottocartelle diverse: senza questa
 * pulizia, i file di una struttura precedente resterebbero e finirebbero
 * nell'archivio asar.
 */

import { rmSync } from 'node:fs'
import { paths } from './lib/release-meta.js'
import path from 'node:path'

rmSync(path.join(paths.root, 'dist'), { recursive: true, force: true })
