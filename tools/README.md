# Tools

Development and exploration tools for the NSNodes Events platform.

## Directories

### `probes/`
Playwright-based probe tests for exploring event platform structures before implementing scrapers.

**Purpose:** Understand how platforms work (rendering, APIs, selectors, anti-bot measures) before building production scrapers.

**Tests:**
- Page load and rendering detection
- Network inspection for API endpoints
- DOM structure analysis and selector testing
- Dynamic content loading (scroll/pagination)
- Data extraction and validation
- Anti-bot detection checks

**Usage:**
```bash
# Run all probe tests
npm run probe

# Test specific platforms
npm run probe:luma
npm run probe:sola
```

**Results:** Saved to `../results/` directory with JSON reports and screenshots

### `city-extraction/`
Scripts for discovering and extracting city lists from event platforms.

**Scripts:**
- `extract-all-luma-cities.js` - Extract complete Luma city list by clicking through region tabs
- `inspect-luma-structure.js` - Inspect DOM structure to understand page layout
- `extract-luma-cities.js` - Initial city extraction attempt (deprecated)

**Usage:**
```bash
npm run extract:luma-cities
```

**Output:** Updates `packages/sources/luma/data/` with latest city data

## Development Workflow

1. **Probe** a new platform to understand its structure
2. **Extract** any metadata (cities, categories, etc.)
3. **Implement** scraper in `packages/sources/`
4. **Re-probe** periodically to detect platform changes
