import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import App from '../src/App.vue'
import { SETTINGS_SNAPSHOT, installBridge } from './helpers.js'

async function mountApp(overrides) {
  const { bridge, listeners } = installBridge(overrides)
  const wrapper = mount(App)
  await flushPromises()
  return { wrapper, bridge, listeners }
}

async function addTwoFiles(wrapper) {
  await wrapper.get('[data-testid="uploader"]').trigger('click')
  await flushPromises()
}

describe('App', () => {
  beforeEach(() => {
    delete globalThis.window.pdfix
  })

  it('interroga il processo principale all avvio', async () => {
    const { bridge } = await mountApp()
    expect(bridge.operations).toHaveBeenCalled()
    expect(bridge.settings.get).toHaveBeenCalled()
  })

  it('mostra i file scelti e genera i comandi disponibili', async () => {
    const { wrapper, bridge } = await mountApp()
    expect(wrapper.find('[data-testid="file-list"]').exists()).toBe(false)

    await addTwoFiles(wrapper)
    expect(bridge.chooseFiles).toHaveBeenCalled()
    expect(wrapper.text()).toContain('File caricati (2)')
    expect(wrapper.get('[data-testid="action-merge"]').attributes('disabled')).toBeUndefined()
  })

  it('esegue l operazione con i percorsi nell ordine corrente', async () => {
    const { wrapper, bridge } = await mountApp()
    await addTwoFiles(wrapper)
    await wrapper.get('[data-testid="action-merge"]').trigger('click')
    await flushPromises()

    expect(bridge.run).toHaveBeenCalledWith({
      operation: 'merge',
      files: ['/tmp/a.pdf', '/tmp/b.pdf'],
      pdfa: false,
      params: {},
    })
    expect(wrapper.get('[data-testid="status-success"]').text()).toContain('/tmp/out.pdf')
  })

  it('inoltra la scelta PDF/A al processo principale', async () => {
    const { wrapper, bridge } = await mountApp()
    await addTwoFiles(wrapper)
    await wrapper.get('[data-testid="pdfa-toggle"]').setValue(true)
    await wrapper.get('[data-testid="action-merge"]').trigger('click')
    await flushPromises()
    expect(bridge.run.mock.calls[0][0].pdfa).toBe(true)
  })

  it('mostra l errore restituito dal motore', async () => {
    const { wrapper } = await mountApp({
      run: vi.fn(async () => ({ ok: false, error: 'Memoria insufficiente: aumenta il limite.' })),
    })
    await addTwoFiles(wrapper)
    await wrapper.get('[data-testid="action-merge"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="status-error"]').text()).toContain('Memoria insufficiente')
    expect(wrapper.find('[data-testid="status-success"]').exists()).toBe(false)
  })

  it('non segnala nulla se l utente annulla il salvataggio', async () => {
    const { wrapper } = await mountApp({ run: vi.fn(async () => ({ ok: true, canceled: true })) })
    await addTwoFiles(wrapper)
    await wrapper.get('[data-testid="action-merge"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-testid="status-success"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="status-error"]').exists()).toBe(false)
  })

  it('mostra l avanzamento comunicato dal motore', async () => {
    const { wrapper, listeners } = await mountApp()
    listeners.progress[0]({ index: 1, total: 3, pages: 4 })
    await flushPromises()
    expect(wrapper.get('[data-testid="status-progress"]').text()).toContain('Elaborazione 2 di 3')
  })

  it('apre le impostazioni dal pulsante e dal menu', async () => {
    const { wrapper, bridge, listeners } = await mountApp()
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(false)

    await wrapper.get('[data-testid="settings-open"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="settings-dialog"]').isVisible()).toBe(true)

    await wrapper.get('[data-testid="settings-close"]').trigger('click')
    listeners.menu[0]('settings')
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(true)
    expect(bridge.settings.get).toHaveBeenCalledTimes(3)
  })

  it('salva le preferenze e ricarica le funzionalita attive', async () => {
    const { wrapper, bridge } = await mountApp()
    await wrapper.get('[data-testid="settings-open"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="field-memoryLimitMb"]').setValue('8192')
    await wrapper.get('[data-testid="settings-save"]').trigger('click')
    await flushPromises()

    expect(bridge.settings.set).toHaveBeenCalled()
    expect(bridge.settings.set.mock.calls[0][0].memoryLimitMb).toBe(8192)
    expect(bridge.operations).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(false)
  })

  it('misura il limite di memoria reale su richiesta', async () => {
    const { wrapper, bridge } = await mountApp()
    await wrapper.get('[data-testid="settings-open"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="diagnostics-run"]').trigger('click')
    await flushPromises()
    expect(bridge.diagnostics).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="diagnostics-heap"]').text()).toContain('4096 MB')
  })

  it('nasconde i comandi delle funzionalita disattivate', async () => {
    const { wrapper } = await mountApp({
      operations: vi.fn(async () => [
        {
          name: 'merge',
          label: 'Unisci PDF',
          description: 'unisce',
          minFiles: 2,
          maxFiles: null,
          supportsPdfA: true,
          forcesPdfA: false,
        },
      ]),
    })
    await addTwoFiles(wrapper)
    expect(wrapper.find('[data-testid="action-convert"]').exists()).toBe(false)
    expect(wrapper.find('[data-testid="action-merge"]').exists()).toBe(true)
  })

  it('reagisce alle azioni di menu su elenco e informazioni', async () => {
    const { wrapper, bridge, listeners } = await mountApp()
    listeners.menu[0]('open-files')
    await flushPromises()
    expect(wrapper.text()).toContain('File caricati (2)')

    listeners.menu[0]('clear-files')
    await flushPromises()
    expect(wrapper.find('[data-testid="file-list"]').exists()).toBe(false)

    listeners.menu[0]('about')
    await flushPromises()
    expect(bridge.info).toHaveBeenCalled()
    expect(wrapper.get('[data-testid="info-dialog"]').isVisible()).toBe(true)
  })

  it('mostra le informazioni e permette di segnalare un bug', async () => {
    const { wrapper, bridge } = await mountApp()
    await wrapper.get('[data-testid="about-open"]').trigger('click')
    await flushPromises()

    const dialog = wrapper.get('[data-testid="info-dialog"]')
    expect(dialog.get('[data-testid="info-author"]').text()).toBe(
      'Sviluppato da Lorenzo De Marco — licenza AGPLv3',
    )
    expect(dialog.get('[data-testid="info-version"]').text()).toContain('1.2.3')

    await wrapper.get('[data-testid="report-bug"]').trigger('click')
    expect(bridge.reportBug).toHaveBeenCalled()

    await wrapper.get('[data-testid="info-close"]').trigger('click')
    expect(wrapper.find('[data-testid="info-dialog"]').exists()).toBe(false)
  })

  it('cambia lingua dal selettore e lo salva nelle preferenze', async () => {
    const { wrapper, bridge } = await mountApp()
    expect(wrapper.text()).toContain('Unione, modifica e conversione di PDF')

    await wrapper.get('[data-testid="language-select"]').setValue('en')
    await flushPromises()

    expect(bridge.settings.set).toHaveBeenCalled()
    expect(bridge.settings.set.mock.calls[0][0].language).toBe('en')
    expect(wrapper.text()).toContain('Merge, edit and convert PDFs')
    expect(wrapper.text()).toContain('Click to add files')
  })

  it('chiede i parametri prima di eseguire un operazione che li dichiara', async () => {
    const { wrapper, bridge } = await mountApp()
    await addTwoFiles(wrapper)

    // Con due PDF caricati «Estrai pagine» non è eseguibile: si prova con uno solo.
    await wrapper.get('[data-testid="remove-file"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="action-extract"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="operation-dialog"]').isVisible()).toBe(true)
    expect(bridge.run).not.toHaveBeenCalled()

    await wrapper.get('[data-testid="param-pages"]').setValue('2-4')
    await wrapper.get('[data-testid="operation-confirm"]').trigger('click')
    await flushPromises()

    expect(bridge.run).toHaveBeenCalledWith({
      operation: 'extract',
      files: ['/tmp/b.pdf'],
      pdfa: false,
      params: { pages: '2-4' },
    })
    expect(wrapper.find('[data-testid="operation-dialog"]').exists()).toBe(false)
  })

  it('annullare la configurazione non esegue nulla', async () => {
    const { wrapper, bridge } = await mountApp()
    await addTwoFiles(wrapper)
    await wrapper.get('[data-testid="remove-file"]').trigger('click')
    await flushPromises()

    await wrapper.get('[data-testid="action-extract"]').trigger('click')
    await flushPromises()
    await wrapper.get('[data-testid="operation-cancel"]').trigger('click')
    await flushPromises()

    expect(bridge.run).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="operation-dialog"]').exists()).toBe(false)
  })

  it('mostra l icona dell applicazione nell intestazione', async () => {
    const { wrapper } = await mountApp()
    const icon = wrapper.get('[data-testid="app-icon"]')
    expect(icon.attributes('src')).toBeTruthy()
    expect(icon.attributes('alt')).toBe('PDFix')
  })

  it('apre le impostazioni con la scorciatoia da tastiera', async () => {
    const { wrapper } = await mountApp()
    globalThis.window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true }))
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(true)

    globalThis.window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(false)
  })

  it('applica il tema scelto alla radice del documento', async () => {
    const snapshot = {
      ...SETTINGS_SNAPSHOT,
      values: { ...SETTINGS_SNAPSHOT.values, theme: 'scuro' },
    }
    await mountApp({
      settings: {
        get: vi.fn(async () => snapshot),
        set: vi.fn(async () => snapshot),
        reset: vi.fn(async () => snapshot),
        onChange: vi.fn(() => () => {}),
      },
    })
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    document.documentElement.classList.remove('dark')
  })

  it('applica la preferenza PDF/A predefinita', async () => {
    const snapshot = {
      ...SETTINGS_SNAPSHOT,
      values: { ...SETTINGS_SNAPSHOT.values, defaultPdfA: true },
    }
    const { wrapper } = await mountApp({
      settings: {
        get: vi.fn(async () => snapshot),
        set: vi.fn(async () => snapshot),
        reset: vi.fn(async () => snapshot),
        onChange: vi.fn(() => () => {}),
      },
    })
    await addTwoFiles(wrapper)
    expect(wrapper.get('[data-testid="pdfa-toggle"]').element.checked).toBe(true)
  })
})
