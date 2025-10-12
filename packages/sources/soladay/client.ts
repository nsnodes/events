/**
 * Sola.day client (placeholder)
 * TODO: Investigate if Sola.day provides iCal feeds or requires scraping
 */

import type { SyncResult } from '../../core/types.js'

export async function syncSoladay(): Promise<SyncResult> {
  const startTime = Date.now()

  console.log('Sola.day sync not implemented yet')

  return {
    source: 'soladay',
    eventsProcessed: 0,
    eventsCreated: 0,
    eventsUpdated: 0,
    errors: ['Not implemented'],
    duration: Date.now() - startTime
  }
}
