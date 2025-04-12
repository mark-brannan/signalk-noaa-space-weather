/**
 * TK
 */
import fetch from 'node-fetch'
import { Response } from 'node-fetch'

const API = 'https://services.swpc.noaa.gov'
const USER_AGENT = 'signalk-noaa-space-weather'
const observationsKey = 'environment.observations.noaa.swpc.'
const forecastKey = 'environment.forecast.noaa.swpc.'

// Useful links:
// https://services.swpc.noaa.gov/products/noaa-scales.json
// https://www.spaceweather.gov/noaa-scales-explanation

// https://services.swpc.noaa.gov/text/advisory-outlook.txt
// https://services.swpc.noaa.gov/products/alerts.json

// https://services.swpc.noaa.gov/text/current-space-weather-indices.txt
// https://services.swpc.noaa.gov/text/3-day-forecast.txt
// https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json

// https://services.swpc.noaa.gov/images/swx-overview-small.gif
// https://services.swpc.noaa.gov/images/notifications-timeline.png

export default function (app: any) {
  const error = app.error
  const debug = app.debug
  let timers: any = []
  let sentMetaPaths: any = {}
  let hardStationName: string
  let defaultMethod: string[]

  const plugin: Plugin = {
    start: function (props: any) {

      setTimeout(() => { getObservationsAndForecasts(props) }, 5000)
      timers.push(
        setInterval(() => {
          getObservationsAndForecasts(props)
        }, (props.observationsInterval|| 60) * 1000) // TODO: 60 * 60
      )

      if (props.sendAdvisoryOutlook) {
        setTimeout(() => { sendAdvisoryOutlook(props) }, 5000)
        timers.push(
          setInterval(() => {
            sendAdvisoryOutlook(props)
          }, (props.notificationsInterval || 60 * 60) * 1000)
        )
      }

      if (props.sendAlertsWatchesWarnings) {
        setTimeout(() => { sendAlertsWatchesWarnings(props) }, 5000)
        timers.push(
          setInterval(() => {
            sendAlertsWatchesWarnings(props)
          }, (props.notificationsInterval || 60) * 1000) // TODO: 60 * 60
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
          title: 'Send notifications for weekly "Advisory Outlook"',
          default: true
        },
        sendAlertsWatchesWarnings: {
          type: 'boolean',
          title: 'Send notifications for alerts, watches, and warnings"',
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
        observationsInterval: {
          type: 'number',
          title: 'Interval for observations and forecasts',
          description: 'in seconds',
          default: 60
        },
        notificationsInterval: {
          type: 'number',
          title: 'Notifications Interval',
          description: 'in seconds',
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
    return fetch(API + subPath, {
      method: "GET",
      headers: { 'User-Agent': USER_AGENT }
    }).then(response => {
      if (response.ok) {
        return dataCallbackFn(response)
      } else {
        const status = `No NOAA Space Weather '${productName}' found!`
        app.setPluginError(status)
        throw new Error(status)
      }
    }).then(data => {
      const status = `NOAA Space Weather ${productName} retrieved: ${new Date()}`
      return data
    }).catch(error => {
      error(`Failed to fetch '${productName}': ${error}`)
      throw error
    })
  }

  async function sendAdvisoryOutlook(props: any) {

    const advisoryBasePath = "notifications.noaa.swpc.advisory_outlook"
    const idPrefix = "space_weather_advisory_outlook"

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
        state: 'alert',
        method: 'normal'
      }
      currentAdvisory = notif
      handleMessageUpdates(path, notif)

      //app.debug('Sending %j', notif)
      if (!existing || existing.state === 'normal') {
        app.debug('Sending %s: %s', id, message)
      }

      const existingAdvisories = app.getSelfPath(advisoryBasePath)
      if (existingAdvisories) {
        //app.debug('existingAdvisories: %j', existingAdvisories)
        Object.values(existingAdvisories).forEach(
        (advisory: any) => {
          const shortId = advisory.value.id.slice(idPrefix.length)
          if (currentAdvisory.id != advisory.value.id &&
            advisory.value.state !== 'normal') {
            app.debug("Clearing " + advisory.value.id)
            handleMessageUpdates(
              advisoryBasePath + "." + shortId,
              { ...advisory.value, state: 'normal' })
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
        debug("handling alert: %j", alert)
        const issued = new Date(alert.issue_datetime + "Z")
        const serialNumber  = alert.message.match(/Serial Number: ([0-9]*)/)[1]
        const messageCode = alert.message.match(/Space Weather Message Code: ([A-Z0-9]*)/)[1]
        const alertLevel = getAlertLevel(messageCode)
        const state = alertLevel === "WARNING" ? "warn" :
          alertLevel === "ALERT" ? "alert" :
          "normal"

        // 5th line, could start with 'WARNING:', 'EXTENDED WARNING:', 'CONTINUED ALERT:', etc.
        const mainMessageRegex = /([^\n]*\n)([^\n]*\n)([^\n]*\n)([^\n]*\n)([A-Z ]*:[^\n]*)/
        const mainMessage = alert.message.match(mainMessageRegex)[5]
        const id = basePath + ".sn:" + serialNumber
        const path = id
        const method = defaultMethod

        const notif = {
          id: id,
          issued: issued.toISOString(),
          message: mainMessage,
          description: alert.message,
          alertLevel: alertLevel,
          state: state,
          method: method
        }
        app.debug('Sending %j', notif)
        handleMessageUpdates(path, notif)
      })
    })
  }

  async function getObservationsAndForecasts(props: any) {
    getScales(props)
    getPlanetaryKIndexForecast(props)
    getSolarWindSpeed(props)
  }

  async function getScales (props: any) {
    fetchJson('/products/noaa-scales.json', 'Scales').then(json => {
      const values: any = []
      const metas: any = []

      const scalesPath = 'environment.noaa.space_weather.scales.'
      /*if (json["0"]) {
        values.push({
          path: scalesPath + "today",
          value: json[],
        })
      }*/
    })
    /*
      .catch((err: any) => {
        app.error(err)
        app.setPluginError(err.message)
      })*/
  }

  async function getPlanetaryKIndexForecast (props: any) {
    fetchJson('/products/noaa-planetary-k-index-forecast.json', 'Planetary K-index Forecast')
    .then(json => {
      const values: any = []
      const metas: any = []

      const scalesPath = 'environment.noaa.space_weather.kp-forecast'
      if (json["0"]) {
        /*values.push({
          path: scalesPath + "today",
          value: json[],
        })*/
      }
    })
  }

  async function getSolarWindSpeed(props: any) {
  // TODO: maybe include or combine with strength and orientation of the IMF:
  // https://services.swpc.noaa.gov/products/summary/solar-wind-mag-field.json
    fetchJson('/products/summary/solar-wind-speed.json', 'Solar Wind Speed')
    .then(json => {
      const values: any = []
      const metas: any = []
      const path = 'environment.noaa.space_weather.SolarWindSpeed'
      if (json["WindSpeed"]) {
        const speedInKmPerSecond = json["WindSpeed"]
        values.push({
          path: path, value: speedInKmPerSecond * 1000
        })
      }
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

  function handleMessageUpdates(path: String, value: any) {
      app.handleMessage(plugin.id, {
        updates: [
          {
            values: [
              {
                path,
                value: value
              }
            ]
          }
        ]
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
