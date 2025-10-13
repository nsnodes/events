/**
 * Geocoding Utility
 *
 * Reverse geocodes coordinates to normalized city and country names
 * Uses OpenStreetMap Nominatim with rate limiting and caching
 */

import NodeGeocoder from 'node-geocoder'

// Initialize geocoder with Nominatim provider
const geocoder = NodeGeocoder({
  provider: 'openstreetmap',
  // Nominatim requires a user agent
  httpAdapter: 'https',
  apiKey: null, // Not required for Nominatim
  formatter: null
})

// In-memory cache to avoid duplicate API calls
const cache = new Map()

// Rate limiting: 1 request per second for Nominatim
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 1000 // 1 second

/**
 * Wait to respect rate limit
 */
async function waitForRateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest
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
 * Reverse geocode coordinates to get normalized city and country
 *
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @returns {Promise<{city: string|null, country: string|null}>}
 */
export async function reverseGeocode(lat, lng) {
  if (!lat || !lng) {
    return { city: null, country: null }
  }

  // Check cache first
  const cacheKey = getCacheKey(lat, lng)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  try {
    // Wait for rate limit
    await waitForRateLimit()

    // Perform reverse geocoding
    const results = await geocoder.reverse({ lat, lon: lng })

    if (!results || results.length === 0) {
      const fallback = { city: null, country: null }
      cache.set(cacheKey, fallback)
      return fallback
    }

    const result = results[0]

    // Extract normalized city and country
    const normalized = {
      city: result.city || result.county || result.state || null,
      country: result.country || result.countryCode?.toUpperCase() || null
    }

    // Cache the result
    cache.set(cacheKey, normalized)

    return normalized

  } catch (error) {
    console.error(`Geocoding failed for ${lat},${lng}:`, error.message)

    // Cache negative result to avoid retrying
    const fallback = { city: null, country: null }
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
