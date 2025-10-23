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

interface HandleLocation {
  name?: string;
  city: string | null;
  country: string | null;
  timezone: string | null;
}

type HandleLocations = Record<string, HandleLocation>;

let handleLocations: HandleLocations = {}
try {
  handleLocations = JSON.parse(fs.readFileSync(HANDLE_LOCATIONS_FILE, 'utf8'))
} catch (error) {
  // File doesn't exist yet, that's okay
}

interface RawEvent {
  uid: string;
  title: string;
  description?: string;
  startDate: string | Date;
  endDate?: string | Date;
  location?: string;
  geo?: { lat: number; lon: number };
  organizer?: string;
  status?: string;
  sequence?: number;
  url?: string;
  lumaUrl?: string;
}

interface Organizer {
  name: string;
}

interface NormalizedEvent {
  uid: string;
  fingerprint: string;
  source: string;
  sourceUrl: string;
  sourceEventId: string;
  title: string;
  description: string | null;
  startAt: Date;
  endAt: Date | null;
  timezone: string | null;
  venueName: string | null;
  address: string | undefined;
  lat: number | undefined;
  lng: number | undefined;
  city: string | null;
  country: string | null;
  organizers: Organizer[];
  tags: string[];
  imageUrl: null;
  status: string;
  sequence: number;
  confidence: number;
  raw: RawEvent;
  firstSeen: Date;
  lastSeen: Date;
  lastChecked: Date;
}

interface NormalizationOptions {
  skipGeocoding?: boolean;
  reuseLocation?: {
    city: string | null;
    country: string | null;
    timezone: string | null;
  };
  entityType?: 'city' | 'handle';
}

interface EntityResult {
  success: boolean;
  citySlug: string;
  events?: RawEvent[];
}

interface DatabaseInterface {
  getEventsByUids(uids: string[]): Promise<Array<{
    uid: string;
    city: string | null;
    country: string | null;
    timezone: string | null;
    fingerprint: string;
  }>>;
}

/**
 * Normalize a single Luma event to common Event schema
 * @param rawEvent - Raw event from Luma iCal
 * @param entitySlug - Entity slug for context (city or handle)
 * @param options - Normalization options
 * @returns Normalized event
 */
export async function normalizeEvent(
  rawEvent: RawEvent,
  entitySlug: string | null = null,
  options: NormalizationOptions = {}
): Promise<NormalizedEvent> {
  const startAt = new Date(rawEvent.startDate)
  const endAt = rawEvent.endDate ? new Date(rawEvent.endDate) : null

  let city: string | null = null
  let country: string | null = null
  let timezone: string | null = null

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
  else if (options.entityType === 'handle' && entitySlug && handleLocations[entitySlug]) {
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
  const organizers: Organizer[] = []
  if (rawEvent.organizer) {
    organizers.push({ name: rawEvent.organizer })
  }
  // Add handle organization if this is from a handle
  if (options.entityType === 'handle' && entitySlug && handleLocations[entitySlug]?.name) {
    const handleName = handleLocations[entitySlug].name
    // Only add if not already in organizers
    if (!organizers.some(o => o.name === handleName)) {
      organizers.push({ name: handleName })
    }
  }

  // Determine if this is a popup city event (longer than 2 days)
  const tags: string[] = []
  if (isPopupCityEvent(startAt, endAt)) {
    tags.push('popup-city')
  }

  const normalized: NormalizedEvent = {
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
    tags,
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
 * @param entityResult - Result from fetchEvents()
 * @param db - Database instance (optional, for optimization)
 * @param entityType - Type of entity ('city' or 'handle')
 * @returns Array of normalized events
 */
export async function normalizeCityEvents(
  entityResult: EntityResult,
  db: DatabaseInterface | null = null,
  entityType: 'city' | 'handle' = 'city'
): Promise<NormalizedEvent[]> {
  if (!entityResult.success || !entityResult.events) {
    return []
  }

  // Detect entity type from slug if not provided
  // (handles are typically in handleLocations, cities are not)
  let detectedEntityType = entityType
  if (!entityType && handleLocations[entityResult.citySlug]) {
    detectedEntityType = 'handle'
  }

  // Optimization: Check which events already exist in DB
  let existingEventsMap = new Map<string, {
    uid: string;
    city: string | null;
    country: string | null;
    timezone: string | null;
    fingerprint: string;
  }>()

  if (db) {
    try {
      const uids = entityResult.events.map(e => e.uid)
      const existingEvents = await db.getEventsByUids(uids)
      existingEventsMap = new Map(existingEvents.map(e => [e.uid, e]))
    } catch (error) {
      console.warn('Could not fetch existing events for optimization:', (error as Error).message)
    }
  }

  // Process events sequentially to respect geocoding rate limits
  const normalized: NormalizedEvent[] = []
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
        entityType: detectedEntityType
      })
      normalized.push(normalizedEvent)
      reusedCount++
    } else {
      // New or updated event - perform geocoding
      const normalizedEvent = await normalizeEvent(event, entityResult.citySlug, {
        entityType: detectedEntityType
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

function extractCity(location: string | undefined): string | null {
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

function extractVenueName(location: string | undefined): string | null {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

  // Get first part before comma
  const firstPart = location.split(',')[0].trim()
  return firstPart || null
}

function extractCountry(location: string | undefined): string | null {
  if (!location) return null

  // Skip URLs
  if (location.startsWith('http')) return null

  // Skip internal room references - they don't have valid country data
  if (isInternalRoomReference(location)) return null

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
function isInternalRoomReference(location: string | undefined): boolean {
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

function extractLumaUrl(description: string | undefined): string | null {
  if (!description) return null

  // Extract URL from "Get up-to-date information at: https://luma.com/..." line
  const match = description.match(/Get up-to-date information at:\s*(https?:\/\/[^\s\\]+)/i)
  return match ? match[1] : null
}

function cleanDescription(description: string | undefined): string | null {
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

function mapStatus(status: string | undefined): string {
  if (!status) return 'scheduled'

  const normalized = status.toUpperCase()

  if (normalized === 'CONFIRMED') return 'scheduled'
  if (normalized === 'TENTATIVE') return 'tentative'
  if (normalized === 'CANCELLED') return 'cancelled'

  return 'scheduled'
}

/**
 * Determine if an event should be tagged as a popup city event
 * Events longer than 2 days are considered popup cities (similar to Sola.day popup cities)
 * @param startAt - Event start date
 * @param endAt - Event end date (can be null)
 * @returns true if event should be tagged as popup-city
 */
function isPopupCityEvent(startAt: Date, endAt: Date | null): boolean {
  if (!endAt) {
    // If no end date, check if it's a multi-day event by looking at the start date
    // Events that start at midnight and have no end date are often multi-day events
    return startAt.getUTCHours() === 0 && startAt.getUTCMinutes() === 0
  }

  // Calculate duration in milliseconds
  const durationMs = endAt.getTime() - startAt.getTime()
  
  // Convert to days (2 days = 2 * 24 * 60 * 60 * 1000 milliseconds)
  const durationDays = durationMs / (24 * 60 * 60 * 1000)
  
  // Tag as popup city if longer than 2 days
  return durationDays > 2
}
