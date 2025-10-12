# Luma City Data

This directory contains the complete list of cities available on Luma.com.

## Files

- **`cities.json`** - Complete city data with metadata (72 cities)
  - Includes city name, slug, region, event count, icon URL
  - Organized by region (Europe, North America, Asia & Pacific, Africa, South America)

- **`cities.csv`** - CSV format for easy import/export
  - Columns: slug, city, region, event_count, url

- **`city-slugs.json`** - Simple array of city slugs for programmatic use

## Data Structure

### cities.json
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
      "iconUrl": "https://images.lumacdn.com/discovery/ams-icon.png"
    },
    ...
  ],
  "byRegion": {
    "Europe": [...],
    "North America": [...],
    ...
  }
}
```

## City Coverage

- **Total Cities:** 72
- **Europe:** 21 cities
- **North America:** 25 cities (includes USA, Canada, Mexico)
- **Asia & Pacific:** 19 cities
- **Africa:** 2 cities (Lagos, Nairobi)
- **South America:** 5 cities

## Top Cities by Event Count

1. New York (nyc) - 55 events
2. Los Angeles (la) - 50 events
3. San Francisco (sf) - 46 events
4. London - 45 events
5. Amsterdam - 39 events

## Notable Slug Patterns

Some cities use abbreviations:
- `nyc` → New York
- `sf` → San Francisco
- `la` → Los Angeles
- `sd` → San Diego
- `dc` → Washington, DC
- `hongkong` → Hong Kong (one word)
- `waterloo_ca` → Waterloo, Canada

## Updating City Data

To refresh the city list:

```bash
npm run extract:luma-cities
```

This will run the Playwright script to scrape the latest city list from Luma's discover page and update all data files.

## Last Updated

Generated: October 12, 2025
Source: https://luma.com/discover
