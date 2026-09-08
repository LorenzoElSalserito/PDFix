import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import Uploader from '../src/components/Uploader.vue'

describe('Uploader', () => {
  it('chiede al processo principale di aprire il dialog', async () => {
    const wrapper = mount(Uploader)
    await wrapper.get('[data-testid="uploader"]').trigger('click')
    expect(wrapper.emitted('choose')).toHaveLength(1)
  })

  it('inoltra i file trascinati come array, non come FileList', async () => {
    const wrapper = mount(Uploader)
    // Un `FileList` vero non attraversa il ponte di contesto di Electron:
    // arriva vuoto al preload. Il componente deve consegnarne una copia array.
    const primo = { name: 'a.pdf' }
    const files = { 0: primo, length: 1, item: (index) => (index === 0 ? primo : null) }
    await wrapper.get('[data-testid="uploader"]').trigger('drop', { dataTransfer: { files } })

    const inoltrati = wrapper.emitted('dropped')[0][0]
    expect(Array.isArray(inoltrati)).toBe(true)
    expect(inoltrati).toEqual([primo])
  })

  it('evidenzia l area durante il trascinamento', async () => {
    const wrapper = mount(Uploader)
    const area = wrapper.get('[data-testid="uploader"]')
    await area.trigger('dragover')
    expect(area.classes()).toContain('border-blue-500')
    await area.trigger('dragleave')
    expect(area.classes()).not.toContain('border-blue-500')
  })

  it('non reagisce quando e disabilitato', async () => {
    const wrapper = mount(Uploader, { props: { disabled: true } })
    expect(wrapper.get('[data-testid="uploader"]').classes()).toContain('pointer-events-none')
  })
})
