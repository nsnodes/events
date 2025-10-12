/**
 * Fingerprint generation for deduplication
 * Creates stable hash from title + start time + location
 */

import { createHash } from 'crypto'

export function generateFingerprint(
  title: string,
  startAt: Date,
  city?: string,
  lat?: number,
  lng?: number
): string {
  // Normalize title
  const normalizedTitle = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

  // UTC timestamp
  const timestamp = startAt.toISOString().split('.')[0] + 'Z'

  // Location (prefer city, fallback to rounded coordinates)
  const location = city
    ? city.toLowerCase()
    : (lat && lng)
      ? `${lat.toFixed(2)},${lng.toFixed(2)}`
      : ''

  const input = `${normalizedTitle}::${timestamp}::${location}`

  return createHash('sha256')
    .update(input)
    .digest('hex')
    .substring(0, 32)
}

export function generateContentHash(
  title: string,
  startAt: Date,
  description?: string
): string {
  const input = `${title}${startAt.toISOString()}${description || ''}`

  return createHash('sha256')
    .update(input)
    .digest('hex')
}
