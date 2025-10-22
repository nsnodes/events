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

interface Task {
  id: string;
  schedule: string;
  description?: string;
  enabled?: boolean | (() => boolean);
  run?: () => Promise<any>;
  extractStream?: (db: any) => AsyncGenerator<any[], void, unknown>;
}

interface TaskResult {
  taskId: string;
  success: boolean;
  eventsProcessed?: number;
  duration: number;
  result?: any;
  error?: string;
  skipped?: boolean;
  reason?: string;
}

interface ScheduleResult {
  schedule: string;
  tasksRun: number;
  eventsProcessed: number;
  duration: number;
  tasks?: TaskResult[];
}

interface TaskMetadata {
  id: string;
  schedule: string;
  description: string;
  hasExtractStream: boolean;
  hasRun: boolean;
}

/**
 * Load all task definitions from all sources
 * @returns Array of all tasks
 */
async function loadAllTasks(): Promise<Task[]> {
  const tasks: Task[] = []

  // Find all tasks.ts files in sources
  const sourcesDir = path.join(__dirname, '../sources')
  const taskFiles = await glob('*/tasks.{ts,js}', { cwd: sourcesDir, absolute: true })

  for (const taskFile of taskFiles) {
    try {
      const module = await import(taskFile)
      const sourceTasks: Task[] = module.default || []

      tasks.push(...sourceTasks)
    } catch (error) {
      console.error(`Failed to load tasks from ${taskFile}:`, (error as Error).message)
    }
  }

  return tasks
}

/**
 * Run all tasks matching a specific schedule
 * @param schedule - Schedule name ('polling', 'daily', 'weekly')
 * @returns Execution summary
 */
export async function runSchedule(schedule: string): Promise<ScheduleResult> {
  console.log(`\n🚀 Running schedule: ${schedule}\n`)

  const startTime = Date.now()
  const allTasks = await loadAllTasks()

  // Filter tasks matching this schedule and check if enabled
  const matchingTasks = allTasks.filter(task => {
    if (task.schedule !== schedule) return false

    // Check if task is enabled (if enabled property exists)
    if (task.enabled !== undefined) {
      const isEnabled = typeof task.enabled === 'function' ? task.enabled() : task.enabled
      if (!isEnabled) {
        console.log(`⏭️  Skipping disabled task: ${task.id}`)
        return false
      }
    }

    return true
  })

  if (matchingTasks.length === 0) {
    console.log(`⚠️  No tasks found for schedule: ${schedule}`)
    return {
      schedule: schedule,
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
  const taskResults: TaskResult[] = []

  // Execute each task
  for (const task of matchingTasks) {
    try {
      const taskResult = await executeTask(task)
      taskResults.push(taskResult)

      if (taskResult.eventsProcessed) {
        totalEventsProcessed += taskResult.eventsProcessed
      }
    } catch (error) {
      console.error(`\n❌ Task ${task.id} failed:`, (error as Error).message)
      taskResults.push({
        taskId: task.id,
        success: false,
        error: (error as Error).message,
        duration: 0
      })
    }
  }

  const duration = Date.now() - startTime

  console.log(`\n✨ Schedule complete in ${(duration / 1000).toFixed(1)}s`)
  console.log(`   Tasks run: ${matchingTasks.length}`)
  console.log(`   Events processed: ${totalEventsProcessed}`)

  return {
    schedule,
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
async function executeTask(task: Task): Promise<TaskResult> {
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
 * @param taskId - Task identifier (e.g., 'luma:events')
 * @returns Task result
 */
export async function runTask(taskId: string): Promise<TaskResult> {
  console.log(`\n🎯 Running task: ${taskId}\n`)

  const allTasks = await loadAllTasks()
  const task = allTasks.find(t => t.id === taskId)

  if (!task) {
    throw new Error(`Task not found: ${taskId}`)
  }

  // Check if task is enabled
  if (task.enabled !== undefined) {
    const isEnabled = typeof task.enabled === 'function' ? task.enabled() : task.enabled
    if (!isEnabled) {
      console.log(`⏭️  Task is disabled: ${task.id}`)
      return {
        taskId: task.id,
        success: false,
        skipped: true,
        reason: 'Task is disabled via config',
        duration: 0
      }
    }
  }

  return await executeTask(task)
}

/**
 * List all available tasks
 * @returns Array of task metadata
 */
export async function listTasks(): Promise<TaskMetadata[]> {
  const allTasks = await loadAllTasks()

  return allTasks.map(task => ({
    id: task.id,
    schedule: task.schedule,
    description: task.description || 'No description',
    hasExtractStream: !!task.extractStream,
    hasRun: !!task.run
  }))
}
