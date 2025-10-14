#!/usr/bin/env node
/**
 * Inspect raw iCal VEVENT blocks to verify SEQUENCE field parsing
 */

import https from 'https'
import http from 'http'
import fs from 'fs'

const LUMA_ICAL_URLS = JSON.parse(
  fs.readFileSync('packages/sources/luma/data/ical-urls.json', 'utf8')
)

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http
    client.get(url, (response) => {
      let data = ''
      response.on('data', chunk => data += chunk)
      response.on('end', () => resolve(data))
    }).on('error', reject)
  })
}

async function inspectRawIcal() {
  console.log('=== RAW ICAL INSPECTION ===\n')

  const [citySlug, icalUrl] = Object.entries(LUMA_ICAL_URLS)[0]
  console.log(`City: ${citySlug}`)
  console.log(`iCal URL: ${icalUrl}\n`)

  console.log('Fetching raw iCal data...\n')
  const icalData = await fetchUrl(icalUrl)

  // Extract first 3 VEVENT blocks
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g
  let match
  let count = 0

  console.log('First 3 VEVENT blocks:\n')
  console.log('=' .repeat(80))

  while ((match = veventRegex.exec(icalData)) !== null && count < 3) {
    count++
    const veventBlock = match[1]

    console.log(`\nVEVENT #${count}:`)
    console.log('-'.repeat(80))

    // Unfold lines (remove line folding: CRLF + space)
    const unfoldedBlock = veventBlock.replace(/\r?\n[ \t]/g, '')
    const lines = unfoldedBlock.split('\n').map(l => l.trim()).filter(Boolean)

    // Show the key fields
    for (const line of lines) {
      if (line.startsWith('UID:') ||
          line.startsWith('SUMMARY:') ||
          line.startsWith('SEQUENCE:') ||
          line.startsWith('DTSTAMP:') ||
          line.startsWith('DTSTART:') ||
          line.startsWith('LAST-MODIFIED:')) {
        console.log(`  ${line}`)
      }
    }
  }

  console.log('\n' + '='.repeat(80))
  console.log('\nKey observations:')
  console.log('1. Do all events have the same SEQUENCE value?')
  console.log('2. Is there another field (like DTSTAMP or LAST-MODIFIED) that varies per event?')
  console.log('3. Are we parsing the correct field?\n')

  // Extract all SEQUENCE values
  const sequenceValues = []
  const sequenceRegex = /SEQUENCE:(\d+)/g
  let seqMatch
  while ((seqMatch = sequenceRegex.exec(icalData)) !== null) {
    sequenceValues.push(parseInt(seqMatch[1]))
  }

  const uniqueSequences = [...new Set(sequenceValues)]
  console.log(`Total SEQUENCE fields found: ${sequenceValues.length}`)
  console.log(`Unique SEQUENCE values: ${uniqueSequences.length}`)
  console.log(`Values: ${uniqueSequences.slice(0, 10).join(', ')}${uniqueSequences.length > 10 ? '...' : ''}`)

  if (uniqueSequences.length === 1) {
    console.log('\n⚠️  ALL events have the SAME sequence number!')
    console.log('    This confirms Luma is using SEQUENCE as a global counter, not per-event.')
  } else {
    console.log('\n✓ Events have different sequence numbers (per-event tracking)')
  }
}

inspectRawIcal().catch(console.error)
