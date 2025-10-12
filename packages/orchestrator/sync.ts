/**
 * Main orchestrator - coordinates syncing from all sources
 * Deployment-agnostic: can be called from GitHub Actions, Vercel Cron, CLI, etc.
 */

import { syncLuma } from '../sources/luma/client.js'
import { syncSoladay } from '../sources/soladay/client.js'
import type { SyncResult } from '../core/types.js'

export async function sync(): Promise<{
  results: SyncResult[]
  totalEvents: number
  totalErrors: number
  duration: number
}> {
  const startTime = Date.now()

  console.log('🚀 Starting event sync...\n')

  const results: SyncResult[] = []

  // Sync Luma
  try {
    const lumaResult = await syncLuma()
    results.push(lumaResult)
    console.log(`\n✓ Luma: ${lumaResult.eventsProcessed} events in ${lumaResult.duration}ms`)
    if (lumaResult.errors.length > 0) {
      console.log(`  Errors: ${lumaResult.errors.length}`)
    }
  } catch (error) {
    console.error('✗ Luma sync failed:', error)
    results.push({
      source: 'luma',
      eventsProcessed: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      duration: 0
    })
  }

  // Sync Sola.day
  try {
    const soladayResult = await syncSoladay()
    results.push(soladayResult)
    console.log(`✓ Sola.day: ${soladayResult.eventsProcessed} events in ${soladayResult.duration}ms`)
    if (soladayResult.errors.length > 0) {
      console.log(`  Errors: ${soladayResult.errors.length}`)
    }
  } catch (error) {
    console.error('✗ Sola.day sync failed:', error)
    results.push({
      source: 'soladay',
      eventsProcessed: 0,
      eventsCreated: 0,
      eventsUpdated: 0,
      errors: [error instanceof Error ? error.message : String(error)],
      duration: 0
    })
  }

  const totalEvents = results.reduce((sum, r) => sum + r.eventsProcessed, 0)
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0)
  const duration = Date.now() - startTime

  console.log(`\n✨ Sync complete: ${totalEvents} events, ${totalErrors} errors, ${duration}ms`)

  return {
    results,
    totalEvents,
    totalErrors,
    duration
  }
}
