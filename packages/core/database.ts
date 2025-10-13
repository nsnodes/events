/**
 * Database operations (Supabase)
 * Can be swapped out for other databases without changing core logic
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Event } from './types.js'

export interface Database {
  upsertEvent(event: Event): Promise<void>
  upsertEvents(events: Event[]): Promise<void>
  getEventByUid(uid: string): Promise<Event | null>
  getEventsByUids(uids: string[]): Promise<Event[]>
}

/**
 * Transform Event object to database row format
 */
function eventToRow(event: Event): any {
  return {
    uid: event.uid,
    fingerprint: event.fingerprint || null,

    source: event.source,
    source_url: event.sourceUrl,
    source_event_id: event.sourceEventId || null,

    title: event.title,
    description: event.description || null,
    start_at: event.startAt.toISOString(),
    end_at: event.endAt ? event.endAt.toISOString() : null,
    timezone: event.timezone || null,

    venue_name: event.venueName || null,
    address: event.address || null,
    lat: event.lat || null,
    lng: event.lng || null,
    city: event.city || null,
    country: event.country || null,

    organizers: event.organizers || [],
    tags: event.tags || [],
    image_url: event.imageUrl || null,
    status: event.status,

    sequence: event.sequence || 0,
    confidence: event.confidence,
    raw: event.raw || null,

    first_seen: event.firstSeen.toISOString(),
    last_seen: event.lastSeen.toISOString(),
    last_checked: event.lastChecked.toISOString()
  }
}

/**
 * Transform database row to Event object
 */
function rowToEvent(row: any): Event {
  return {
    uid: row.uid,
    fingerprint: row.fingerprint,

    source: row.source,
    sourceUrl: row.source_url,
    sourceEventId: row.source_event_id,

    title: row.title,
    description: row.description,
    startAt: new Date(row.start_at),
    endAt: row.end_at ? new Date(row.end_at) : undefined,
    timezone: row.timezone,

    venueName: row.venue_name,
    address: row.address,
    lat: row.lat,
    lng: row.lng,
    city: row.city,
    country: row.country,

    organizers: row.organizers || [],
    tags: row.tags || [],
    imageUrl: row.image_url,
    status: row.status,

    sequence: row.sequence,
    confidence: row.confidence,
    raw: row.raw,

    firstSeen: new Date(row.first_seen),
    lastSeen: new Date(row.last_seen),
    lastChecked: new Date(row.last_checked)
  }
}

export class SupabaseDatabase implements Database {
  private client: SupabaseClient

  constructor(url: string, key: string) {
    this.client = createClient(url, key)
  }

  async upsertEvent(event: Event): Promise<void> {
    const row = eventToRow(event)

    // Check if event exists to preserve first_seen
    const existing = await this.getEventByUid(event.uid)
    if (existing) {
      row.first_seen = existing.firstSeen.toISOString()
    }

    const { error } = await this.client
      .from('events')
      .upsert(row, {
        onConflict: 'uid'
      })

    if (error) {
      throw new Error(`Failed to upsert event: ${error.message}`)
    }
  }

  async upsertEvents(events: Event[]): Promise<void> {
    if (events.length === 0) {
      return
    }

    const rows = events.map(eventToRow)

    // Get existing events to preserve first_seen timestamps
    const uids = events.map(e => e.uid)
    const { data: existingRows } = await this.client
      .from('events')
      .select('uid, first_seen')
      .in('uid', uids)

    const existingMap = new Map(
      (existingRows || []).map(row => [row.uid, row.first_seen])
    )

    // Preserve first_seen for existing events
    rows.forEach(row => {
      if (existingMap.has(row.uid)) {
        row.first_seen = existingMap.get(row.uid)
      }
    })

    // Supabase has a limit on batch size, so chunk if needed
    const BATCH_SIZE = 500
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE)

      const { error } = await this.client
        .from('events')
        .upsert(batch, {
          onConflict: 'uid'
        })

      if (error) {
        throw new Error(`Failed to upsert events batch: ${error.message}`)
      }
    }
  }

  async getEventByUid(uid: string): Promise<Event | null> {
    const { data, error } = await this.client
      .from('events')
      .select('*')
      .eq('uid', uid)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        // Not found
        return null
      }
      throw new Error(`Failed to fetch event: ${error.message}`)
    }

    return data ? rowToEvent(data) : null
  }

  async getEventsByUids(uids: string[]): Promise<Event[]> {
    if (uids.length === 0) {
      return []
    }

    // Fetch only uid, sequence, city, country for optimization
    const { data, error } = await this.client
      .from('events')
      .select('uid, sequence, city, country')
      .in('uid', uids)

    if (error) {
      throw new Error(`Failed to fetch events: ${error.message}`)
    }

    // Return partial Event objects (only fields needed for optimization)
    return (data || []).map(row => ({
      uid: row.uid,
      sequence: row.sequence,
      city: row.city,
      country: row.country
    } as any))
  }
}

export function createDatabase(): Database {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
  }

  return new SupabaseDatabase(url, key)
}
