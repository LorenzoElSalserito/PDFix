import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { LANGUAGES, createTranslator, dictionaries, resolveLanguage } from '../src/i18n/index.js'
import { useI18n } from '../src/composables/useI18n.js'
import InfoDialog from '../src/components/InfoDialog.vue'

describe('dizionari', () => {
  it('coprono le stesse chiavi in entrambe le lingue', () => {
    const italiane = Object.keys(dictionaries.it).sort()
    const inglesi = Object.keys(dictionaries.en).sort()
    expect(inglesi).toEqual(italiane)
  })

  it('non lasciano testi vuoti', () => {
    for (const [lingua, dizionario] of Object.entries(dictionaries)) {
      for (const [chiave, testo] of Object.entries(dizionario)) {
        expect(typeof testo, `${lingua}.${chiave}`).toBe('string')
        expect(testo.trim().length, `${lingua}.${chiave}`).toBeGreaterThan(0)
      }
    }
  })

  it('traducono davvero: nessuna voce inglese identica all italiana per errore', () => {
    // Alcune stringhe coincidono legittimamente (nomi propri, sigle): si
    // controlla che la maggioranza schiacciante sia effettivamente tradotta.
    const chiavi = Object.keys(dictionaries.it)
    const identiche = chiavi.filter((chiave) => dictionaries.it[chiave] === dictionaries.en[chiave])
    expect(identiche.length / chiavi.length).toBeLessThan(0.1)
  })

  it('offre un selettore con le lingue disponibili', () => {
    expect(LANGUAGES.map((lingua) => lingua.value)).toEqual(Object.keys(dictionaries))
    expect(LANGUAGES.every((lingua) => lingua.short.length === 2)).toBe(true)
  })
})

describe('traduttore', () => {
  it('usa la lingua richiesta', () => {
    expect(createTranslator('en')('info.reportBug')).toBe('Report a bug')
    expect(createTranslator('it')('info.reportBug')).toBe('Segnala un Bug')
  })

  it('ricade sull italiano e poi sul testo fornito', () => {
    const t = createTranslator('en')
    expect(t('chiave.assente', 'Etichetta dal catalogo')).toBe('Etichetta dal catalogo')
    expect(t('chiave.assente')).toBe('chiave.assente')
  })

  it('normalizza una lingua sconosciuta', () => {
    expect(resolveLanguage('de')).toBe('it')
    expect(resolveLanguage('en')).toBe('en')
  })
})

describe('InfoDialog', () => {
  const info = { version: '1.0.0', electron: '43.0.0', chrome: '130', node: '20.19.2' }

  it('mostra autore, licenza e versione', () => {
    const { setLanguage } = useI18n()
    setLanguage('it')
    const wrapper = mount(InfoDialog, { props: { open: true, info } })
    expect(wrapper.get('[data-testid="info-author"]').text()).toBe(
      'Sviluppato da Lorenzo De Marco — licenza AGPLv3',
    )
    expect(wrapper.get('[data-testid="info-version"]').text()).toContain('1.0.0')
  })

  it('si traduce con la lingua scelta', async () => {
    const { setLanguage } = useI18n()
    setLanguage('en')
    const wrapper = mount(InfoDialog, { props: { open: true, info } })
    expect(wrapper.get('[data-testid="info-author"]').text()).toBe(
      'Developed by Lorenzo De Marco — AGPLv3 licence',
    )
    expect(wrapper.get('[data-testid="report-bug"]').text()).toBe('Report a bug')
    setLanguage('it')
  })

  it('emette la richiesta di segnalazione e la chiusura', async () => {
    const wrapper = mount(InfoDialog, { props: { open: true, info } })
    await wrapper.get('[data-testid="report-bug"]').trigger('click')
    await wrapper.get('[data-testid="info-close"]').trigger('click')
    expect(wrapper.emitted('report')).toHaveLength(1)
    expect(wrapper.emitted('close')).toHaveLength(1)
  })

  it('emette la richiesta di donazione', async () => {
    const wrapper = mount(InfoDialog, { props: { open: true, info } })
    await wrapper.get('[data-testid="donate"]').trigger('click')
    expect(wrapper.emitted('donate')).toHaveLength(1)
  })

  it('traduce anche il pulsante delle donazioni', () => {
    const { setLanguage } = useI18n()
    setLanguage('en')
    const inglese = mount(InfoDialog, { props: { open: true, info } })
    expect(inglese.get('[data-testid="donate"]').text()).toBe('Donate')

    setLanguage('it')
    const italiano = mount(InfoDialog, { props: { open: true, info } })
    expect(italiano.get('[data-testid="donate"]').text()).toBe('Donazioni')
  })
})
