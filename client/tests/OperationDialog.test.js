import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import OperationDialog from '../src/components/OperationDialog.vue'
import { OPERATIONS, installBridge } from './helpers.js'

const extract = OPERATIONS.find((operation) => operation.name === 'extract')
const images = OPERATIONS.find((operation) => operation.name === 'images')
const stamp = OPERATIONS.find((operation) => operation.name === 'stamp')
const formfill = OPERATIONS.find((operation) => operation.name === 'formfill')

afterEach(() => {
  delete globalThis.window.pdfix
})

describe('OperationDialog', () => {
  it('non compare finche non c e un operazione da configurare', () => {
    const wrapper = mount(OperationDialog, { props: { operation: null } })
    expect(wrapper.find('[data-testid="operation-dialog"]').exists()).toBe(false)
  })

  it('genera i controlli dai parametri del descrittore', () => {
    const wrapper = mount(OperationDialog, { props: { operation: extract } })
    const field = wrapper.get('[data-testid="param-pages"]')
    expect(field.element.tagName).toBe('INPUT')
    expect(field.element.value).toBe('1')
    expect(field.attributes('placeholder')).toBe('1-3,7')
    expect(wrapper.text()).toContain('Estrai pagine')
  })

  it('conferma i valori modificati', async () => {
    const wrapper = mount(OperationDialog, { props: { operation: extract } })
    await wrapper.get('[data-testid="param-pages"]').setValue('2-5')
    await wrapper.get('[data-testid="operation-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')[0][0]).toEqual({ pages: '2-5' })
  })

  it('mostra i parametri condizionali solo quando servono', async () => {
    const wrapper = mount(OperationDialog, { props: { operation: images } })
    expect(wrapper.find('[data-testid="param-marginMm"]').exists()).toBe(false)

    await wrapper.get('[data-testid="param-pageSize"]').setValue('a4')
    expect(wrapper.find('[data-testid="param-marginMm"]').exists()).toBe(true)

    await wrapper.get('[data-testid="param-marginMm"]').setValue('12')
    await wrapper.get('[data-testid="operation-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')[0][0]).toEqual({ pageSize: 'a4', marginMm: 12 })
  })

  it('riparte dai valori predefiniti a ogni apertura', async () => {
    const wrapper = mount(OperationDialog, { props: { operation: extract } })
    await wrapper.get('[data-testid="param-pages"]').setValue('9')
    await wrapper.setProps({ operation: null })
    await wrapper.setProps({ operation: extract })
    expect(wrapper.get('[data-testid="param-pages"]').element.value).toBe('1')
  })

  it('sceglie un file per i parametri che ne chiedono uno', async () => {
    const { bridge } = installBridge()
    const wrapper = mount(OperationDialog, { props: { operation: stamp } })
    expect(wrapper.text()).toContain('Nessun file scelto')

    await wrapper.get('[data-testid="param-image"]').trigger('click')
    await flushPromises()

    expect(bridge.chooseFile).toHaveBeenCalledWith(['.png', '.jpg'])
    // Nella finestra compare solo il nome: il percorso intero non ci sta.
    expect(wrapper.get('[data-testid="param-image-value"]').text()).toBe('logo.png')

    await wrapper.get('[data-testid="operation-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')[0][0]).toEqual({ image: '/tmp/loghi/logo.png', scala: 30 })
  })

  it('una scelta annullata lascia il parametro com era', async () => {
    installBridge({ chooseFile: async () => null })
    const wrapper = mount(OperationDialog, { props: { operation: stamp } })
    await wrapper.get('[data-testid="param-image"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-testid="param-image-value"]').text()).toBe('Nessun file scelto')
  })

  it('chiede al motore i parametri che dipendono dal documento', async () => {
    const { bridge } = installBridge()
    const wrapper = mount(OperationDialog, {
      props: { operation: formfill, files: ['/tmp/modulo.pdf'] },
    })
    await flushPromises()

    expect(bridge.inspect).toHaveBeenCalledWith({
      operation: 'formfill',
      files: ['/tmp/modulo.pdf'],
    })
    expect(wrapper.find('[data-testid="param-campo:nome"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="param-appiattisci"]').exists()).toBe(true)

    await wrapper.get('[data-testid="param-campo:nome"]').setValue('Lorenzo')
    await wrapper.get('[data-testid="operation-confirm"]').trigger('click')
    expect(wrapper.emitted('confirm')[0][0]).toEqual({
      appiattisci: false,
      'campo:nome': 'Lorenzo',
      'campo:accetto': false,
    })
  })

  it('spiega perche i parametri del documento non si possono leggere', async () => {
    installBridge({ inspect: async () => ({ ok: false, error: 'Il documento non contiene campi compilabili.' }) })
    const wrapper = mount(OperationDialog, {
      props: { operation: formfill, files: ['/tmp/senza-modulo.pdf'] },
    })
    await flushPromises()

    expect(wrapper.get('[data-testid="operation-inspect-error"]').text()).toBe(
      'Il documento non contiene campi compilabili.',
    )
    expect(wrapper.find('[data-testid="param-campo:nome"]').exists()).toBe(false)
  })

  it('non interroga il motore per le operazioni con parametri fissi', async () => {
    const { bridge } = installBridge()
    mount(OperationDialog, { props: { operation: extract, files: ['/tmp/a.pdf'] } })
    await flushPromises()
    expect(bridge.inspect).not.toHaveBeenCalled()
  })

  it('lo sfondo chiude la finestra solo se il gesto e cominciato li', async () => {
    installBridge()
    const wrapper = mount(OperationDialog, { props: { operation: extract, files: ['/tmp/a.pdf'] } })
    const sfondo = wrapper.get('[data-testid="operation-dialog"]')
    const pannello = wrapper.get('[data-testid="operation-confirm"]')

    // Trascinamento cominciato dentro il pannello e finito sullo sfondo: la
    // finestra resta aperta, altrimenti si perderebbe quello che si stava
    // facendo — collocare la firma, per esempio.
    await pannello.trigger('mousedown')
    await sfondo.trigger('click')
    expect(wrapper.emitted('close')).toBeUndefined()

    // Un clic vero sullo sfondo, invece, chiude.
    await sfondo.trigger('mousedown')
    await sfondo.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('si chiude senza eseguire nulla', async () => {
    const wrapper = mount(OperationDialog, { props: { operation: extract } })
    await wrapper.get('[data-testid="operation-cancel"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
