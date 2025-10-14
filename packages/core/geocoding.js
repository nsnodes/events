/**
 * Geocoding Utility
 *
 * Reverse geocodes coordinates to normalized city and country names
 * Uses Mapbox Geocoding API with rate limiting and persistent caching
 * Also includes timezone lookup from coordinates
 */

import NodeGeocoder from 'node-geocoder'
import { find as findTimezone } from 'geo-tz'
import countries from 'i18n-iso-countries'
import { createRequire } from 'module'
import fs from 'fs'
import path from 'path'

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
  }, 5000) // Save 5 seconds after last change
}

process.on('exit', () => saveCache())
process.on('SIGINT', () => {
  saveCache()
  process.exit(0)
})

// Rate limiting: Mapbox allows 600 requests/minute (10/sec)
// Use 8 req/sec to stay comfortably under the limit with some buffer
let lastRequestTime = 0
const MIN_REQUEST_INTERVAL = 125 // 125ms = 8 requests/second (80% of Mapbox limit)

// Exponential backoff for when we get rate limited
let consecutiveErrors = 0
const MAX_CONSECUTIVE_ERRORS = 5 // More lenient since Mapbox supports bulk
const BACKOFF_BASE = 2000 // Start with 2 second backoff

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
    // If no geocoder configured, return fallback
    if (!geocoder) {
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      scheduleCacheSave()
      return fallback
    }

    // Check if we've hit max consecutive errors - stop geocoding temporarily
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
      console.warn(`[geocoding] Max consecutive errors reached, skipping geocoding for ${lat},${lng}`)
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      scheduleCacheSave()
      return fallback
    }

    // Wait for rate limit (with exponential backoff if we've had errors)
    await waitForRateLimit()

    // Perform reverse geocoding with Mapbox
    const results = await geocoder.reverse({
      lat,
      lon: lng
    })

    if (!results || results.length === 0) {
      const fallback = { city: null, country: null, timezone: null }
      cache.set(cacheKey, fallback)
      return fallback
    }

    const result = results[0]

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

    // Extract normalized city, country, and timezone from Mapbox response
    // Mapbox returns: city, country, countryCode, state, etc.
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
    // Increment error counter for backoff
    consecutiveErrors++

    const errorMsg = error.message || String(error)

    // Only log first few errors to avoid spam
    if (consecutiveErrors <= 3) {
      if (errorMsg.includes('blocked') || errorMsg.includes('rate limit')) {
        console.error(`[geocoding] Rate limited for ${lat},${lng} - backing off`)
      } else {
        console.error(`Geocoding failed for ${lat},${lng}:`, errorMsg.substring(0, 200))
      }
    }

    // Cache negative result to avoid retrying
    const fallback = { city: null, country: null, timezone: null }
    cache.set(cacheKey, fallback)
    scheduleCacheSave()

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
  try {
    if (fs.existsSync(CACHE_FILE)) {
      fs.unlinkSync(CACHE_FILE)
    }
  } catch (error) {
    console.warn('[geocoding] Failed to delete cache file:', error.message)
  }
}

