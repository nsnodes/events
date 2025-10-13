/**
 * Sola.day Event Normalization
 *
 * Transforms raw Sola.day scraped data into normalized Event schema
 */

import { generateFingerprint } from '../../core/fingerprint.js'

/**
 * Normalize a single Sola.day event to common Event schema
 * @param {Object} rawEvent - Raw event from Sola.day scraper
 * @returns {Object} Normalized event
 */
export function normalizeEvent(rawEvent) {
  // Parse date range (e.g., "Dec 10 - 15, 2025" or "Jan 5, 2025")
  const { startAt, endAt } = parseDateRange(rawEvent.dateRange, rawEvent.timeRange)

  // Extract city/country from location
  const { city, country } = parseLocation(rawEvent.location)

  const normalized = {
    // Identifiers
    uid: `sola-${rawEvent.id}`,
    fingerprint: generateFingerprint(
      rawEvent.title,
      startAt,
      city
    ),

    // Source metadata
    source: 'soladay',
    sourceUrl: rawEvent.url,
    sourceEventId: rawEvent.id,

    // Core event data
    title: rawEvent.title,
    description: rawEvent.description,
    startAt,
    endAt,
    timezone: null, // Not provided by Sola.day

    // Location
    venueName: null,
    address: rawEvent.fullAddress || rawEvent.location,
    lat: null, // Would need geocoding
    lng: null,
    city,
    country,

    // Additional metadata
    organizers: rawEvent.organizer ? [{ name: rawEvent.organizer }] : [],
    tags: rawEvent.tags || [],
    imageUrl: rawEvent.image,
    status: mapStatus(rawEvent.status),

    // Tracking
    sequence: 0, // Sola.day doesn't provide version tracking
    confidence: 0.85, // Medium-high confidence (DOM scraping, dates need parsing)
    raw: rawEvent,

    // Timestamps
    firstSeen: new Date(),
    lastSeen: new Date(),
    lastChecked: new Date()
  }

  return normalized
}

/**
 * Normalize batch of events from scraper
 * @param {Object} scrapedEvent - Result from scrapeEventDetail()
 * @returns {Object|null} Normalized event or null if failed
 */
export function normalizeScrapedEvent(scrapedEvent) {
  if (!scrapedEvent.success || !scrapedEvent.title) {
    return null
  }

  return normalizeEvent(scrapedEvent)
}

// Helper functions

/**
 * Parse Sola.day date range strings
 * Examples: "Dec 10 - 15, 2025", "Jan 5, 2025", "Dec 31, 2024 - Jan 2, 2025"
 */
function parseDateRange(dateRange, timeRange) {
  const now = new Date()
  const currentYear = now.getFullYear()

  try {
    // Simple heuristic: try to parse the date string
    // This is a naive implementation - may need refinement based on actual data

    // Default to upcoming date if parsing fails
    const defaultStart = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) // 1 week from now

    if (!dateRange) {
      return {
        startAt: defaultStart,
        endAt: null
      }
    }

    // Very basic parsing - just extract first date we can find
    // TODO: Improve this with proper date parsing library
    const months = {
      'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
      'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
    }

    // Try to match "Month Day" pattern
    const match = dateRange.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d+)/)

    if (match) {
      const month = months[match[1]]
      const day = parseInt(match[2])

      // Guess year (if month has passed this year, assume next year)
      let year = currentYear
      if (month < now.getMonth() || (month === now.getMonth() && day < now.getDate())) {
        year = currentYear + 1
      }

      const startAt = new Date(year, month, day, 12, 0, 0) // Noon as default

      return {
        startAt,
        endAt: null // TODO: Parse end date from range
      }
    }

    return {
      startAt: defaultStart,
      endAt: null
    }

  } catch (error) {
    console.warn('Failed to parse date:', dateRange, error.message)
    return {
      startAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
      endAt: null
    }
  }
}

/**
 * Parse location string to extract city/country
 */
function parseLocation(location) {
  if (!location) {
    return { city: null, country: null }
  }

  // Handle "Online" events
  if (location.toLowerCase().includes('online')) {
    return { city: 'Online', country: null }
  }

  // Try to parse "City, Country" format
  const parts = location.split(',').map(p => p.trim())

  if (parts.length >= 2) {
    return {
      city: parts[0],
      country: parts[parts.length - 1]
    }
  }

  return {
    city: location,
    country: null
  }
}

/**
 * Map Sola.day status to normalized status
 */
function mapStatus(status) {
  if (!status) return 'scheduled'

  const normalized = status.toLowerCase()

  if (normalized === 'ongoing') return 'scheduled' // Treat ongoing as scheduled
  if (normalized === 'past') return 'cancelled' // Past events marked as cancelled for filtering
  if (normalized === 'upcoming') return 'scheduled'

  return 'scheduled'
}
