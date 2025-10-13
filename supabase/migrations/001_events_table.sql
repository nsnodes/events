-- Events table for normalized event data from all sources
CREATE TABLE IF NOT EXISTS events (
  -- Identifiers
  uid TEXT PRIMARY KEY,
  fingerprint TEXT,

  -- Source metadata
  source TEXT NOT NULL CHECK (source IN ('luma', 'soladay')),
  source_url TEXT NOT NULL,
  source_event_id TEXT,

  -- Core event data
  title TEXT NOT NULL,
  description TEXT,
  start_at TIMESTAMPTZ NOT NULL,
  end_at TIMESTAMPTZ,
  timezone TEXT,

  -- Location
  venue_name TEXT,
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  city TEXT,
  country TEXT,

  -- Additional metadata
  organizers JSONB DEFAULT '[]'::JSONB,
  tags TEXT[] DEFAULT '{}'::TEXT[],
  image_url TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'updated', 'cancelled', 'tentative')),

  -- Tracking
  sequence INTEGER DEFAULT 0,
  confidence REAL NOT NULL DEFAULT 0.9 CHECK (confidence >= 0 AND confidence <= 1),
  raw JSONB,

  -- Timestamps
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_events_source ON events(source);
CREATE INDEX IF NOT EXISTS idx_events_start_at ON events(start_at);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_fingerprint ON events(fingerprint);
CREATE INDEX IF NOT EXISTS idx_events_source_event_id ON events(source, source_event_id);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comment on table
COMMENT ON TABLE events IS 'Normalized event data aggregated from multiple sources (Luma, Sola.day, etc.)';
