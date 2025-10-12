/**
 * Database operations (Supabase)
 * Can be swapped out for other databases without changing core logic
 */

import type { Event } from './types.js'

export interface Database {
  upsertEvent(event: Event): Promise<void>
  upsertEvents(events: Event[]): Promise<void>
  getEventByUid(uid: string): Promise<Event | null>
}

// Placeholder - will be implemented with actual Supabase client
export class SupabaseDatabase implements Database {
  constructor(
    private url: string,
    private key: string
  ) {}

  async upsertEvent(event: Event): Promise<void> {
    // TODO: Implement Supabase upsert
    throw new Error('Not implemented')
  }

  async upsertEvents(events: Event[]): Promise<void> {
    // TODO: Batch upsert
    throw new Error('Not implemented')
  }

  async getEventByUid(uid: string): Promise<Event | null> {
    // TODO: Query by UID
    throw new Error('Not implemented')
    return null
  }
}

export function createDatabase(): Database {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_KEY

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_KEY environment variables')
  }

  return new SupabaseDatabase(url, key)
}
