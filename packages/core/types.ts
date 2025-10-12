/**
 * Core types for event ingestion system
 */

export interface Event {
  // Identifiers
  uid: string                    // Unique ID from source (e.g., Luma UID)
  fingerprint?: string           // Optional: SHA256 hash for deduplication

  // Source metadata
  source: 'luma' | 'soladay'
  sourceUrl: string              // Link to original event page
  sourceEventId?: string         // Source-specific event ID

  // Core event data
  title: string
  description?: string
  startAt: Date
  endAt?: Date
  timezone?: string

  // Location
  venueName?: string
  address?: string
  lat?: number
  lng?: number
  city?: string
  country?: string

  // Additional metadata
  organizers?: Organizer[]
  tags?: string[]
  imageUrl?: string
  status: EventStatus

  // Tracking
  sequence?: number              // Version number (from iCal SEQUENCE)
  confidence: number             // 0-1 confidence score
  raw?: any                      // Original data for debugging

  // Timestamps
  firstSeen: Date
  lastSeen: Date
  lastChecked: Date
}

export interface Organizer {
  name: string
  email?: string
  url?: string
}

export type EventStatus = 'scheduled' | 'updated' | 'cancelled' | 'tentative'

export interface SyncResult {
  source: string
  eventsProcessed: number
  eventsCreated: number
  eventsUpdated: number
  errors: string[]
  duration: number               // milliseconds
}

export interface SourceConfig {
  name: string
  enabled: boolean
  cities?: string[]              // Optional: limit to specific cities
  icalUrls?: string[]            // Direct iCal URLs if known
}
