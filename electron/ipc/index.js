/**
 * Registrazione di tutti i canali IPC in un punto solo.
 */

import { registerAppHandlers } from './app.js'
import { registerFileHandlers } from './files.js'
import { registerPdfHandlers } from './pdf.js'
import { registerSettingsHandlers } from './settings-channel.js'

export function registerIpc(context) {
  registerAppHandlers(context)
  registerFileHandlers(context)
  registerPdfHandlers(context)
  registerSettingsHandlers(context)
}
