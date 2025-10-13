# Event Ingestion Architecture

Simple, reliable event sync from Luma and Sola.day using official iCal feeds.

## Overview

Instead of scraping HTML with Playwright, we use **iCal feeds** provided by platforms like Luma. This is simpler, faster, more reliable, and respects rate limits.

## System Design

```
┌─────────────────────────────────────────┐
│  Scheduler (GitHub Actions / Vercel)   │
│  Runs every hour                        │
└──────────────┬──────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────┐
│  Orchestrator                            │
│  - Coordinates source syncs              │
│  - Aggregates results                    │
└──────────────┬───────────────────────────┘
               │
       ┌───────┴────────┐
       │                 │
       ▼                 ▼
┌─────────────┐   ┌─────────────┐
│ Luma Source │   │ Sola Source │
│ - Fetch iCal│   │ - TBD       │
│ - Parse     │   │             │
│ - Normalize │   │             │
└──────┬──────┘   └──────┬──────┘
       │                 │
       └────────┬────────┘
                ▼
       ┌─────────────────┐
       │ Supabase DB     │
       │ - Upsert events │
       │ - Track updates │
       └─────────────────┘
```

## Why iCal?

**Advantages:**
- ✅ **Official API** - No anti-bot concerns, no captchas
- ✅ **Structured data** - Standardized format (RFC 5545)
- ✅ **Fast** - No browser needed, simple HTTP fetch
- ✅ **Update detection** - SEQUENCE field tracks versions
- ✅ **Unique IDs** - UID field for deduplication
- ✅ **Geocoding included** - GEO field provides coordinates
- ✅ **Reliable** - Won't break when UI changes

**What we get from Luma iCal:**
- Event title, description
- Start/end times (UTC)
- Location (address + coordinates)
- Organizer info
- Status (confirmed/tentative/cancelled)
- Version number (detects updates)
- Link to original event page (in description)

## Directory Structure

```
packages/
├── core/                 # Shared types and utilities
│   ├── types.ts          # Event, SyncResult interfaces
│   ├── database.ts       # Supabase client wrapper
│   └── fingerprint.ts    # Deduplication helpers
│
├── sources/              # Publisher-specific extractors
│   ├── luma/
│   │   ├── client.ts     # Fetch iCal feeds
│   │   ├── parser.ts     # iCal → Event transform
│   │   └── cities.json   # City configuration
│   └── soladay/
│       └── client.ts     # TBD
│
└── orchestrator/
    └── sync.ts           # Main coordinator

apps/
├── cli/                  # Local testing: node apps/cli/run.ts
└── cron-vercel/          # Future: Vercel deployment

.github/workflows/
└── sync-events.yml       # GitHub Actions cron
```

## Data Flow

1. **Scheduler triggers** (hourly cron)
2. **Orchestrator** calls each source sync function
3. **Luma client:**
   - Reads `cities.json` config
   - For each city:
     - Fetch iCal URL (from config or discover it)
     - Download `.ics` file
     - Parse VEVENT blocks
4. **Parser** transforms iCal → normalized Event objects
5. **Database** upserts events (dedupe by UID)
6. **Results** logged and aggregated

## Database Schema

**events table:**
- `uid` (PK) - From iCal UID field
- `fingerprint` - SHA256 hash for cross-source deduplication
- `source` - 'luma' | 'soladay'
- `source_url` - Link to original event
- Event fields: title, description, start/end times, location, etc.
- `sequence` - Version number (from iCal SEQUENCE)
- `confidence` - 0.98 for iCal (high trust)
- Timestamps: first_seen, last_seen, last_checked

**Update detection:**
- Compare incoming `sequence` with stored value
- If higher → update event and set status='updated'
- If same → just update last_checked timestamp

## City Discovery

**Current approach:**
- Manual curation in `cities.json`
- Start with top 20-30 cities

**Future automation:**
1. Scrape Luma's discover page once/week
2. Extract all city links
3. For each city page, find iCal subscription URL
4. Update `cities.json`
5. Existing `scripts/extract-luma-cities.js` can be adapted

## Deployment Options

**GitHub Actions (recommended for OSS):**
- Zero setup for contributors (fork + add secrets)
- Free tier: 2000 min/month (way more than needed)
- Built-in cron scheduler
- Manual trigger button for testing

**Vercel Cron (future):**
- Fast edge runtime
- Better for frequent syncs (< 5 min intervals)
- Requires Vercel account

**Self-hosted:**
- Run `node apps/cli/run.ts` via systemd timer or cron

## TODO

- [ ] Implement iCal parsing (use `ical.js` or `node-ical` library)
- [ ] Complete Supabase database integration
- [ ] Add city discovery automation
- [ ] Implement Sola.day source (investigate if they have iCal)
- [ ] Add monitoring/alerting for failed syncs
- [ ] Create public API endpoints for monetization

## Running Locally

```bash
# Install dependencies
npm install

# Set environment variables
export SUPABASE_URL=your_url
export SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Run sync
npm run sync
```

## Testing

Existing Playwright probes in `tests/` can be used to:
- Validate iCal URLs still work
- Check for changes in page structure
- Discover new cities

## Scalability

This architecture easily handles:
- **10K events/hour** with simple HTTP fetches
- **50+ cities** in parallel
- **Multiple sources** (add new sources without changing core)

If you need more:
- Add caching layer (Redis)
- Implement incremental sync (only check updated events)
- Use database replication for read-heavy API
