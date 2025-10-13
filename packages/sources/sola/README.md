# Sola.day Event Source

Scraper for app.sola.day (Social Layer) events - a Web3 event platform.

## Quick Start

```bash
# Scrape all events
npm run sola:events
```

## Architecture

**Single-tier system** - Unlike Luma, Sola.day doesn't have iCal feeds, so we scrape directly with Playwright.

```
┌──────────────────────────────────────────────────────────┐
│ Sola.day Scraping Flow                                    │
├──────────────────────────────────────────────────────────┤
│                                                            │
│  Step 1: Discover Page (app.sola.day/)                    │
│  ├─ Method: Playwright                                    │
│  ├─ Extracts: Group/community URLs (/event/{slug})        │
│  └─ Output: ~51 group URLs                                │
│                                                            │
│  Step 2: Group Pages (/event/{slug})                      │
│  ├─ Method: Playwright (concurrent: 3x)                   │
│  ├─ Extracts: Individual event detail URLs                │
│  └─ Output: ~150-200 event detail URLs                    │
│                                                            │
│  Step 3: Event Detail Pages (/event/detail/{id})          │
│  ├─ Method: Playwright (concurrent: 3x)                   │
│  ├─ Parses: Title, dates, location, organizer, desc, etc  │
│  └─ Output: Full event data                               │
│                                                            │
└──────────────────────────────────────────────────────────┘
```

## Directory Structure

```
packages/sources/sola/
├── scrapers/
│   ├── index.js          # Main exports
│   ├── events.js         # Event scraping logic
│   └── README.md         # Full API documentation
├── scripts/
│   └── run-events.js     # Demo script
└── README.md             # This file
```

## Usage Examples

### Programmatic Usage

```javascript
import {
  scrapeDiscoverPage,
  scrapeGroupPage,
  scrapeEventDetail,
  scrapeAllEvents
} from './packages/sources/sola/scrapers/index.js';

// Memory-efficient streaming (recommended for production)
for await (const event of scrapeAllEvents({ headless: true, concurrency: 3 })) {
  console.log(`${event.title} - ${event.dateRange}`);
  await storeInDatabase(event);
}

// Or get specific parts
const discover = await scrapeDiscoverPage();
const groupEvents = await scrapeGroupPage('https://app.sola.day/event/prospera');
const eventDetail = await scrapeEventDetail('https://app.sola.day/event/detail/15839');
```

## Data Format

### Event Detail Output

```json
{
  "success": true,
  "timestamp": "2025-10-13T...",
  "id": "15839",
  "url": "https://app.sola.day/event/detail/15839",
  "title": "Solana Próspera",
  "status": "ongoing",
  "tags": ["Conference", "Workshops"],
  "organizer": "Venture Launch",
  "dateRange": "Sat, Oct 11 - Mon, Nov 10, 2025",
  "timeRange": "07:00 - 21:00 GMT+0",
  "location": "Próspera, Roatán",
  "fullAddress": "Beta Building, St John's Bay...",
  "description": "4-week bootcamp for founders...",
  "externalUrl": "https://venturelaunch.xyz/prospera",
  "image": "https://ik.imagekit.io/soladata/..."
}
```

## Performance

- **Step 1 (Discover)**: ~3-5 seconds (1 page)
- **Step 2 (Groups)**: ~60-90 seconds (51 groups, 3x concurrent)
- **Step 3 (Events)**: ~120-180 seconds (150-200 events, 3x concurrent)

**Total: ~3-5 minutes** for complete scrape of all events

**Recommended frequency**: Every 30 minutes

## GitHub Actions Example

```yaml
name: Fetch Sola Events
on:
  schedule:
    - cron: '*/30 * * * *'  # Every 30 minutes
  workflow_dispatch:

jobs:
  fetch-events:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npx playwright install chromium
      - run: |
          node -e "
          import { scrapeAllEvents } from './packages/sources/sola/scrapers/index.js';

          let total = 0;
          for await (const event of scrapeAllEvents({ headless: true })) {
            if (event.success) {
              total++;
              // await storeInDatabase(event);
            }
          }

          console.log(\`Scraped \${total} events\`);
          "
```

## Error Handling

All functions return structured results with error information:

```javascript
{
  success: true/false,
  error: 'error message',
  timestamp: '2025-10-13T...',
  // ... other data
}
```

## Testing

```bash
# Run probe tests to verify platform structure
npm run probe:sola

# Scrape all events
npm run sola:events
```

## Maintenance

**When Sola.day changes their website:**

1. Run probe tests to identify what changed
2. Update selectors/parsing logic in `scrapers/events.js`
3. Test with a few events before running full scrape
4. Update tests

**Common changes to watch for:**
- Page structure (line order in innerText)
- Status keywords (Past/Upcoming/Ongoing)
- New event fields

## Contributing

When modifying scrapers:

1. Update the scraper module in `scrapers/`
2. Test with `npm run sola:events`
3. Run probe tests: `npm run probe:sola`
4. Update documentation if API changes

## License

MIT
