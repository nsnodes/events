import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { SupabaseDatabase } from '../packages/core/database.js'
import type { Event } from '../packages/core/types.js'

// Mirrors SELECT_CHUNK_SIZE / write-path BATCH_SIZE in packages/core/database.ts
const SELECT_CHUNK_SIZE = 100
const BATCH_SIZE = 500

function makeEvent(uid: string): Event {
  const now = new Date('2026-11-13T00:00:00.000Z')
  return {
    uid,
    source: 'soladay',
    sourceUrl: `https://app.sola.day/e/${uid}`,
    title: `Event ${uid}`,
    startAt: now,
    status: 'scheduled',
    confidence: 1,
    firstSeen: now,
    lastSeen: now,
    lastChecked: now
  }
}

interface FakeRow {
  first_seen: string
  fingerprint: string
  city: string | null
  country: string | null
  timezone: string | null
}

/**
 * Minimal fake Supabase client: records every `.in('uid', ...)` SELECT and
 * `.upsert(...)` call, and serves existing rows from a map.
 */
function createFakeClient(existing: Map<string, FakeRow>) {
  const selectCalls: Array<{ columns: string, uids: string[] }> = []
  const upsertCalls: any[][] = []

  const client = {
    from(table: string) {
      assert.equal(table, 'events')
      return {
        select(columns: string) {
          return {
            in(field: string, uids: string[]) {
              assert.equal(field, 'uid')
              selectCalls.push({ columns, uids: [...uids] })
              const data = uids
                .filter(uid => existing.has(uid))
                .map(uid => ({ uid, ...existing.get(uid) }))
              return Promise.resolve({ data, error: null })
            }
          }
        },
        upsert(rows: any[]) {
          upsertCalls.push(rows)
          return Promise.resolve({ error: null })
        }
      }
    }
  }

  return { client: client as unknown as SupabaseClient, selectCalls, upsertCalls }
}

test('upsertEvents chunks the existing-events uid SELECT and preserves first_seen', async () => {
  // 1203 events: thirteen SELECT chunks (100×12 + 3) and three upsert batches
  const events = Array.from({ length: 1203 }, (_, i) => makeEvent(`event-${i}@app.sola.day`))
  const preservedSeen = '2026-01-01T00:00:00.000Z'
  const existing = new Map(
    events.slice(0, 700).map(e => [e.uid, {
      first_seen: preservedSeen,
      fingerprint: `fp-${e.uid}`,
      city: 'Test City',
      country: 'TC',
      timezone: 'UTC'
    }])
  )
  const { client, selectCalls, upsertCalls } = createFakeClient(existing)
  const db = new SupabaseDatabase('https://example.supabase.co', 'test-key', client)

  await db.upsertEvents(events)

  // SELECT ran in chunks of at most SELECT_CHUNK_SIZE, covering every uid exactly once
  assert.equal(selectCalls.length, Math.ceil(events.length / SELECT_CHUNK_SIZE))
  for (const call of selectCalls) {
    assert.ok(call.uids.length <= SELECT_CHUNK_SIZE, `SELECT chunk of ${call.uids.length} exceeds ${SELECT_CHUNK_SIZE}`)
    assert.equal(call.columns, 'uid, first_seen')
  }
  assert.deepEqual(
    selectCalls.flatMap(call => call.uids).sort(),
    events.map(e => e.uid).sort()
  )

  // Write path still chunks at its own (larger) limit
  assert.equal(upsertCalls.length, Math.ceil(events.length / BATCH_SIZE))
  for (const batch of upsertCalls) {
    assert.ok(batch.length <= BATCH_SIZE, `upsert batch of ${batch.length} exceeds ${BATCH_SIZE}`)
  }

  // first_seen preserved for existing rows, fresh for new ones
  const upserted = upsertCalls.flat()
  const byUid = new Map(upserted.map(row => [row.uid, row]))
  assert.equal(upserted.length, events.length)
  for (const event of events) {
    const row = byUid.get(event.uid)
    const expected = existing.has(event.uid) ? preservedSeen : event.firstSeen.toISOString()
    assert.equal(row.first_seen, expected, `first_seen mismatch for ${event.uid}`)
  }
})

test('getEventsByUids chunks the uid SELECT and merges chunk results', async () => {
  // 1002 uids: eleven chunks (100×10 + 2)
  const uids = Array.from({ length: 1002 }, (_, i) => `event-${i}@app.sola.day`)
  const existing = new Map(
    uids.map(uid => [uid, {
      first_seen: '2026-01-01T00:00:00.000Z',
      fingerprint: `fp-${uid}`,
      city: 'Test City',
      country: 'TC',
      timezone: 'UTC'
    }])
  )
  const { client, selectCalls } = createFakeClient(existing)
  const db = new SupabaseDatabase('https://example.supabase.co', 'test-key', client)

  const events = await db.getEventsByUids(uids)

  assert.equal(selectCalls.length, Math.ceil(uids.length / SELECT_CHUNK_SIZE))
  for (const call of selectCalls) {
    assert.ok(call.uids.length <= SELECT_CHUNK_SIZE, `SELECT chunk of ${call.uids.length} exceeds ${SELECT_CHUNK_SIZE}`)
    assert.equal(call.columns, 'uid, fingerprint, city, country, timezone')
  }

  // Every uid's partial event came back exactly once, across chunks
  assert.deepEqual(
    events.map(e => e.uid).sort(),
    [...uids].sort()
  )
  assert.equal(events[0].fingerprint, `fp-${events[0].uid}`)
})

test('getEventsByUids returns [] without querying for an empty batch', async () => {
  const { client, selectCalls } = createFakeClient(new Map())
  const db = new SupabaseDatabase('https://example.supabase.co', 'test-key', client)

  assert.deepEqual(await db.getEventsByUids([]), [])
  assert.equal(selectCalls.length, 0)
})
