/**
 * Signal K plugin surfacing NOAA Space Weather Prediction Center products.
 *
 * All parsing lives in ./parse.ts, which is pure and independently tested.
 * This module owns the I/O: fetching from NOAA and emitting Signal K deltas.
 */
import {
  NoaaScaleValues,
  NotificationStates,
  ValueUpdate,
  parseAdvisoryOutlook,
  parseAlert,
  parseKpForecast,
  parseSolarWind,
  transformJsonScaleRange,
  zoneMethods,
  zonesForKp,
  zonesForScale
} from './parse.js'

const API = 'https://services.swpc.noaa.gov'
const USER_AGENT = 'signalk-noaa-space-weather'
const FETCH_TIMEOUT_MS = 30000

const scalesBasePath = 'environment.noaa.swpc.scales.'
const kpBasePath = 'environment.noaa.swpc.kp'
const solarWindBasePath = 'environment.noaa.swpc.solar_wind'

const SCALE_DESCRIPTIONS: { [letter: string]: string } = {
  G: 'Geomagnetic Storm',
  S: 'Solar Radiation Storm',
  R: 'Radio Blackout'
}

// Maps a key of noaa-scales.json onto the Signal K sub-path it populates.
const NOAA_SCALE_RANGES = [
  {
    jsonIndex: '-1',
    subPath: 'observations.24_hours_maximums',
    label: '24-hour observed maximum',
    isObservation: true
  },
  {
    jsonIndex: '0',
    subPath: 'observations.latest',
    label: 'Latest observed',
    isObservation: true
  },
  {
    jsonIndex: '1',
    subPath: 'forecast.1day',
    label: 'Day 1 forecast',
    isObservation: false
  },
  {
    jsonIndex: '2',
    subPath: 'forecast.2day',
    label: 'Day 2 forecast',
    isObservation: false
  },
  {
    jsonIndex: '3',
    subPath: 'forecast.3day',
    label: 'Day 3 forecast',
    isObservation: false
  }
]

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let timers: any[] = []
  let stopped = false
  let defaultMethod: string[] = ['visual', 'sound']

  const plugin: Plugin = {
    start: function (props: any) {
      stopped = false

      // Must be resolved before anything schedules a notification.
      if (typeof props.notificationVisual !== 'undefined') {
        defaultMethod = []
        if (props.notificationVisual) defaultMethod.push('visual')
        if (props.notificationSound) defaultMethod.push('sound')
      } else {
        defaultMethod = ['visual', 'sound']
      }

      schedule(
        () => getObservationsAndForecasts(props),
        (props.observationsInterval || 60) * 60 * 1000
      )

      if (props.sendAdvisoryOutlook) {
        schedule(
          () => sendAdvisoryOutlook(props),
          (props.notificationsInterval || 60) * 60 * 1000
        )
      }

      if (props.sendAlertsWatchesWarnings) {
        schedule(
          () => sendAlertsWatchesWarnings(props),
          (props.notificationsInterval || 60) * 60 * 1000
        )
      }
    },

    stop: function () {
      // Both the initial setTimeout and the repeating setInterval handles are
      // tracked: previously only the intervals were, so a stop within the
      // first 5 seconds left a fetch in flight that still emitted deltas.
      stopped = true
      timers.forEach((timer) => clearTimeout(timer))
      timers = []
    },

    id: 'signalk-noaa-space-weather',
    name: 'NOAA Space Weather',
    description: 'SignalK Plugin to get SPACE weather from the NOAA SWPC',
    schema: {
      type: 'object',
      properties: {
        sendAdvisoryOutlook: {
          type: 'boolean',
          title:
            'Send notifications for weekly "Advisory Outlook" (as notification state="alert")',
          default: true
        },
        sendAlertsWatchesWarnings: {
          type: 'boolean',
          title:
            'Send notifications for alerts, watches, and warnings (state "alert" or "normal")',
          default: false
        },
        notificationVisual: {
          type: 'boolean',
          title: 'Notification Method Visual',
          default: true
        },
        notificationSound: {
          type: 'boolean',
          title: 'Notification Method Sound',
          default: true
        },
        minScaleAlert: {
          type: 'number',
          title:
            'Minimum NOAA "scale" value to trigger "alert" notifications (will use state="normal" below this)',
          description: '1-5 (minor, moderate, strong, severe, extreme)',
          default: NoaaScaleValues.STRONG
        },
        zoneAlertThreshold: {
          type: 'number',
          title:
            'Lowest NOAA "scale" value that raises an alarm zone on observed and forecast values',
          description:
            '1-5. Levels below this are "normal". This level is "alert" (no popup or sound),' +
            ' one above is "warn" (visual), and higher is "alarm" (visual and sound).' +
            ' The default of 3 reflects NOAA event frequencies: level 1 occurs on roughly a' +
            ' quarter of all days, level 3 about monthly, level 5 four times per solar cycle.',
          default: NoaaScaleValues.STRONG
        },
        observationsInterval: {
          type: 'number',
          title: 'Interval for observations and forecasts',
          description: 'in minutes',
          default: 60
        },
        notificationsInterval: {
          type: 'number',
          title: 'Notifications Interval',
          description: 'in minutes',
          default: 60
        }
      }
    }
  }

  /** Run `task` shortly after start, then on `intervalMs`, tracking both handles. */
  function schedule(task: () => void, intervalMs: number) {
    timers.push(setTimeout(task, 5000))
    timers.push(setInterval(task, intervalMs))
  }

  function zoneAlertThreshold(props: any): number {
    const configured = Number(props?.zoneAlertThreshold)
    return Number.isFinite(configured) && configured >= 1 && configured <= 5
      ? configured
      : NoaaScaleValues.STRONG
  }

  function methodsFor(props: any) {
    return zoneMethods(
      props.notificationVisual !== false,
      props.notificationSound !== false
    )
  }

  function fetchJson(subPath: string, productName: string): Promise<any> {
    return fetchData(subPath, productName, (response) => response.json())
  }

  function fetchText(subPath: string, productName: string): Promise<string> {
    return fetchData(subPath, productName, (response) => response.text())
  }

  function fetchData(
    subPath: string,
    productName: string,
    dataCallbackFn: (response: Response) => Promise<any>
  ): Promise<any> {
    const url = API + subPath
    return fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    })
      .then((response) => {
        if (!response.ok) {
          const status = `NOAA Space Weather '${productName}' not found at ${url}`
          app.setPluginError(status)
          throw new Error(status)
        }
        return dataCallbackFn(response)
      })
      .then((data) => {
        app.setPluginStatus(
          `NOAA Space Weather ${productName} retrieved: ${new Date()}`
        )
        return data
      })
  }

  /** Log and swallow: one failing product must not take down the others. */
  function report(productName: string) {
    return (err: any) => {
      error(`Failed to handle '${productName}': ${err}`)
    }
  }

  // https://services.swpc.noaa.gov/text/advisory-outlook.txt
  async function sendAdvisoryOutlook(props: any) {
    const advisoryBasePath = 'notifications.noaa.swpc.advisory_outlook'
    const idPrefix = 'space_weather_advisory_outlook'

    sendMetadata([
      {
        path: advisoryBasePath,
        value: {
          name: 'NOAA Space Weather Advisory Outlook',
          description:
            'Issued every Monday, the Advisory provides general descriptions' +
            ' of space weather conditions during the past week and an outlook for the next 7 days.' +
            ' Outlooks are based on the NOAA Space Weather Scales.',
          timeout: 60 * 60 * 24 * 7
        }
      }
    ])

    return fetchText('/text/advisory-outlook.txt', 'Advisory Outlook')
      .then((text) => {
        if (stopped) return
        const outlook = parseAdvisoryOutlook(text)
        if (!outlook) {
          error('Failed to parse the advisory outlook text product')
          return
        }

        const { idLine, shortId, issued } = outlook
        const path = advisoryBasePath + '.' + shortId
        const existing = app.getSelfPath(path + '.value')
        const id = idPrefix + shortId

        const currentAdvisory = {
          id,
          issued: issued.toISOString(),
          message: `${idLine} for ${issued.toDateString()}`,
          description: text,
          state: NotificationStates.ALERT,
          method: defaultMethod
        }
        sendUpdatedValue(path, currentAdvisory, issued.toISOString())

        if (!existing || existing.state === NotificationStates.NORMAL) {
          debug('Sending %s: %s', id, currentAdvisory.message)
        }

        // Clear any advisory from a previous week that is still raised.
        const existingAdvisories = app.getSelfPath(advisoryBasePath)
        if (!existingAdvisories) return
        Object.values(existingAdvisories).forEach((advisory: any) => {
          if (!advisory?.value?.id) return
          if (
            currentAdvisory.id === advisory.value.id ||
            advisory.value.state === NotificationStates.NORMAL
          ) {
            return
          }
          const staleShortId = advisory.value.id.slice(idPrefix.length)
          debug('Clearing ' + advisory.value.id)
          sendUpdatedValue(
            advisoryBasePath + '.' + staleShortId,
            { ...advisory.value, state: NotificationStates.NORMAL },
            issued.toISOString()
          )
        })
      })
      .catch(report('Advisory Outlook'))
  }

  // https://services.swpc.noaa.gov/products/alerts.json
  async function sendAlertsWatchesWarnings(props: any) {
    return fetchJson('/products/alerts.json', 'Alerts, Watches, and Warnings')
      .then((json) => {
        if (stopped) return
        if (!Array.isArray(json)) {
          error('Alerts payload was not an array')
          return
        }

        const basePath = 'notifications.noaa.swpc'
        let skipped = 0

        json.forEach((alert: any) => {
          const parsed = parseAlert(
            alert,
            props.minScaleAlert ?? NoaaScaleValues.STRONG
          )
          if (!parsed) {
            skipped++
            return
          }

          const path = basePath + '.sn:' + parsed.serialNumber
          sendUpdatedValue(
            path,
            {
              id: path,
              issued: parsed.issued.toISOString(),
              message: parsed.mainMessage,
              description: alert.message,
              alertLevel: parsed.alertLevel,
              scale: parsed.scaleText,
              state: parsed.state,
              method: defaultMethod
            },
            parsed.issued.toISOString()
          )
        })

        if (skipped > 0) {
          error('Skipped %d unparseable alert(s) of %d', skipped, json.length)
        }
      })
      .catch(report('Alerts, Watches, and Warnings'))
  }

  async function getObservationsAndForecasts(props: any) {
    await Promise.allSettled([
      getScales(props),
      getPlanetaryKIndexForecast(props),
      getSolarWindSummary(props)
    ])
  }

  /**
   * Metadata for every scale path, generated from NOAA_SCALE_RANGES rather
   * than written out by hand -- the previous hand-written list silently
   * pointed all three "latest observed" entries at the 24-hour maximum paths,
   * so observations.latest.* carried no metadata at all.
   */
  function scaleMetadata(props: any) {
    const threshold = zoneAlertThreshold(props)
    const methods = methodsFor(props)
    const metas: any[] = []

    for (const range of NOAA_SCALE_RANGES) {
      const base = scalesBasePath + range.subPath
      for (const letter of ['G', 'S', 'R']) {
        if (letter === 'G' || range.isObservation) {
          metas.push({
            path: `${base}.${letter}`,
            value: {
              ...methods,
              displayName: `${SCALE_DESCRIPTIONS[letter]} (${letter})`,
              description: `${range.label} for ${SCALE_DESCRIPTIONS[letter].toLowerCase()}s`,
              units: 'none',
              timeout: 60 * 60 * 4,
              displayScale: {
                lower: NoaaScaleValues.NONE,
                upper: NoaaScaleValues.EXTREME,
                type: 'linear'
              },
              zones: zonesForScale(letter, threshold)
            }
          })
        } else if (letter === 'S') {
          metas.push({
            path: `${base}.S.probability`,
            value: {
              displayName: 'S1 or greater probability',
              description: `${range.label} probability of an S1 or greater solar radiation storm`,
              units: 'ratio',
              timeout: 60 * 60 * 4
            }
          })
        } else {
          metas.push({
            path: `${base}.R.minorProbability`,
            value: {
              displayName: 'R1-R2 probability',
              description: `${range.label} probability of an R1-R2 radio blackout`,
              units: 'ratio',
              timeout: 60 * 60 * 4
            }
          })
          metas.push({
            path: `${base}.R.majorProbability`,
            value: {
              displayName: 'R3 or greater probability',
              description: `${range.label} probability of an R3 or greater radio blackout`,
              units: 'ratio',
              timeout: 60 * 60 * 4
            }
          })
        }
      }
    }
    return metas
  }

  // https://services.swpc.noaa.gov/products/noaa-scales.json
  async function getScales(props: any) {
    sendMetadata(scaleMetadata(props))

    return fetchJson('/products/noaa-scales.json', 'Scales')
      .then((json) => {
        if (stopped) return
        const values: ValueUpdate[] = []

        for (const range of NOAA_SCALE_RANGES) {
          const scaleEntry = json?.[range.jsonIndex]
          if (!scaleEntry) {
            error(
              "Json contains no scale entry for index '%s' (%s)",
              range.jsonIndex,
              range.subPath
            )
            continue
          }
          values.push(
            ...transformJsonScaleRange(
              scaleEntry,
              scalesBasePath + range.subPath,
              range.isObservation
            )
          )
        }

        if (values.length === 0) return
        const latestTime = values.find(
          (v) => v.path === scalesBasePath + 'observations.latest.time'
        )
        sendUpdatedValues(
          values,
          latestTime ? latestTime.value : new Date().toISOString()
        )
      })
      .catch(report('Scales'))
  }

  /**
   * https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
   *
   * Kp underlies the G scale directly (G1 = Kp5 ... G5 = Kp9) and this feed is
   * 3-hourly out to +3 days, so it answers "how bad, and when" at eight times
   * the resolution of the single daily G value in noaa-scales.json. The fetch
   * was already being made; its result was previously discarded.
   */
  async function getPlanetaryKIndexForecast(props: any) {
    const threshold = zoneAlertThreshold(props)
    const methods = methodsFor(props)
    const kpZones = zonesForKp(threshold)
    const commonKpMeta = {
      units: 'none',
      timeout: 60 * 60 * 6,
      displayScale: { lower: 0, upper: 9, type: 'linear' }
    }

    sendMetadata([
      {
        path: `${kpBasePath}.observed`,
        value: {
          ...commonKpMeta,
          ...methods,
          displayName: 'Planetary K-index',
          shortName: 'Kp',
          description:
            'Most recent observed or estimated planetary K-index. Kp 5 and above is a' +
            ' geomagnetic storm (G1 = Kp5 ... G5 = Kp9).',
          zones: kpZones
        }
      },
      {
        path: `${kpBasePath}.forecast.max24h`,
        value: {
          ...commonKpMeta,
          ...methods,
          displayName: 'Max forecast Kp (24h)',
          description:
            'Highest planetary K-index forecast within the next 24 hours',
          zones: kpZones
        }
      },
      {
        path: `${kpBasePath}.forecast.max72h`,
        value: {
          ...commonKpMeta,
          ...methods,
          displayName: 'Max forecast Kp (72h)',
          description:
            'Highest planetary K-index forecast within the next 72 hours',
          zones: kpZones
        }
      },
      {
        path: `${kpBasePath}.forecast.maxNoaaScale`,
        value: {
          ...methods,
          units: 'none',
          timeout: 60 * 60 * 6,
          displayName: 'Max forecast G scale (72h)',
          description:
            'NOAA G scale value corresponding to the highest Kp forecast in the next 72 hours',
          displayScale: {
            lower: NoaaScaleValues.NONE,
            upper: NoaaScaleValues.EXTREME,
            type: 'linear'
          },
          zones: zonesForScale('G', threshold)
        }
      },
      {
        path: `${kpBasePath}.forecast.nextStormTime`,
        value: {
          timeout: 60 * 60 * 6,
          displayName: 'Next forecast storm onset',
          description:
            'Timestamp of the first forecast interval reaching Kp 5 (G1) or above, if any'
        }
      },
      {
        path: `${kpBasePath}.forecast.nextStormKp`,
        value: {
          ...commonKpMeta,
          displayName: 'Next forecast storm Kp',
          description: 'Planetary K-index at the next forecast storm onset'
        }
      }
    ])

    return fetchJson(
      '/products/noaa-planetary-k-index-forecast.json',
      'Planetary K-index Forecast'
    )
      .then((json) => {
        if (stopped) return
        const summary = parseKpForecast(json)
        if (summary.observed === null && summary.max72h === null) {
          error('Planetary K-index forecast contained no usable rows')
          return
        }

        debug(
          'Kp observed=%s max24h=%s max72h=%s nextStorm=%s',
          summary.observed,
          summary.max24h,
          summary.max72h,
          summary.nextStormTime
        )

        sendUpdatedValues(
          [
            { path: `${kpBasePath}.observed`, value: summary.observed },
            { path: `${kpBasePath}.forecast.max24h`, value: summary.max24h },
            { path: `${kpBasePath}.forecast.max72h`, value: summary.max72h },
            {
              path: `${kpBasePath}.forecast.maxNoaaScale`,
              value: summary.maxNoaaScale
            },
            {
              path: `${kpBasePath}.forecast.nextStormTime`,
              value: summary.nextStormTime
            },
            {
              path: `${kpBasePath}.forecast.nextStormKp`,
              value: summary.nextStormKp
            }
          ],
          summary.observedTime ?? new Date().toISOString()
        )
      })
      .catch(report('Planetary K-index Forecast'))
  }

  async function getSolarWindSummary(props: any) {
    sendMetadata([
      {
        path: `${solarWindBasePath}.speed`,
        value: {
          displayName: 'Solar Wind Speed',
          shortName: 'SWS',
          description:
            'The solar wind speed; typical values are around 400 km/s',
          units: 'm/s',
          timeout: 60 * 60
        }
      },
      {
        path: `${solarWindBasePath}.Bt`,
        value: {
          displayName: 'IMF strength (Bt)',
          shortName: 'Bt',
          description: 'The strength of the interplanetary magnetic field',
          units: 'T',
          timeout: 60 * 60
        }
      },
      {
        path: `${solarWindBasePath}.Bz`,
        value: {
          displayName: 'IMF orientation (Bz)',
          shortName: 'Bz',
          description:
            'The north-south component of the interplanetary magnetic field in GSM' +
            ' coordinates. Sustained negative (southward) Bz couples the solar wind to' +
            " Earth's magnetosphere and drives geomagnetic storms.",
          units: 'T',
          timeout: 60 * 60
        }
      }
    ])

    return Promise.all([
      fetchJson('/products/summary/solar-wind-speed.json', 'Solar Wind Speed'),
      fetchJson(
        '/products/summary/solar-wind-mag-field.json',
        'Solar Wind Magnetic Field'
      )
    ])
      .then(([speedJson, magJson]) => {
        if (stopped) return
        const wind = parseSolarWind(speedJson, magJson)

        const values: ValueUpdate[] = []
        if (wind.speed !== null) {
          values.push({ path: `${solarWindBasePath}.speed`, value: wind.speed })
        }
        if (wind.bt !== null) {
          values.push({ path: `${solarWindBasePath}.Bt`, value: wind.bt })
        }
        if (wind.bz !== null) {
          values.push({ path: `${solarWindBasePath}.Bz`, value: wind.bz })
        }

        if (values.length === 0) {
          error('Solar wind payloads contained no recognised fields')
          return
        }
        debug('Solar wind values: %j', values)
        sendUpdatedValues(values, wind.timestamp ?? new Date().toISOString())
      })
      .catch(report('Solar Wind Summary'))
  }

  function sendMetadata(metas: any[]) {
    if (metas.length === 0) return
    app.handleMessage(plugin.id, { updates: [{ meta: metas }] })
  }

  function sendUpdatedValue(path: string, value: any, timestamp: string) {
    debug("sending updated value for '%s', timestamp=%s", path, timestamp)
    sendUpdatedValues([{ path, value }], timestamp)
  }

  function sendUpdatedValues(values: ValueUpdate[], timestamp: string) {
    app.handleMessage(plugin.id, { updates: [{ values, timestamp }] })
  }

  return plugin
}

interface Plugin {
  start: (props: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}
