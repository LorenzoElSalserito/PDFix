import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import Uploader from '../src/components/Uploader.vue'

describe('Uploader', () => {
  it('renders the upload area', () => {
    const wrapper = mount(Uploader)
    expect(wrapper.text()).toContain('Clicca per caricare')
    expect(wrapper.text()).toContain('trascina qui i tuoi PDF')
  })

  it('has a hidden file input accepting PDF', () => {
    const wrapper = mount(Uploader)
    const input = wrapper.find('input[type="file"]')
    expect(input.exists()).toBe(true)
    expect(input.attributes('accept')).toBe('application/pdf')
    expect(input.attributes('multiple')).toBeDefined()
  })

  it('emits files-added on file selection', async () => {
    const wrapper = mount(Uploader)
    const input = wrapper.find('input[type="file"]')

    const file = new File(['%PDF-test'], 'test.pdf', { type: 'application/pdf' })
    Object.defineProperty(input.element, 'files', { value: [file] })
    await input.trigger('change')

    expect(wrapper.emitted('files-added')).toBeTruthy()
    expect(wrapper.emitted('files-added')[0][0]).toHaveLength(1)
  })

  it('applies disabled styling when disabled prop is true', () => {
    const wrapper = mount(Uploader, { props: { disabled: true } })
    const area = wrapper.find('div')
    expect(area.classes()).toContain('opacity-50')
    expect(area.classes()).toContain('pointer-events-none')
  })

  it('handles drag events', async () => {
    const wrapper = mount(Uploader)
    const area = wrapper.find('div')

    await area.trigger('dragover')
    expect(area.classes()).toContain('border-blue-500')

    await area.trigger('dragleave')
    expect(area.classes()).not.toContain('border-blue-500')
  })
})
