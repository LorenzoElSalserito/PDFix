/**
 * Certificazione delle funzionalità di manipolazione.
 *
 * Ogni operazione viene eseguita dall'applicazione reale, con i suoi parametri
 * scelti nell'interfaccia, e il file prodotto viene riaperto e ispezionato: è
 * la prova che la funzione lavora davvero, non che il pulsante esiste.
 */

import { expect, test } from '@playwright/test'
import { PDFDocument } from 'pdf-lib'
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { addFiles, buildMultiPagePdf, fixtures, launchApp, pageCountOf } from './helpers.js'

/** Prepara cartella di lavoro, sorgente multipagina e applicazione avviata. */
async function conDocumento({ copies = 2, saveDir = false } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, copies)
  const outputPath = path.join(dir, 'risultato.pdf')
  const outputDir = path.join(dir, 'parti')
  if (saveDir) rmSync(outputDir, { recursive: true, force: true })
  if (saveDir) (await import('node:fs')).mkdirSync(outputDir)

  const session = await launchApp({
    openFiles: [source.output],
    savePath: outputPath,
    ...(saveDir ? { saveDir: outputDir } : {}),
  })

  return {
    ...session,
    dir,
    source,
    outputPath,
    outputDir,
    async cleanup() {
      await session.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Apre la finestra dei parametri di una operazione. */
async function configura(page, operazione) {
  await page.getByTestId(`action-${operazione}`).click()
  await expect(page.getByTestId('operation-dialog')).toBeVisible()
}

test('estrazione di pagine scelte', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'extract')
    await page.getByTestId('param-pages').fill('2-3')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(app.outputPath)
    await expect(page.getByTestId('status-success')).toContainText('2 pagine')
    expect(await pageCountOf(app.outputPath)).toBe(2)
  } finally {
    await app.cleanup()
  }
})

test('eliminazione di pagine', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'remove')
    await page.getByTestId('param-pages').fill('1')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(await pageCountOf(app.outputPath)).toBe(app.source.pages - 1)
  } finally {
    await app.cleanup()
  }
})

test('una selezione impossibile viene spiegata, non eseguita', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'extract')
    await page.getByTestId('param-pages').fill('99')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-error')).toContainText('Pagina 99 inesistente')
    await expect(page.getByTestId('status-success')).toHaveCount(0)
  } finally {
    await app.cleanup()
  }
})

test('rotazione delle pagine', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'rotate')
    await page.getByTestId('param-pages').fill('1')
    await page.getByTestId('param-angle').selectOption('180')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const document = await PDFDocument.load(readFileSync(app.outputPath), { updateMetadata: false })
    expect(document.getPage(0).getRotation().angle).toBe(180)
    expect(document.getPage(1).getRotation().angle).toBe(0)
  } finally {
    await app.cleanup()
  }
})

test('divisione in un file per pagina', async () => {
  const app = await conDocumento({ saveDir: true })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'split')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(app.outputDir)
    const prodotti = readdirSync(app.outputDir).sort()
    expect(prodotti).toHaveLength(app.source.pages)
    for (const file of prodotti) {
      expect(await pageCountOf(path.join(app.outputDir, file))).toBe(1)
    }
  } finally {
    await app.cleanup()
  }
})

test('divisione per intervalli', async () => {
  const app = await conDocumento({ saveDir: true })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'split')
    await page.getByTestId('param-mode').selectOption('intervalli')
    await page.getByTestId('param-ranges').fill('1-2,3-')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const prodotti = readdirSync(app.outputDir).sort()
    expect(prodotti).toHaveLength(2)
    expect(await pageCountOf(path.join(app.outputDir, prodotti[0]))).toBe(2)
  } finally {
    await app.cleanup()
  }
})

test('filigrana su tutte le pagine', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'watermark')
    await page.getByTestId('param-text').fill('RISERVATO')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(await pageCountOf(app.outputPath)).toBe(app.source.pages)
    expect(statSync(app.outputPath).size).toBeGreaterThan(statSync(app.source.output).size)
  } finally {
    await app.cleanup()
  }
})

test('numerazione delle pagine', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'numbering')
    await page.getByTestId('param-format').selectOption('n-di-tot')
    await page.getByTestId('param-position').selectOption('alto-destra')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(await pageCountOf(app.outputPath)).toBe(app.source.pages)
  } finally {
    await app.cleanup()
  }
})

test('modifica dei metadati', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'metadata')
    await page.getByTestId('param-title').fill('Contratto 2026')
    await page.getByTestId('param-author').fill('Lorenzo De Marco')
    await page.getByTestId('param-keywords').fill('contratto, 2026')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const document = await PDFDocument.load(readFileSync(app.outputPath), { updateMetadata: false })
    expect(document.getTitle()).toBe('Contratto 2026')
    expect(document.getAuthor()).toBe('Lorenzo De Marco')
  } finally {
    await app.cleanup()
  }
})

test('ottimizzazione del documento', async () => {
  const app = await conDocumento({ copies: 3 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'optimize')
    await page.getByTestId('param-stripMetadata').check()
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(statSync(app.outputPath).size).toBeLessThan(statSync(app.source.output).size)
    expect(await pageCountOf(app.outputPath)).toBe(app.source.pages)
  } finally {
    await app.cleanup()
  }
})

test('creazione di un PDF da immagini', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-img-'))
  const outputPath = path.join(dir, 'immagini.pdf')
  const session = await launchApp({ openFiles: [fixtures.jpg, fixtures.png], savePath: outputPath })
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByText('File caricati (2)')).toBeVisible()

    // Le operazioni sui PDF non accettano immagini e restano spente.
    await expect(page.getByTestId('action-merge')).toBeDisabled()
    await expect(page.getByTestId('action-images')).toBeEnabled()

    await configura(page, 'images')
    await page.getByTestId('param-pageSize').selectOption('a4')
    await page.getByTestId('param-marginMm').fill('10')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(await pageCountOf(outputPath)).toBe(2)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('ogni operazione del catalogo ha un comando nell interfaccia', async () => {
  const app = await conDocumento()
  try {
    const { page } = app
    await addFiles(page)
    const attese = [
      'merge',
      'convert',
      'extract',
      'remove',
      'rotate',
      'split',
      'images',
      'watermark',
      'numbering',
      'metadata',
      'optimize',
    ]
    for (const operazione of attese) {
      await expect(page.getByTestId(`action-${operazione}`)).toHaveCount(1)
    }
  } finally {
    await app.cleanup()
  }
})
