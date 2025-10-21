#!/usr/bin/env node
/**
 * Parser Regression Test
 *
 * This test validates that the iCal parser produces consistent output
 * by comparing against a saved fixture of real Luma data.
 *
 * If this test fails, it means the parser behavior has changed and you
 * should verify the changes are intentional.
 */

import { readFileSync } from 'fs';
import ical from 'node-ical';

// Expected output from parsing the first 3 events in the fixture
const EXPECTED_EVENTS = [
  {
    uid: 'calev-vG3wexz4mtcmqXs@events.lu.ma',
    title: '[SOC] #28 - Chartered Cities &amp; Network States',
    description: 'Find more information on https://luma.com/ns',
    startDate: '2023-05-17T17:00:00.000Z',
    endDate: '2023-05-17T19:30:00.000Z',
    location: 'https://events.humanitix.com/soc-28-chartered-cities-and-network-states',
    geo: { lat: 51.47499, lon: -0.028711 },
    organizer: 'Origin Society + Weekly Web3 Workshops',
    status: 'TENTATIVE',
    // Note: sequence is dynamic and changes with each iCal generation
  },
  {
    uid: 'calev-POccik0D3w0EWOs@events.lu.ma',
    title: '[TECH] #34 - DApps with a pinch of ZK',
    description: 'Find more information on https://luma.com/ns',
    startDate: '2023-07-05T17:00:00.000Z',
    endDate: '2023-07-05T19:30:00.000Z',
    location: 'https://events.humanitix.com/tech-34-dapps-with-a-pinch-of-zk',
    geo: { lat: 51.530155, lon: -0.075475 },
    organizer: 'Weekly Web3 Workshops',
    status: 'TENTATIVE',
  },
  {
    uid: 'evt-hE163lNAasezbIA@events.lu.ma',
    title: 'Network States Brazil Meetup #13',
    startDate: '2023-07-08T16:00:01.000Z',
    endDate: '2023-07-08T19:00:01.000Z',
    location: 'https://luma.com/event/evt-hE163lNAasezbIA',
    geo: { lat: -23.6, lon: -46.675 },
    organizer: 'Jean Hansen',
    status: 'TENTATIVE',
    lumaUrl: 'https://luma.com/6p94n5i8',
  }
];

/**
 * Parse iCal data (same logic as in events.js)
 */
function parseIcalData(icalData) {
  const parsed = ical.sync.parseICS(icalData);
  const events = [];

  for (const [key, component] of Object.entries(parsed)) {
    if (component.type !== 'VEVENT') continue;

    const event = { uid: component.uid };

    if (component.summary) event.title = component.summary;
    if (component.description) {
      event.description = component.description;
      // Extract Luma URL from description (matches both lu.ma and luma.com)
      const urlMatch = component.description.match(/https?:\/\/(luma\.com|lu\.ma)\/[^\s]+/);
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

  return events;
}

/**
 * Compare two event objects (ignoring sequence which is dynamic)
 */
function compareEvents(actual, expected, eventIndex) {
  const errors = [];

  for (const [key, value] of Object.entries(expected)) {
    if (key === 'sequence') continue; // Skip sequence (dynamic)

    const actualValue = actual[key];

    if (typeof value === 'object' && value !== null) {
      // Deep compare objects (like geo)
      if (JSON.stringify(actualValue) !== JSON.stringify(value)) {
        errors.push(`Event ${eventIndex}: ${key} mismatch. Expected ${JSON.stringify(value)}, got ${JSON.stringify(actualValue)}`);
      }
    } else {
      if (actualValue !== value) {
        errors.push(`Event ${eventIndex}: ${key} mismatch. Expected "${value}", got "${actualValue}"`);
      }
    }
  }

  return errors;
}

/**
 * Run the test
 */
async function test() {
  console.log('🧪 Parser Regression Test\n');
  console.log('Loading fixture data...');

  const fixtureData = readFileSync('tests/fixtures/luma-sample.ics', 'utf-8');
  console.log('✓ Loaded fixture\n');

  console.log('Parsing iCal data...');
  const events = parseIcalData(fixtureData);
  console.log(`✓ Parsed ${events.length} events\n`);

  console.log('Validating first 3 events against expected output...\n');

  let allErrors = [];

  for (let i = 0; i < EXPECTED_EVENTS.length; i++) {
    const expected = EXPECTED_EVENTS[i];
    const actual = events[i];

    console.log(`  Event ${i + 1}: ${expected.title}`);

    if (!actual) {
      allErrors.push(`Event ${i} is missing from parsed output`);
      console.log('    ❌ MISSING\n');
      continue;
    }

    const errors = compareEvents(actual, expected, i);

    if (errors.length === 0) {
      console.log('    ✅ PASS\n');
    } else {
      console.log('    ❌ FAIL');
      errors.forEach(err => console.log(`       - ${err}`));
      console.log('');
      allErrors.push(...errors);
    }
  }

  if (allErrors.length === 0) {
    console.log('✅ All regression tests passed!\n');
    process.exit(0);
  } else {
    console.log(`❌ ${allErrors.length} validation errors found:\n`);
    allErrors.forEach(err => console.log(`  - ${err}`));
    console.log('');
    process.exit(1);
  }
}

test().catch(error => {
  console.error('❌ Test execution failed:', error);
  process.exit(1);
});
