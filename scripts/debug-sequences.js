#!/usr/bin/env node
/**
 * Debug script to inspect sequence numbers from iCal feeds
 * Helps understand if sequence numbers are per-event or global
 */

import { fetchEvents } from '../packages/sources/luma/scrapers/events.js'
import fs from 'fs'

const LUMA_ICAL_URLS = JSON.parse(
  fs.readFileSync('packages/sources/luma/data/ical-urls.json', 'utf8')
)

async function debugSequences() {
  console.log('=== SEQUENCE NUMBER DEBUGGING ===\n')

  // Get first city's iCal URL
  const [citySlug, icalUrl] = Object.entries(LUMA_ICAL_URLS)[0]
  console.log(`City: ${citySlug}`)
  console.log(`iCal URL: ${icalUrl}\n`)

  // Fetch events twice with a small delay
  console.log('Fetching events (first time)...')
  const result1 = await fetchEvents(citySlug, icalUrl)

  if (!result1.success) {
    console.error('Failed to fetch:', result1.error)
    return
  }

  console.log(`Found ${result1.events.length} events\n`)

  // Show first 10 events with their sequence numbers
  console.log('First fetch - sample sequence numbers:')
  for (let i = 0; i < Math.min(10, result1.events.length); i++) {
    const evt = result1.events[i]
    console.log(`  ${evt.uid}: sequence=${evt.sequence}`)
  }

  // Wait 2 seconds
  console.log('\nWaiting 2 seconds...\n')
  await new Promise(resolve => setTimeout(resolve, 2000))

  // Fetch again
  console.log('Fetching events (second time)...')
  const result2 = await fetchEvents(citySlug, icalUrl)

  if (!result2.success) {
    console.error('Failed to fetch:', result2.error)
    return
  }

  console.log(`Found ${result2.events.length} events\n`)

  // Compare sequence numbers
  console.log('Comparing sequence numbers:\n')

  const uids1 = new Map(result1.events.map(e => [e.uid, e.sequence]))
  const uids2 = new Map(result2.events.map(e => [e.uid, e.sequence]))

  let changedCount = 0
  let unchangedCount = 0
  let examples = []

  for (const [uid, seq1] of uids1.entries()) {
    if (uids2.has(uid)) {
      const seq2 = uids2.get(uid)
      if (seq1 !== seq2) {
        changedCount++
        if (examples.length < 10) {
          examples.push({ uid, seq1, seq2, diff: seq2 - seq1 })
        }
      } else {
        unchangedCount++
      }
    }
  }

  console.log(`Events with changed sequence: ${changedCount}`)
  console.log(`Events with unchanged sequence: ${unchangedCount}`)

  if (examples.length > 0) {
    console.log('\nExamples of changed sequences:')
    for (const ex of examples) {
      console.log(`  ${ex.uid}: ${ex.seq1} → ${ex.seq2} (diff: ${ex.diff})`)
    }

    // Check if all diffs are the same (indicating global counter)
    const diffs = examples.map(ex => ex.diff)
    const allSame = diffs.every(d => d === diffs[0])
    if (allSame && diffs.length > 1) {
      console.log(`\n⚠️  All differences are ${diffs[0]} - this suggests:`)
      console.log('     - Either we\'re parsing incorrectly (maybe need to look at DTSTAMP?)')
      console.log('     - Or Luma uses a global sequence counter')
      console.log('     - Per iCal spec (RFC 5545): SEQUENCE should be per-event and only increment when that specific event changes')
    } else if (changedCount > 0) {
      console.log('\n✓ Differences vary - suggests per-event sequence numbers (correct per RFC 5545)')
    }
  } else {
    console.log('\n✓ No sequence changes detected between fetches')
    console.log('   This means: either the feed is cached, or no events were modified in the 2 second interval')
  }

  // Also show the actual sequence values to understand the range
  console.log('\n=== SEQUENCE NUMBER ANALYSIS ===\n')

  const allSequences = result1.events.map(e => e.sequence || 0).filter(s => s > 0)
  if (allSequences.length > 0) {
    const minSeq = Math.min(...allSequences)
    const maxSeq = Math.max(...allSequences)
    const avgSeq = Math.round(allSequences.reduce((a, b) => a + b, 0) / allSequences.length)

    console.log(`Sequence range: ${minSeq} - ${maxSeq}`)
    console.log(`Average sequence: ${avgSeq}`)

    if (minSeq > 100000) {
      console.log('\n⚠️  Very large sequence numbers (>100k) are unusual.')
      console.log('    Per RFC 5545, SEQUENCE starts at 0 and increments for each event update.')
      console.log('    This suggests either:')
      console.log('    1. We\'re parsing the wrong field')
      console.log('    2. Luma is using SEQUENCE for something else (like a global revision ID)')
      console.log('    3. These events have been updated many times')
    } else if (minSeq < 100) {
      console.log('\n✓ Reasonable sequence numbers (<100) suggest normal per-event usage')
    }
  }
}

debugSequences().catch(console.error)
