/**
 * Luma Task Definitions
 *
 * Defines all tasks for the Luma event source with their schedules
 * and execution logic. Tasks are discovered and run by the orchestrator.
 */

import * as scrapers from './scrapers/index.js'
import { normalizeCityEvents } from './normalize.js'
import config from '../../../config.js'
import fs from 'fs'
import path from 'path'

interface TaskResult {
  skipped?: boolean;
  reason?: string;
  totalCities?: number;
  totalRegions?: number;
  entityType?: string;
  totalEntities?: number;
  withIcalUrl?: number;
  withoutIcalUrl?: number;
}

interface Task {
  id: string;
  schedule: 'daily' | 'weekly' | 'polling';
  description: string;
  run?: () => Promise<TaskResult>;
  extractStream?: (db: any) => AsyncGenerator<any[], void, unknown>;
}

const tasks: Task[] = [
  /**
   * Task: Discover cities
   * Frequency: Daily (detect new cities being added)
   * Method: Playwright scraping
   * Note: Disabled by default - check config.js to enable
   */
  {
    id: 'luma:cities',
    schedule: 'daily',
    description: 'Discover all cities available on Luma (disabled by default)',

    async run(): Promise<TaskResult> {
      if (!config.luma.cities_enabled) {
        console.log('[luma:cities] Skipping - cities_enabled=false in config.js')
        return { skipped: true, reason: 'cities_enabled=false' }
      }

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
   * Note: Uses either cities or handles based on config.js
   */
  {
    id: 'luma:ical-urls',
    schedule: 'weekly',
    description: 'Extract iCal subscription URLs for configured entities (handles or cities)',

    async run(): Promise<TaskResult> {
      console.log('[luma:ical-urls] Starting iCal URL extraction...')

      let entities: any[]
      let entityType: string

      // Use handles if cities are disabled
      if (!config.luma.cities_enabled && config.luma.handles.length > 0) {
        console.log('[luma:ical-urls] Using user handles from config')
        entityType = 'handles'

        // Load handles from data file
        const handlesPath = path.join(process.cwd(), 'packages/sources/luma/data/handles.json')
        const handlesData = JSON.parse(fs.readFileSync(handlesPath, 'utf8'))
        entities = handlesData.handles

        console.log(`[luma:ical-urls] Loaded ${entities.length} handles: ${entities.map((h: any) => h.slug).join(', ')}`)
      } else if (config.luma.cities_enabled) {
        console.log('[luma:ical-urls] Using cities from data file')
        entityType = 'cities'
        const cities = scrapers.getCities()
        entities = cities.cities
        console.log(`[luma:ical-urls] Loaded ${entities.length} cities`)
      } else {
        console.log('[luma:ical-urls] No entities configured - skipping')
        return { skipped: true, reason: 'No cities or handles enabled in config' }
      }

      const data = await scrapers.scrapeIcalUrls(entities, { headless: true })

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

      scrapers.saveIcalUrls(data, entityType)

      console.log(`[luma:ical-urls] Saved ${data.withIcalUrl} iCal URLs for ${entityType}`)

      // Validate results - fail if success rate is too low
      const successRate = data.withIcalUrl / data.totalEntities
      const MIN_SUCCESS_RATE = 0.5

      if (data.withIcalUrl === 0) {
        throw new Error(
          `Zero iCal URLs found! Scraping is completely broken. ` +
          `Existing URLs have been preserved.`
        )
      }

      if (successRate < MIN_SUCCESS_RATE) {
        throw new Error(
          `Only ${data.withIcalUrl}/${data.totalEntities} iCal URLs found (${Math.round(successRate * 100)}%). ` +
          `This is below the ${MIN_SUCCESS_RATE * 100}% threshold - Luma may have changed their UI. ` +
          `Existing URLs have been preserved.`
        )
      }

      return {
        entityType,
        totalEntities: data.totalEntities,
        withIcalUrl: data.withIcalUrl,
        withoutIcalUrl: data.withoutIcalUrl
      }
    }
  },

  /**
   * Task: Sync events (streaming)
   * Frequency: Polling (every 10 minutes)
   * Method: HTTP fetch from iCal feeds
   * Returns: Async generator yielding normalized events
   * Note: Uses iCal URLs from whatever entities are configured (handles or cities)
   */
  {
    id: 'luma:events',
    schedule: 'polling',
    description: 'Fetch events from all configured entity iCal feeds (handles or cities)',

    async *extractStream(db: any): AsyncGenerator<any[], void, unknown> {
      console.log('[luma:events] Starting event sync (streaming)...')

      // Get full iCal data with entity type metadata
      const icalData = scrapers.getIcalData()
      const icalUrls = scrapers.getIcalUrls()
      const entityCount = Object.keys(icalUrls).length
      const entityType = icalData.entityType === 'handles' ? 'handle' : 'city'

      console.log(`[luma:events] Fetching events from ${entityCount} ${icalData.entityType}...`)

      let processedEntities = 0
      let successfulEntities = 0
      let totalEvents = 0

      for await (const entityResult of scrapers.fetchAllCityEventsStreaming(icalUrls)) {
        processedEntities++
        console.log(`[luma:events] Processing ${entityResult.citySlug}...`)

        if (entityResult.success) {
          successfulEntities++
          console.log(`[luma:events]   Fetched ${entityResult.eventCount} events, normalizing...`)
          const normalized = await normalizeCityEvents(entityResult, db, entityType as 'city' | 'handle')
          totalEvents += normalized.length

          console.log(
            `[luma:events] ${entityResult.citySlug}: ${normalized.length} events ` +
            `(${processedEntities}/${entityCount})`
          )

          yield normalized
        } else {
          console.error(
            `[luma:events] ${entityResult.citySlug}: FAILED - ${entityResult.error} ` +
            `(${processedEntities}/${entityCount})`
          )
        }
      }

      console.log(`[luma:events] Complete: ${totalEvents} events from ${entityCount} ${icalData.entityType}`)

      // Validate results - fail if too many feeds are broken
      const successRate = successfulEntities / entityCount
      const MIN_SUCCESS_RATE = 0.5

      if (successfulEntities === 0) {
        throw new Error(
          `Zero iCal feeds succeeded! All ${entityCount} feeds failed. ` +
          `iCal URLs may be stale or Luma API may be down.`
        )
      }

      if (successRate < MIN_SUCCESS_RATE) {
        throw new Error(
          `Only ${successfulEntities}/${entityCount} iCal feeds succeeded (${Math.round(successRate * 100)}%). ` +
          `This is below the ${MIN_SUCCESS_RATE * 100}% threshold - iCal URLs may need updating.`
        )
      }
    }
  }
]

export default tasks
