# Supabase Setup Guide

This guide covers setting up Supabase for event data storage.

## Prerequisites

- Supabase account (https://supabase.com)
- Node.js 20+ installed

## 1. Create Supabase Project

1. Go to https://supabase.com/dashboard
2. Click "New project"
3. Choose organization and set:
   - **Project name**: `nsnodes-events` (or your preferred name)
   - **Database password**: Generate strong password (save it!)
   - **Region**: Choose closest to your users
4. Wait for project to be created (~2 minutes)

## 2. Get API Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Copy the following values:
   - **Project URL** (e.g., `https://xxxxx.supabase.co`)
   - **Project API keys** → `service_role` (secret key)

⚠️ **Important**: Use the `service_role` key, not the `anon` key. The service role bypasses Row Level Security (RLS).

## 3. Run Database Migration

### Option A: Via Supabase Dashboard (Easiest)

1. Go to **Database** → **SQL Editor**
2. Create new query
3. Copy the contents of `supabase/migrations/001_events_table.sql`
4. Paste and click "Run"

### Option B: Via Supabase CLI (Recommended for Production)

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
```

## 4. Verify Table Creation

1. Go to **Database** → **Tables**
2. You should see the `events` table
3. Click on it to view the schema

Expected columns:
- `uid` (text, PK)
- `source` (text)
- `title` (text)
- `start_at` (timestamptz)
- ... and others

## 5. Set Environment Variables

### Local Development

Create `.env` file in project root:

```bash
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=your-service-role-key-here
```

### GitHub Actions

1. Go to your GitHub repo → **Settings** → **Secrets and variables** → **Actions**
2. Add two secrets:
   - `SUPABASE_URL`: Your project URL
   - `SUPABASE_KEY`: Your service role key

## 6. Test Connection

Run a simple test to verify connection:

```bash
# Install dependencies
npm install

# Test by listing tasks (shouldn't error on DB connection)
npm run list

# Or run a sync task (will attempt to write to DB)
npm run task luma:events
```

If successful, you should see events being inserted into Supabase!

## 7. View Data

1. Go to **Database** → **Table Editor**
2. Select `events` table
3. You should see ingested events

## Optional: Row Level Security (RLS)

For production API access, enable RLS:

```sql
-- Enable RLS
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Public read access"
  ON events
  FOR SELECT
  USING (true);

-- Service role can do everything (already has this implicitly)
```

## Database Schema

### events table

| Column | Type | Description |
|--------|------|-------------|
| uid | TEXT | Primary key, unique event ID |
| source | TEXT | 'luma' or 'soladay' |
| title | TEXT | Event title |
| description | TEXT | Event description |
| start_at | TIMESTAMPTZ | Event start time |
| end_at | TIMESTAMPTZ | Event end time (optional) |
| city | TEXT | City name |
| lat/lng | DOUBLE PRECISION | Coordinates |
| organizers | JSONB | Array of organizer objects |
| tags | TEXT[] | Array of tags |
| status | TEXT | 'scheduled', 'updated', 'cancelled', 'tentative' |
| confidence | REAL | 0-1 confidence score |
| first_seen | TIMESTAMPTZ | First time event was seen |
| last_seen | TIMESTAMPTZ | Last time event was verified |

## Indexes

The following indexes are created for performance:

- `idx_events_source` - Filter by source
- `idx_events_start_at` - Time-based queries
- `idx_events_city` - Location queries
- `idx_events_fingerprint` - Deduplication

## Troubleshooting

### "Missing SUPABASE_URL or SUPABASE_KEY"

Ensure environment variables are set correctly. For local development, use a `.env` file.

### "Failed to upsert event"

Check Supabase logs:
1. Go to **Database** → **Logs**
2. Look for error messages
3. Common issues:
   - Column mismatch (run migration again)
   - Connection timeout (check firewall)
   - Invalid data format (check normalization)

### "PGRST116: Not Found"

This is normal when querying for a non-existent event. Not an error.

## Next Steps

- Set up GitHub Actions secrets for automated syncing
- Configure RLS for public API access (optional)
- Set up real-time subscriptions (optional)
- Add database backups (Supabase handles this automatically)
