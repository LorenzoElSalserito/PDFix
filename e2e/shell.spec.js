/**
 * Scocca dell'applicazione: schermata di avvio, informazioni, donazioni,
 * segnalazione di un problema e cambio di lingua.
 */

import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { launchApp, mainWindowOf } from './helpers.js'

test('lo splash compare per tre secondi e poi lascia il posto all applicazione', async () => {
  // Qui la durata reale non viene accorciata: è il caso che la verifica.
  const startedAt = Date.now()
  const session = await launchApp({ splashMs: null })
  try {
    const { app, page } = session

    // Fin da subito ci sono due finestre: lo splash, visibile, e quella
    // principale, ancora nascosta.
    const durante = await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows().map((window) => ({
        url: window.webContents.getURL(),
        visible: window.isVisible(),
      })),
    )
    const splash = durante.find((window) => window.url.includes('splash.html'))
    expect(splash, 'lo splash è aperto').toBeTruthy()
    expect(splash.visible).toBe(true)

    // Attesa della comparsa vera e propria dell'applicazione.
    await page.waitForFunction(() => document.querySelector('[data-testid="uploader"]') !== null)
    await expect
      .poll(
        async () =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().some(
              (window) => !window.webContents.getURL().includes('splash.html') && window.isVisible(),
            ),
          ),
        { timeout: 15_000 },
      )
      .toBe(true)

    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2900)

    // Lo splash sparisce: resta solo la finestra dell'applicazione.
    await expect
      .poll(
        async () =>
          app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().filter((window) =>
              window.webContents.getURL().includes('splash.html'),
            ).length,
          ),
        { timeout: 10_000 },
      )
      .toBe(0)
  } finally {
    await session.close()
  }
})

test('la finestra principale e pronta quando compare', async () => {
  const session = await launchApp({ splashMs: null })
  try {
    const { page } = session
    // Nessuna attesa aggiuntiva: se lo splash ha fatto il suo lavoro,
    // l'interfaccia è già completa nel momento in cui si vede.
    await expect(page.getByTestId('uploader')).toBeVisible()
    await expect(page.getByTestId('settings-open')).toBeVisible()
    await expect(page.getByTestId('language-select')).toBeVisible()
  } finally {
    await session.close()
  }
})

test('lo splash mostra il logo di PDFix, non un icona di sistema', async () => {
  const session = await launchApp({ splashMs: null })
  try {
    const { app } = session

    // Il logo dentro la pagina: se il percorso fosse sbagliato l'immagine
    // resterebbe vuota e lo splash mostrerebbe solo il nome.
    const logo = await app.evaluate(async ({ BrowserWindow }) => {
      const splash = BrowserWindow.getAllWindows().find((window) =>
        window.webContents.getURL().includes('splash.html'),
      )
      if (!splash) return null
      return {
        title: splash.getTitle(),
        immagine: await splash.webContents.executeJavaScript(
          `(() => { const img = document.querySelector('img'); return { src: img.src, larghezza: img.naturalWidth } })()`,
        ),
      }
    })

    expect(logo, 'lo splash è ancora aperto').toBeTruthy()
    expect(logo.title).toBe('PDFix')
    expect(logo.immagine.src).toContain('icon.png')
    expect(logo.immagine.larghezza, 'il logo è stato caricato davvero').toBeGreaterThan(0)
  } finally {
    await session.close()
  }
})

test('il pulsante informazioni mostra autore e licenza', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await page.getByTestId('about-open').click()

    const dialog = page.getByTestId('info-dialog')
    await expect(dialog).toBeVisible()
    await expect(page.getByTestId('info-author')).toHaveText(
      'Sviluppato da Lorenzo De Marco — licenza AGPLv3',
    )
    await expect(page.getByTestId('info-version')).toContainText('Versione')

    await page.getByTestId('info-close').click()
    await expect(dialog).toHaveCount(0)
  } finally {
    await session.close()
  }
})

test('«Segnala un Bug» apre il programma di posta con oggetto e destinatario', async () => {
  const session = await launchApp()
  try {
    const { app, page } = session

    // Si sostituisce l'apertura del client di posta per catturarne l'indirizzo:
    // il test verifica cosa verrebbe aperto, senza aprire nulla.
    await app.evaluate(({ shell }) => {
      globalThis.__ultimoUrl = null
      shell.openExternal = async (url) => {
        globalThis.__ultimoUrl = url
      }
    })

    await page.getByTestId('about-open').click()
    await page.getByTestId('report-bug').click()

    const url = await app.evaluate(() => globalThis.__ultimoUrl)
    expect(url).toBeTruthy()
    expect(url).toContain('mailto:commercial.lorenzodm@gmail.com')

    const parametri = new URLSearchParams(new URL(url).search)
    expect(parametri.get('subject').trim()).toBe('[BUG PDFIX]')
    expect(parametri.get('body')).toContain('PDFix')
    expect(parametri.get('body')).toContain('Electron')
  } finally {
    await session.close()
  }
})

test('«Donazioni» apre la pagina PayPal nel browser', async () => {
  const session = await launchApp()
  try {
    const { app, page } = session

    // Stessa tecnica della segnalazione: si intercetta l'apertura esterna per
    // controllare l'indirizzo senza aprire davvero il browser.
    await app.evaluate(({ shell }) => {
      globalThis.__ultimoUrl = null
      shell.openExternal = async (url) => {
        globalThis.__ultimoUrl = url
      }
    })

    await page.getByTestId('about-open').click()
    await page.getByTestId('donate').click()

    const url = await app.evaluate(() => globalThis.__ultimoUrl)
    expect(url).toBe('https://www.paypal.com/paypalme/lorenzodemarco92')
  } finally {
    await session.close()
  }
})

test('il selettore di lingua traduce l interfaccia', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await expect(page.getByText('Unione, modifica e conversione di PDF')).toBeVisible()

    await page.getByTestId('language-select').selectOption('en')
    await expect(page.getByText('Merge, edit and convert PDFs')).toBeVisible()
    await expect(page.getByText('Click to add files')).toBeVisible()

    await page.getByTestId('settings-open').click()
    await expect(page.getByTestId('settings-dialog')).toContainText('Settings')
    await expect(page.getByTestId('settings-dialog')).toContainText('Appearance')
    await page.getByTestId('settings-close').click()

    await page.getByTestId('about-open').click()
    await expect(page.getByTestId('info-author')).toHaveText(
      'Developed by Lorenzo De Marco — AGPLv3 licence',
    )
  } finally {
    await session.close()
  }
})

test('anche i comandi delle operazioni seguono la lingua', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await page.getByTestId('uploader').click()
    await expect(page.getByTestId('action-merge')).toHaveText('Unisci PDF')

    await page.getByTestId('language-select').selectOption('en')
    await expect(page.getByTestId('action-merge')).toHaveText('Merge PDFs')
    await expect(page.getByTestId('action-convert')).toHaveText('Convert to PDF/A')
  } finally {
    await session.close()
  }
})

test('la lingua scelta sopravvive al riavvio', async () => {
  const first = await launchApp()
  const dataDir = first.dataDir
  try {
    await first.page.getByTestId('language-select').selectOption('en')
    await expect(first.page.getByText('Merge, edit and convert PDFs')).toBeVisible()
  } finally {
    await first.close({ keepData: true })
  }

  const stored = JSON.parse(readFileSync(path.join(dataDir, 'settings.json'), 'utf8'))
  expect(stored.language).toBe('en')

  const second = await launchApp({ userDataDir: dataDir })
  try {
    await expect(second.page.getByText('Merge, edit and convert PDFs')).toBeVisible()
    await expect(second.page.getByTestId('language-select')).toHaveValue('en')
  } finally {
    await second.close()
  }
})

test('lo splash non lascia finestre orfane alla chiusura', async () => {
  const session = await launchApp()
  try {
    // Lo splash viene distrutto subito dopo aver mostrato l'applicazione: si
    // attende quel momento invece di fotografare un istante qualsiasi.
    await expect
      .poll(
        () => session.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length),
        { timeout: 10_000 },
      )
      .toBe(1)
    expect((await mainWindowOf(session.app)).url()).toContain('index.html')
  } finally {
    await session.close()
  }
})
