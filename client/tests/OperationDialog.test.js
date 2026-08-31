import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import OperationDialog from '../src/components/OperationDialog.vue'
import { OPERATIONS } from './helpers.js'

const extract = OPERATIONS.find((operation) => operation.name === 'extract')
const images = OPERATIONS.find((operation) => operation.name === 'images')

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

  it('si chiude senza eseguire nulla', async () => {
    const wrapper = mount(OperationDialog, { props: { operation: extract } })
    await wrapper.get('[data-testid="operation-cancel"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('confirm')).toBeUndefined()
  })
})
