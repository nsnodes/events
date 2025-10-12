#!/usr/bin/env node
/**
 * CLI runner for local testing
 * Usage: node apps/cli/run.ts
 */

import { sync } from '../../packages/orchestrator/sync.js'

async function main() {
  try {
    const result = await sync()

    // Exit with error code if there were errors
    if (result.totalErrors > 0) {
      process.exit(1)
    }
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

main()
