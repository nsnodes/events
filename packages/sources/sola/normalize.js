/**
 * Sola.day Event Normalization
 *
 * Transforms raw Sola.day event data (from iCal) into normalized Event schema
 */

import { generateFingerprint } from '../../core/fingerprint.js'
import { reverseGeocode } from '../../core/geocoding.js'

/**
 * Normalize a single Sola.day event to common Event schema
 * @param {Object} rawEvent - Raw event from Sola.day iCal
 * @param {string} citySlug - City slug for context
 * @param {Object} options - Normalization options
 * @param {boolean} options.skipGeocoding - Skip geocoding (reuse existing data)
 * @param {Object} options.reuseLocation - Location data to reuse {city, country}
 * @returns {Promise<Object>} Normalized event
 */
export async function normalizeEvent(rawEvent, citySlug = null, options = {}) {
  const startAt = new Date(rawEvent.startDate)
  const endAt = rawEvent.endDate ? new Date(rawEvent.endDate) : null

  let city = null
  let country = null

  // Option 1: Reuse existing location data (for unchanged events)
  if (options.skipGeocoding && options.reuseLocation) {
    city = options.reuseLocation.city
    country = options.reuseLocation.country
  }
  // Option 2: Use reverse geocoding if we have coordinates
  else if (rawEvent.geo?.lat && rawEvent.geo?.lon) {
    const geocoded = await reverseGeocode(rawEvent.geo.lat, rawEvent.geo.lon)
    city = geocoded.city
    country = geocoded.country
  }

  // Fallback to parsing if geocoding didn't work or no coordinates
  if (!city) {
    city = extractCity(rawEvent.location) || citySlug
  }
  if (!country) {
    country = extractCountry(rawEvent.location)
  }

  const normalized = {
    // Identifiers
    uid: rawEvent.uid,
    fingerprint: generateFingerprint(
      rawEvent.title,
      startAt,
      city,
      rawEvent.geo?.lat,
      rawEvent.geo?.lon
    ),

    // Source metadata
    source: 'soladay',
    sourceUrl: rawEvent.solaUrl || rawEvent.url || `https://app.sola.day/event/detail/${rawEvent.uid}`,
    sourceEventId: rawEvent.uid,

    // Core event data
    title: rawEvent.title,
    description: cleanDescription(rawEvent.description),
    startAt,
    endAt,
    timezone: null, // iCal dates are UTC, timezone not provided

    // Location
    venueName: extractVenueName(rawEvent.location),
    address: rawEvent.location,
    lat: rawEvent.geo?.lat,
    lng: rawEvent.geo?.lon,
    city,
    country,

    // Additional metadata
    organizers: rawEvent.organizer ? [{ name: rawEvent.organizer }] : [],
    tags: [],
    imageUrl: null, // Would need to be extracted from description or separate fetch
    status: mapStatus(rawEvent.status),

    // Tracking
    sequence: rawEvent.sequence || 0,
    confidence: 0.98, // High confidence - official iCal data
    raw: rawEvent,

    // Timestamps
    firstSeen: new Date(),
    lastSeen: new Date(),
    lastChecked: new Date()
  }

  return normalized
}

/**
 * Normalize batch of events from a city result
 * Optimized: Only geocodes new or updated events
 *
 * @param {Object} cityResult - Result from fetchEvents()
 * @param {Object} db - Database instance (optional, for optimization)
 * @returns {Promise<Array>} Array of normalized events
 */
export async function normalizeCityEvents(cityResult, db = null) {
  if (!cityResult.success || !cityResult.events) {
    return []
  }

  // Optimization: Check which events already exist in DB
  let existingEventsMap = new Map()
  if (db) {
    try {
      const uids = cityResult.events.map(e => e.uid)
      const existingEvents = await db.getEventsByUids(uids)
      existingEventsMap = new Map(existingEvents.map(e => [e.uid, e]))
    } catch (error) {
      console.warn('Could not fetch existing events for optimization:', error.message)
    }
  }

  // Process events sequentially to respect geocoding rate limits
  const normalized = []
  let geocodingCount = 0
  let reusedCount = 0

  for (const event of cityResult.events) {
    const existing = existingEventsMap.get(event.uid)

    // Skip geocoding if event exists and hasn't changed
    if (existing && existing.sequence === (event.sequence || 0)) {
      // Reuse existing geocoded data
      const normalizedEvent = await normalizeEvent(event, cityResult.citySlug, {
        skipGeocoding: true,
        reuseLocation: {
          city: existing.city,
          country: existing.country
        }
      })
      normalized.push(normalizedEvent)
      reusedCount++
    } else {
      // New or updated event - perform geocoding
      const normalizedEvent = await normalizeEvent(event, cityResult.citySlug)
      normalized.push(normalizedEvent)
      geocodingCount++
    }
  }

  if (db && cityResult.events.length > 0) {
    console.log(`  [geocoding] ${geocodingCount} geocoded, ${reusedCount} reused`)
  }

  return normalized
}

// Helper functions

function extractCity(location) {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

  // Handle "Online" events
  if (location.toLowerCase().includes('online')) return 'Online'

  // Try to extract city from address (naive approach)
  // Example: "Venue Name, Amsterdam, Netherlands" -> "Amsterdam"
  const parts = location.split(',').map(p => p.trim())

  if (parts.length >= 2) {
    // Assume second-to-last part is city
    return parts[parts.length - 2]
  }

  return null
}

function extractVenueName(location) {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

  // Get first part before comma
  const firstPart = location.split(',')[0].trim()
  return firstPart || null
}

function extractCountry(location) {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

  // Try to get last part (usually country)
  const parts = location.split(',').map(p => p.trim())

  if (parts.length > 1) {
    return parts[parts.length - 1]
  }

  return null
}

function cleanDescription(description) {
  if (!description) return null

  // Remove common iCal artifacts
  return description
    .replace(/Get up to date information at:.*$/gm, '')
    .trim()
}

function mapStatus(status) {
  if (!status) return 'scheduled'

  const normalized = status.toUpperCase()

  if (normalized === 'CONFIRMED') return 'scheduled'
  if (normalized === 'TENTATIVE') return 'tentative'
  if (normalized === 'CANCELLED') return 'cancelled'

  return 'scheduled'
}
