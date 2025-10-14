/**
 * Luma Task Definitions
 *
 * Defines all tasks for the Luma event source with their schedules
 * and execution logic. Tasks are discovered and run by the orchestrator.
 */

import * as scrapers from './scrapers/index.js'
import { normalizeCityEvents } from './normalize.js'

export default [
  /**
   * Task: Discover cities
   * Frequency: Daily (detect new cities being added)
   * Method: Playwright scraping
   */
  {
    id: 'luma:cities',
    cron: '0 0 * * *',
    description: 'Discover all cities available on Luma',

    async run() {
      console.log('[luma:cities] Starting city discovery...')

      const data = await scrapers.scrapeCities({ headless: true })

      // Check for changes
      try {
        const oldData = scrapers.getCities()
        const diff = scrapers.compareCities(oldData, data)

        if (diff.hasChanges) {
          console.log(`[luma:cities] Changes detected:`)
          console.log(`  Added: ${diff.added.length} cities`)
          console.log(`  Removed: ${diff.removed.length} cities`)
          console.log(`  Updated: ${diff.updated.length} cities`)
        } else {
          console.log('[luma:cities] No changes detected')
        }
      } catch (error) {
        // First run - no previous data
        console.log('[luma:cities] First run - no previous data to compare')
      }

      scrapers.saveCities(data)

      console.log(`[luma:cities] Saved ${data.totalCities} cities`)

      return {
        totalCities: data.totalCities,
        totalRegions: data.totalRegions
      }
    }
  },

  /**
   * Task: Update iCal URLs
   * Frequency: Weekly (iCal endpoints rarely change)
   * Method: Playwright scraping (clicks subscribe buttons)
   */
  {
    id: 'luma:ical-urls',
    cron: '0 0 * * 0',
    description: 'Extract iCal subscription URLs for all cities',

    async run() {
      console.log('[luma:ical-urls] Starting iCal URL extraction...')

      const cities = scrapers.getCities()
      const data = await scrapers.scrapeIcalUrls(cities.cities, { headless: true })

      // Check for changes
      try {
        const oldUrls = scrapers.getIcalUrls()
        const diff = scrapers.compareIcalUrls(oldUrls, data)

        if (diff.hasChanges) {
          console.log(`[luma:ical-urls] Changes detected:`)
          console.log(`  Changed: ${diff.changed.length} URLs`)
          console.log(`  Added: ${diff.added.length} URLs`)
          console.log(`  Removed: ${diff.removed.length} URLs`)
        } else {
          console.log('[luma:ical-urls] No changes detected')
        }
      } catch (error) {
        // First run - no previous data
        console.log('[luma:ical-urls] First run - no previous data to compare')
      }

      scrapers.saveIcalUrls(data)

      console.log(`[luma:ical-urls] Saved ${data.withIcalUrl} iCal URLs`)

      return {
        totalCities: data.totalCities,
        withIcalUrl: data.withIcalUrl,
        withoutIcalUrl: data.withoutIcalUrl
      }
    }
  },

  /**
   * Task: Sync events (streaming)
   * Frequency: Every 10 minutes (high-frequency polling)
   * Method: HTTP fetch from iCal feeds
   * Returns: Async generator yielding normalized events
   */
  {
    id: 'luma:events',
    cron: '*/10 * * * *',
    description: 'Fetch events from all city iCal feeds',

    async *extractStream(db) {
      console.log('[luma:events] Starting event sync (streaming)...')

      const icalUrls = scrapers.getIcalUrls()
      const cityCount = Object.keys(icalUrls).length

      console.log(`[luma:events] Fetching events from ${cityCount} cities...`)

      let processedCities = 0
      let totalEvents = 0

      for await (const cityResult of scrapers.fetchAllCityEventsStreaming(icalUrls)) {
        processedCities++
        console.log(`[luma:events] Processing ${cityResult.citySlug}...`)

        if (cityResult.success) {
          console.log(`[luma:events]   Fetched ${cityResult.eventCount} events, normalizing...`)
          const normalized = await normalizeCityEvents(cityResult, db)
          totalEvents += normalized.length

          console.log(
            `[luma:events] ${cityResult.citySlug}: ${normalized.length} events ` +
            `(${processedCities}/${cityCount})`
          )

          yield normalized
        } else {
          console.error(
            `[luma:events] ${cityResult.citySlug}: FAILED - ${cityResult.error} ` +
            `(${processedCities}/${cityCount})`
          )
        }
      }

      console.log(`[luma:events] Complete: ${totalEvents} events from ${cityCount} cities`)
    }
  }
]
