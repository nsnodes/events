import assert from 'node:assert/strict'
import test from 'node:test'

import {
  generateContentHash,
  generateFingerprint,
} from '../packages/core/fingerprint.js'
import {
  PermanentError,
  TransientError,
  categorizeError,
  retry,
} from '../packages/core/retry.js'

test('event fingerprints normalize titles and cities deterministically', () => {
  const startAt = new Date('2026-09-01T12:34:56.789Z')

  assert.equal(
    generateFingerprint('  Network-State Meetup! ', startAt, 'Stockholm'),
    generateFingerprint('network state meetup', startAt, 'STOCKHOLM'),
  )
  assert.notEqual(
    generateFingerprint('Network State Meetup', startAt, 'Stockholm'),
    generateFingerprint('Network State Meetup', startAt, 'Gothenburg'),
  )
  assert.equal(generateContentHash('Title', startAt), generateContentHash('Title', startAt))
})

test('retry retries transient failures and returns the successful result', async () => {
  let attempts = 0
  const result = await retry(
    async () => {
      attempts += 1
      if (attempts < 3) throw new TransientError('temporary network failure')
      return 'ok'
    },
    { maxAttempts: 3, initialDelay: 0 },
  )

  assert.equal(result, 'ok')
  assert.equal(attempts, 3)
})

test('retry does not retry permanent failures', async () => {
  let attempts = 0
  await assert.rejects(
    retry(
      async () => {
        attempts += 1
        throw new PermanentError('invalid event')
      },
      { maxAttempts: 3, initialDelay: 0 },
    ),
    PermanentError,
  )
  assert.equal(attempts, 1)
  assert.equal(categorizeError(new Error('HTTP 503')), 'transient')
  assert.equal(categorizeError(new Error('HTTP 404')), 'permanent')
})
