/**
 * Luma iCal parser
 * Converts iCal VEVENT data to normalized Event objects
 */

import type { Event, Organizer } from '../../core/types.js'
import { generateFingerprint } from '../../core/fingerprint.js'

interface IcalEvent {
  uid: string
  summary: string
  description?: string
  dtstart: string
  dtend?: string
  location?: string
  geo?: string
  organizer?: string
  sequence?: number
  status?: string
}

/**
 * Parse iCal data into Event objects
 * TODO: Implement proper iCal parsing (use node-ical or ical.js library)
 */
export function parseIcal(icalData: string): Event[] {
  // Placeholder - needs actual iCal parsing library
  console.warn('parseIcal needs proper implementation with ical.js or node-ical')

  // For now, return empty array
  // Real implementation will:
  // 1. Parse VCALENDAR and extract VEVENT blocks
  // 2. Parse each field (DTSTART, DTEND, GEO, etc.)
  // 3. Transform to normalized Event objects

  return []
}

/**
 * Transform parsed iCal event to normalized Event object
 */
function transformEvent(icalEvent: IcalEvent): Event {
  const startAt = new Date(icalEvent.dtstart)
  const endAt = icalEvent.dtend ? new Date(icalEvent.dtend) : undefined

  // Parse GEO field (format: lat;lng)
  let lat: number | undefined
  let lng: number | undefined
  if (icalEvent.geo) {
    const [latStr, lngStr] = icalEvent.geo.split(';')
    lat = parseFloat(latStr)
    lng = parseFloat(lngStr)
  }

  // Extract city from location or address
  const city = extractCity(icalEvent.location)

  // Parse organizer (format: CN=Name:mailto:email)
  const organizers: Organizer[] = []
  if (icalEvent.organizer) {
    const nameMatch = icalEvent.organizer.match(/CN=([^:]+)/)
    const emailMatch = icalEvent.organizer.match(/mailto:(.+)/)
    organizers.push({
      name: nameMatch?.[1] || 'Unknown',
      email: emailMatch?.[1]
    })
  }

  // Extract image URL from description if present
  const imageUrl = extractImageUrl(icalEvent.description)

  const now = new Date()

  return {
    uid: icalEvent.uid,
    fingerprint: generateFingerprint(icalEvent.summary, startAt, city, lat, lng),

    source: 'luma',
    sourceUrl: extractLumaUrl(icalEvent.description) || icalEvent.location || '',
    sourceEventId: icalEvent.uid,

    title: icalEvent.summary,
    description: cleanDescription(icalEvent.description),
    startAt,
    endAt,

    venueName: extractVenueName(icalEvent.location),
    address: icalEvent.location,
    lat,
    lng,
    city,

    organizers,
    imageUrl,
    status: mapStatus(icalEvent.status),
    sequence: icalEvent.sequence,
    confidence: 0.98, // High confidence for official iCal data

    raw: icalEvent,

    firstSeen: now,
    lastSeen: now,
    lastChecked: now
  }
}

// Helper functions

function extractCity(location?: string): string | undefined {
  if (!location) return undefined
  // TODO: Better city extraction logic
  // For now, just try to find city in address
  return undefined
}

function extractImageUrl(description?: string): string | undefined {
  if (!description) return undefined
  // Look for Luma event URL in description
  const urlMatch = description.match(/https:\/\/luma\.com\/event\/[^\s]+/)
  return urlMatch ? urlMatch[0] : undefined
}

function extractLumaUrl(description?: string): string | undefined {
  if (!description) return undefined
  const match = description.match(/https:\/\/luma\.com\/event\/[^\s]+/)
  return match ? match[0] : undefined
}

function extractVenueName(location?: string): string | undefined {
  if (!location) return undefined
  if (location.startsWith('http')) return undefined // It's a URL, not a venue
  // TODO: Better venue extraction
  return location.split(',')[0].trim()
}

function cleanDescription(description?: string): string | undefined {
  if (!description) return undefined
  // Remove "Get up to date information at: ..." line
  return description.replace(/Get up to date information at:.*$/gm, '').trim()
}

function mapStatus(status?: string): Event['status'] {
  if (!status) return 'scheduled'

  const normalized = status.toUpperCase()
  if (normalized === 'CONFIRMED') return 'scheduled'
  if (normalized === 'TENTATIVE') return 'tentative'
  if (normalized === 'CANCELLED') return 'cancelled'

  return 'scheduled'
}
