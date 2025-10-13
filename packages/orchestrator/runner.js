/**
 * Task Orchestrator
 *
 * Generic runner that discovers and executes tasks from all event sources
 * based on cron schedule patterns. Source-agnostic.
 */

import { createDatabase } from '../core/database.js'
import { glob } from 'glob'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Load all task definitions from all sources
 * @returns {Promise<Array>} Array of all tasks
 */
async function loadAllTasks() {
  const tasks = []

  // Find all tasks.js files in sources
  const sourcesDir = path.join(__dirname, '../sources')
  const taskFiles = await glob('*/tasks.js', { cwd: sourcesDir, absolute: true })

  for (const taskFile of taskFiles) {
    try {
      const module = await import(taskFile)
      const sourceTasks = module.default || []

      tasks.push(...sourceTasks)
    } catch (error) {
      console.error(`Failed to load tasks from ${taskFile}:`, error.message)
    }
  }

  return tasks
}

/**
 * Run all tasks matching a specific cron schedule
 * @param {string} cronPattern - Cron pattern to match
 * @returns {Promise<Object>} Execution summary
 */
export async function runSchedule(cronPattern) {
  console.log(`\n🚀 Running schedule: ${cronPattern}\n`)

  const startTime = Date.now()
  const allTasks = await loadAllTasks()

  // Filter tasks matching this cron pattern
  const matchingTasks = allTasks.filter(task => task.cron === cronPattern)

  if (matchingTasks.length === 0) {
    console.log(`⚠️  No tasks found for schedule: ${cronPattern}`)
    return {
      schedule: cronPattern,
      tasksRun: 0,
      eventsProcessed: 0,
      duration: Date.now() - startTime
    }
  }

  console.log(`Found ${matchingTasks.length} task(s) to run:\n`)
  matchingTasks.forEach(task => {
    console.log(`  - ${task.id}: ${task.description || 'No description'}`)
  })
  console.log()

  let totalEventsProcessed = 0
  const taskResults = []

  // Execute each task
  for (const task of matchingTasks) {
    try {
      const taskResult = await executeTask(task)
      taskResults.push(taskResult)

      if (taskResult.eventsProcessed) {
        totalEventsProcessed += taskResult.eventsProcessed
      }
    } catch (error) {
      console.error(`\n❌ Task ${task.id} failed:`, error.message)
      taskResults.push({
        taskId: task.id,
        success: false,
        error: error.message
      })
    }
  }

  const duration = Date.now() - startTime

  console.log(`\n✨ Schedule complete in ${(duration / 1000).toFixed(1)}s`)
  console.log(`   Tasks run: ${matchingTasks.length}`)
  console.log(`   Events processed: ${totalEventsProcessed}`)

  return {
    schedule: cronPattern,
    tasksRun: matchingTasks.length,
    eventsProcessed: totalEventsProcessed,
    duration,
    tasks: taskResults
  }
}

/**
 * Execute a single task
 * @private
 */
async function executeTask(task) {
  const startTime = Date.now()

  // Task with extractStream (yields normalized events to save)
  if (task.extractStream) {
    let eventsProcessed = 0
    const db = createDatabase()

    // Pass database to task for optimization
    for await (const eventBatch of task.extractStream(db)) {
      // eventBatch is an array of normalized events
      if (Array.isArray(eventBatch) && eventBatch.length > 0) {
        await db.upsertEvents(eventBatch)
        eventsProcessed += eventBatch.length
      }
    }

    return {
      taskId: task.id,
      success: true,
      eventsProcessed,
      duration: Date.now() - startTime
    }
  }

  // Task with run() (performs side effects, no event extraction)
  if (task.run) {
    const result = await task.run()

    return {
      taskId: task.id,
      success: true,
      result,
      duration: Date.now() - startTime
    }
  }

  throw new Error(`Task ${task.id} has no extractStream or run method`)
}

/**
 * Run a specific task by ID (for testing)
 * @param {string} taskId - Task identifier (e.g., 'luma:events')
 * @returns {Promise<Object>} Task result
 */
export async function runTask(taskId) {
  console.log(`\n🎯 Running task: ${taskId}\n`)

  const allTasks = await loadAllTasks()
  const task = allTasks.find(t => t.id === taskId)

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  return await executeTask(task)
}

/**
 * List all available tasks
 * @returns {Promise<Array>} Array of task metadata
 */
export async function listTasks() {
  const allTasks = await loadAllTasks()

  return allTasks.map(task => ({
    id: task.id,
    cron: task.cron,
    description: task.description || 'No description',
    hasExtractStream: !!task.extractStream,
    hasRun: !!task.run
  }))
}
