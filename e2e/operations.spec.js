/**
 * Certificazione delle funzionalità di manipolazione.
 *
 * Ogni operazione viene eseguita dall'applicazione reale, con i suoi parametri
 * scelti nell'interfaccia, e il file prodotto viene riaperto e ispezionato: è
 * la prova che la funzione lavora davvero, non che il pulsante esiste.
 */

import { expect, test } from '@playwright/test'
import { PDFDocument } from '@cantoo/pdf-lib'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { addFiles, buildFormPdf, buildMultiPagePdf, fixtures, launchApp, pageCountOf } from './helpers.js'

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

// -------------------------------------------------------- impaginazione -----

/** Riapre il documento prodotto e ne descrive la prima pagina. */
async function primaPagina(filePath) {
  const document = await PDFDocument.load(readFileSync(filePath), { updateMetadata: false })
  const page = document.getPage(0)
  const size = page.getSize()
  return {
    pagine: document.getPageCount(),
    larghezza: Math.round(size.width),
    altezza: Math.round(size.height),
    media: page.getMediaBox(),
    crop: page.getCropBox(),
  }
}

test('due pagine per foglio', async () => {
  const app = await conDocumento({ copies: 3 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'nup')
    await page.getByTestId('param-perFoglio').selectOption('2')
    await page.getByTestId('param-marginMm').fill('5')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(app.outputPath)

    const risultato = await primaPagina(app.outputPath)
    expect(risultato.pagine).toBe(Math.ceil(app.source.pages / 2))
    // A4 orizzontale: la larghezza supera l'altezza.
    expect(risultato.larghezza).toBe(842)
    expect(risultato.altezza).toBe(595)
  } finally {
    await app.cleanup()
  }
})

test('quattro pagine per foglio su foglio verticale', async () => {
  const app = await conDocumento({ copies: 3 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'nup')
    await page.getByTestId('param-perFoglio').selectOption('4')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const risultato = await primaPagina(app.outputPath)
    expect(risultato.pagine).toBe(Math.ceil(app.source.pages / 4))
    expect(risultato.larghezza).toBe(595)
    expect(risultato.altezza).toBe(842)
  } finally {
    await app.cleanup()
  }
})

test('libretto con facciate a coppie', async () => {
  const app = await conDocumento({ copies: 3 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'booklet')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const risultato = await primaPagina(app.outputPath)
    // Le pagine si arrotondano al multiplo di quattro, due facciate per foglio.
    expect(risultato.pagine).toBe((Math.ceil(app.source.pages / 4) * 4) / 2)
    expect(risultato.larghezza).toBeGreaterThan(risultato.altezza)
  } finally {
    await app.cleanup()
  }
})

test('formato uniforme su tutte le pagine', async () => {
  const app = await conDocumento({ copies: 2 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'resize')
    await page.getByTestId('param-formato').selectOption('a5')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const document = await PDFDocument.load(readFileSync(app.outputPath), { updateMetadata: false })
    expect(document.getPageCount()).toBe(app.source.pages)
    for (const pagina of document.getPages()) {
      const size = pagina.getSize()
      expect(Math.round(size.width)).toBe(420)
      expect(Math.round(size.height)).toBe(595)
    }
  } finally {
    await app.cleanup()
  }
})

test('ritaglio dei margini', async () => {
  const app = await conDocumento({ copies: 2 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'crop')
    await page.getByTestId('param-topMm').fill('10')
    await page.getByTestId('param-bottomMm').fill('10')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const risultato = await primaPagina(app.outputPath)
    expect(risultato.pagine).toBe(app.source.pages)
    // Il foglio resta quello di prima: cambia solo l'area visibile.
    expect(Math.round(risultato.media.height - risultato.crop.height)).toBe(57)
    expect(Math.round(risultato.crop.width)).toBe(Math.round(risultato.media.width))
  } finally {
    await app.cleanup()
  }
})

// ------------------------------------------------- timbri e numerazione -----

test('filigrana con immagine scelta dall utente', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, 2)
  const outputPath = path.join(dir, 'timbrato.pdf')
  const session = await launchApp({
    openFiles: [source.output],
    savePath: outputPath,
    paramFile: fixtures.png,
  })
  try {
    const { page } = session
    await addFiles(page)
    await configura(page, 'stamp')

    // Il parametro parte vuoto: il file arriva dalla finestra di sistema, che
    // in automazione restituisce l'immagine di prova.
    await expect(page.getByTestId('param-image-value')).toHaveText('Nessun file scelto')
    await page.getByTestId('param-image').click()
    await expect(page.getByTestId('param-image-value')).toHaveText(path.basename(fixtures.png))

    await page.getByTestId('param-scala').fill('40')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(outputPath)
    expect(await pageCountOf(outputPath)).toBe(source.pages)
    expect(statSync(outputPath).size).toBeGreaterThan(statSync(source.output).size)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('numerazione Bates continua fra due documenti', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const outputDir = path.join(dir, 'numerati')
  ;(await import('node:fs')).mkdirSync(outputDir)
  // Due documenti distinti: la proprietà da dimostrare è che il contatore non
  // riparte, e servono due file veri per vederlo.
  const primo = fixtures.first
  const secondo = fixtures.second

  const session = await launchApp({
    openFiles: [primo, secondo],
    savePath: path.join(dir, 'inutile.pdf'),
    saveDir: outputDir,
  })
  try {
    const { page } = session
    await addFiles(page)
    await configura(page, 'bates')
    await page.getByTestId('param-prefix').fill('ACME-')
    await page.getByTestId('param-digits').fill('4')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    const prodotti = readdirSync(outputDir).filter((name) => name.endsWith('_bates.pdf')).sort()
    expect(prodotti).toEqual([
      `${path.basename(primo, '.pdf')}_bates.pdf`,
      `${path.basename(secondo, '.pdf')}_bates.pdf`,
    ])
    for (const nome of prodotti) {
      expect(await pageCountOf(path.join(outputDir, nome))).toBeGreaterThan(0)
    }
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

// -------------------------------------------------------------- moduli -----

test('lettura dei campi di un modulo in JSON', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const modulo = await buildFormPdf(dir)
  const outputPath = path.join(dir, 'campi.json')
  const session = await launchApp({ openFiles: [modulo], savePath: outputPath })
  try {
    const { page } = session
    await addFiles(page)
    await page.getByTestId('action-formfields').click()

    await expect(page.getByTestId('status-success')).toContainText(outputPath)
    const report = JSON.parse(readFileSync(outputPath, 'utf8'))
    expect(report.campi.map((campo) => campo.name).sort()).toEqual(['accetto', 'nome'])
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('compilazione di un modulo con i campi letti dal documento', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const modulo = await buildFormPdf(dir)
  const outputPath = path.join(dir, 'compilato.pdf')
  const session = await launchApp({ openFiles: [modulo], savePath: outputPath })
  try {
    const { page } = session
    await addFiles(page)
    await configura(page, 'formfill')

    // I campi non stanno nel catalogo: li ha letti il motore dal documento.
    await expect(page.getByTestId('param-campo:nome')).toBeVisible()
    await page.getByTestId('param-campo:nome').fill('Lorenzo De Marco')
    await page.getByTestId('param-campo:accetto').check()
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(outputPath)
    const document = await PDFDocument.load(readFileSync(outputPath), { updateMetadata: false })
    const form = document.getForm()
    expect(form.getTextField('nome').getText()).toBe('Lorenzo De Marco')
    expect(form.getCheckBox('accetto').isChecked()).toBe(true)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('blocco di un modulo compilato', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const modulo = await buildFormPdf(dir)
  const outputPath = path.join(dir, 'bloccato.pdf')
  const session = await launchApp({ openFiles: [modulo], savePath: outputPath })
  try {
    const { page } = session
    await addFiles(page)
    await page.getByTestId('action-formflatten').click()

    await expect(page.getByTestId('status-success')).toContainText(outputPath)
    const document = await PDFDocument.load(readFileSync(outputPath), { updateMetadata: false })
    expect(document.getForm().getFields()).toHaveLength(0)
    expect(document.getPageCount()).toBe(1)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})


// -------------------------------------------- allegati e archiviazione -----

test('allegato incorporato con uscita PDF/A-3b', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, 1)
  const allegato = path.join(dir, 'fattura.xml')
  writeFileSync(allegato, '<?xml version="1.0"?><fattura numero="7"/>', 'utf8')
  const outputPath = path.join(dir, 'con-allegato.pdf')

  const session = await launchApp({
    openFiles: [source.output],
    savePath: outputPath,
    paramFile: allegato,
  })
  try {
    const { page } = session
    await addFiles(page)
    await configura(page, 'attach')
    await page.getByTestId('param-file').click()
    await expect(page.getByTestId('param-file-value')).toHaveText('fattura.xml')
    await page.getByTestId('param-descrizione').fill('Fattura elettronica')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(outputPath)

    const raw = readFileSync(outputPath).toString('latin1')
    expect(raw).toContain('/EmbeddedFiles')
    expect(raw).toMatch(/\/AFRelationship\s*\/Data/)
    expect(raw).toContain('pdfaid:part>3<')
    expect(await pageCountOf(outputPath)).toBe(source.pages)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('segnalibri creati dall elenco scritto nella finestra', async () => {
  const app = await conDocumento({ copies: 2 })
  try {
    const { page } = app
    await addFiles(page)
    await configura(page, 'bookmarks')
    await page.getByTestId('param-voci').fill(['1: Introduzione', '3: Capitolo secondo'].join('\n'))
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-success')).toContainText(app.outputPath)

    const { outlineTargets } = await import('../core/pdf/outline.js')
    const document = await PDFDocument.load(readFileSync(app.outputPath), { updateMetadata: false })
    expect(outlineTargets(document)).toEqual([
      { title: 'Introduzione', pageIndex: 0 },
      { title: 'Capitolo secondo', pageIndex: 2 },
    ])
  } finally {
    await app.cleanup()
  }
})

test('divisione di un documento seguendo i suoi segnalibri', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, 2)
  const conIndice = path.join(dir, 'indice.pdf')

  // L'indice viene scritto dal motore vero: il test end-to-end verifica la
  // divisione, non la creazione dei segnalibri, che ha già il suo caso.
  const { runRequest } = await import('../core/engine.js')
  const preparato = await runRequest({
    operation: 'bookmarks',
    files: [source.output],
    output: conIndice,
    params: { voci: ['1: Contratto', '3: Allegato tecnico'].join('\n'), apri: true },
  })
  expect(preparato.ok).toBe(true)

  const outputDir = path.join(dir, 'parti')
  mkdirSync(outputDir)
  const session = await launchApp({
    openFiles: [conIndice],
    savePath: path.join(dir, 'inutile.pdf'),
    saveDir: outputDir,
  })
  try {
    const { page } = session
    await addFiles(page)
    await page.getByTestId('action-splitbookmarks').click()

    await expect(page.getByTestId('status-success')).toBeVisible()
    expect(readdirSync(outputDir).sort()).toEqual(['Allegato tecnico.pdf', 'Contratto.pdf'])
    expect(await pageCountOf(path.join(outputDir, 'Contratto.pdf'))).toBe(2)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})


// -------------------------------------------- protezione e firma -----------

test('protezione con password e rimozione della protezione', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, 1)
  const protetto = path.join(dir, 'protetto.pdf')

  const primo = await launchApp({ openFiles: [source.output], savePath: protetto })
  try {
    const { page } = primo
    await addFiles(page)
    await configura(page, 'protect')
    await page.getByTestId('param-userPassword').fill('apriti-sesamo')
    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toContainText(protetto)
  } finally {
    await primo.close()
  }

  // Il file prodotto è davvero cifrato: senza password non si apre.
  expect(readFileSync(protetto).toString('latin1')).toContain('/Encrypt')
  const { loadDocument } = await import('../core/pdf/document.js')
  await expect(loadDocument(protetto)).rejects.toThrow(/protetto da password/)

  const libero = path.join(dir, 'libero.pdf')
  const secondo = await launchApp({ openFiles: [protetto], savePath: libero })
  try {
    const { page } = secondo
    await addFiles(page)
    await configura(page, 'unprotect')
    await page.getByTestId('param-password').fill('apriti-sesamo')
    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toContainText(libero)

    expect(readFileSync(libero).toString('latin1')).not.toContain('/Encrypt')
    expect(await pageCountOf(libero)).toBe(source.pages)
  } finally {
    await secondo.close()
    rmSync(dir, { recursive: true, force: true })
  }
})

test('la password sbagliata viene detta senza produrre file', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-op-'))
  const source = await buildMultiPagePdf(dir, 1)
  const protetto = path.join(dir, 'protetto.pdf')

  const { runRequest } = await import('../core/engine.js')
  const preparato = await runRequest({
    operation: 'protect',
    files: [source.output],
    output: protetto,
    params: { userPassword: 'giusta', stampa: 'no', copia: false, modifica: false },
  })
  expect(preparato.ok).toBe(true)

  const uscita = path.join(dir, 'mai.pdf')
  const session = await launchApp({ openFiles: [protetto], savePath: uscita })
  try {
    const { page } = session
    await addFiles(page)
    await configura(page, 'unprotect')
    await page.getByTestId('param-password').fill('sbagliata')
    await page.getByTestId('operation-confirm').click()

    await expect(page.getByTestId('status-error')).toContainText('Password errata')
    expect(existsSync(uscita)).toBe(false)
  } finally {
    await session.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
