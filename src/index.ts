/**
 * TK
 */
import fetch from 'node-fetch'
import { Response } from 'node-fetch'

const API = 'https://services.swpc.noaa.gov'
const USER_AGENT = 'signalk-noaa-space-weather'
const observationsKey = 'environment.observations.noaa.swpc.'
const forecastKey = 'environment.forecast.noaa.swpc.'

const NotificationStates = Object.freeze({
  NOMINAL:    "nominal",
  NORMAL:     "normal",
  ALERT:      "alert",
  WARN:       "warn",
  ALARM:      "alarm",
  EMERGENCY:  "emergency",
})

// https://www.spaceweather.gov/noaa-scales-explanation
const NoaaScaleValues = Object.freeze({
  NONE:     0,
  MINOR:    1,
  MODERATE: 2,
  STRONG:   3,
  SEVERE:   4,
  EXTREME:  5,
})


export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let timers: any = []
  let sentMetaPaths: any = {}
  let defaultMethod: string[]

  const plugin: Plugin = {
    start: function (props: any) {

      setTimeout(() => { getObservationsAndForecasts(props) }, 5000)
      timers.push(
        setInterval(() => {
          getObservationsAndForecasts(props)
        }, (props.observationsInterval|| 60 ) * 60 * 1000)
      )

      if (props.sendAdvisoryOutlook) {
        setTimeout(() => { sendAdvisoryOutlook(props) }, 5000)
        timers.push(
          setInterval(() => {
            sendAdvisoryOutlook(props)
          }, (props.notificationsInterval || 60) * 60 * 1000)
        )
      }

      if (props.sendAlertsWatchesWarnings) {
        setTimeout(() => { sendAlertsWatchesWarnings(props) }, 5000)
        timers.push(
          setInterval(() => {
            sendAlertsWatchesWarnings(props)
          }, (props.notificationsInterval || 60) * 60 * 1000)
        )
      }

      if (typeof props.notificationVisual !== 'undefined') {
        defaultMethod = []
        if (props.notificationVisual) {
          defaultMethod.push('visual')
        }
        if (props.notificationSound) {
          defaultMethod.push('sound')
        }
      } else {
        defaultMethod = ['visual', 'sound']
      }
  },

    stop: function () {
      timers.forEach((timer: any) => {
        clearInterval(timer)
      })
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
          title: 'Send notifications for weekly "Advisory Outlook" (as notification state="alert")',
          default: true
        },
        sendAlertsWatchesWarnings: {
          type: 'boolean',
          title: 'Send notifications for alerts, watches, and warnings (state "alert" or "normal")',
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
          title: 'Minimum NOAA "scale" value to trigger "alert" notifications (will use state="normal" below this)',
          description: '1-5 (minor, moderate, strong, severe, extreme)',
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

  type DataCallbackFn = (Response) => String | any

  function fetchJson(subPath: String, productName: String): Promise<any> {
    return fetchData(subPath, productName, response => response.json())
  }

  function fetchText(subPath: String, productName: String): Promise<String> {
    return fetchData(subPath, productName, response => response.text())
  }

  function fetchData(subPath: String, productName: String, dataCallbackFn: DataCallbackFn): Promise<String | any> {
    const url = API + subPath
    return fetch(url, {
      method: "GET",
      headers: { 'User-Agent': USER_AGENT }
    }).then(response => {
      if (response.ok) {
        return dataCallbackFn(response)
      } else {
        const status = `NOAA Space Weather '${productName}' not found at ${url}`
        app.setPluginError(status)
        throw new Error(status)
      }
    }).then(data => {
      const status = `NOAA Space Weather ${productName} retrieved: ${new Date()}`
      app.setPluginStatus(status)
      return data
    }).catch(error => {
      app.error(`Failed to fetch '${productName}': ${error}`)
      throw error
    })
  }

  // https://services.swpc.noaa.gov/text/advisory-outlook.txt
  async function sendAdvisoryOutlook(props: any) {

    const advisoryBasePath = "notifications.noaa.swpc.advisory_outlook"
    const idPrefix = "space_weather_advisory_outlook"

    sendMetadata([{
      path: advisoryBasePath,
      value: {
        name: "NOAA Space Weather Advisory Outlook",
        description: "Issued every Monday, the Advisory provides general descriptions"
        + " of space weather conditions during the past week and an outlook for the next 7 days."
        + " Outlooks are based on the NOAA Space Weather Scales.",
        timeout: 60 * 60 * 24 * 7,
      }
    }])

    let currentAdvisory
    fetchText('/text/advisory-outlook.txt', 'Advisory Outlook')
    .then(text => {
      const regexForIdAndDate = /\n(SPACE WEATHER ADVISORY OUTLOOK ([^\n]*))\n([^\n]*)\n/
      const idLine = text.match(regexForIdAndDate)[1]
      const shortId = text.match(regexForIdAndDate)[2]
      const issued = parseIssueDate(text)

      const path = advisoryBasePath + "." + shortId
      const existing = app.getSelfPath(path + '.value')

      const id = idPrefix + shortId
      const message = `${idLine} for ${issued.toDateString()}`
      const notif = {
        id: id,
        issued: issued.toISOString(),
        message: message,
        description: text,
        state: NotificationStates.ALERT,
        method: props.defaultMethod,
      }
      currentAdvisory = notif
      sendUpdatedValue(path, notif, issued.toISOString())

      //app.debug('Sending %j', notif)
      if (!existing || existing.state === NotificationStates.NORMAL) {
        app.debug('Sending %s: %s', id, message)
      }

      const existingAdvisories = app.getSelfPath(advisoryBasePath)
      if (existingAdvisories) {
        //app.debug('existingAdvisories: %j', existingAdvisories)
        Object.values(existingAdvisories).forEach(
        (advisory: any) => {
          const shortId = advisory.value.id.slice(idPrefix.length)
          if (currentAdvisory.id != advisory.value.id &&
            advisory.value.state !== NotificationStates.NORMAL) {
            app.debug("Clearing " + advisory.value.id)
            sendUpdatedValue(
              advisoryBasePath + "." + shortId,
              { ...advisory.value, state: NotificationStates.NORMAL },
              issued.toISOString()
            )
          }
        })
      }


    })
  }


  // https://services.swpc.noaa.gov/products/alerts.json
  // deciphering message codes:
  // http://www.spaceweather.org/ISES/code/fmt/exam.html
  async function sendAlertsWatchesWarnings(props: any) {
    fetchJson('/products/alerts.json', 'Alerts, Watches, and Warnings').then(json => {
      const basePath = "notifications.noaa.swpc"

      json.forEach(alert => {
        //debug("handling alert: %j", alert)

        const serialNumber  = alert.message.match(/Serial Number: ([0-9]*)/)[1]

        // 5th line, could start with 'WARNING:', 'EXTENDED WARNING:', 'CONTINUED ALERT:', etc.
        let mainMessage: string = "<text parsing failure!>"
        const mainMessageRegex = /([^\n]*\n)([^\n]*\n)([^\n]*\n)([^\n]*\n)([A-Z ]*:[^\n]*)/
        if (alert.message.match(mainMessageRegex)) {
          mainMessage = alert.message.match(mainMessageRegex)[5]
        } else {
          error("Failed to parse main message line from alert text: %s", alert.message)
        }
        const id = basePath + ".sn:" + serialNumber
        const path = id

        const issued = new Date(alert.issue_datetime + "Z")
        const messageCode = alert.message.match(/Space Weather Message Code: ([A-Z0-9]*)/)[1]
        const alertLevel = getAlertLevel(messageCode)

        // Scale line is not always present and could take multiple forms, such as:
        // NOAA Scale: R2 - Moderate
        // Predicted NOAA Scale: S1 - Minor
        // NOAA Scale: G3 or greater - Strong to Extreme
        let state: String = NotificationStates.NORMAL
        let scaleText: String = ""
        const scaleLineRegex = /\n([^[\n]*NOAA Scale: *([GSR][0-9][^-]*)[^\n]*)/
        if (alert.message.match(scaleLineRegex)) {
          const scaleText = alert.message.match(scaleLineRegex)[2]
          const numericScale = (scaleText.match(/or greater/)) ?
            NoaaScaleValues.EXTREME : scaleText.match(/[GSR]([0-5])/)[1]

          const state = numericScale > (props.minScaleAlert) ?
            NotificationStates.ALERT : NotificationStates.NORMAL
        }

        const notif = {
          id: id,
          issued: issued.toISOString(),
          message: mainMessage,
          description: alert.message,
          alertLevel: alertLevel,
          scale: scaleText,
          state: state,
          method: defaultMethod,
        }
        //app.debug('Sending %j', notif)
        sendUpdatedValue(path, notif, issued.toISOString())
      })
    })
  }

// TBD:
// https://services.swpc.noaa.gov/text/current-space-weather-indices.txt
// https://services.swpc.noaa.gov/text/3-day-forecast.txt
// https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json
// https://services.swpc.noaa.gov/images/swx-overview-small.gif
// https://services.swpc.noaa.gov/images/notifications-timeline.png

  async function getObservationsAndForecasts(props: any) {
    getScales(props)
    getPlanetaryKIndexForecast(props)
    getSolarWindSummary(props)
  }

  const commonScaleMeta = {
    units: "none",
    "timeout": 60 * 60 * 4,
    displayScale: {
      "lower": NoaaScaleValues.NONE,
      "upper": NoaaScaleValues.EXTREME,
      "type": "linear",
    }
  }
    // "24-Hour Observed Maximums",
    // "Latest Observed",
  
  // https://services.swpc.noaa.gov/products/noaa-scales.json
  async function getScales (props: any) {

    const scalesBasePath = 'environment.noaa.swpc.scales.' 
    const metas: any = [
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.G',
        value: {...commonScaleMeta,
          name: "Geomagnetic Storm Impacts",
          description: "24-Hour Observed Maximums for geomagnetic storms"
        }
      },
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.S',
        value: {...commonScaleMeta,
          name: "Solar Radiation Storm Impacts",
          description: "24-Hour Observed Maximums for solar radiation storms"
        }
      },
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.R',
        value: {...commonScaleMeta,
          name: "Radio Blackout Impacts",
          description: "24-Hour Observed Maximums for radio blackouts"
        }
      },
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.G',
        value: {...commonScaleMeta,
          name: "Geomagnetic Storm Impacts",
          description: "Latest Observed for geomagnetic storms"
        }
      },
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.S',
        value: {...commonScaleMeta,
          name: "Solar Radiation Storm Impacts",
          description: "Latest Observed for solar radiation storms"
        }
      },
      {
        path: 'environment.noaa.swpc.scales.observations.24_hours_maximums.R',
        value: {...commonScaleMeta,
          name: "Radio Blackout Impacts",
          description: "Latest Observed for radio blackouts"
        }
      },
    ]
    sendMetadata(metas)

    fetchJson('/products/noaa-scales.json', 'Scales').then(json => {
      const values: any = []


      // TOOD: capture zones from the examplanations for each G/S/R scale effect
      // inferred from the noaa-scales json
      const NoaaScaleRangeInfo = [
        {
          jsonIndex: "-1",
          subPath: "observations.24_hours_maximums",
        },
        {
          jsonIndex: "0",
          subPath: "observations.latest",
        },
        {
          jsonIndex: "1",
          subPath: "forecast.1day",
        },
        {
          jsonIndex: "2",
          subPath: "forecast.2day",
        },
        {
          jsonIndex: "3",
          subPath: "forecast.3day",
        },
      ]

      NoaaScaleRangeInfo.forEach(rangeInfo => {
        const scaleEntry = json[rangeInfo.jsonIndex]
        if (scaleEntry) {
          const basePath = scalesBasePath + rangeInfo.subPath
          const valueUpdates = transformJsonScaleRange(scaleEntry, basePath)
          values.push(...valueUpdates)
        } else {
          error("Json contains no scale entry for index '%s' (%s)",
            rangeInfo.jsonIndex, rangeInfo.subPath)
        }
      })
      const timestamp = values.find(element => element.path === scalesBasePath + 'observations.latest.time')['value']
      sendUpdatedValues(values, timestamp)
    })
  }

  function transformJsonScaleRange(json: any, basePath: String): any[] {
    const valueUpdates = []

    const isoDateString= json["DateStamp"] + "T" + json["TimeStamp"] + "Z"
    valueUpdates.push({
      path: basePath + ".time",
      value: isoDateString
    })

    const scaleLetters = ["G", "S", "R"]
    scaleLetters.forEach(key => {
      const update = {
        path: basePath + "." + key,
        value: null
      }
      // prior and current observations have Scale and Text but no probabilities;
      // forecast G entries have Scale and Text only,
      // forecast S and R entries have NO scale or text, but 
      // have probabilities: 'Prob' for S, and minor/major for R
      if (key == "G" || basePath.match(/.observations./)) {
        update.value = parseInt(json[key]["Scale"])
      } else {
        if (key == "S") {
          update.value = {
            probability: parseFloat(json[key]["Prob"]),
          }
        } else { // "R"
          update.value = {
            minorProbability: parseFloat(json[key]["MinorProb"]),
            majorProbability: parseFloat(json[key]["MajorProb"]),
          }
        }
      }
      valueUpdates.push(update)
    })
    return valueUpdates
  }

  async function getPlanetaryKIndexForecast (props: any) {
    fetchJson('/products/noaa-planetary-k-index-forecast.json', 'Planetary K-index Forecast')
    .then(json => {
      const values: any = []
      const metas: any = []

      const scalesPath = 'environment.noaa.swpc.kp'
      if (json["0"]) {
        /*values.push({
          path: scalesPath + "today",
          value: json[],
        })*/
      }
    })
  }

  async function getSolarWindSummary(props: any) {
    const basePath = 'environment.noaa.swpc.solar_wind'

    const metas: any = [
      {
        path: 'environment.noaa.swpc.solar_wind.speed',
        value: {
          displayName: "Solar Wind Speed",
          shortName: "SWS",
          description: "The solar wind speed; typical values are 400 km/s",
          units: "m/s",
          "timeout": 60 * 60,
        }
      },
      {
        path: 'environment.noaa.swpc.solar_wind.Bt',
        value: {
          displayName: "IMF strength (Bt)",
          shortName: "Bt",
          description: "The strength of the interplanetary magnetic field ",
          units: "nT",
          "timeout": 60 * 60,
        }
      },
      {
        path: 'environment.noaa.swpc.solar_wind.Bz',
        value: {
          displayName: "IMF orientation (Bz)",
          description: "The north-south direction of the interplanetary magnetic field",
          units: "nT north-south",
          "timeout": 60 * 60,
        }
      },
    ]
    sendMetadata(metas)

    fetchJson('/products/summary/solar-wind-speed.json', 'Solar Wind Speed')
    .then(json => {
      const path = basePath + '.speed'
      if (json["WindSpeed"]) {
        const speedInKmPerSecond = json["WindSpeed"]
        const timestamp = json['TimeStamp']
          sendUpdatedValue(path, speedInKmPerSecond * 1000, timestamp)
      }
    })

    fetchJson('/products/summary/solar-wind-mag-field.json', 'Solar Wind Magnetic Field')
    .then(json => {
      const values = [
          {path: basePath + ".Bt", value: json["Bt"] * 1},
          {path: basePath + ".Bz", value: json["Bz"] * 1},
      ]
      debug("Solar mag field values: %j", values)
      sendUpdatedValues(values, json['TimeStamp'])
    })
  }

  // parse a UTC date/time from text lines such as:
  // :Issued: 2025 Apr 08 1230 UTC
  function parseIssueDate(text: String): Date {
    const issuedLine = text.match(/\n:Issued: ([^\n]*)/)[1]
    const dateTimeRegex = /([0-9]{4} [A-Za-z]{3,9} [0-9]{1,2}) ([0-9]{2,4} UTC)/
    const datePortion = issuedLine.match(dateTimeRegex)[1]
    const timePortion = issuedLine.match(dateTimeRegex)[2].padStart(8, "0")
    const newTimeString = timePortion.slice(0, 2) + ":" + timePortion.slice(2, 4) + " UTC"
    const newDateTimeString = datePortion + " " + newTimeString
    debug("rewrote issue date/time string as: " + newDateTimeString)
    return new Date(newDateTimeString)
  }

  function getAlertLevel(messageCode: String): String {
    if (messageCode.match(/ALT/)) return "ALERT"
    if (messageCode.match(/WAR/)) return "WARNING"
    if (messageCode.match(/WAT/)) return "WATCH"
    if (messageCode.match(/SUM/)) return "SUMMARY"
    return "ALERT"
  }

  function sendMetadata(metas: any) {
    if (metas.length > 0) {
      app.handleMessage(plugin.id, {
        updates: [{ meta: metas }]
      })

      metas.forEach(meta => {
        sentMetaPaths[meta.path] = true
      })
    }
  }

  function sendUpdatedValue(path: String, value: any, timestamp: String) {
    debug("sending updated value for '%s', timestamp=%s", path, timestamp)
    sendUpdatedValues([{
      path: path,
      value: value
    }],
    timestamp)
  }

  function sendUpdatedValues(values: any[], timestamp: String) {
    app.handleMessage(plugin.id, {
      updates: [{
        values: values,
        timestamp: timestamp,
      }]
    })
  }

  return plugin
}

interface Plugin {
  start: (app: any) => void
  stop: () => void
  id: string
  name: string
  description: string
  schema: any
}