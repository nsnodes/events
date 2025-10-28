#!/usr/bin/env tsx
/**
 * Tag Network School events with community tags
 *
 * Usage: tsx scripts/tag-events.ts
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env.local') })

const supabaseUrl = process.env.SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

interface TagRule {
  name: string
  keywords: string[]
  checkTitle?: boolean
  checkDescription?: boolean
  checkLocation?: boolean
  checkOrganizers?: boolean
}

const TAG_RULES: TagRule[] = [
  {
    name: 'commons',
    keywords: ['commons'],
    checkTitle: true,
    checkDescription: true,
    checkLocation: true
  }
  // Arc tagging removed per user request
]

async function tagEvents() {
  console.log('Fetching Network School events...')

  // Fetch all Luma events - we'll check them all for Arc/Commons mentions
  // Since NS events don't have a clear identifier, we'll tag any Luma event
  // that matches our tag rules
  const { data: events, error } = await supabase
    .from('events')
    .select('*')
    .eq('source', 'luma')

  if (error) {
    console.error('Error fetching events:', error)
    process.exit(1)
  }

  if (!events || events.length === 0) {
    console.log('No Network School events found')
    return
  }

  console.log(`Found ${events.length} Network School events`)

  let updateCount = 0
  const updatedEvents: Array<{ uid: string; title: string; oldTags: string[]; newTags: string[] }> = []

  for (const event of events) {
    const title = event.title || ''
    const description = event.description || ''
    const location = event.address || event.venue_name || ''
    const organizerNames = (event.organizers || []).map((o: any) => o.name || '').join(' ')
    const existingTags = event.tags || []
    const newTags = new Set<string>(existingTags)

    // Check each tag rule
    for (const rule of TAG_RULES) {
      // Skip if already tagged
      if (existingTags.includes(rule.name)) {
        continue
      }

      let matched = false

      for (const keyword of rule.keywords) {
        const regex = new RegExp(keyword, 'i')

        if (rule.checkTitle && regex.test(title)) {
          matched = true
          break
        }

        if (rule.checkDescription && regex.test(description)) {
          matched = true
          break
        }

        if (rule.checkLocation && regex.test(location)) {
          matched = true
          break
        }

        if (rule.checkOrganizers && regex.test(organizerNames)) {
          matched = true
          break
        }
      }

      if (matched) {
        newTags.add(rule.name)

        // Also add to raw data for easy access
        if (event.raw && typeof event.raw === 'object') {
          event.raw._tags = Array.from(newTags)
        }
      }
    }

    // Update if tags changed
    const finalTags = Array.from(newTags)
    if (JSON.stringify(finalTags.sort()) !== JSON.stringify(existingTags.sort())) {
      const { error: updateError } = await supabase
        .from('events')
        .update({
          tags: finalTags,
          raw: event.raw
        })
        .eq('uid', event.uid)

      if (updateError) {
        console.error(`Error updating event ${event.uid}:`, updateError)
      } else {
        updateCount++
        updatedEvents.push({
          uid: event.uid,
          title: event.title,
          oldTags: existingTags,
          newTags: finalTags
        })
      }
    }
  }

  console.log(`\nTagging complete!`)
  console.log(`Updated ${updateCount} events\n`)

  if (updatedEvents.length > 0) {
    console.log('Updated events:')
    for (const event of updatedEvents) {
      const addedTags = event.newTags.filter(t => !event.oldTags.includes(t))
      console.log(`  - ${event.title}`)
      console.log(`    Added tags: ${addedTags.join(', ')}`)
    }
  }

  // Summary by tag
  console.log('\nSummary by tag:')
  for (const rule of TAG_RULES) {
    const count = updatedEvents.filter(e => e.newTags.includes(rule.name)).length
    if (count > 0) {
      console.log(`  ${rule.name}: ${count} events`)
    }
  }
}

tagEvents().catch(console.error)
