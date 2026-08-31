/**
 * Test delle preferenze: normalizzazione dello schema, calcolo del limite di
 * memoria e persistenza su file.
 */

import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import {
  MEMORY_LIMIT_MAX_MB,
  MEMORY_LIMIT_MIN_MB,
  SETTINGS_FIELDS,
  automaticMemoryLimitMb,
  defaultSettings,
  effectiveMemoryLimitMb,
  normalizeSettings,
} from '../electron/lib/settings-schema.js'
import { createSettingsStore } from '../electron/lib/settings.js'
import { OPTIONAL_OPERATIONS } from '../core/catalog.js'

function workspace() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-settings-'))
  return { dir, file: path.join(dir, 'settings.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('ogni campo dello schema ha un valore predefinito valido', () => {
  for (const field of SETTINGS_FIELDS) {
    assert.ok(field.key && field.label && field.section, `campo ${field.key} descritto`)
    if (field.type === 'number') {
      assert.ok(field.default >= field.min && field.default <= field.max, `${field.key} nell’intervallo`)
    }
  }
  const defaults = defaultSettings()
  for (const operation of OPTIONAL_OPERATIONS) {
    assert.equal(defaults.features[operation.name], true)
  }
})

test('normalizeSettings riporta i valori fuori scala nell’intervallo', () => {
  const normalized = normalizeSettings({ memoryLimitMb: 99999999, processTimeoutSec: 1 })
  assert.equal(normalized.memoryLimitMb, MEMORY_LIMIT_MAX_MB)
  assert.equal(normalized.processTimeoutSec, 30)
  assert.equal(normalizeSettings({ memoryLimitMb: 1 }).memoryLimitMb, MEMORY_LIMIT_MIN_MB)
  assert.equal(normalizeSettings({ memoryLimitMb: 'ciao' }).memoryLimitMb, defaultSettings().memoryLimitMb)
})

test('normalizeSettings scarta chiavi sconosciute e valori non pertinenti', () => {
  const normalized = normalizeSettings({ inesistente: 42, features: { merge: false, finto: true }, lastFolder: '  ' })
  assert.equal('inesistente' in normalized, false)
  assert.equal(normalized.features.merge, false)
  assert.equal('finto' in normalized.features, false)
  assert.equal(normalized.lastFolder, null)
})

test('il limite automatico è metà della memoria fisica, entro 1–16 GB', () => {
  assert.equal(automaticMemoryLimitMb(16 * 1024 ** 3), 8192)
  assert.equal(automaticMemoryLimitMb(2 * 1024 ** 3), 1024, 'sotto la soglia minima si usa 1 GB')
  assert.equal(automaticMemoryLimitMb(128 * 1024 ** 3), 16384, 'sopra la soglia massima si usa 16 GB')
  assert.equal(automaticMemoryLimitMb(16 * 1024 ** 3) % 256, 0, 'arrotondato a 256 MB')
})

test('il limite effettivo segue la modalità scelta', () => {
  const manual = normalizeSettings({ memoryLimitAuto: false, memoryLimitMb: 2048 })
  assert.equal(effectiveMemoryLimitMb(manual, 16 * 1024 ** 3), 2048)
  const auto = normalizeSettings({ memoryLimitAuto: true, memoryLimitMb: 2048 })
  assert.equal(effectiveMemoryLimitMb(auto, 16 * 1024 ** 3), 8192)
})

test('lo store scrive, rilegge e notifica le modifiche', () => {
  const { file, cleanup } = workspace()
  try {
    const store = createSettingsStore({ filePath: file })
    const seen = []
    store.onChange((next) => seen.push(next.memoryLimitMb))

    assert.equal(store.all().memoryLimitMb, defaultSettings().memoryLimitMb)
    store.set({ memoryLimitAuto: false, memoryLimitMb: 3072 })
    assert.equal(store.memoryLimitMb(), 3072)
    assert.deepEqual(seen, [3072])

    const persisted = JSON.parse(readFileSync(file, 'utf8'))
    assert.equal(persisted.memoryLimitMb, 3072)

    const reopened = createSettingsStore({ filePath: file })
    assert.equal(reopened.all().memoryLimitMb, 3072, 'le preferenze sopravvivono al riavvio')

    reopened.reset()
    assert.equal(reopened.all().memoryLimitMb, defaultSettings().memoryLimitMb)
  } finally {
    cleanup()
  }
})

test('un file di configurazione corrotto non blocca l’avvio', () => {
  const { file, cleanup } = workspace()
  try {
    writeFileSync(file, '{ questo non è json')
    const store = createSettingsStore({ filePath: file })
    assert.deepEqual(store.all(), defaultSettings())
  } finally {
    cleanup()
  }
})

test('le funzionalità opzionali si disattivano singolarmente', () => {
  const { file, cleanup } = workspace()
  try {
    const store = createSettingsStore({ filePath: file })
    assert.equal(store.isFeatureEnabled('convert'), true)
    store.set({ features: { convert: false } })
    assert.equal(store.isFeatureEnabled('convert'), false)
    assert.equal(store.isFeatureEnabled('merge'), true)
  } finally {
    cleanup()
  }
})

test('all() restituisce una copia: mutarla non tocca lo stato', () => {
  const { file, cleanup } = workspace()
  try {
    const store = createSettingsStore({ filePath: file })
    const snapshot = store.all()
    snapshot.memoryLimitMb = 1
    snapshot.features.merge = false
    assert.notEqual(store.all().memoryLimitMb, 1)
    assert.equal(store.isFeatureEnabled('merge'), true)
  } finally {
    cleanup()
  }
})
