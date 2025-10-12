/**
 * Luma iCal client
 * Fetches and parses iCal feeds from Luma city pages
 */

import type { Event, SyncResult } from '../../core/types.js'
import { parseIcal } from './parser.js'
import cities from './cities.json' assert { type: 'json' }

export interface LumaCity {
  slug: string
  name: string
  country?: string
  icalUrl?: string
}

/**
 * Discover iCal URL for a city by fetching its page
 * TODO: Implement HTML parsing to extract iCal subscription link
 */
async function discoverIcalUrl(citySlug: string): Promise<string | null> {
  // Implementation needed:
  // 1. Fetch https://luma.com/{citySlug}
  // 2. Look for iCal subscription link (likely in <link> tag or button)
  // 3. Extract discplace-XXXXX ID
  // 4. Return full iCal URL

  console.warn(`discoverIcalUrl not implemented yet for ${citySlug}`)
  return null
}

/**
 * Fetch and parse iCal feed
 */
async function fetchIcal(url: string): Promise<Event[]> {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to fetch iCal: ${response.statusText}`)
  }

  const icalData = await response.text()
  return parseIcal(icalData)
}

/**
 * Sync all events from Luma
 */
export async function syncLuma(): Promise<SyncResult> {
  const startTime = Date.now()
  const result: SyncResult = {
    source: 'luma',
    eventsProcessed: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    errors: [],
    duration: 0
  }

  try {
    const citiesToSync = cities.cities as LumaCity[]

    for (const city of citiesToSync) {
      try {
        // Get iCal URL (either from config or discover it)
        const icalUrl = city.icalUrl || await discoverIcalUrl(city.slug)

        if (!icalUrl) {
          result.errors.push(`No iCal URL for ${city.name}`)
          continue
        }

        console.log(`Fetching events for ${city.name}...`)
        const events = await fetchIcal(icalUrl)

        result.eventsProcessed += events.length

        // TODO: Upsert to database
        // const db = createDatabase()
        // await db.upsertEvents(events)

        console.log(`✓ ${city.name}: ${events.length} events`)
      } catch (error) {
        const errorMsg = `${city.name}: ${error instanceof Error ? error.message : String(error)}`
        result.errors.push(errorMsg)
        console.error(`✗ ${errorMsg}`)
      }
    }
  } catch (error) {
    result.errors.push(`Fatal error: ${error instanceof Error ? error.message : String(error)}`)
  }

  result.duration = Date.now() - startTime
  return result
}
