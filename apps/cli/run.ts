#!/usr/bin/env node
/**
 * CLI runner for local testing and development
 *
 * Usage:
 *   node apps/cli/run.js schedule:daily
 *   node apps/cli/run.js schedule:weekly
 *   node apps/cli/run.js schedule:sync
 *   node apps/cli/run.js task luma:events
 *   node apps/cli/run.js list
 */

import 'dotenv/config'
import { runSchedule, runTask, listTasks } from '../../packages/orchestrator/runner.js'

const command = process.argv[2]
const arg = process.argv[3]

async function main() {
  try {
    if (!command) {
      console.error('Usage: node apps/cli/run.js <command> [args]')
      console.error('')
      console.error('Commands:')
      console.error('  schedule:daily   - Run daily tasks (discover cities)')
      console.error('  schedule:weekly  - Run weekly tasks (update iCal URLs)')
      console.error('  schedule:polling - Run polling tasks (fetch events every 10 min)')
      console.error('  task <id>        - Run specific task by ID')
      console.error('  list             - List all available tasks')
      process.exit(1)
    }

    // Schedule commands
    if (command === 'schedule:daily') {
      await runSchedule('daily')
    } else if (command === 'schedule:weekly') {
      await runSchedule('weekly')
    } else if (command === 'schedule:polling') {
      await runSchedule('polling')
    }

    // Task command
    else if (command === 'task') {
      if (!arg) {
        console.error('Error: task ID required')
        console.error('Usage: node apps/cli/run.js task <task-id>')
        process.exit(1)
      }
      await runTask(arg)
    }

    // List command
    else if (command === 'list') {
      const tasks = await listTasks()

      console.log('\n📋 Available tasks:\n')

      tasks.forEach(task => {
        console.log(`  ${task.id}`)
        console.log(`    Schedule: ${task.schedule}`)
        console.log(`    ${task.description}`)
        console.log()
      })

      console.log(`Total: ${tasks.length} task(s)`)
    }

    // Unknown command
    else {
      console.error(`Unknown command: ${command}`)
      process.exit(1)
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

main()
