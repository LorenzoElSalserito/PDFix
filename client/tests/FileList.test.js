import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import FileList from '../src/components/FileList.vue'

const documents = [
  { id: '1', path: '/a.pdf', name: 'a.pdf', size: 2048 },
  { id: '2', path: '/b.pdf', name: 'b.pdf', size: 1024 * 1024 },
]

describe('FileList', () => {
  it('elenca i documenti numerati con la dimensione', () => {
    const wrapper = mount(FileList, { props: { documents } })
    const names = wrapper.findAll('[data-testid="file-name"]').map((node) => node.text())
    expect(names).toEqual(['1. a.pdf', '2. b.pdf'])
    expect(wrapper.text()).toContain('2.0 KB')
    expect(wrapper.text()).toContain('1.0 MB')
    expect(wrapper.text()).toContain('File caricati (2)')
  })

  it('emette la rimozione con l identificativo del documento', async () => {
    const wrapper = mount(FileList, { props: { documents } })
    await wrapper.findAll('[data-testid="remove-file"]')[1].trigger('click')
    expect(wrapper.emitted('remove')[0]).toEqual(['2'])
  })

  it('emette lo svuotamento dell elenco', async () => {
    const wrapper = mount(FileList, { props: { documents } })
    await wrapper.get('[data-testid="clear-files"]').trigger('click')
    expect(wrapper.emitted('clear')).toHaveLength(1)
  })
})
