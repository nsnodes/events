# Finding Calendar ID for Luma User Pages

Luma user pages (e.g., `luma.com/user/usr-xxxxx`) don't have an iCal subscription button, but their events are associated with a calendar ID that can be used to get an iCal feed.

## When to use this

Use this process when:
- You want to add a Luma user (not a calendar) to the handles list
- The user page URL looks like `luma.com/user/usr-xxxxx` or redirects to one
- There's no "Add iCal Subscription" button on the page

## Steps to find the calendar ID

### 1. Get the user ID

The user ID is in the URL. For example:
- URL: `https://luma.com/user/usr-bRtyfgATCOX4Ek3`
- User ID: `usr-bRtyfgATCOX4Ek3`

### 2. Call the Luma API

```bash
curl -s "https://api2.luma.com/user/profile/events?username=USER_ID" | jq '.events_past[0].event.calendar_api_id'
```

Example:
```bash
curl -s "https://api2.luma.com/user/profile/events?username=usr-bRtyfgATCOX4Ek3" | jq '.events_past[0].event.calendar_api_id'
# Returns: "cal-dGAz0ocxi1mvFdP"
```

### 3. Verify the iCal URL works

```bash
curl -sL "http://api2.luma.com/ics/get?entity=calendar&id=CALENDAR_ID" | head -20
```

You should see iCal data starting with `BEGIN:VCALENDAR`.

### 4. Add to handles.json

Add the user with the `calendarId` field:

```json
{
  "handle": "liberland",
  "slug": "user/usr-bRtyfgATCOX4Ek3",
  "url": "https://luma.com/user/usr-bRtyfgATCOX4Ek3",
  "type": "user",
  "name": "Liberland.org",
  "calendarId": "cal-dGAz0ocxi1mvFdP"
}
```

The `calendarId` field tells the scraper to skip browser scraping and use the known calendar ID directly.

## API Response Structure

The API returns events in two arrays:
- `events_hosting`: Events the user is currently hosting
- `events_past`: Past events

Each event contains:
```json
{
  "api_id": "evt-xxxxx",
  "event": {
    "api_id": "evt-xxxxx",
    "calendar_api_id": "cal-xxxxx",  // <-- This is what we need
    "name": "Event Name",
    "start_at": "2025-04-14T05:30:00.000Z",
    ...
  }
}
```

## Notes

- The calendar ID is consistent across all events from the same user
- If the user has no events, you won't be able to find the calendar ID
- Some users may host events on multiple calendars; check a few events to verify
