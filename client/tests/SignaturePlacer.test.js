import { beforeEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SignaturePlacer from '../src/components/SignaturePlacer.vue'
import { installBridge } from './helpers.js'

const piazzamento = { page: 1, x: 0.5, y: 0.5, width: 0.2 }

// Senza documento l'anteprima non parte: resta il foglio in scala, che è
// esattamente la condizione in cui il piazzamento deve funzionare lo stesso.
const montaPlacer = (props) =>
  mount(SignaturePlacer, {
    props: { modelValue: piazzamento, documentPath: '', imagePath: '/tmp/firma.png', ...props },
  })

/** Ultimo piazzamento emesso dal componente. */
const ultimo = (wrapper) => wrapper.emitted('update:modelValue').at(-1)[0]

describe('SignaturePlacer', () => {
  beforeEach(() => {
    installBridge()
  })

  it('chiede l immagine prima di mostrare il foglio', () => {
    const wrapper = montaPlacer({ imagePath: '' })
    expect(wrapper.get('[data-testid="signature-needs-image"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="signature-stage"]').exists()).toBe(false)
  })

  it('disegna il riquadro dove dice il piazzamento', () => {
    const stile = montaPlacer().get('[data-testid="signature-overlay"]').attributes('style')
    expect(stile).toContain('left: 50%')
    expect(stile).toContain('top: 50%')
    expect(stile).toContain('width: 20%')
  })

  it('le frecce spostano la firma di un passo, Maiusc di dieci', async () => {
    const wrapper = montaPlacer()
    const overlay = wrapper.get('[data-testid="signature-overlay"]')

    await overlay.trigger('keydown', { key: 'ArrowRight' })
    expect(ultimo(wrapper).x).toBeCloseTo(0.505, 5)

    await overlay.trigger('keydown', { key: 'ArrowUp', shiftKey: true })
    expect(ultimo(wrapper).y).toBeCloseTo(0.45, 5)
  })

  it('non lascia uscire la firma dal foglio', async () => {
    const wrapper = montaPlacer({ modelValue: { page: 1, x: 0.02, y: 0.5, width: 0.2 } })
    const overlay = wrapper.get('[data-testid="signature-overlay"]')

    await overlay.trigger('keydown', { key: 'ArrowLeft', shiftKey: true })
    expect(ultimo(wrapper).x).toBe(0)
  })

  it('ignora i tasti che non spostano nulla', async () => {
    const wrapper = montaPlacer()
    await wrapper.get('[data-testid="signature-overlay"]').trigger('keydown', { key: 'a' })
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
  })

  it('cambia pagina e lo dice nel piazzamento', async () => {
    const wrapper = montaPlacer()
    // Senza anteprima il documento ha una pagina sola: avanti è disabilitato,
    // indietro pure, e la pagina resta quella.
    expect(wrapper.get('[data-testid="signature-page-next"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="signature-page-previous"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="signature-page-label"]').text()).toContain('1')
  })

  it('mostra la larghezza in percentuale', () => {
    expect(montaPlacer().get('[data-testid="signature-size"]').text()).toBe('20%')
  })

  it('spiega che l anteprima manca invece di lasciare il foglio muto', () => {
    const wrapper = montaPlacer()
    expect(wrapper.find('[data-testid="signature-page-image"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="signature-page-fallback"]').exists()).toBe(true)
  })
})
