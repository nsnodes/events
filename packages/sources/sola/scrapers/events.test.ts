#!/usr/bin/env node
/**
 * Test for Sola iCal parser
 * Tests the node-ical based parser against real iCal data from Sola API
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import ical from 'node-ical';
import { VEvent } from 'node-ical';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '../fixtures/prospera-ical.txt');

async function test() {
  console.log('Testing Sola iCal parser with real fixture...\n');

  try {
    // Load fixture
    const icalData = readFileSync(fixturePath, 'utf-8');
    console.log('✓ Loaded fixture from:', fixturePath);
    console.log(`  Size: ${icalData.length} bytes\n`);

    // Parse using node-ical
    const parsed = ical.sync.parseICS(icalData);
    const events = [];

    // Convert to our format (same logic as in events.ts)
    for (const [key, component] of Object.entries(parsed)) {
      if (component.type !== 'VEVENT') continue;

      const vevent = component as VEvent;
      const event: any = { uid: vevent.uid };

      if (vevent.summary) event.title = vevent.summary;
      if (vevent.description) {
        event.description = vevent.description;
        const urlMatch = vevent.description.match(/https?:\/\/app\.sola\.day\/[^\s]+/);
        if (urlMatch) event.solaUrl = urlMatch[0];
      }

      if (vevent.start) {
        event.startDate = vevent.start instanceof Date
          ? vevent.start.toISOString()
          : new Date(vevent.start).toISOString();
      }
      if (vevent.end) {
        event.endDate = vevent.end instanceof Date
          ? vevent.end.toISOString()
          : new Date(vevent.end).toISOString();
      }

      if (vevent.location) event.location = vevent.location;

      if (vevent.geo) {
        event.geo = {
          lat: parseFloat(vevent.geo.lat as any),
          lon: parseFloat(vevent.geo.lon as any)
        };
      }

      if (vevent.organizer) {
        if (typeof vevent.organizer === 'string') {
          event.organizer = vevent.organizer;
        } else if (vevent.organizer.params?.CN) {
          event.organizer = vevent.organizer.params.CN;
        } else if ((vevent.organizer as any).val) {
          event.organizer = (vevent.organizer as any).val.replace('mailto:', '');
        }
      }

      if (vevent.status) event.status = vevent.status;
      if (vevent.sequence !== undefined) {
        event.sequence = typeof vevent.sequence === 'string'
          ? parseInt(vevent.sequence, 10)
          : vevent.sequence;
      }

      // Handle URL - node-ical can return string or object
      if (vevent.url) {
        event.url = typeof vevent.url === 'string'
          ? vevent.url
          : (vevent.url as any).val || vevent.url;
      }

      if (event.uid) events.push(event);
    }

    console.log(`✓ Parsed ${events.length} events\n`);

    if (events.length === 0) {
      throw new Error('No events parsed from fixture');
    }

    // Verify first event
    const event1 = events[0];
    console.log('Event 1 verification:');
    console.log('  ✓ UID:', event1.uid);
    console.log('  ✓ Title:', event1.title);
    console.log('  ✓ Start:', event1.startDate);
    console.log('  ✓ End:', event1.endDate);
    console.log('  ✓ Location:', event1.location);
    console.log('  ✓ Organizer:', event1.organizer);
    console.log('  ✓ Status:', event1.status);
    console.log('  ✓ URL:', event1.url);
    console.log('  ✓ Sola URL:', event1.solaUrl);

    // Basic assertions
    if (!event1.uid) throw new Error('UID missing');
    if (!event1.uid.startsWith('sola-')) throw new Error('UID should start with sola-');
    if (!event1.title) throw new Error('Title missing');
    if (!event1.startDate) throw new Error('Start date missing');
    if (!event1.endDate) throw new Error('End date missing');
    if (!event1.url) throw new Error('URL missing');
    if (typeof event1.url !== 'string') throw new Error(`URL should be a string, got ${typeof event1.url}: ${JSON.stringify(event1.url)}`);
    if (!event1.url.includes('app.sola.day')) throw new Error(`URL should be a Sola URL, got: ${event1.url}`);
    if (event1.organizer !== 'prospera') throw new Error(`Organizer should be 'prospera', got '${event1.organizer}'`);
    if (event1.status !== 'CONFIRMED') throw new Error('Status should be CONFIRMED');

    // Verify all events
    console.log('\n✓ All events:');
    for (const event of events) {
      console.log(`  - ${event.uid}: ${event.title}`);
      if (!event.uid || !event.title || !event.startDate) {
        throw new Error(`Invalid event: ${JSON.stringify(event)}`);
      }
    }

    console.log(`\n✅ All tests passed! (${events.length} events parsed successfully)\n`);

  } catch (error) {
    console.error('❌ Test failed:', (error as Error).message);
    console.error(error);
    process.exit(1);
  }
}

test();
