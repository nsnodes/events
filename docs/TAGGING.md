# Event Tagging

This document describes the automatic tagging system for events.

## Automatic Tags

Events are automatically tagged during normalization based on their properties.

### popup-city

**Applied to:** All events (Luma and Sola.day)

**Criteria:**
- Event duration is longer than 2 days (48+ hours), OR
- Event starts at midnight UTC with no end date

**Purpose:** Identifies multi-day gatherings and pop-up city events

**Example events:**
- Edge City Patagonia (28 days)
- Zuzalu (multiple weeks)
- Invisible Garden (40 days)

### commons

**Applied to:** Network School (ns) handle events only

**Criteria:**
- Event is from the Network School handle (`luma.com/ns`)
- "commons" keyword appears in title, description, or location (case-insensitive)

**Purpose:** Identifies commons-related events within the Network School community

**Example events:**
- Commons Party
- Commons Closing Ceremony
- Network State Commons Meetup

**Implementation:** `packages/sources/luma/normalize.ts` - automatically applied during event normalization

### invisible-garden

**Applied to:** Sola.day popup cities only

**Criteria:**
- Event is a Sola.day popup city
- City slug contains "invisiblegarden"

**Purpose:** Special tag for Invisible Garden events to allow filtering them separately

**Example events:**
- Invisible Garden (Chiang Mai)
- Invisible Garden Argentina

## Tag Usage

### Database Queries

```sql
-- Get all popup city events
SELECT * FROM events WHERE tags @> '["popup-city"]'

-- Get Network School commons events
SELECT * FROM events WHERE tags @> '["commons"]'

-- Get popup cities excluding Invisible Garden
SELECT * FROM events 
WHERE tags @> '["popup-city"]' 
AND NOT tags @> '["invisible-garden"]'

-- Get events with multiple tags
SELECT * FROM events 
WHERE tags @> '["popup-city", "commons"]'
```

### Frontend Filtering

Events can be filtered by tags for different views:

- **Upcoming Events:** Exclude `invisible-garden` tagged events
- **Pop-up Cities:** Show only `popup-city` tagged events
- **Commons Section:** Show only `commons` tagged events from Network School

## Manual Tagging

For retroactive tagging or bulk updates, use the tagging script:

```bash
tsx scripts/tag-events.ts
```

This script:
- Fetches Network School events from Supabase
- Applies tag rules to existing events
- Updates the database with new tags

**Note:** Automatic tagging during normalization is preferred. The manual script is for:
- Backfilling tags on historical data
- One-time bulk updates
- Testing new tag rules

## Adding New Tags

To add a new automatic tag:

1. **For Luma events:** Edit `packages/sources/luma/normalize.ts`
   - Add logic in the "Build tags array" section
   - Check event properties (title, description, location, etc.)
   - Add tag to the `tags` array

2. **For Sola.day events:** Edit `packages/sources/sola/normalize.ts`
   - Add logic in the `normalizePopupCity()` or `normalizeEvent()` function
   - Similar approach to Luma tagging

3. **For manual tagging:** Edit `scripts/tag-events.ts`
   - Add new tag rule to `TAG_RULES` array
   - Specify keywords and fields to check

### Example: Adding a new tag

```typescript
// In packages/sources/luma/normalize.ts

// Tag biotech events for Network School
if (entitySlug === 'ns' && options.entityType === 'handle') {
  const title = rawEvent.title?.toLowerCase() || ''
  const description = rawEvent.description?.toLowerCase() || ''
  
  if (title.includes('biotech') || description.includes('longevity')) {
    tags.push('biotech')
  }
}
```

## Tag Guidelines

When adding new tags:

1. **Be specific:** Tags should have clear, well-defined criteria
2. **Be consistent:** Use lowercase, hyphenated names (e.g., `popup-city`, not `Popup City`)
3. **Document:** Add tag to this document with criteria and examples
4. **Test:** Verify tag is applied correctly to sample events
5. **Consider scope:** Decide if tag applies to all events or specific handles/sources

## Current Tag List

| Tag | Source | Auto/Manual | Scope |
|-----|--------|-------------|-------|
| `popup-city` | All | Auto | Events > 2 days |
| `commons` | Luma | Auto | Network School only |
| `invisible-garden` | Sola.day | Auto | Invisible Garden cities |

## Future Enhancements

Potential tags to consider:

- `longevity` - Longevity and biotech events
- `crypto` - Crypto and blockchain events
- `ai` - AI and machine learning events
- `network-state` - Network state related events
- `startup-cities` - Startup cities events
- `edge-city` - Edge City branded events

