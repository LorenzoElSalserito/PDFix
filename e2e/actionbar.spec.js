/**
 * La pulsantiera: ogni comando del catalogo esiste, sta nel suo gruppo e fa
 * qualcosa quando lo si preme.
 *
 * L'elenco delle operazioni non è scritto qui: viene dal catalogo, così una
 * funzionalità aggiunta senza pulsante — o senza gruppo — fa fallire il test
 * invece di passare inosservata.
 */

import { expect, test } from '@playwright/test'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { OPERATIONS, OPERATION_GROUPS } from '../core/catalog.js'
import { addFiles, buildMultiPagePdf, fixtures, launchApp } from './helpers.js'

const catalogo = OPERATIONS.filter((operazione) => !operazione.hidden)

/** Un comando chiede parametri prima di partire? */
const chiedeParametri = (operazione) =>
  Boolean(operazione.inspect) || (operazione.params?.length ?? 0) > 0

/** Operazioni eseguibili su un solo documento PDF già caricato. */
const suUnDocumento = catalogo.filter(
  (operazione) =>
    operazione.minFiles <= 1 &&
    (operazione.maxFiles === null || operazione.maxFiles >= 1) &&
    (operazione.inputExtensions ?? ['.pdf']).includes('.pdf'),
)

/** Applicazione avviata su un documento di più pagine, con destinazioni pronte. */
async function conDocumento() {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-barra-'))
  const source = await buildMultiPagePdf(dir)
  const outputDir = path.join(dir, 'parti')
  mkdirSync(outputDir)

  const session = await launchApp({
    openFiles: [source.output],
    savePath: path.join(dir, 'risultato.pdf'),
    saveDir: outputDir,
  })

  return {
    ...session,
    async cleanup() {
      await session.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('ogni operazione del catalogo ha un pulsante, nel gruppo che dichiara', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)

    for (const operazione of catalogo) {
      const comando = page.getByTestId(`action-${operazione.name}`)
      await expect(comando, operazione.name).toHaveCount(1)
      await expect(comando, operazione.name).toHaveAttribute('data-group', operazione.group)
    }

    // Nessun pulsante di troppo: la barra mostra il catalogo, non altro.
    await expect(page.locator('[data-group]')).toHaveCount(catalogo.length)
  } finally {
    await app.cleanup()
  }
})

test('ogni comando apre la sua finestra o avvia davvero l elaborazione', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    const esito = page.locator('[data-testid="status-success"], [data-testid="status-error"]')

    for (const operazione of suUnDocumento) {
      const comando = page.getByTestId(`action-${operazione.name}`)
      await expect(comando, operazione.name).toBeEnabled()
      await comando.click()

      if (chiedeParametri(operazione)) {
        await expect(page.getByTestId('operation-dialog'), operazione.name).toBeVisible()
        await page.getByTestId('operation-cancel').click()
        await expect(page.getByTestId('operation-dialog'), operazione.name).toHaveCount(0)
      } else {
        // Senza parametri il comando parte subito: il motore risponde, bene o
        // male che sia andata, e la risposta compare in fondo alla pagina.
        await expect(esito.first(), operazione.name).toBeVisible()
      }
    }
  } finally {
    await app.cleanup()
  }
})

test('Esc chiude la finestra dei parametri senza eseguire nulla', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)

    await page.getByTestId('action-extract').click()
    await expect(page.getByTestId('operation-dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    await expect(page.getByTestId('operation-dialog')).toHaveCount(0)
    await expect(page.getByTestId('status-success')).toHaveCount(0)
    await expect(page.getByTestId('status-error')).toHaveCount(0)
  } finally {
    await app.cleanup()
  }
})

test('le schede dei gruppi filtrano i comandi', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)

    await expect(page.getByTestId('action-group-all')).toHaveAttribute('aria-pressed', 'true')

    for (const gruppo of OPERATION_GROUPS) {
      const attesi = catalogo.filter((operazione) => operazione.group === gruppo.id)
      await page.getByTestId(`action-group-${gruppo.id}`).click()

      await expect(page.locator('[data-group]'), gruppo.id).toHaveCount(attesi.length)
      for (const operazione of attesi) {
        await expect(page.getByTestId(`action-${operazione.name}`), operazione.name).toBeVisible()
      }
    }

    await page.getByTestId('action-group-all').click()
    await expect(page.locator('[data-group]')).toHaveCount(catalogo.length)
  } finally {
    await app.cleanup()
  }
})

test('il comando delle immagini si attiva solo con le immagini caricate', async () => {
  const session = await launchApp({ openFiles: [fixtures.jpg, fixtures.png] })
  try {
    const { page } = session
    await addFiles(page)

    await expect(page.getByTestId('action-images')).toBeEnabled()
    await expect(page.getByTestId('action-merge')).toBeDisabled()

    await page.getByTestId('action-images').click()
    await expect(page.getByTestId('operation-dialog')).toBeVisible()
    await page.getByTestId('operation-cancel').click()
    await expect(page.getByTestId('operation-dialog')).toHaveCount(0)
  } finally {
    await session.close()
  }
})

test('l interruttore PDF/A resta accanto ai comandi e si ricorda la scelta', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)

    const interruttore = page.getByTestId('pdfa-toggle')
    await expect(interruttore).not.toBeChecked()
    await interruttore.check()
    await expect(interruttore).toBeChecked()

    // Cambiare scheda non deve azzerare la scelta fatta.
    await page.getByTestId('action-group-pagine').click()
    await expect(interruttore).toBeChecked()
  } finally {
    await app.cleanup()
  }
})
