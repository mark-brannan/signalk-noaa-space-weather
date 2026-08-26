/**
 * https://services.swpc.noaa.gov/text/drap_global_frequencies.txt
 *
 * NOAA's D-RAP model as a global grid of the highest frequency currently
 * degraded by >=1dB (the "band is dead" threshold). Two readers, from one
 * fetch: the number at the vessel's own position, published on a path the
 * way every other product here publishes one, and the whole grid, cached to
 * disk for the absorption map and the tile route (src/cache/drapCache.ts).
 *
 * The grid is the more useful half. A cutoff at the boat says which bands are
 * absorbed *here*; only the grid says whether the far end of the path is
 * under a blackout, which is the question anyone raising a net, a shore
 * contact or Winlink is actually asking.
 */
import { writeDrapCache } from '../cache/drapCache.js'
import { DRAP_BASE } from '../paths.js'
import {
  drapFrequencyAt,
  parseDrapGrid,
  zoneMethods,
  zonesForDrap
} from '../parse.js'
import { Meta } from '../publisher.js'
import { vesselPosition } from './aurora.js'
import { Product } from './types.js'

const MHZ_TO_HZ = 1e6

export const drap: Product = {
  name: 'D-RAP',
  intervalMinutes: (settings) => settings.updateInterval,
  enabled: (settings) => settings.drapEnabled,

  metadata(): Meta[] {
    return [
      {
        path: `${DRAP_BASE}.highest_affected_frequency`,
        value: {
          ...zoneMethods(),
          displayName: 'D-RAP highest affected frequency',
          shortName: 'D-RAP',
          description:
            'Highest HF frequency degraded by 1dB or more of D-region' +
            " absorption at the vessel's position, from NOAA's D-RAP model." +
            ' A value of 0 means no degradation is predicted here.',
          units: 'Hz',
          timeout: 60 * 60,
          // Published even though the webapp draws the band strip from the
          // raw number instead: a zone ladder on a path is what Freeboard,
          // Grafana, another plugin or a script reads, none of which have
          // this plugin's tile. zonesForDrap carries why it buckets by band
          // and why it stays quiet.
          zones: zonesForDrap()
        }
      },
      {
        path: `${DRAP_BASE}.validTime`,
        value: {
          displayName: 'D-RAP valid time',
          description:
            'Time the D-RAP grid this reading came from is valid for',
          timeout: 60 * 60
        }
      }
    ]
  },

  async refresh({ client, publisher, stopped }) {
    // No position gate, unlike aurora.ts. That gate is there so a metered
    // link is not spent on a ~900 KB grid nothing can be read out of yet;
    // this payload is a hundredth of the size, and it is not read out of at
    // a point any more -- the map draws the whole grid, and a boat with no
    // fix yet is exactly when somebody is looking at the map to decide
    // whether the radio is worth switching on.
    const text = await client.text('/text/drap_global_frequencies.txt', 'D-RAP')
    if (stopped()) return

    const grid = parseDrapGrid(text)
    if (!grid) {
      publisher.error('D-RAP payload contained no usable grid')
      return
    }

    // Cache the grid for the map and the tile route. Best effort: a disk
    // write failing here must not stop the value below from publishing, the
    // same rule aurora.ts applies to its own cache.
    try {
      writeDrapCache(publisher.dataDirPath(), grid)
    } catch (err) {
      publisher.error(`Failed to cache the D-RAP grid: ${err}`)
    }

    // The grid is cached either way; only the vessel's own cell needs a fix.
    const position = vesselPosition(publisher)
    if (!position) {
      publisher.debug('No vessel position yet; D-RAP cached but not published')
      return
    }

    const frequencyMHz = drapFrequencyAt(
      grid,
      position.latitude,
      position.longitude
    )
    if (frequencyMHz === null) {
      publisher.error(
        'Could not resolve a D-RAP frequency for position %j',
        position
      )
      return
    }

    // A boat sitting in one spot commonly reads the same grid cell across
    // several polls even while the wider grid keeps moving (the grid itself
    // changes fast -- docs/noaa-products.md -- but one cell need not).
    // Skip the republish rather than re-broadcasting an unmoved reading to
    // every connected client, the same rule aIndex.ts and sunspot.ts apply.
    const frequencyHz = frequencyMHz * MHZ_TO_HZ
    const publishedFrequency = publisher.selfPath(
      `${DRAP_BASE}.highest_affected_frequency.value`
    )
    const publishedValidTime = publisher.selfPath(
      `${DRAP_BASE}.validTime.value`
    )
    if (
      publishedFrequency === frequencyHz &&
      publishedValidTime === grid.validTime
    ) {
      return
    }

    publisher.debug(
      'D-RAP %s MHz at %s, %s',
      frequencyMHz,
      position.latitude,
      position.longitude
    )

    publisher.values(
      [
        { path: `${DRAP_BASE}.highest_affected_frequency`, value: frequencyHz },
        { path: `${DRAP_BASE}.validTime`, value: grid.validTime }
      ],
      grid.validTime
    )
  }
}
