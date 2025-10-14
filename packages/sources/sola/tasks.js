/**
 * Sola.day Task Definitions
 *
 * Four-tier task system for Sola.day (matching Luma's architecture)
 */

import * as scrapers from './scrapers/index.js'
import { normalizeCityEvents, normalizePopupCities } from './normalize.js'
import config from '../../../config.js'

export default [
  /**
   * Task: Discover popup cities
   * Frequency: Daily
   * Method: Playwright scraping
   */
  {
    id: 'sola:cities',
    schedule: 'daily',
    description: 'Discover all popup cities on Sola.day',

    async run() {
      console.log('[sola:cities] Starting city discovery...')

      const data = await scrapers.scrapePopupCities({ headless: true })

      // Check for changes
      try {
        const oldData = scrapers.getCities()
        const diff = scrapers.compareCities(oldData, data)

        if (diff.hasChanges) {
          console.log(`[sola:cities] Changes detected: ${diff.summary}`)
          console.log(`  Added: ${diff.added.map(c => c.slug).join(', ')}`)
          console.log(`  Removed: ${diff.removed.map(c => c.slug).join(', ')}`)
        } else {
          console.log('[sola:cities] No changes detected')
        }
      } catch (error) {
        console.log('[sola:cities] First run - no previous data to compare')
      }

      scrapers.saveCities(data)

      console.log(`[sola:cities] Saved ${data.totalCities} cities`)

      return {
        totalCities: data.totalCities
      }
    }
  },

  /**
   * Task: Extract iCal URLs
   * Frequency: Weekly
   * Method: Playwright scraping (clicks subscribe buttons)
   * Only runs when cities_events_enabled is true
   */
  {
    id: 'sola:ical-urls',
    schedule: 'weekly',
    description: 'Extract iCal subscription URLs for all popup cities',
    enabled: () => config.sola?.cities_events_enabled === true,

    async run() {
      console.log('[sola:ical-urls] Starting iCal URL extraction...')

      const cities = scrapers.getCities()
      const data = await scrapers.scrapeIcalUrls(cities.cities, { headless: true })

      // Check for changes
      try {
        const oldUrls = scrapers.getIcalUrls()
        const diff = scrapers.compareIcalUrls(oldUrls, data)

        if (diff.hasChanges) {
          console.log(`[sola:ical-urls] Changes detected:`)
          console.log(`  Changed: ${diff.changed.length} URLs`)
          console.log(`  Added: ${diff.added.length} URLs`)
          console.log(`  Removed: ${diff.removed.length} URLs`)
        } else {
          console.log('[sola:ical-urls] No changes detected')
        }
      } catch (error) {
        console.log('[sola:ical-urls] First run - no previous data to compare')
      }

      scrapers.saveIcalUrls(data)

      console.log(`[sola:ical-urls] Saved ${data.withIcalUrl} iCal URLs`)

      return {
        totalCities: data.totalCities,
        withIcalUrl: data.withIcalUrl,
        withoutIcalUrl: data.withoutIcalUrl
      }
    }
  },

  /**
   * Task: Sync popup cities as events (streaming)
   * Frequency: Daily
   * Method: Playwright scraping for city details (no RSS feed for cities)
   * Returns: Async generator yielding normalized popup city events
   */
  {
    id: 'sola:popup-cities',
    schedule: 'daily',
    description: 'Scrape popup city details and normalize as events',
    enabled: () => config.sola?.cities_enabled === true,

    async *extractStream(db) {
      console.log('[sola:popup-cities] Starting popup city sync (streaming)...')

      const citiesData = scrapers.getCities()
      const cityCount = citiesData.cities.length

      console.log(`[sola:popup-cities] Scraping details for ${cityCount} cities...`)

      const cityDetailsResult = await scrapers.scrapeCityDetails(citiesData.cities, { headless: true })

      // Check for changes
      try {
        const oldDetails = scrapers.getCityDetails()
        const diff = scrapers.compareCityDetails(oldDetails, cityDetailsResult)

        if (diff.hasChanges) {
          console.log(`[sola:popup-cities] Changes detected: ${diff.summary}`)
        } else {
          console.log('[sola:popup-cities] No changes detected')
        }
      } catch (error) {
        console.log('[sola:popup-cities] First run - no previous data to compare')
      }

      scrapers.saveCityDetails(cityDetailsResult)

      // Normalize cities as events
      const normalized = await normalizePopupCities(cityDetailsResult)

      console.log(`[sola:popup-cities] Complete: ${normalized.length} popup cities normalized as events`)

      // Yield all normalized city events in a single batch
      yield normalized
    }
  },

  /**
   * Task: Sync events (streaming)
   * Frequency: Polling (every 10 minutes)
   * Method: HTTP fetch from iCal feeds
   * Returns: Async generator yielding normalized events
   * Only runs when cities_events_enabled is true
   */
  {
    id: 'sola:events',
    schedule: 'polling',
    description: 'Fetch events from all popup city iCal feeds',
    enabled: () => config.sola?.cities_events_enabled === true,

    async *extractStream(db) {
      console.log('[sola:events] Starting event sync (streaming)...')

      const icalUrls = scrapers.getIcalUrls()
      const cityCount = Object.keys(icalUrls).length

      console.log(`[sola:events] Fetching events from ${cityCount} cities...`)

      let processedCities = 0
      let totalEvents = 0

      for await (const cityResult of scrapers.fetchAllCityEventsStreaming(icalUrls)) {
        processedCities++

        if (cityResult.success) {
          const normalized = await normalizeCityEvents(cityResult, db)
          totalEvents += normalized.length

          console.log(
            `[sola:events] ${cityResult.citySlug}: ${normalized.length} events ` +
            `(${processedCities}/${cityCount})`
          )

          yield normalized
        } else {
          console.error(
            `[sola:events] ${cityResult.citySlug}: FAILED - ${cityResult.error} ` +
            `(${processedCities}/${cityCount})`
          )
        }
      }

      console.log(`[sola:events] Complete: ${totalEvents} events from ${cityCount} cities`)
    }
  }
]
