# NSNodes Events

Event aggregation platform for scraping and normalizing events from multiple sources (Luma.com, Sola.day, and more).

## Overview

NSNodes Events automatically discovers, scrapes, and normalizes event data from various platforms into a unified format. The system handles city discovery, iCal feed extraction, and event normalization with built-in geocoding and deduplication.

## Installation

```bash
npm install
npx playwright install chromium
```

## Repository Structure

```
.
├── packages/
│   ├── sources/          # Platform-specific scrapers
│   │   ├── luma/         # Luma.com scraper
│   │   └── sola/         # Sola.day scraper
│   ├── core/             # Shared utilities (database, geocoding)
│   └── orchestrator/     # Scraping orchestration
└── tools/                # Development and testing tools
```

## Usage

### Luma Events
```bash
# Discover cities
npm run luma:cities

# Extract iCal URLs for all cities
npm run luma:ical-urls

# Scrape events from iCal feeds
npm run luma:events
```

### Sola Events
```bash
# Discover cities/communities
npm run sola:cities

# Extract iCal URLs
npm run sola:ical-urls

# Scrape events
npm run sola:events
```

### List All Events
```bash
npm run list:events
```

## Architecture

Each event source defines tasks in a `tasks.js` file with:
- **Task ID**: Unique identifier (e.g., `luma:cities`, `luma:events`)
- **Cron field**: Category label for grouping tasks by frequency (`*/10 * * * *`, `0 0 * * *`, `0 0 * * 0`)
- **Execution logic**: `run()` or `extractStream()` function

Example task definition:
```javascript
export default [
  {
    id: 'luma:cities',
    cron: '0 0 * * *',  // Category: daily tasks
    description: 'Discover all cities available on Luma',
    async run() {
      // Task implementation
    }
  }
]
```

The orchestrator discovers all `tasks.js` files and filters tasks by their cron field. The cron value is used as a category label, not for actual scheduling:

- `schedule:sync` runs tasks with cron `*/10 * * * *`
- `schedule:daily` runs tasks with cron `0 0 * * *`
- `schedule:weekly` runs tasks with cron `0 0 * * 0`

GitHub Actions handles the actual scheduling by calling these commands on a schedule.

## Features

- **Multi-source aggregation**: Support for Luma.com, Sola.day, and more
- **Three-tier iCal architecture**: City discovery → iCal URL extraction → Event scraping
- **Automatic geocoding**: Normalizes location data with caching
- **Deduplication**: Prevents duplicate events across sources
- **Flexible normalization**: Converts platform-specific data to unified schema
- **Task-based design**: Easy to add new sources by defining tasks

## Contributing

When adding new event sources:
1. Create a new source directory in `packages/sources/your-source/`
2. Create `tasks.js` exporting task definitions (required for GitHub Actions)
3. Implement scrapers for city discovery, iCal URL extraction, and event fetching
4. Add normalization logic in `normalize.js` to convert to unified event schema
5. The orchestrator will automatically discover and run your tasks

## License

MIT
