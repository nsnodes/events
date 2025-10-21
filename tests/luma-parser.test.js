#!/usr/bin/env node
/**
 * Quick test for Luma iCal parser
 * Tests the node-ical based parser against a sample iCal file
 */

// Sample iCal data from Luma (real format)
const sampleIcal = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Lu.ma//NONSGML Events//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:San Francisco Events
X-WR-TIMEZONE:America/Los_Angeles
BEGIN:VEVENT
UID:evt-abc123
SUMMARY:AI Builders Meetup
DESCRIPTION:Join us for an evening of AI discussions\\n\\nhttps://lu.ma/ai-meetup
DTSTART:20251201T180000Z
DTEND:20251201T200000Z
LOCATION:Mission District, San Francisco
GEO:37.7599;-122.4148
ORGANIZER;CN=Tech Community:mailto:hello@example.com
STATUS:CONFIRMED
SEQUENCE:0
URL:https://lu.ma/ai-meetup
END:VEVENT
BEGIN:VEVENT
UID:evt-def456
SUMMARY:Startup Networking Night
DESCRIPTION:Connect with fellow founders and investors\\n\\nView event: https://lu.ma/startup-night
DTSTART:20251205T190000Z
DTEND:20251205T220000Z
LOCATION:SoMa, San Francisco, CA
STATUS:CONFIRMED
SEQUENCE:1
END:VEVENT
END:VCALENDAR`;

// Import the parser
async function test() {
  // Dynamically import to use ES modules
  const { default: ical } = await import('node-ical');

  console.log('Testing node-ical parser...\n');

  try {
    const parsed = ical.sync.parseICS(sampleIcal);
    const events = [];

    // Convert to our format (same logic as in events.js)
    for (const [key, component] of Object.entries(parsed)) {
      if (component.type !== 'VEVENT') continue;

      const event = { uid: component.uid };

      if (component.summary) event.title = component.summary;
      if (component.description) {
        event.description = component.description;
        const urlMatch = component.description.match(/https?:\/\/lu\.ma\/[^\s]+/);
        if (urlMatch) event.lumaUrl = urlMatch[0];
      }

      if (component.start) {
        event.startDate = component.start instanceof Date
          ? component.start.toISOString()
          : new Date(component.start).toISOString();
      }
      if (component.end) {
        event.endDate = component.end instanceof Date
          ? component.end.toISOString()
          : new Date(component.end).toISOString();
      }

      if (component.location) event.location = component.location;

      if (component.geo) {
        event.geo = {
          lat: parseFloat(component.geo.lat),
          lon: parseFloat(component.geo.lon)
        };
      }

      if (component.organizer) {
        if (typeof component.organizer === 'string') {
          event.organizer = component.organizer;
        } else if (component.organizer.params?.CN) {
          event.organizer = component.organizer.params.CN;
        } else if (component.organizer.val) {
          event.organizer = component.organizer.val.replace('mailto:', '');
        }
      }

      if (component.status) event.status = component.status;
      if (component.sequence !== undefined) {
        event.sequence = typeof component.sequence === 'string'
          ? parseInt(component.sequence, 10)
          : component.sequence;
      }
      if (component.url) event.url = component.url;

      if (event.uid) events.push(event);
    }

    console.log(`✓ Parsed ${events.length} events\n`);

    // Verify event 1
    const event1 = events.find(e => e.uid === 'evt-abc123');
    if (!event1) throw new Error('Event 1 not found');

    console.log('Event 1 verification:');
    console.log('  ✓ UID:', event1.uid);
    console.log('  ✓ Title:', event1.title);
    console.log('  ✓ Start:', event1.startDate);
    console.log('  ✓ End:', event1.endDate);
    console.log('  ✓ Location:', event1.location);
    console.log('  ✓ Geo:', event1.geo);
    console.log('  ✓ Luma URL:', event1.lumaUrl);
    console.log('  ✓ Organizer:', event1.organizer);
    console.log('  ✓ Status:', event1.status);
    console.log('  ✓ Sequence:', event1.sequence);
    console.log('  ✓ URL:', event1.url);

    // Basic assertions
    if (event1.title !== 'AI Builders Meetup') throw new Error('Title mismatch');
    if (!event1.startDate.includes('2025-12-01')) throw new Error('Start date mismatch');
    if (!event1.lumaUrl) throw new Error('Luma URL not extracted');
    if (event1.geo.lat !== 37.7599) throw new Error('Geo latitude mismatch');
    if (event1.organizer !== 'Tech Community') throw new Error('Organizer mismatch');

    console.log('\n✓ Event 2 verification:');
    const event2 = events.find(e => e.uid === 'evt-def456');
    if (!event2) throw new Error('Event 2 not found');
    console.log('  ✓ Title:', event2.title);
    console.log('  ✓ Luma URL:', event2.lumaUrl);
    console.log('  ✓ Sequence:', event2.sequence);

    if (event2.lumaUrl !== 'https://lu.ma/startup-night') throw new Error('Event 2 URL mismatch');
    console.log('  ✓ Sequence type:', typeof event2.sequence, 'value:', event2.sequence);
    if (event2.sequence !== 1) throw new Error(`Sequence mismatch: expected 1, got ${event2.sequence} (type: ${typeof event2.sequence})`);

    console.log('\n✅ All tests passed!\n');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error(error);
    process.exit(1);
  }
}

test();
