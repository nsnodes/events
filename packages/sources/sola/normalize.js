/**
 * Sola.day Event Normalization
 *
 * Transforms raw Sola.day event data (from iCal) into normalized Event schema
 */

import { generateFingerprint } from '../../core/fingerprint.js'

/**
 * Normalize a single Sola.day event to common Event schema
 * @param {Object} rawEvent - Raw event from Sola.day iCal
 * @param {string} citySlug - City slug for context
 * @returns {Object} Normalized event
 */
export function normalizeEvent(rawEvent, citySlug = null) {
  const startAt = new Date(rawEvent.startDate)
  const endAt = rawEvent.endDate ? new Date(rawEvent.endDate) : null

  // Extract city from location or use citySlug
  const city = extractCity(rawEvent.location) || citySlug

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
    country: extractCountry(rawEvent.location),

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
 * @param {Object} cityResult - Result from fetchEvents()
 * @returns {Array} Array of normalized events
 */
export function normalizeCityEvents(cityResult) {
  if (!cityResult.success || !cityResult.events) {
    return []
  }

  return cityResult.events.map(event =>
    normalizeEvent(event, cityResult.citySlug)
  )
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
