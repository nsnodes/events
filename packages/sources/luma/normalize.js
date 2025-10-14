/**
 * Luma Event Normalization
 *
 * Transforms raw Luma event data (from iCal) into normalized Event schema
 */

import { generateFingerprint } from '../../core/fingerprint.js'
import { reverseGeocode } from '../../core/geocoding.js'
import fs from 'fs'
import path from 'path'

// Load handle location cache
const HANDLE_LOCATIONS_FILE = path.join(process.cwd(), 'packages/sources/luma/data/handle-locations.json')
let handleLocations = {}
try {
  handleLocations = JSON.parse(fs.readFileSync(HANDLE_LOCATIONS_FILE, 'utf8'))
} catch (error) {
  // File doesn't exist yet, that's okay
}

/**
 * Normalize a single Luma event to common Event schema
 * @param {Object} rawEvent - Raw event from Luma iCal
 * @param {string} entitySlug - Entity slug for context (city or handle)
 * @param {Object} options - Normalization options
 * @param {boolean} options.skipGeocoding - Skip geocoding (reuse existing data)
 * @param {Object} options.reuseLocation - Location data to reuse {city, country}
 * @param {string} options.entityType - Type of entity ('city' or 'handle')
 * @returns {Promise<Object>} Normalized event
 */
export async function normalizeEvent(rawEvent, entitySlug = null, options = {}) {
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
  // Option 3: Check for internal room references (for handles)
  else if (options.entityType === 'handle' && handleLocations[entitySlug]) {
    const isInternalRoom = isInternalRoomReference(rawEvent.location)

    if (isInternalRoom) {
      // Apply handle's default location for internal rooms
      const defaultLocation = handleLocations[entitySlug]
      city = defaultLocation.city
      country = defaultLocation.country
      timezone = defaultLocation.timezone
    }
  }

  // Fallback to parsing if no location data yet
  if (!city) {
    city = extractCity(rawEvent.location) || entitySlug
  }
  if (!country) {
    country = extractCountry(rawEvent.location)
  }

  // Extract the actual Luma URL from description before cleaning
  const extractedUrl = extractLumaUrl(rawEvent.description)

  // Build organizers array
  const organizers = []
  if (rawEvent.organizer) {
    organizers.push({ name: rawEvent.organizer })
  }
  // Add handle organization if this is from a handle
  if (options.entityType === 'handle' && handleLocations[entitySlug]?.name) {
    const handleName = handleLocations[entitySlug].name
    // Only add if not already in organizers
    if (!organizers.some(o => o.name === handleName)) {
      organizers.push({ name: handleName })
    }
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
    source: 'luma',
    sourceUrl: extractedUrl || rawEvent.lumaUrl || rawEvent.url || `https://lu.ma/event/${rawEvent.uid}`,
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
    organizers,
    tags: [],
    imageUrl: null, // Would need to be extracted from description URL
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
 * Normalize batch of events from an entity result (city or handle)
 * Optimized: Only geocodes new or updated events
 *
 * @param {Object} entityResult - Result from fetchEvents()
 * @param {Object} db - Database instance (optional, for optimization)
 * @param {string} entityType - Type of entity ('city' or 'handle')
 * @returns {Promise<Array>} Array of normalized events
 */
export async function normalizeCityEvents(entityResult, db = null, entityType = 'city') {
  if (!entityResult.success || !entityResult.events) {
    return []
  }

  // Detect entity type from slug if not provided
  // (handles are typically in handleLocations, cities are not)
  if (!entityType && handleLocations[entityResult.citySlug]) {
    entityType = 'handle'
  }

  // Optimization: Check which events already exist in DB
  let existingEventsMap = new Map()
  if (db) {
    try {
      const uids = entityResult.events.map(e => e.uid)
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

  for (const event of entityResult.events) {
    const existing = existingEventsMap.get(event.uid)

    // Generate fingerprint for this event to detect real changes
    // Fingerprint is based on: title, startAt, city, coordinates
    const startAt = new Date(event.startDate)
    const tempCity = event.geo?.lat && event.geo?.lon ?
      (existing?.city || entityResult.citySlug) : entityResult.citySlug

    const eventFingerprint = generateFingerprint(
      event.title,
      startAt,
      tempCity,
      event.geo?.lat,
      event.geo?.lon
    )

    // Skip geocoding if event exists and fingerprint hasn't changed
    // (Luma uses global sequence numbers, so we can't rely on those)
    if (existing && existing.fingerprint === eventFingerprint) {
      // Reuse existing geocoded data - event hasn't actually changed
      const normalizedEvent = await normalizeEvent(event, entityResult.citySlug, {
        skipGeocoding: true,
        reuseLocation: {
          city: existing.city,
          country: existing.country,
          timezone: existing.timezone
        },
        entityType
      })
      normalized.push(normalizedEvent)
      reusedCount++
    } else {
      // New or updated event - perform geocoding
      const normalizedEvent = await normalizeEvent(event, entityResult.citySlug, {
        entityType
      })
      normalized.push(normalizedEvent)
      geocodingCount++
    }
  }

  if (db && entityResult.events.length > 0) {
    console.log(`  [geocoding] ${geocodingCount} geocoded, ${reusedCount} reused`)
  }

  return normalized
}

// Helper functions

function extractCity(location) {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

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
    const lastPart = parts[parts.length - 1]

    // If the last part has a postal code, try to extract just the country name
    // e.g., "Singapore 059191" -> "Singapore"
    const postalCodePattern = /\b\d{5,6}(-\d{4})?\b/
    if (postalCodePattern.test(lastPart)) {
      // Remove postal code and return the country name
      const countryName = lastPart.replace(postalCodePattern, '').trim()
      if (countryName) return countryName
    }

    return lastPart
  }

  return null
}

/**
 * Detect if a location string is an internal room reference (not a real address)
 * Uses structural characteristics rather than hardcoded room names
 * @private
 */
function isInternalRoomReference(location) {
  if (!location) return false

  const parts = location.split(',').map(p => p.trim())

  // Check for obvious internal room patterns
  const internalRoomKeywords = /\b(room|floor|corridor|suite|vip|ping pong|karaoke|conference|lift|elevator|alleyway|beach shack|volleyball|library|opposite|branching|near the)\b/i
  if (internalRoomKeywords.test(location)) {
    // If it has internal keywords AND is short (< 3 parts), likely internal
    if (parts.length < 3) return true
  }

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

  // Real addresses typically have 3+ parts (street, city, region/country)
  // If 3+ parts and no internal keywords, assume real address
  if (parts.length >= 3 && !internalRoomKeywords.test(location)) return false

  // Hotel/building names can be part of internal references OR real addresses
  // Only trust them as real addresses if they have 3+ parts
  const buildingIndicators = /\b(hotel|resort|mall|center|centre|plaza|tower|building)\b/i
  if (buildingIndicators.test(location) && parts.length >= 3) {
    return false // Multi-part with building = real address
  }

  // If short and single-part, likely internal
  if (parts.length === 1 && location.length < 30) return true

  // Default to internal for 2-part short strings without geographic keywords
  if (parts.length <= 2 && location.length < 80) return true

  return false
}

function extractLumaUrl(description) {
  if (!description) return null

  // Extract URL from "Get up-to-date information at: https://luma.com/..." line
  const match = description.match(/Get up-to-date information at:\s*(https?:\/\/[^\s\\]+)/i)
  return match ? match[1] : null
}

function cleanDescription(description) {
  if (!description) return null

  // Remove Luma boilerplate:
  // 1. "Get up-to-date information at: ..." (first line)
  // 2. "Address:\n..." section (until first blank line)

  let cleaned = description

  // Remove first line if it starts with "Get up-to-date information at:"
  if (cleaned.match(/^Get up-to-date information at:/i)) {
    const firstLineEnd = cleaned.indexOf('\\n')
    if (firstLineEnd !== -1) {
      cleaned = cleaned.substring(firstLineEnd)
      cleaned = cleaned.replace(/^(\\n)+/, '') // Remove leading newlines
    } else {
      return null // Entire description is just the URL line
    }
  }

  // Remove "Address:\n..." section (everything until first double newline)
  if (cleaned.match(/^Address:/i)) {
    const doubleNewline = cleaned.indexOf('\\n\\n')
    if (doubleNewline !== -1) {
      cleaned = cleaned.substring(doubleNewline)
      cleaned = cleaned.replace(/^(\\n)+/, '') // Remove leading newlines
    } else {
      // No content after Address section
      return null
    }
  }

  return cleaned.trim() || null
}

function mapStatus(status) {
  if (!status) return 'scheduled'

  const normalized = status.toUpperCase()

  if (normalized === 'CONFIRMED') return 'scheduled'
  if (normalized === 'TENTATIVE') return 'tentative'
  if (normalized === 'CANCELLED') return 'cancelled'

  return 'scheduled'
}
