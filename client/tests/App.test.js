import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../src/App.vue'

// Mock axios
vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
  },
}))

describe('App', () => {
  it('renders header with PDFix title', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('PDFix')
    expect(wrapper.text()).toContain('PDF Merge')
  })

  it('shows uploader on initial render', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('Clicca per caricare')
  })

  it('does not show file list when no files added', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).not.toContain('File caricati')
  })

  it('does not show action buttons when no files added', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).not.toContain('Unisci PDF')
  })

  it('shows AGPLv3 footer', () => {
    const wrapper = mount(App)
    expect(wrapper.text()).toContain('AGPLv3')
    expect(wrapper.text()).toContain('Codice Sorgente')
  })
})
