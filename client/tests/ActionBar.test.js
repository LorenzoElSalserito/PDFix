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

describe('ActionBar: gruppi', () => {
  const tutte = (props) => mount(ActionBar, { props: { operations: OPERATIONS, documents: pdfDocuments(2), ...props } })

  it('offre una scheda per ogni gruppo presente, piu una per tutte le operazioni', () => {
    const wrapper = tutte()
    const schede = wrapper.findAll('[data-testid^="action-group-"]')
    expect(schede.map((scheda) => scheda.attributes('data-testid'))).toEqual([
      'action-group-all',
      'action-group-documento',
      'action-group-pagine',
      'action-group-contenuto',
      'action-group-moduli',
    ])
    expect(wrapper.get('[data-testid="action-group-all"]').text()).toContain(String(OPERATIONS.length))
    expect(wrapper.get('[data-testid="action-group-documento"]').text()).toContain('3')
  })

  it('parte da tutte le operazioni e le mostra insieme', () => {
    const wrapper = tutte()
    expect(wrapper.findAll('[data-testid^="action-"][data-group]')).toHaveLength(OPERATIONS.length)
    expect(wrapper.get('[data-testid="action-group-all"]').attributes('aria-pressed')).toBe('true')
  })

  it('una scheda mostra solo le operazioni del suo gruppo', async () => {
    const wrapper = tutte()
    await wrapper.get('[data-testid="action-group-moduli"]').trigger('click')

    expect(wrapper.findAll('[data-group]')).toHaveLength(1)
    expect(wrapper.find('[data-testid="action-formfill"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="action-merge"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="action-group-moduli"]').attributes('aria-pressed')).toBe('true')
  })

  it('torna a tutte se il gruppo aperto sparisce dalle funzionalita attive', async () => {
    const wrapper = tutte()
    await wrapper.get('[data-testid="action-group-moduli"]').trigger('click')

    await wrapper.setProps({ operations: OPERATIONS.filter((operation) => operation.group !== 'moduli') })

    expect(wrapper.find('[data-testid="action-group-moduli"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="action-group-all"]').attributes('aria-pressed')).toBe('true')
    expect(wrapper.find('[data-testid="action-merge"]').exists()).toBe(true)
  })

  it('segna le operazioni che producono sempre PDF/A', () => {
    const wrapper = tutte()
    const conversione = wrapper.get('[data-testid="action-convert"]')
    expect(conversione.find('span.bg-emerald-500').exists()).toBe(true)
    expect(wrapper.get('[data-testid="action-merge"]').find('span.bg-emerald-500').exists()).toBe(false)
  })

  it('mette ogni pulsante nel gruppo dichiarato dal catalogo', () => {
    const wrapper = tutte()
    for (const operation of OPERATIONS) {
      expect(wrapper.get(`[data-testid="action-${operation.name}"]`).attributes('data-group')).toBe(
        operation.group,
      )
    }
  })
})
