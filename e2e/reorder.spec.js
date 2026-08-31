/**
 * Riordino dei documenti: l'ordine dell'elenco e' l'ordine delle pagine nel
 * file prodotto, quindi il trascinamento e' parte del comportamento verificato.
 */

import { expect, test } from '@playwright/test'
import { addFiles, launchApp } from './helpers.js'

test('trascinare una riga cambia l ordine di unione', async () => {
  const session = await launchApp()
  try {
    const { page } = session
    await addFiles(page)
    await expect(page.getByTestId('file-name').first()).toContainText('sample1.pdf')

    const handles = page.locator('.drag-handle')
    await handles.nth(1).dragTo(handles.first())

    await expect(page.getByTestId('file-name').first()).toContainText('sample2.pdf')
    await expect(page.getByTestId('file-name').nth(1)).toContainText('sample1.pdf')

    // L'unione parte dall'ordine mostrato: il documento prodotto contiene
    // comunque tutte le pagine dei due sorgenti.
    await page.getByTestId('action-merge').click()
    await expect(page.getByTestId('status-success')).toContainText('2 pagine')
  } finally {
    await session.close()
  }
})
