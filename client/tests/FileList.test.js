import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FileList from '../src/components/FileList.vue'

const mockFiles = [
  { id: '1', name: 'doc1.pdf', size: 1024, preview: { pages: 3, width: 595, height: 842 } },
  { id: '2', name: 'doc2.pdf', size: 2048576, preview: { pages: 1, width: 595, height: 842 } },
]

describe('FileList', () => {
  it('renders file count', () => {
    const wrapper = mount(FileList, {
      props: { files: mockFiles },
    })
    expect(wrapper.text()).toContain('File caricati (2)')
  })

  it('renders each file with name and size', () => {
    const wrapper = mount(FileList, {
      props: { files: mockFiles },
    })
    expect(wrapper.text()).toContain('doc1.pdf')
    expect(wrapper.text()).toContain('doc2.pdf')
    expect(wrapper.text()).toContain('1.0 KB')
  })

  it('shows page count from preview', () => {
    const wrapper = mount(FileList, {
      props: { files: mockFiles },
    })
    expect(wrapper.text()).toContain('3 pagine')
    expect(wrapper.text()).toContain('1 pagina')
  })

  it('emits remove event when remove button is clicked', async () => {
    const wrapper = mount(FileList, {
      props: { files: mockFiles },
    })
    const removeButtons = wrapper.findAll('button[title="Rimuovi"]')
    await removeButtons[0].trigger('click')
    expect(wrapper.emitted('remove')).toBeTruthy()
    expect(wrapper.emitted('remove')[0][0]).toBe('1')
  })

  it('shows drag handle for reordering', () => {
    const wrapper = mount(FileList, {
      props: { files: mockFiles },
    })
    const handles = wrapper.findAll('.drag-handle')
    expect(handles.length).toBe(2)
  })
})
