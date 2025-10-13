# Luma Scrapers

Three-tier scraping system optimized for different update frequencies.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Scraping Layers                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Layer 1: Cities (Run: Once + Daily)                        │
│  ├─ Scrapes Luma discover page                              │
│  ├─ Extracts all city names and slugs                       │
│  └─ Detects: New cities, removed cities                     │
│                                                              │
│  Layer 2: iCal URLs (Run: Once + Weekly)                    │
│  ├─ Opens each city page with Playwright                    │
│  ├─ Clicks subscribe button, extracts iCal URL              │
│  └─ Detects: Changed endpoints, new/removed cities          │
│                                                              │
│  Layer 3: Events (Run: Every 10 minutes)                    │
│  ├─ Fetches iCal feeds via HTTP (no browser needed)         │
│  ├─ Parses VEVENT data                                      │
│  └─ Returns: Events with metadata                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Layer 1: Cities (Daily)

```javascript
import { scrapeCities, saveCities, getCities, compareCities } from '@/packages/sources/luma/scrapers';

// Initial setup (run once)
const cities = await scrapeCities({ headless: true });
saveCities(cities);
console.log(`Found ${cities.totalCities} cities across ${cities.totalRegions} regions`);

// Daily check for changes
const oldCities = getCities();
const newCities = await scrapeCities({ headless: true });
const diff = compareCities(oldCities, newCities);

if (diff.hasChanges) {
  console.log('Changes detected:', diff.summary);
  if (diff.added.length > 0) {
    console.log('New cities:', diff.added.map(c => c.city));
  }
  saveCities(newCities);
}
```

### Layer 2: iCal URLs (Weekly)

```javascript
import {
  getCities,
  scrapeIcalUrls,
  saveIcalUrls,
  getIcalUrls,
  compareIcalUrls
} from '@/packages/sources/luma/scrapers';

// Initial setup (run once)
const cities = getCities();
const icalData = await scrapeIcalUrls(cities.cities, {
  headless: true,
  concurrency: 3
});
saveIcalUrls(icalData);
console.log(`Extracted ${icalData.withIcalUrl} iCal URLs`);

// Weekly check for changes
const oldUrls = getIcalUrls();
const cities = getCities();
const newIcalData = await scrapeIcalUrls(cities.cities);
const newUrls = {};
newIcalData.cities.forEach(c => {
  if (c.icalUrl) newUrls[c.slug] = c.icalUrl;
});

const diff = compareIcalUrls(oldUrls, newUrls);

if (diff.hasChanges) {
  console.log('iCal URL changes:', diff.summary);
  saveIcalUrls(newIcalData);
}
```

### Layer 3: Events (Every 10 minutes)

**Memory-efficient streaming approach (recommended for production):**

```javascript
import { getIcalUrls, fetchAllCityEventsStreaming } from '@/packages/sources/luma/scrapers';

const icalUrls = getIcalUrls();

// Process events city-by-city as they arrive (no memory buildup)
for await (const cityResult of fetchAllCityEventsStreaming(icalUrls, { concurrency: 5 })) {
  console.log(`${cityResult.citySlug}: ${cityResult.eventCount} events`);

  // Process each city immediately: store in DB, send to API, etc.
  await storeEventsInDatabase(cityResult.events);

  // Events are garbage collected after processing, keeping memory low
}
```

**Aggregated approach (simpler for testing/small batches):**

```javascript
import { getIcalUrls, fetchAllCityEvents, fetchEvents } from '@/packages/sources/luma/scrapers';

// Fetch all events into memory at once
const icalUrls = getIcalUrls();
const result = await fetchAllCityEvents(icalUrls, { concurrency: 5 });

console.log(`Fetched ${result.totalEvents} events from ${result.successfulCities} cities`);

// Process all events
result.events.forEach(event => {
  console.log(`${event.title} - ${event.startDate}`);
});

// Fetch events for a single city
const amsterdamEvents = await fetchEvents('amsterdam', icalUrls.amsterdam);
```

## GitHub Actions Integration

### Daily: Check for new cities

```yaml
name: Update Cities
on:
  schedule:
    - cron: '0 0 * * *'  # Daily at midnight
  workflow_dispatch:

jobs:
  update-cities:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install chromium
      - run: |
          node -e "
          import { scrapeCities, saveCities, getCities, compareCities } from './packages/sources/luma/scrapers/index.js';

          const oldCities = getCities();
          const newCities = await scrapeCities({ headless: true });
          const diff = compareCities(oldCities, newCities);

          if (diff.hasChanges) {
            console.log('Cities changed:', JSON.stringify(diff.summary));
            saveCities(newCities);

            // Commit changes
            exec('git add packages/sources/luma/data/cities*');
            exec('git commit -m \"Update cities: +${diff.added.length} -${diff.removed.length}\"');
            exec('git push');
          }
          "
```

### Weekly: Update iCal URLs

```yaml
name: Update iCal URLs
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday
  workflow_dispatch:

jobs:
  update-ical-urls:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install chromium
      - run: |
          node -e "
          import { getCities, scrapeIcalUrls, saveIcalUrls, getIcalUrls, compareIcalUrls } from './packages/sources/luma/scrapers/index.js';

          const cities = getCities();
          const oldUrls = getIcalUrls();
          const newData = await scrapeIcalUrls(cities.cities, { headless: true });

          const newUrls = {};
          newData.cities.forEach(c => { if (c.icalUrl) newUrls[c.slug] = c.icalUrl; });

          const diff = compareIcalUrls(oldUrls, newUrls);

          if (diff.hasChanges) {
            console.log('iCal URLs changed:', JSON.stringify(diff.summary));
            saveIcalUrls(newData);

            // Commit changes
            exec('git add packages/sources/luma/data/*ical*');
            exec('git commit -m \"Update iCal URLs: ${diff.changed.length} changed\"');
            exec('git push');
          }
          "
```

### Every 10 minutes: Fetch events

```yaml
name: Fetch Events
on:
  schedule:
    - cron: '*/10 * * * *'  # Every 10 minutes
  workflow_dispatch:

jobs:
  fetch-events:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: |
          node -e "
          import { getIcalUrls, fetchAllCityEventsStreaming } from './packages/sources/luma/scrapers/index.js';

          const icalUrls = getIcalUrls();
          let totalEvents = 0;

          // Stream events city-by-city (memory-efficient)
          for await (const cityResult of fetchAllCityEventsStreaming(icalUrls, { concurrency: 10 })) {
            console.log(\`\${cityResult.citySlug}: \${cityResult.eventCount} events\`);
            totalEvents += cityResult.eventCount;

            // Process immediately: store in DB, send to API, etc.
            // await storeEventsInDatabase(cityResult.events);
          }

          console.log(\`Total: \${totalEvents} events\`);
          "
```

## API Reference

### Cities

- `scrapeCities(options)` - Scrape all cities from Luma
- `saveCities(citiesData)` - Save cities to disk
- `getCities()` - Load cities from disk
- `compareCities(oldData, newData)` - Detect changes

### iCal URLs

- `scrapeIcalUrls(cities, options)` - Extract iCal URLs for cities
- `saveIcalUrls(icalData)` - Save iCal URLs to disk
- `getIcalUrls()` - Load iCal URLs from disk
- `compareIcalUrls(oldUrls, newUrls)` - Detect changes

### Events

- `fetchEvents(citySlug, icalUrl)` - Fetch events for one city
- `fetchAllCityEventsStreaming(icalUrls, options)` - **Async generator** that yields city results as they complete (memory-efficient)
- `fetchAllCityEvents(icalUrls, options)` - Fetch events for all cities (aggregated in memory)
- `filterEventsByDateRange(events, start, end)` - Filter by date
- `groupEventsByCity(events)` - Group events by city

## Data Files

```
packages/sources/luma/data/
├── cities.json              # Full city data (Layer 1)
├── cities.csv               # CSV export
├── city-slugs.json          # Just slugs
├── ical-urls.json           # Slug → iCal URL mapping (Layer 2)
└── cities-with-ical.json    # Full data with iCal URLs
```

## Performance

- **Layer 1 (Cities)**: ~30-60 seconds (Playwright required)
- **Layer 2 (iCal URLs)**: ~90 seconds for 72 cities with 3x concurrency (Playwright required)
- **Layer 3 (Events)**: ~15 seconds for 72 cities with 5x concurrency (No Playwright, just HTTP)

## Error Handling

All functions return structured results with error information:

```javascript
{
  success: true/false,
  error: 'error message',
  timestamp: '2025-10-12T...',
  // ... other data
}
```

Retry logic is built into Layer 2 (iCal URL extraction) with 2 attempts per city.
