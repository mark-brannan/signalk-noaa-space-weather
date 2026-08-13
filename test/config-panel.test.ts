import { describe, expect, it } from 'vitest'
import {
  ALARM_LEVEL_OPTIONS,
  AURORA_WIRE_KB,
  DAYS_PER_MONTH,
  DEFAULTS,
  OTHER_WIRE_KB,
  dailyKb,
  formatKb,
  panelSettings,
  settingsDiffer
} from '../public/config-panel.js'
import { schema, settingsFrom } from '../src/config'

describe('the panel agrees with the schema about choices', () => {
  it('defaults an absent key to what the schema would have', () => {
    for (const [key, value] of Object.entries(DEFAULTS)) {
      expect(schema.properties[key].default).toBe(value)
    }
    expect(Object.keys(DEFAULTS).sort()).toEqual(
      Object.keys(schema.properties).sort()
    )
  })

  it('offers exactly the alarm levels the schema offers, in the same order', () => {
    expect(ALARM_LEVEL_OPTIONS.map((option) => option.value)).toEqual(
      schema.properties.alarmLevel.oneOf.map((option: any) => option.const)
    )
  })

  it('quotes each level at the rate the schema quotes it', () => {
    for (const option of ALARM_LEVEL_OPTIONS) {
      const fromSchema = schema.properties.alarmLevel.oneOf.find(
        (candidate: any) => candidate.const === option.value
      )
      expect(fromSchema.title).toContain(option.rate)
    }
  })
})

describe('panelSettings', () => {
  it('produces values settingsFrom reads back unchanged', () => {
    const configurations = [
      {},
      { alarmLevel: 3, auroraEnabled: true, auroraInterval: 15 },
      { updateInterval: 5, sendAdvisoryOutlook: false },
      // Out of range, half-typed and hostile, all of which the number and
      // select controls can produce before a save.
      { alarmLevel: 9, auroraInterval: '', updateInterval: -1 },
      { alarmLevel: 'nonsense', auroraInterval: null }
    ]
    for (const configuration of configurations) {
      const shown = panelSettings(configuration)
      expect(settingsFrom(shown)).toEqual(shown)
    }
  })

  it('leaves a superseded key to the plugin rather than translating it', () => {
    // `zoneAlertThreshold` migrates to alarmLevel 3 in settingsFrom. The panel
    // must not do that itself -- it shows the saved side, and the status route
    // is how it learns the two disagree.
    const saved = { zoneAlertThreshold: 1 }
    expect(panelSettings(saved).alarmLevel).toBe(DEFAULTS.alarmLevel)
    expect(settingsFrom(saved).alarmLevel).toBe(3)
    expect(settingsDiffer(panelSettings(saved), settingsFrom(saved))).toBe(true)
  })
})

describe('settingsDiffer', () => {
  it('says no when the status route has not answered', () => {
    expect(settingsDiffer(panelSettings({}), null)).toBe(false)
  })

  it('says no when the running plugin matches what is shown', () => {
    const saved = { alarmLevel: 4, auroraEnabled: true, auroraInterval: 30 }
    expect(settingsDiffer(panelSettings(saved), settingsFrom(saved))).toBe(
      false
    )
  })

  it('says yes when a default is supplying a value nothing was saved with', () => {
    expect(
      settingsDiffer(panelSettings({}), { ...settingsFrom({}), alarmLevel: 2 })
    ).toBe(true)
  })
})

describe('dailyKb', () => {
  const settings = panelSettings({})

  it('counts nothing for aurora while aurora is off', () => {
    expect(dailyKb(settings).aurora).toBe(0)
    expect(dailyKb(settings).total).toBe(dailyKb(settings).other)
  })

  it('charges one wire payload per interval per day', () => {
    const day = dailyKb({ ...settings, auroraEnabled: true })
    expect(day.other).toBeCloseTo((1440 / 60) * OTHER_WIRE_KB)
    expect(day.aurora).toBeCloseTo((1440 / 120) * AURORA_WIRE_KB)
    expect(day.total).toBeCloseTo(day.aurora + day.other)
  })

  it('doubles when an interval is halved', () => {
    const base = dailyKb({ ...settings, auroraEnabled: true })
    const faster = dailyKb({
      ...settings,
      auroraEnabled: true,
      auroraInterval: 60
    })
    expect(faster.aurora).toBeCloseTo(base.aurora * 2)
  })

  it('charges a cleared interval what the plugin will spend on it', () => {
    // An empty number field means the default, because that is what
    // settingsFrom will make of it -- not zero, and not a division by zero.
    const cleared = dailyKb({
      ...settings,
      auroraEnabled: true,
      auroraInterval: '',
      updateInterval: ''
    })
    expect(cleared).toEqual(dailyKb({ ...settings, auroraEnabled: true }))
  })

  it('is the figure the schema used to quote, at the interval it assumed', () => {
    // The description this panel replaced said "about 1.7 MB a day", true only
    // at the 120-minute default. That number is now computed, and this pins it
    // to the same place the sentence started from.
    const day = dailyKb({ ...settings, auroraEnabled: true })
    expect(day.aurora / 1024).toBeCloseTo(1.7, 1)
  })
})

describe('formatKb', () => {
  it('reports in the unit an airtime plan is sold in', () => {
    expect(formatKb(120)).toBe('120 KB')
    expect(formatKb(1740)).toBe('1.70 MB')
    expect(formatKb(50 * 1024)).toBe('50.0 MB')
    expect(formatKb(2 * 1024 * 1024)).toBe('2.00 GB')
  })
})

describe('a month', () => {
  it('is short enough that every calendar month has one', () => {
    expect(DAYS_PER_MONTH).toBeLessThanOrEqual(28 + 2)
  })
})
