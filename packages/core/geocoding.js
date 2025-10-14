/**
 * Geocoding Utility
 *
 * Reverse geocodes coordinates to normalized city and country names
 * Uses OpenStreetMap Nominatim with rate limiting and caching
 * Also includes timezone lookup from coordinates
 */

import NodeGeocoder from 'node-geocoder'
import { find as findTimezone } from 'geo-tz'
import countries from 'i18n-iso-countries'
import { createRequire } from 'module'

// Register English locale for country name translation
const require = createRequire(import.meta.url)
countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

// Initialize geocoder with Nominatim provider
// IMPORTANT: Nominatim requires a custom User-Agent identifying the application
const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  httpAdapter: 'https',
  apiKey: null,
  formatter: null,
  headers: {
    'User-Agent': 'nsnodes-events/1.0 (events aggregation platform; contact: github.com/nsnodes/events)'
  }
})

// In-memory cache to avoid duplicate API calls
const cache = new Map()

// Rate limiting: Conservative 2 seconds per request for Nominatim
// Nominatim discourages bulk/automated requests - be very conservative
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 2000 // 2 seconds (more conservative than required 1/sec)

// Exponential backoff for when we get rate limited
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 3
const BACKOFF_BASE = 5000 // Start with 5 second backoff

/**
 * Wait to respect rate limit with exponential backoff on errors
 */
async function waitForRateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  // Calculate wait time with exponential backoff if we've had errors
  let waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest

  if (consecutiveErrors > 0) {
    // Exponential backoff: 5s, 10s, 20s, etc.
    const backoffTime = BACKOFF_BASE * Math.pow(2, consecutiveErrors - 1)
    waitTime = Math.max(waitTime, backoffTime)
    console.warn(`[geocoding] Backing off ${backoffTime}ms after ${consecutiveErrors} consecutive errors`)
  }

  if (waitTime > 0) {
    await new Promise(resolve => setTimeout(resolve, waitTime))
  }

  lastRequestTime = Date.now()
}

/**
 * Generate cache key from coordinates
 */
function getCacheKey(lat, lng) {
  // Round to 4 decimal places (~11m precision) for cache key
  const roundedLat = Math.round(lat * 10000) / 10000
  const roundedLng = Math.round(lng * 10000) / 10000
  return `${roundedLat},${roundedLng}`
}

/**
 * Reverse geocode coordinates to get normalized city, country, and timezone
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{city: string|null, country: string|null, timezone: string|null}>}
 */
export async function reverseGeocode(lat, lng) {
  if (!lat || !lng) {
    return { city: null, country: null, timezone: null }
  }

  // Check cache first
  const cacheKey = getCacheKey(lat, lng)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  try {
    // Check if we've hit max consecutive errors - stop geocoding temporarily
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.warn(`[geocoding] Max consecutive errors reached, skipping geocoding for ${lat},${lng}`)
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      return fallback
    }

    // Wait for rate limit
    await waitForRateLimit()

    // Perform reverse geocoding with accept-language header
    const results = await geocoder.reverse({
      lat,
      lon: lng,
      addressdetails: 1,
      'accept-language': 'en'
    })

    if (!results || results.length === 0) {
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      return fallback
    }

    const result = results[0]

    // Check if we got an HTML error response (Nominatim blocks return HTML)
    if (typeof result === 'string' && result.includes('<html>')) {
      throw new Error('Nominatim access blocked - please wait before retrying')
    }

    // Success - reset error counter
    consecutiveErrors = 0

    // Lookup timezone from coordinates (offline, fast)
    let timezone = null
    try {
      const timezones = findTimezone(lat, lng)
      timezone = timezones && timezones.length > 0 ? timezones[0] : null
    } catch (tzError) {
      console.warn(`Timezone lookup failed for ${lat},${lng}:`, tzError.message)
    }

    // Extract normalized city, country, and timezone
    // Use countryCode with i18n-iso-countries for proper English country name
    let country = result.country
    if (!country && result.countryCode) {
      // Convert ISO country code to English name using proper i18n library
      country = countries.getName(result.countryCode, 'en', { select: 'official' })
    }

    const normalized = {
      city: result.city || result.county || result.state || null,
      country: country || null,
      timezone
    }

    // Cache the result
    cache.set(cacheKey, normalized)

    return normalized

  } catch (error) {
    // Increment error counter for backoff
    consecutiveErrors++

    const errorMsg = error.message || String(error)

    // Only log first few errors to avoid spam
    if (consecutiveErrors <= 3) {
      if (errorMsg.includes('blocked')) {
        console.error(`[geocoding] BLOCKED by Nominatim for ${lat},${lng} - stopping geocoding requests`)
      } else {
        console.error(`Geocoding failed for ${lat},${lng}:`, errorMsg.substring(0, 200))
      }
    }

    // Cache negative result to avoid retrying
    const fallback = { city: null, country: null, timezone: null }
    cache.set(cacheKey, fallback)

    return fallback
  }
}

/**
 * Batch reverse geocode multiple coordinates
 * Processes sequentially to respect rate limiting
 *
 * @param {Array<{lat: number, lng: number}>} coordinates
 * @returns {Promise<Array<{city: string|null, country: string|null}>>}
 */
export async function reverseGeocodeBatch(coordinates) {
  const results = []

  for (const coord of coordinates) {
    const result = await reverseGeocode(coord.lat, coord.lng)
    results.push(result)
  }

  return results
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    size: cache.size,
    keys: Array.from(cache.keys())
  }
}

/**
 * Clear the cache
 */
export function clearCache() {
  cache.clear()
}

