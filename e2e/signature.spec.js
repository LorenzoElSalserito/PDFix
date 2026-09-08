/**
 * Firma su foglio: l'immagine della propria firma, collocata guardando la
 * pagina.
 *
 * Il punto della funzione non è che il pulsante esista, ma che il documento
 * riceva la firma esattamente dove l'anteprima l'aveva mostrata: ogni test
 * riapre il PDF prodotto e confronta le coordinate scritte nel file con il
 * riquadro trascinato nella finestra.
 */

import { expect, test } from '@playwright/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { addFiles, buildMultiPagePdf, drawnImageOn, fixtures, launchApp } from './helpers.js'

/** Applicazione avviata su un documento di quattro pagine, con firma pronta. */
async function conFirma({ image = fixtures.png } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'pdfix-firma-'))
  const source = await buildMultiPagePdf(dir, 2)
  const outputPath = path.join(dir, 'firmato.pdf')

  const session = await launchApp({ openFiles: [source.output], savePath: outputPath, paramFile: image })
  return {
    ...session,
    source,
    outputPath,
    async cleanup() {
      await session.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

/** Apre la finestra della firma e sceglie l'immagine: l'anteprima compare. */
async function apriFirma(page) {
  await page.getByTestId('action-signature').click()
  await expect(page.getByTestId('operation-dialog')).toBeVisible()
  await expect(page.getByTestId('signature-needs-image')).toBeVisible()

  await page.getByTestId('param-image').click()
  await expect(page.getByTestId('param-image-value')).not.toHaveText('')
  await expect(page.getByTestId('signature-stage')).toBeVisible()
  // L'anteprima è la pagina vera, disegnata da pdf.js: senza, resterebbe il
  // rettangolo di riserva, e questo test non varrebbe nulla.
  await expect(page.getByTestId('signature-page-image')).toBeVisible()
  await expect(page.getByTestId('signature-page-fallback')).toHaveCount(0)
}

/** Frazioni della pagina occupate dal riquadro della firma, come si vedono. */
async function riquadro(page) {
  const stage = await page.getByTestId('signature-stage').boundingBox()
  const overlay = await page.getByTestId('signature-overlay').boundingBox()
  return {
    x: (overlay.x - stage.x) / stage.width,
    y: (overlay.y - stage.y) / stage.height,
    width: overlay.width / stage.width,
    stage,
    overlay,
  }
}

/**
 * Tolleranza del confronto, in punti PDF.
 *
 * L'anteprima è larga poche centinaia di pixel e una pagina A4 quasi
 * seicento punti: un pixel di arrotondamento nel riquadro vale già due punti
 * sul foglio. Si concede lo spessore di due pixel — un errore vero di
 * collocazione sarebbe di decine di punti.
 */
const tolleranza = (size, stage) => (2 * size.width) / stage.width

/** Trascina il riquadro della firma di uno scostamento in pixel. */
async function trascina(page, dx, dy) {
  const overlay = await page.getByTestId('signature-overlay').boundingBox()
  const fromX = overlay.x + overlay.width / 2
  const fromY = overlay.y + overlay.height / 2

  await page.mouse.move(fromX, fromY)
  await page.mouse.down()
  await page.mouse.move(fromX + dx, fromY + dy, { steps: 12 })
  await page.mouse.up()
}

test('la firma finisce nel punto in cui e stata trascinata', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    const prima = await riquadro(page)
    // Lo scostamento è una frazione del foglio: su una finestra più piccola —
    // i runner di macOS, per dire — un valore in pixel fissi uscirebbe
    // dall'anteprima e il gesto finirebbe altrove.
    await trascina(page, -prima.stage.width * 0.25, -prima.stage.height * 0.25)
    const dopo = await riquadro(page)

    expect(dopo.x, 'il riquadro si è spostato a sinistra').toBeLessThan(prima.x)
    expect(dopo.y, 'e verso l alto').toBeLessThan(prima.y)

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toContainText(app.outputPath)

    const { size, scale, translate } = await drawnImageOn(app.outputPath, 0)
    expect(scale, 'la firma è stata disegnata sulla prima pagina').not.toBeNull()

    // Quello che si vedeva nell'anteprima, in punti sulla pagina.
    const larghezzaAttesa = size.width * dopo.width
    const xAttesa = size.width * dopo.x
    const yAttesa = size.height - size.height * dopo.y - larghezzaAttesa * (dopo.overlay.height / dopo.overlay.width)

    const scarto = tolleranza(size, dopo.stage)
    expect(Math.abs(scale[0] - larghezzaAttesa)).toBeLessThan(scarto)
    expect(Math.abs(translate[4] - xAttesa)).toBeLessThan(scarto)
    expect(Math.abs(translate[5] - yAttesa)).toBeLessThan(scarto)
  } finally {
    await app.cleanup()
  }
})

test('le frecce spostano la firma di poco, restando dentro il foglio', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    await page.getByTestId('signature-overlay').click()
    const prima = await riquadro(page)
    for (let colpo = 0; colpo < 10; colpo++) await page.keyboard.press('ArrowLeft')
    const dopo = await riquadro(page)

    expect(dopo.x).toBeLessThan(prima.x)
    expect(dopo.x).toBeGreaterThanOrEqual(0)

    // Con Maiusc il passo è largo: contro il bordo la firma si ferma e non
    // esce dalla pagina, per quante volte si insista.
    for (let colpo = 0; colpo < 20; colpo++) await page.keyboard.press('Shift+ArrowLeft')
    const albordo = await riquadro(page)
    expect(albordo.x).toBeLessThan(0.01)

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toBeVisible()

    const { size, translate } = await drawnImageOn(app.outputPath, 0)
    expect(Math.abs(translate[4]), 'la firma è appoggiata al margine sinistro').toBeLessThan(
      tolleranza(size, albordo.stage),
    )
  } finally {
    await app.cleanup()
  }
})

test('la maniglia ridimensiona la firma e il documento la riceve piu grande', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    const prima = await riquadro(page)
    const maniglia = await page.getByTestId('signature-resize').boundingBox()
    await page.mouse.move(maniglia.x + maniglia.width / 2, maniglia.y + maniglia.height / 2)
    await page.mouse.down()
    // Si tira fino all'angolo interno del foglio: dentro l'anteprima su
    // qualunque dimensione di finestra, e la firma cresce di sicuro.
    await page.mouse.move(
      prima.stage.x + prima.stage.width - 2,
      prima.stage.y + prima.stage.height - 2,
      { steps: 10 },
    )
    await page.mouse.up()

    const dopo = await riquadro(page)
    expect(dopo.width).toBeGreaterThan(prima.width)
    await expect(page.getByTestId('signature-size')).toContainText('%')

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toBeVisible()

    const { size, scale } = await drawnImageOn(app.outputPath, 0)
    expect(Math.abs(scale[0] - size.width * dopo.width)).toBeLessThan(tolleranza(size, dopo.stage))
  } finally {
    await app.cleanup()
  }
})

test('la firma va sulla pagina scelta nell anteprima, non sulla prima', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    await expect(page.getByTestId('signature-page-label')).toContainText('1')
    await page.getByTestId('signature-page-next').click()
    await page.getByTestId('signature-page-next').click()
    await expect(page.getByTestId('signature-page-label')).toContainText('3')

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toBeVisible()

    expect((await drawnImageOn(app.outputPath, 2)).scale, 'firmata la terza pagina').not.toBeNull()
    expect((await drawnImageOn(app.outputPath, 0)).scale, 'la prima resta pulita').toBeNull()
  } finally {
    await app.cleanup()
  }
})

test('anche un JPEG vale come firma', async () => {
  const app = await conFirma({ image: fixtures.jpg })
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-success')).toContainText(app.outputPath)
    expect((await drawnImageOn(app.outputPath, 0)).scale).not.toBeNull()
  } finally {
    await app.cleanup()
  }
})

test('senza immagine la finestra lo dice e non produce nulla', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await page.getByTestId('action-signature').click()

    await expect(page.getByTestId('signature-needs-image')).toBeVisible()
    await expect(page.getByTestId('signature-stage')).toHaveCount(0)

    await page.getByTestId('operation-confirm').click()
    await expect(page.getByTestId('status-error')).toContainText('obbligatorio')
    await expect(page.getByTestId('status-success')).toHaveCount(0)
  } finally {
    await app.cleanup()
  }
})

test('un trascinamento che finisce fuori dal pannello non chiude la finestra', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)
    await apriFirma(page)

    const overlay = await page.getByTestId('signature-overlay').boundingBox()
    const finestra = page.viewportSize() ?? (await page.evaluate(() => ({ width: innerWidth, height: innerHeight })))

    // Punto sicuramente sullo sfondo: il pannello è centrato e largo al più
    // due terzi della finestra, il margine sinistro è scoperto.
    const sfondo = { x: 6, y: Math.round(finestra.height / 2) }

    // Si trascina la firma fin lì: il puntatore esce dal pannello e si rilascia
    // sullo sfondo. Chiudere significherebbe buttare via il lavoro appena fatto.
    await page.mouse.move(overlay.x + overlay.width / 2, overlay.y + overlay.height / 2)
    await page.mouse.down()
    await page.mouse.move(sfondo.x, sfondo.y, { steps: 10 })
    await page.mouse.up()

    await expect(page.getByTestId('operation-dialog')).toBeVisible()
    await expect(page.getByTestId('signature-stage')).toBeVisible()

    // Un clic vero sullo sfondo, invece, chiude come sempre.
    await page.mouse.click(sfondo.x, sfondo.y)
    await expect(page.getByTestId('operation-dialog')).toHaveCount(0)
  } finally {
    await app.cleanup()
  }
})

test('la firma digitale con certificato non e piu fra i comandi', async () => {
  const app = await conFirma()
  try {
    const { page } = app
    await addFiles(page)

    await expect(page.getByTestId('action-sign')).toHaveCount(0)
    await expect(page.getByTestId('action-signature')).toHaveCount(1)
  } finally {
    await app.cleanup()
  }
})
