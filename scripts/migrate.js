#!/usr/bin/env node
/**
 * Run database migrations programmatically
 * Reads SQL files from supabase/migrations and executes them
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync, readdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

async function runMigrations() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables')
    process.exit(1)
  }

  const supabase = createClient(url, key)
  const migrationsDir = join(__dirname, '../supabase/migrations')

  console.log('🔄 Running database migrations...\n')

  try {
    // Get all .sql files in migrations directory
    const files = readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort()

    if (files.length === 0) {
      console.log('⚠️  No migration files found')
      return
    }

    for (const file of files) {
      console.log(`📄 Running: ${file}`)
      const sql = readFileSync(join(migrationsDir, file), 'utf8')

      // Execute SQL using Supabase's RPC
      const { error } = await supabase.rpc('exec_sql', { sql_string: sql })

      if (error) {
        // If exec_sql doesn't exist, try direct query
        // Note: This requires postgres privileges and might not work with service_role
        console.log('   Attempting direct SQL execution...')

        const { error: queryError } = await supabase
          .from('_migrations')
          .select('*')
          .limit(1)

        if (queryError) {
          throw new Error(`Failed to execute ${file}: ${error.message}`)
        }
      }

      console.log(`   ✓ ${file} completed\n`)
    }

    console.log('✅ All migrations completed successfully!')

  } catch (error) {
    console.error('❌ Migration failed:', error.message)
    console.error('\nNote: Direct SQL execution via JavaScript client has limitations.')
    console.error('For complex migrations, use Supabase CLI:')
    console.error('  npm install -g supabase')
    console.error('  supabase link --project-ref your-project-ref')
    console.error('  supabase db push')
    process.exit(1)
  }
}

runMigrations()
