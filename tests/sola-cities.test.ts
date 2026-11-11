import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  detectDiscoveryAnomaly,
  saveCities,
} from '../packages/sources/sola/scrapers/cities.js'

// Regression tests for the 2026-11-11 incident: app.sola.day silently 308'd
// to sola.day, which rendered a Next.js error boundary with zero /event/
// links, and the daily beat committed an empty dataset over a month-long
// 21-city one. Discovery must flag these anomalies and saveCities must
// refuse to overwrite retained data with a failed/empty result.

const REQUESTED_URL = 'https://app.sola.day/'

const city = (slug: string) => ({
  slug,
  url: `https://app.sola.day/event/${slug}`,
  title: slug,
  dates: null,
  location: null,
  imageUrl: null,
})

test('detectDiscoveryAnomaly flags a redirect away from the requested page', () => {
  const anomaly = detectDiscoveryAnomaly({
    requestedUrl: REQUESTED_URL,
    finalUrl: 'https://sola.day/',
    cities: [],
    pageText: 'Something went wrong!',
  })

  assert.match(anomaly!, /Redirected from https:\/\/app\.sola\.day\/ to https:\/\/sola\.day\//)
})

test('detectDiscoveryAnomaly accepts the same page after a trailing-slash redirect', () => {
  const anomaly = detectDiscoveryAnomaly({
    requestedUrl: REQUESTED_URL,
    finalUrl: 'https://app.sola.day',
    cities: [city('prospera')],
    pageText: 'Popup cities',
  })

  assert.equal(anomaly, null)
})

test('detectDiscoveryAnomaly flags a rendered error boundary', () => {
  const anomaly = detectDiscoveryAnomaly({
    requestedUrl: REQUESTED_URL,
    finalUrl: REQUESTED_URL,
    cities: [],
    pageText: 'Application error: a client-side exception has occurred',
  })

  assert.match(anomaly!, /error boundary/)
})

test('detectDiscoveryAnomaly flags an empty city list on the correct page', () => {
  const anomaly = detectDiscoveryAnomaly({
    requestedUrl: REQUESTED_URL,
    finalUrl: REQUESTED_URL,
    cities: [],
    pageText: 'Upcoming popup cities',
  })

  assert.match(anomaly!, /no popup cities/)
})

test('detectDiscoveryAnomaly accepts a healthy result', () => {
  const anomaly = detectDiscoveryAnomaly({
    requestedUrl: REQUESTED_URL,
    finalUrl: REQUESTED_URL,
    cities: [city('prospera'), city('cabo')],
    pageText: 'Prospera by ... Cabo by ...',
  })

  assert.equal(anomaly, null)
})

test('saveCities refuses a failed result and keeps the previous data files', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'sola-cities-test-'))
  const retained = JSON.stringify({ success: true, timestamp: '2026-10-31T00:00:00.000Z', totalCities: 21, cities: [city('prospera')] })
  writeFileSync(join(dataDir, 'cities.json'), retained)
  writeFileSync(join(dataDir, 'city-slugs.json'), JSON.stringify(['prospera']))

  try {
    assert.throws(
      () => saveCities({ success: false, timestamp: '2026-11-11T05:11:36.000Z', error: 'Redirected from https://app.sola.day/ to https://sola.day/', cities: [] }, dataDir),
      /keeping previous data files/,
    )
    assert.throws(
      () => saveCities({ success: true, timestamp: '2026-11-11T05:11:36.000Z', totalCities: 0, cities: [] }, dataDir),
      /empty city list/,
    )

    assert.equal(readFileSync(join(dataDir, 'cities.json'), 'utf-8'), retained)
    assert.equal(readFileSync(join(dataDir, 'city-slugs.json'), 'utf-8'), JSON.stringify(['prospera']))
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})

test('saveCities writes a healthy result', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'sola-cities-test-'))

  try {
    saveCities({ success: true, timestamp: '2026-11-11T05:11:36.000Z', totalCities: 1, cities: [city('prospera')] }, dataDir)

    const saved = JSON.parse(readFileSync(join(dataDir, 'cities.json'), 'utf-8'))
    assert.equal(saved.cities.length, 1)
    assert.deepEqual(JSON.parse(readFileSync(join(dataDir, 'city-slugs.json'), 'utf-8')), ['prospera'])
  } finally {
    rmSync(dataDir, { recursive: true, force: true })
  }
})
