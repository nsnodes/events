# Luma Event Source

Scraper for Luma.com events using a three-tier architecture optimized for different update frequencies.

## Quick Start

```bash
# 1. Extract city list (run once, then daily)
npm run luma:cities

# 2. Extract iCal URLs (run once, then weekly)
npm run luma:ical-urls

# 3. Fetch events (run every 10 minutes)
npm run luma:events
```

## Architecture

### Three-Tier System

**Why three tiers?** Different data changes at different rates. This architecture minimizes Playwright usage (expensive) and maximizes HTTP requests (cheap).

```
┌──────────────────────────────────────────────────────────┐
│ Tier 1: Cities (Daily check)                             │
│ ├─ Method: Playwright                                     │
│ ├─ Speed: ~60s                                            │
│ ├─ Changes: Rare (new cities added occasionally)         │
│ └─ Output: cities.json → Used by Tier 2                  │
├──────────────────────────────────────────────────────────┤
│ Tier 2: iCal URLs (Weekly check)                         │
│ ├─ Method: Playwright (clicks subscribe buttons)         │
│ ├─ Speed: ~90s (72 cities, 3x concurrent)                │
│ ├─ Changes: Very rare (endpoint structure change)        │
│ └─ Output: ical-urls.json → Used by Tier 3               │
├──────────────────────────────────────────────────────────┤
│ Tier 3: Events (Every 10 minutes)                        │
│ ├─ Method: HTTP (no browser needed!)                     │
│ ├─ Speed: ~15s (72 cities, 5x concurrent)                │
│ ├─ Changes: Constant (events update frequently)          │
│ └─ Output: Event data → Store in database                │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
packages/sources/luma/
├── scrapers/
│   ├── index.js          # Main exports
│   ├── cities.js         # Tier 1: City discovery
│   ├── ical-urls.js      # Tier 2: iCal URL extraction
│   ├── events.js         # Tier 3: Event fetching
│   └── README.md         # Full API documentation
├── data/
│   ├── cities.json       # 72 cities with metadata
│   ├── cities.csv        # CSV export
│   ├── city-slugs.json   # Just slugs
│   ├── ical-urls.json    # slug → iCal URL mapping
│   └── README.md         # Data documentation
└── README.md             # This file
```

## Usage Examples

### Programmatic Usage

```javascript
import {
  // Tier 1
  scrapeCities, saveCities, getCities, compareCities,
  // Tier 2
  scrapeIcalUrls, saveIcalUrls, getIcalUrls, compareIcalUrls,
  // Tier 3
  fetchEvents, fetchAllCityEventsStreaming
} from './packages/sources/luma/scrapers/index.js';

// === Tier 1: Cities ===
const cities = await scrapeCities({ headless: true });
saveCities(cities);

// === Tier 2: iCal URLs ===
const citiesData = getCities();
const icalData = await scrapeIcalUrls(citiesData.cities);
saveIcalUrls(icalData);

// === Tier 3: Events (streaming for memory efficiency) ===
const icalUrls = getIcalUrls();
for await (const cityResult of fetchAllCityEventsStreaming(icalUrls)) {
  console.log(`${cityResult.citySlug}: ${cityResult.eventCount} events`);
  // Process each city immediately (store in DB, etc.)
}
```

### Change Detection

```javascript
// Detect new cities
const oldCities = getCities();
const newCities = await scrapeCities();
const cityDiff = compareCities(oldCities, newCities);

if (cityDiff.hasChanges) {
  console.log('New cities:', cityDiff.added);
  saveCities(newCities);
  // Trigger Tier 2 to get iCal URLs for new cities
}

// Detect iCal URL changes
const oldUrls = getIcalUrls();
// ... scrape new URLs ...
const diff = compareIcalUrls(oldUrls, newUrls);

if (diff.hasChanges) {
  console.log('Changed URLs:', diff.changed);
  saveIcalUrls(newUrls);
}
```

## Data Format

### Cities (Tier 1 Output)

```json
{
  "timestamp": "2025-10-12T...",
  "totalCities": 72,
  "totalRegions": 5,
  "cities": [
    {
      "city": "Amsterdam",
      "slug": "amsterdam",
      "url": "https://luma.com/amsterdam",
      "region": "Europe",
      "eventCount": 39,
      "iconUrl": "https://images.lumacdn.com/..."
    }
  ],
  "byRegion": { ... }
}
```

### iCal URLs (Tier 2 Output)

```json
{
  "amsterdam": "https://api2.luma.com/ics/get?entity=discover&id=discplace-...",
  "nyc": "https://api2.luma.com/ics/get?entity=discover&id=discplace-...",
  ...
}
```

### Events (Tier 3 Output)

```json
{
  "uid": "evt_...",
  "title": "Event Title",
  "description": "...",
  "startDate": "2025-10-15T18:00:00Z",
  "endDate": "2025-10-15T20:00:00Z",
  "location": "Amsterdam, Netherlands",
  "geo": { "lat": 52.3676, "lon": 4.9041 },
  "organizer": "Organizer Name",
  "lumaUrl": "https://lu.ma/event-slug",
  "status": "CONFIRMED",
  "sequence": 0
}
```

## GitHub Actions Setup

See `scrapers/README.md` for complete GitHub Actions workflow examples.

### Cron Schedule Summary

```yaml
# Daily at midnight - Check for new cities
- cron: '0 0 * * *'

# Weekly on Sunday - Update iCal URLs
- cron: '0 0 * * 0'

# Every 10 minutes - Fetch events
- cron: '*/10 * * * *'
```

## Performance

| Tier | Method | Time | Frequency | Cost |
|------|--------|------|-----------|------|
| 1. Cities | Playwright | ~60s | Daily | Low |
| 2. iCal URLs | Playwright | ~90s | Weekly | Low |
| 3. Events | HTTP | ~15s | Every 10min | Very Low |

**Monthly compute time:**
- Cities: 60s × 30 = 30 minutes
- iCal URLs: 90s × 4 = 6 minutes
- Events: 15s × 4,320 = 18 hours

**Total: ~18.6 hours/month** (mostly Tier 3 HTTP requests)

## iCal Feed Structure

Luma provides standard iCalendar (RFC 5545) feeds with:

- `UID`: Unique event identifier
- `SUMMARY`: Event title
- `DESCRIPTION`: Full description + Luma URL
- `DTSTART/DTEND`: UTC timestamps
- `LOCATION`: Venue or city
- `GEO`: Latitude/longitude
- `ORGANIZER`: Host information
- `SEQUENCE`: Version number (increments on updates)
- `STATUS`: CONFIRMED, TENTATIVE, or CANCELLED

## Error Handling

All functions include error handling and return structured results:

```javascript
{
  success: true,
  timestamp: "2025-10-12T...",
  // ... data
}
```

Tier 2 (iCal URLs) includes automatic retry logic (2 attempts per city).

## Testing

```bash
# Run probe tests to verify platform structure
npm run probe:luma

# Test individual tiers
npm run luma:cities
npm run luma:ical-urls
npm run luma:events
```

## Maintenance

**When Luma changes their website:**

1. Run probe tests to identify what changed
2. Update selectors in the affected tier's scraper
3. Re-run affected tier and downstream tiers
4. Update tests

**Most likely to break:** Tier 2 (subscribe button location)
**Least likely to break:** Tier 3 (iCal format is standard)

## Contributing

When modifying scrapers:

1. Update the scraper module in `scrapers/`
2. Test with `npm run luma:<tier>`
3. Run probe tests: `npm run probe:luma`
4. Update documentation if API changes
5. Test change detection functions

## License

MIT
