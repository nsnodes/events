/**
 * Geocoding Utility
 *
 * Reverse geocodes coordinates to normalized city and country names
 * Uses Mapbox Geocoding API with rate limiting and persistent caching
 * Also includes timezone lookup from coordinates
 *
 * Features:
 * - Automatic retries with exponential backoff
 * - Persistent disk-based caching
 * - Rate limiting (8 req/sec)
 * - Distinguishes API failures from "no data found"
 */

import NodeGeocoder from 'node-geocoder'
import { find as findTimezone } from 'geo-tz'
import countries from 'i18n-iso-countries'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'
import { retry, TransientError, PermanentError } from './retry.js'

// Register English locale for country name translation
const require = createRequire(import.meta.url)
countries.registerLocale(require('i18n-iso-countries/langs/en.json'))

// Cache file location
const CACHE_DIR = path.join(process.cwd(), 'packages/core/data')
const CACHE_FILE = path.join(CACHE_DIR, 'geocoding-cache.json')

// Initialize geocoder with Mapbox provider
// Mapbox supports automated/bulk geocoding (unlike Nominatim)
const mapboxToken = process.env.MAPBOX_TOKEN

if (!mapboxToken) {
  console.warn('[geocoding] MAPBOX_TOKEN not set - geocoding will be disabled')
}

const geocoder = mapboxToken ? NodeGeocoder({
  provider: 'mapbox',
  apiKey: mapboxToken,
  httpAdapter: 'https',
  formatter: null
}) : null

// Load cache from disk or initialize empty
function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'))
      return new Map(Object.entries(data))
    }
  } catch (error) {
    console.warn('[geocoding] Failed to load cache:', error.message)
  }
  return new Map()
}

// Save cache to disk
function saveCache() {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true })
    }
    const data = Object.fromEntries(cache)
    fs.writeFileSync(CACHE_FILE, JSON.stringify(data, null, 2))
  } catch (error) {
    console.warn('[geocoding] Failed to save cache:', error.message)
  }
}

// Persistent cache to avoid duplicate API calls
const cache = loadCache()

// Save cache periodically and on exit
let saveTimeout = null
function scheduleCacheSave() {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => {
    saveCache()
    saveTimeout = null
  }, 5000) // Save 5 seconds after last change

  // Don't keep process alive waiting for save
  saveTimeout.unref()
}

process.on('exit', () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveCache()
})
process.on('SIGINT', () => {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveCache()
  process.exit(0)
})

// Rate limiting: Mapbox allows 600 requests/minute (10/sec)
// Use 8 req/sec to stay comfortably under the limit with some buffer
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 125 // 125ms = 8 requests/second (80% of Mapbox limit)

/**
 * Wait to respect rate limit
 */
async function waitForRateLimit() {
  const now = Date.now()
  const timeSinceLastRequest = now - lastRequestTime
  const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest

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
 * Perform the actual geocoding API call (wrapped by retry logic)
 * @private
 */
async function performGeocode(lat, lng) {
  // Wait for rate limit before making request
  await waitForRateLimit()

  try {
    // Perform reverse geocoding with Mapbox
    const results = await geocoder.reverse({
      lat,
      lon: lng
    })

    if (!results || results.length === 0) {
      // No data found - this is a permanent condition (not a failure)
      throw new PermanentError('No geocoding data found for coordinates')
    }

    return results[0]
  } catch (error) {
    const errorMsg = error.message?.toLowerCase() || ''

    // Classify errors as transient or permanent
    if (errorMsg.includes('rate limit') || errorMsg.includes('429')) {
      throw new TransientError(`Rate limited: ${error.message}`, error)
    }

    if (errorMsg.includes('timeout') || errorMsg.includes('network') ||
        errorMsg.includes('econnreset') || errorMsg.includes('503')) {
      throw new TransientError(`Network error: ${error.message}`, error)
    }

    if (errorMsg.includes('unauthorized') || errorMsg.includes('invalid key')) {
      throw new PermanentError(`Auth error: ${error.message}`, error)
    }

    if (error instanceof PermanentError) {
      throw error
    }

    // Default: treat unknown errors as transient (will retry)
    throw new TransientError(`Geocoding error: ${error.message}`, error)
  }
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

  // If no geocoder configured, return fallback
  if (!geocoder) {
    const fallback = { city: null, country: null, timezone: null }
    cache.set(cacheKey, fallback)
    scheduleCacheSave()
    return fallback
  }

  try {
    // Perform geocoding with retry logic
    const result = await retry(
      () => performGeocode(lat, lng),
      {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        onRetry: (error, attempt, delay) => {
          console.warn(`[geocoding] Retry ${attempt} for ${lat},${lng} after ${delay}ms: ${error.message}`)
        }
      }
    )

    // Lookup timezone from coordinates (offline, fast)
    let timezone = null
    try {
      const timezones = findTimezone(lat, lng)
      timezone = timezones && timezones.length > 0 ? timezones[0] : null
    } catch (tzError) {
      console.warn(`[geocoding] Timezone lookup failed for ${lat},${lng}:`, tzError.message)
    }

    // Extract normalized city, country, and timezone from Mapbox response
    let country = result.country
    if (!country && result.countryCode) {
      // Convert ISO country code to English name using i18n library
      country = countries.getName(result.countryCode, 'en', { select: 'official' })
    }

    const normalized = {
      city: result.city || result.county || result.state || null,
      country: country || null,
      timezone
    }

    // Cache the result
    cache.set(cacheKey, normalized)
    scheduleCacheSave()

    return normalized

  } catch (error) {
    // All retries exhausted or permanent error

    if (error instanceof PermanentError) {
      // No data found or auth issue - cache this to avoid retrying
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      scheduleCacheSave()

      if (error.message.includes('No geocoding data')) {
        // This is expected for some coordinates - don't spam logs
        return fallback
      }

      console.error(`[geocoding] Permanent error for ${lat},${lng}:`, error.message)
      return fallback
    }

    // Transient error - all retries failed
    // Don't cache failures - we want to try again next time
    console.error(`[geocoding] All retries failed for ${lat},${lng}:`, error.message)

    // Return fallback but don't cache it
    return { city: null, country: null, timezone: null }
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
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE)
    }
  } catch (error) {
    console.warn('[geocoding] Failed to delete cache file:', error.message)
  }
}

