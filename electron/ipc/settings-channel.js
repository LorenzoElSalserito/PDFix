/**
 * Canali IPC per le preferenze e per il catalogo delle funzionalità.
 *
 * Il renderer non conosce lo schema: lo riceve da qui e genera l'interfaccia.
 */

import { ipcMain } from 'electron'
import { OPTIONAL_OPERATIONS, OPERATIONS } from '../../core/catalog.js'
import { SETTINGS_FIELDS, SETTINGS_SECTIONS, effectiveMemoryLimitMb } from '../lib/settings-schema.js'

function snapshot(settings) {
  const values = settings.all()
  return {
    values,
    fields: SETTINGS_FIELDS,
    sections: SETTINGS_SECTIONS,
    features: OPTIONAL_OPERATIONS.map(({ name, label, description }) => ({ name, label, description })),
    effectiveMemoryLimitMb: effectiveMemoryLimitMb(values),
  }
}

/** Operazioni visibili, filtrate dalle funzionalità attive nelle preferenze. */
function enabledOperations(settings) {
  return OPERATIONS.filter((operation) => !operation.hidden).filter(
    (operation) => !operation.optional || settings.isFeatureEnabled(operation.name),
  )
}

export function registerSettingsHandlers({ settings, onChange }) {
  ipcMain.handle('settings:get', () => snapshot(settings))

  ipcMain.handle('settings:set', (_event, patch) => {
    settings.set(patch ?? {})
    onChange?.(settings.all())
    return snapshot(settings)
  })

  ipcMain.handle('settings:reset', () => {
    settings.reset()
    onChange?.(settings.all())
    return snapshot(settings)
  })

  ipcMain.handle('catalog:operations', () => enabledOperations(settings))
}
