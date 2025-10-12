# Luma Source

Fetches events from Luma.com via iCal feeds.

## How it works

1. **City discovery**: `cities.json` contains list of cities to sync
2. **iCal URL discovery**: If `icalUrl` not in config, fetch city page and extract subscription link
3. **Fetch**: Download iCal feed for each city
4. **Parse**: Convert iCal VEVENT data to normalized Event objects
5. **Upsert**: Save to database (dedupe by UID)

## iCal Feed Structure

Luma provides per-city iCal feeds at:
```
https://api2.luma.com/ics/get?entity=discover&id=discplace-{CITY_ID}
```

Each VEVENT contains:
- `UID`: Unique event identifier
- `SUMMARY`: Event title
- `DESCRIPTION`: Event details + Luma URL
- `DTSTART`/`DTEND`: Start/end times (UTC)
- `LOCATION`: Address or Luma URL
- `GEO`: Latitude;Longitude
- `ORGANIZER`: Host name + email
- `SEQUENCE`: Version number (increments on updates)
- `STATUS`: CONFIRMED, TENTATIVE, or CANCELLED

## TODO

- [ ] Implement `discoverIcalUrl()` - scrape city page to find iCal link
- [ ] Add proper iCal parsing (use `ical.js` or `node-ical`)
- [ ] Improve city extraction from location field
- [ ] Run existing `scripts/extract-luma-cities.js` to populate `cities.json`
