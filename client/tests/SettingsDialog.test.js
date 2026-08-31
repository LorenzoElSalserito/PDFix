import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import SettingsDialog from '../src/components/SettingsDialog.vue'
import { SETTINGS_SNAPSHOT } from './helpers.js'

const props = {
  open: true,
  values: SETTINGS_SNAPSHOT.values,
  fields: SETTINGS_SNAPSHOT.fields,
  sections: SETTINGS_SNAPSHOT.sections,
  features: SETTINGS_SNAPSHOT.features,
  effectiveMemoryLimitMb: 4096,
}

describe('SettingsDialog', () => {
  it('non e montato quando e chiuso', () => {
    const wrapper = mount(SettingsDialog, { props: { ...props, open: false } })
    expect(wrapper.find('[data-testid="settings-dialog"]').exists()).toBe(false)
  })

  it('rende i campi a scelta come menu a tendina', async () => {
    const wrapper = mount(SettingsDialog, { props })
    const theme = wrapper.get('[data-testid="field-theme"]')
    expect(theme.element.tagName).toBe('SELECT')
    expect(theme.findAll('option').map((option) => option.text())).toEqual([
      'Come il sistema',
      'Chiaro',
      'Scuro',
    ])
    expect(theme.element.value).toBe('chiaro')
  })

  it('conserva il tipo dichiarato dallo schema quando salva una scelta', async () => {
    const wrapper = mount(SettingsDialog, { props })
    await wrapper.get('[data-testid="field-theme"]').setValue('scuro')
    await wrapper.get('[data-testid="field-zoomPercent"]').setValue('150')
    await wrapper.get('[data-testid="settings-save"]').trigger('click')

    const saved = wrapper.emitted('save')[0][0]
    expect(saved.theme).toBe('scuro')
    expect(saved.zoomPercent).toBe(150)
  })

  it('genera i controlli a partire dallo schema ricevuto', () => {
    const wrapper = mount(SettingsDialog, { props })
    expect(wrapper.get('[data-testid="field-memoryLimitAuto"]').attributes('type')).toBe('checkbox')
    const number = wrapper.get('[data-testid="field-memoryLimitMb"]')
    expect(number.attributes('type')).toBe('number')
    expect(number.attributes('min')).toBe('512')
    expect(number.attributes('max')).toBe('65536')
    expect(wrapper.get('[data-testid="feature-merge"]')).toBeTruthy()
    expect(wrapper.get('[data-testid="settings-effective-memory"]').text()).toBe('4 GB')
  })

  it('disabilita il limite manuale quando il calcolo e automatico', async () => {
    const wrapper = mount(SettingsDialog, { props })
    expect(wrapper.get('[data-testid="field-memoryLimitMb"]').element.disabled).toBe(false)
    await wrapper.get('[data-testid="field-memoryLimitAuto"]').setValue(true)
    expect(wrapper.get('[data-testid="field-memoryLimitMb"]').element.disabled).toBe(true)
  })

  it('salva una copia modificata senza toccare le preferenze originali', async () => {
    const wrapper = mount(SettingsDialog, { props })
    await wrapper.get('[data-testid="field-memoryLimitMb"]').setValue('8192')
    await wrapper.get('[data-testid="feature-convert"]').setValue(false)
    await wrapper.get('[data-testid="settings-save"]').trigger('click')

    const saved = wrapper.emitted('save')[0][0]
    expect(saved.memoryLimitMb).toBe(8192)
    expect(saved.features.convert).toBe(false)
    expect(SETTINGS_SNAPSHOT.values.memoryLimitMb).toBe(4096)
    expect(SETTINGS_SNAPSHOT.values.features.convert).toBe(true)
  })

  it('espone chiusura, ripristino e diagnostica', async () => {
    const wrapper = mount(SettingsDialog, { props })
    await wrapper.get('[data-testid="settings-close"]').trigger('click')
    await wrapper.get('[data-testid="settings-reset"]').trigger('click')
    await wrapper.get('[data-testid="diagnostics-run"]').trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(1)
    expect(wrapper.emitted('reset')).toHaveLength(1)
    expect(wrapper.emitted('diagnose')).toHaveLength(1)
  })

  it('mostra il risultato della diagnostica', () => {
    const wrapper = mount(SettingsDialog, {
      props: { ...props, diagnostics: { heapLimitMb: 2048, totalMemoryMb: 16000 } },
    })
    expect(wrapper.get('[data-testid="diagnostics-heap"]').text()).toContain('2048 MB')
  })
})
