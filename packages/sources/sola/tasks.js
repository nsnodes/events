/**
 * Sola.day Task Definitions
 *
 * Defines all tasks for the Sola.day (Social Layer) event source.
 * Unlike Luma, Sola.day has no iCal feeds - everything requires Playwright scraping.
 */

import * as scrapers from './scrapers/index.js'
import { normalizeScrapedEvent } from './normalize.js'

export default [
  /**
   * Task: Sync events (streaming)
   * Frequency: Every 10 minutes (or 30 minutes - adjust as needed)
   * Method: Playwright scraping (3-tier: discover → groups → events)
   *
   * Note: This is slower than Luma's HTTP-based sync due to Playwright overhead
   */
  {
    id: 'sola:events',
    cron: '*/10 * * * *',
    description: 'Scrape all events from Sola.day using Playwright',

    async *extractStream() {
      console.log('[sola:events] Starting event scrape (streaming)...')

      let processedEvents = 0
      let successfulEvents = 0
      let failedEvents = 0

      try {
        for await (const rawEvent of scrapers.scrapeAllEvents({
          headless: true,
          concurrency: 3,
          includePast: false // Skip past events
        })) {
          processedEvents++

          if (rawEvent.success && rawEvent.title) {
            const normalized = normalizeScrapedEvent(rawEvent)

            if (normalized) {
              successfulEvents++
              console.log(
                `[sola:events] ${normalized.title.substring(0, 50)} - ` +
                `${normalized.city || 'Unknown'} (${processedEvents} processed)`
              )

              // Yield as single-item array (batch of 1)
              yield [normalized]
            } else {
              failedEvents++
            }
          } else {
            failedEvents++
            console.error(
              `[sola:events] Failed to scrape event: ${rawEvent.error || 'Unknown error'} ` +
              `(${processedEvents} processed)`
            )
          }
        }

        console.log(
          `[sola:events] Complete: ${successfulEvents} events, ` +
          `${failedEvents} failures (${processedEvents} total processed)`
        )

      } catch (error) {
        console.error(`[sola:events] Fatal error: ${error.message}`)
        throw error
      }
    }
  }
]
