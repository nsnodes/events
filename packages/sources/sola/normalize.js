/**
 * Sola.day Event Normalization
 *
 * Transforms raw Sola.day data into normalized Event schema:
 * - Popup cities (from city-details scraper) -> events
 * - Events within cities (from iCal feeds) -> events
 */

import { generateFingerprint } from '../../core/fingerprint.ts'
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
  let timezone = null

  // Option 1: Reuse existing location data (for unchanged events)
  if (options.skipGeocoding && options.reuseLocation) {
    city = options.reuseLocation.city
    country = options.reuseLocation.country
    timezone = options.reuseLocation.timezone
  }
  // Option 2: Use reverse geocoding if we have coordinates
  else if (rawEvent.geo?.lat && rawEvent.geo?.lon) {
    const geocoded = await reverseGeocode(rawEvent.geo.lat, rawEvent.geo.lon)
    city = geocoded.city
    country = geocoded.country
    timezone = geocoded.timezone
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
    timezone, // From geocoding or null

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

    // Generate fingerprint for this event to detect real changes
    // Fingerprint is based on: title, startAt, city, coordinates
    const startAt = new Date(event.startDate)
    const tempCity = event.geo?.lat && event.geo?.lon ?
      (existing?.city || cityResult.citySlug) : cityResult.citySlug

    const eventFingerprint = generateFingerprint(
      event.title,
      startAt,
      tempCity,
      event.geo?.lat,
      event.geo?.lon
    )

    // Skip geocoding if event exists and fingerprint hasn't changed
    if (existing && existing.fingerprint === eventFingerprint) {
      // Reuse existing geocoded data - event hasn't actually changed
      const normalizedEvent = await normalizeEvent(event, cityResult.citySlug, {
        skipGeocoding: true,
        reuseLocation: {
          city: existing.city,
          country: existing.country,
          timezone: existing.timezone
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

  // Skip internal room references - they don't have valid country data
  if (isInternalRoomReference(location)) return null

  // Try to get last part (usually country)
  const parts = location.split(',').map(p => p.trim())

  if (parts.length > 1) {
    const lastPart = parts[parts.length - 1]

    // Basic validation: if the last part has a postal code, extract country name
    // e.g., "Singapore 059191" -> "Singapore"
    const postalCodePattern = /\b\d{5,6}(-\d{4})?\b/
    if (postalCodePattern.test(lastPart)) {
      const countryName = lastPart.replace(postalCodePattern, '').trim()
      if (countryName) return countryName
    }

    return lastPart
  }

  return null
}

/**
 * Detect if a location string is an internal room reference (not a real address)
 * @private
 */
function isInternalRoomReference(location) {
  if (!location) return false

  const parts = location.split(',').map(p => p.trim())

  // Check for postal codes (various formats) - indicates real address
  // US: 12345 or 12345-6789
  // Singapore: 6 digits
  // Canada: A1A 1A1
  // UK: SW1A 1AA
  if (/\b\d{5,6}(-\d{4})?\b|\b[A-Z]\d[A-Z]\s?\d[A-Z]\d\b|\b[A-Z]{1,2}\d{1,2}\s?\d[A-Z]{2}\b/i.test(location)) {
    return false // Has postal code = real address
  }

  // Check for street address indicators - indicates real address
  const streetIndicators = /\b(street|st|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|jalan|jln)\b/i
  if (streetIndicators.test(location)) return false

  // Check for obvious internal room patterns
  const internalRoomKeywords = /\b(room|floor|corridor|suite|vip|ping pong|karaoke|conference|lift|elevator|alleyway|beach shack|volleyball|library|opposite|branching|near the)\b/i

  // If it has internal keywords and no street indicators or postal codes, it's likely internal
  if (internalRoomKeywords.test(location)) {
    // Exception: If it's a long multi-part address with geographic indicators, might be real
    const geoIndicators = /\b(city|state|province|country|region|district)\b/i
    if (parts.length >= 4 && geoIndicators.test(location)) {
      return false // Long address with geographic terms = likely real
    }

    // Otherwise, internal keywords = internal room
    return true
  }

  // Hotel/building names alone (without more context) are likely internal
  const buildingIndicators = /\b(hotel|resort|mall|center|centre|plaza|tower|building)\b/i
  if (buildingIndicators.test(location) && parts.length < 3) {
    return true
  }

  // If short and single-part, likely internal
  if (parts.length === 1 && location.length < 30) return true

  // Default to internal for 2-part short strings
  if (parts.length <= 2 && location.length < 80) return true

  return false
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

/**
 * Normalize a popup city to common Event schema
 * @param {Object} cityDetail - City detail from scrapeCityDetail()
 * @param {Object} options - Normalization options
 * @returns {Promise<Object>} Normalized event
 */
export async function normalizePopupCity(cityDetail, options = {}) {
  if (!cityDetail.success) return null

  const startAt = cityDetail.startDate ? new Date(cityDetail.startDate) : null
  const endAt = cityDetail.endDate ? new Date(cityDetail.endDate) : null

  if (!startAt) {
    console.warn(`[normalize] Skipping city ${cityDetail.citySlug} - missing start date`)
    return null
  }

  // Don't parse location/country from inconsistent text - leave as null
  const city = null
  const country = null
  const timezone = cityDetail.timezone || null

  const normalized = {
    // Identifiers
    uid: `soladay-city-${cityDetail.id || cityDetail.citySlug}`,
    fingerprint: generateFingerprint(
      cityDetail.title,
      startAt,
      city,
      null, // No coordinates for cities typically
      null
    ),

    // Source metadata
    source: 'soladay',
    sourceUrl: `https://app.sola.day/event/${cityDetail.citySlug}`,
    sourceEventId: cityDetail.id?.toString() || cityDetail.citySlug,

    // Core event data
    title: cityDetail.title,
    description: cityDetail.description || null,
    startAt,
    endAt,
    timezone,

    // Location
    venueName: null,
    address: cityDetail.location || null,
    lat: null,
    lng: null,
    city,
    country,

    // Additional metadata
    organizers: [],
    tags: ['popup-city'], // Tag to distinguish popup cities from regular events
    imageUrl: cityDetail.imageUrl || null,
    status: 'scheduled',
    website: cityDetail.website || null,

    // Tracking
    sequence: 0,
    confidence: 0.95, // High confidence - official API data
    raw: cityDetail,

    // Timestamps
    firstSeen: new Date(),
    lastSeen: new Date(),
    lastChecked: new Date()
  }

  return normalized
}

/**
 * Normalize batch of popup cities from city details result
 * @param {Object} cityDetailsResult - Result from scrapeCityDetails()
 * @returns {Promise<Array>} Array of normalized events
 */
export async function normalizePopupCities(cityDetailsResult) {
  if (!cityDetailsResult.success || !cityDetailsResult.cities) {
    return []
  }

  const normalized = []

  for (const cityDetail of cityDetailsResult.cities) {
    const normalizedCity = await normalizePopupCity(cityDetail)
    if (normalizedCity) {
      normalized.push(normalizedCity)
    }
  }

  console.log(`[normalize] Normalized ${normalized.length}/${cityDetailsResult.cities.length} popup cities`)

  return normalized
}
