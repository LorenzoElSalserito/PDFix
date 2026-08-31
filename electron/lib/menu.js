/**
 * Menu applicativo.
 *
 * Le voci non eseguono logica: inoltrano un'azione al renderer, che possiede
 * lo stato dell'interfaccia. Così la stessa azione è disponibile da menu, da
 * scorciatoia e dai pulsanti della pagina senza duplicare comportamento.
 */

import { app, Menu, shell } from 'electron'
import { translator } from './strings.js'

const isMac = process.platform === 'darwin'

function send(window, action) {
  window?.webContents.send('menu:action', action)
}

/**
 * @param {object} options
 * @param {() => import('electron').BrowserWindow | null} options.getWindow
 * @param {string} options.homepage
 * @param {{all: () => object}} [options.settings] fornisce la lingua scelta
 */
export function buildApplicationMenu({ getWindow, homepage, settings }) {
  const t = translator(settings?.all().language)

  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { label: t('menu.about'), click: () => send(getWindow(), 'about') },
            { type: 'separator' },
            { label: t('menu.settings'), accelerator: 'Cmd+,', click: () => send(getWindow(), 'settings') },
            { type: 'separator' },
            { role: 'services', label: t('menu.services') },
            { type: 'separator' },
            { role: 'hide', label: t('menu.hide') },
            { role: 'hideOthers', label: t('menu.hideOthers') },
            { role: 'unhide', label: t('menu.unhide') },
            { type: 'separator' },
            { role: 'quit', label: t('menu.quit') },
          ],
        }]
      : []),
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.addFiles'), accelerator: 'CmdOrCtrl+O', click: () => send(getWindow(), 'open-files') },
        { label: t('menu.clear'), accelerator: 'CmdOrCtrl+Backspace', click: () => send(getWindow(), 'clear-files') },
        { type: 'separator' },
        ...(isMac
          ? [{ role: 'close', label: t('menu.closeWindow') }]
          : [
              { label: t('menu.settings'), accelerator: 'Ctrl+,', click: () => send(getWindow(), 'settings') },
              { type: 'separator' },
              { role: 'quit', label: t('menu.quit') },
            ]),
      ],
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo', label: t('menu.undo') },
        { role: 'redo', label: t('menu.redo') },
        { type: 'separator' },
        { role: 'cut', label: t('menu.cut') },
        { role: 'copy', label: t('menu.copy') },
        { role: 'paste', label: t('menu.paste') },
        { role: 'selectAll', label: t('menu.selectAll') },
      ],
    },
    {
      label: t('menu.view'),
      submenu: [
        { role: 'reload', label: t('menu.reload') },
        { role: 'toggleDevTools', label: t('menu.devTools') },
        { type: 'separator' },
        { role: 'resetZoom', label: t('menu.resetZoom') },
        { role: 'zoomIn', label: t('menu.zoomIn') },
        { role: 'zoomOut', label: t('menu.zoomOut') },
        { type: 'separator' },
        { role: 'togglefullscreen', label: t('menu.fullscreen') },
      ],
    },
    {
      label: t('menu.help'),
      submenu: [
        { label: t('menu.about'), click: () => send(getWindow(), 'about') },
        { label: t('menu.website'), click: () => shell.openExternal(homepage) },
      ],
    },
  ]

  return Menu.buildFromTemplate(template)
}

/**
 * Installa il menu applicativo solo dove appartiene al sistema operativo.
 *
 * Su Windows e Linux la barra dei menu di Chromium sarebbe una striscia in
 * più sopra l'interfaccia, con voci che l'applicazione offre già: viene
 * rimossa. Su macOS la barra è di sistema, sempre presente, e senza menu
 * l'applicazione perderebbe anche «Esci» e le scorciatoie standard.
 */
export function installApplicationMenu(options) {
  Menu.setApplicationMenu(isMac ? buildApplicationMenu(options) : null)
}
