import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ActionBar from '../src/components/ActionBar.vue'
import { OPERATIONS } from './helpers.js'

const pdfDocuments = (count) =>
  Array.from({ length: count }, (_, index) => ({ id: String(index), name: `f${index}.pdf`, path: `/f${index}.pdf` }))

const mergeAndConvert = OPERATIONS.filter((operation) => ['merge', 'convert'].includes(operation.name))

const mountBar = (props) =>
  mount(ActionBar, { props: { operations: mergeAndConvert, documents: pdfDocuments(2), ...props } })

describe('ActionBar', () => {
  it('genera un pulsante per ogni operazione disponibile', () => {
    const wrapper = mountBar()
    expect(wrapper.get('[data-testid="action-merge"]').text()).toBe('Unisci PDF')
    expect(wrapper.get('[data-testid="action-convert"]').text()).toBe('Converti in PDF/A')
  })

  it('disabilita le operazioni non eseguibili con i file correnti', () => {
    const wrapper = mountBar({ documents: pdfDocuments(1) })
    expect(wrapper.get('[data-testid="action-merge"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="action-convert"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="action-merge"]').attributes('title')).toMatch(/almeno 2 file/)
  })

  it('emette l operazione scelta', async () => {
    const wrapper = mountBar()
    await wrapper.get('[data-testid="action-merge"]').trigger('click')
    expect(wrapper.emitted('run')[0][0].name).toBe('merge')
  })

  it('mostra l interruttore PDF/A solo se una operazione lo tratta come opzione', () => {
    expect(mountBar().find('[data-testid="pdfa-toggle"]').exists()).toBe(true)
    const soloConvert = mountBar({ operations: mergeAndConvert.filter((operation) => operation.forcesPdfA) })
    expect(soloConvert.find('[data-testid="pdfa-toggle"]').exists()).toBe(false)
  })

  it('avvisa quando nessuna funzionalita e attiva', () => {
    const wrapper = mountBar({ operations: [] })
    expect(wrapper.get('[data-testid="no-operations"]').text()).toMatch(/Nessuna funzionalita attiva|Nessuna funzionalità attiva/)
  })

  it('disabilita le operazioni che non accettano i file caricati', () => {
    const immagini = OPERATIONS.filter((operation) => operation.name === 'images')
    const conPdf = mountBar({ operations: immagini, documents: pdfDocuments(1) })
    expect(conPdf.get('[data-testid="action-images"]').attributes('disabled')).toBeDefined()
    expect(conPdf.get('[data-testid="action-images"]').attributes('title')).toMatch(/solo file \.jpg/)

    const conImmagini = mountBar({
      operations: immagini,
      documents: [{ id: '1', name: 'foto.jpg', path: '/foto.jpg' }],
    })
    expect(conImmagini.get('[data-testid="action-images"]').attributes('disabled')).toBeUndefined()
  })

  it('mostra lo stato di elaborazione sull operazione in corso', () => {
    const wrapper = mountBar({ busy: true, runningOperation: 'merge' })
    expect(wrapper.get('[data-testid="action-merge"]').text()).toContain('Elaborazione')
    expect(wrapper.get('[data-testid="action-convert"]').attributes('disabled')).toBeDefined()
  })
})
