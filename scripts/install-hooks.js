#!/usr/bin/env node
/**
 * Attiva le guardie di git versionate in `.githooks/`.
 *
 * Gira da sé dopo `npm install`: le guardie servono a chi sviluppa, e chiedere
 * un passo manuale significa non averle proprio nel momento in cui servono.
 */

import { spawnSync } from 'node:child_process'
import { isEntrypoint } from './lib/release-meta.js'

export function installHooks({ env = process.env } = {}) {
  // In CI non serve: lì non si committa, e il repository è usa e getta.
  if (env.CI) return 'saltata: ambiente di integrazione continua'

  const inside = spawnSync('git', ['rev-parse', '--is-inside-work-tree'], { encoding: 'utf8' })
  if (inside.status !== 0) return 'saltata: non è un repository git'

  const result = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { encoding: 'utf8' })
  if (result.status !== 0) return `non riuscita: ${result.stderr.trim()}`
  return 'attive: .githooks/pre-commit, .githooks/pre-push'
}

if (isEntrypoint(import.meta.url)) {
  console.log(`Guardie di git ${installHooks()}`)
}
