/**
 * Interfaccia: barra dei menu, identità visiva, zoom, tema e adattamento allo
 * schermo. Sono tutte proprietà che si verificano solo sull'applicazione vera,
 * perché dipendono dalla finestra Electron e non dal solo DOM.
 */

import { expect, test } from '@playwright/test'
import { addFiles, launchApp } from './helpers.js'

/** Dimensioni estreme dichiarate come supportate. */
const SCREENS = [
  { name: '800×600', width: 800, height: 600 },
  { name: '1366×768', width: 1366, height: 768 },
  { name: '4K (3840×2160)', width: 3840, height: 2160 },
]

async function resizeTo(app, page, { width, height }) {
  await app.evaluate(({ BrowserWindow }, size) => {
    const [window] = BrowserWindow.getAllWindows()
    window.setContentSize(size.width, size.height)
  }, { width, height })
  await page.waitForFunction(
    (expected) => Math.abs(window.innerWidth - expected) < 200,
    width,
    { timeout: 5000 },
  ).catch(() => {})
}

async function openSettings(page) {
  await page.getByTestId('settings-open').click()
  await expect(page.getByTestId('settings-dialog')).toBeVisible()
}

test('la barra dei menu di Chromium non viene mostrata', async () => {
  const session = await launchApp()
  try {
    const menu = await session.app.evaluate(({ Menu }) => Menu.getApplicationMenu())
    // Su macOS la barra è di sistema e il menu resta; altrove viene rimosso.
    if (process.platform === 'darwin') expect(menu).not.toBeNull()
    else expect(menu).toBeNull()

    const autoHide = await session.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].isMenuBarAutoHide(),
    )
    if (process.platform !== 'darwin') expect(autoHide).toBe(true)
  } finally {
    await session.close()
  }
})

test('l icona dell applicazione e visibile accanto al titolo', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    const icon = page.getByTestId('app-icon')
    await expect(icon).toBeVisible()

    const box = await icon.boundingBox()
    expect(box.width).toBeGreaterThanOrEqual(40)
    expect(box.height).toBeGreaterThanOrEqual(40)

    // L'icona sta a sinistra del titolo, sulla stessa riga.
    const title = await page.getByRole('heading', { name: 'PDFix' }).boundingBox()
    expect(box.x).toBeLessThan(title.x)
    expect(Math.abs(box.y + box.height / 2 - (title.y + title.height / 2))).toBeLessThan(40)
  } finally {
    await session.close()
  }
})

test('lo zoom scelto nelle impostazioni ingrandisce davvero l interfaccia', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    const larghezzaCss = () => page.evaluate(() => window.innerWidth)
    const zoomDiElectron = () =>
      session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].webContents.getZoomFactor())

    const base = await larghezzaCss()
    expect(await zoomDiElectron()).toBeCloseTo(1, 2)

    await openSettings(page)
    await page.getByTestId('field-zoomPercent').selectOption('150')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0)

    expect(await zoomDiElectron()).toBeCloseTo(1.5, 2)
    // A parità di finestra, ingrandire riduce i pixel CSS disponibili.
    expect(await larghezzaCss()).toBeLessThan(base)

    await openSettings(page)
    await page.getByTestId('field-zoomPercent').selectOption('50')
    await page.getByTestId('settings-save').click()

    expect(await zoomDiElectron()).toBeCloseTo(0.5, 2)
    expect(await larghezzaCss()).toBeGreaterThan(base)
  } finally {
    await session.close()
  }
})

test('lo zoom sopravvive al riavvio', async () => {
  const first = await launchApp()
  const dataDir = first.dataDir
  try {
    await openSettings(first.page)
    await first.page.getByTestId('field-zoomPercent').selectOption('125')
    await first.page.getByTestId('settings-save').click()
    await expect(first.page.getByTestId('settings-dialog')).toHaveCount(0)
  } finally {
    await first.close({ keepData: true })
  }

  const second = await launchApp({ userDataDir: dataDir })
  try {
    const zoom = await second.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].webContents.getZoomFactor(),
    )
    expect(zoom).toBeCloseTo(1.25, 2)
    await openSettings(second.page)
    await expect(second.page.getByTestId('field-zoomPercent')).toHaveValue('125')
  } finally {
    await second.close()
  }
})

test('la modalita scura inverte i colori dell interfaccia', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    const sfondo = () =>
      page.evaluate(() => getComputedStyle(document.querySelector('header')).backgroundColor)
    const chiaro = await sfondo()

    await openSettings(page)
    await page.getByTestId('field-theme').selectOption('scuro')
    await page.getByTestId('settings-save').click()
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0)

    await expect(page.locator('html')).toHaveClass(/dark/)
    const scuro = await sfondo()
    expect(scuro).not.toBe(chiaro)

    // Verifica che sia davvero scuro: la luminanza del fondo deve crollare.
    const luminanza = (colore) => {
      const [r, g, b] = colore.match(/\d+/g).map(Number)
      return 0.2126 * r + 0.7152 * g + 0.0722 * b
    }
    expect(luminanza(scuro)).toBeLessThan(luminanza(chiaro) / 2)

    await openSettings(page)
    await page.getByTestId('field-theme').selectOption('chiaro')
    await page.getByTestId('settings-save').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
  } finally {
    await session.close()
  }
})

test('il tema scuro resta impostato dopo il riavvio', async () => {
  const first = await launchApp()
  const dataDir = first.dataDir
  try {
    await openSettings(first.page)
    await first.page.getByTestId('field-theme').selectOption('scuro')
    await first.page.getByTestId('settings-save').click()
    await expect(first.page.locator('html')).toHaveClass(/dark/)
  } finally {
    await first.close({ keepData: true })
  }

  const second = await launchApp({ userDataDir: dataDir })
  try {
    await expect(second.page.locator('html')).toHaveClass(/dark/)
  } finally {
    await second.close()
  }
})

test('la finestra non puo essere ridotta sotto 800×600', async () => {
  const session = await launchApp()
  try {
    const minimo = await session.app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()[0].getMinimumSize(),
    )
    expect(minimo).toEqual([800, 600])
  } finally {
    await session.close()
  }
})

for (const screen of SCREENS) {
  test(`l interfaccia resta utilizzabile a ${screen.name}`, async () => {
    const session = await launchApp()
    try {
      const { app, page } = session
      await resizeTo(app, page, screen)

      await expect(page.getByTestId('uploader')).toBeVisible()
      await expect(page.getByTestId('settings-open')).toBeVisible()

      await addFiles(page)
      await expect(page.getByTestId('action-merge')).toBeVisible()

      // Nessuno scorrimento orizzontale: il contenuto sta dentro la finestra.
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
      expect(overflow).toBeLessThanOrEqual(1)

      // Anche la finestra delle impostazioni deve restare tutta raggiungibile.
      await openSettings(page)
      await expect(page.getByTestId('settings-save')).toBeVisible()
      await expect(page.getByTestId('field-theme')).toBeVisible()
      const overflowDialog = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      )
      expect(overflowDialog).toBeLessThanOrEqual(1)
    } finally {
      await session.close()
    }
  })
}
