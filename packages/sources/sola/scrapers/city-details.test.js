/**
 * Tests for Sola.day city details parser
 */

import { scrapeCityDetail } from './city-details.js';

// Test fixtures using the new clean structured data from cities scraper
const fixtures = [
  {
    name: 'Prospera - with location',
    input: {
      slug: 'prospera',
      url: 'https://app.sola.day/event/prospera',
      title: 'Próspera',
      dates: 'Aug 28-Aug 27, 2028',
      location: 'Próspera, Roatán',
      imageUrl: 'https://ik.imagekit.io/soladata/dugphxxe_C_tVHAdr-'
    },
    expected: {
      title: 'Próspera',
      startDate: '2027-08-28',
      endDate: '2028-08-27',
      location: 'Próspera, Roatán',
    }
  },
  {
    name: 'Woosingapore - simple location',
    input: {
      slug: 'woosingapore',
      url: 'https://app.sola.day/event/woosingapore',
      title: 'ShanhaiWoo Singapore',
      dates: 'Sep 02-Oct 01, 2025',
      location: 'Singapore',
      imageUrl: 'https://ik.imagekit.io/soladata/skn8lv86_9x1IMzJdP'
    },
    expected: {
      title: 'ShanhaiWoo Singapore',
      startDate: '2025-09-02',
      endDate: '2025-10-01',
      location: 'Singapore',
    }
  },
  {
    name: 'ETH Safari - country only',
    input: {
      slug: 'ethsafari',
      url: 'https://app.sola.day/event/ethsafari',
      title: 'ETH Safari',
      dates: 'Sep 07-Sep 14, 2025',
      location: 'Kenya',
      imageUrl: 'https://ik.imagekit.io/soladata/2p6lz77k_VN34I97zl'
    },
    expected: {
      title: 'ETH Safari',
      startDate: '2025-09-07',
      endDate: '2025-09-14',
      location: 'Kenya',
    }
  },
  {
    name: 'Edge Patagonia - city and country',
    input: {
      slug: 'edgepatagonia',
      url: 'https://app.sola.day/event/edgepatagonia',
      title: 'Edge City Patagonia 2025',
      dates: 'Oct 18-Nov 15, 2025',
      location: 'San Martin, Argentina',
      imageUrl: 'https://ik.imagekit.io/soladata/rv2s5yu5_qjNyQUwC5'
    },
    expected: {
      title: 'Edge City Patagonia 2025',
      startDate: '2025-10-18',
      endDate: '2025-11-15',
      location: 'San Martin, Argentina',
    }
  },
  {
    name: 'ZuKasLuk - location with comma but no space',
    input: {
      slug: 'zuzalukas',
      url: 'https://app.sola.day/event/zuzalukas',
      title: 'ZuKas',
      dates: 'Sep 05-Sep 19, 2025',
      location: 'Antalya,Kas',
      imageUrl: 'https://app.sola.day/_next/image?url=...'
    },
    expected: {
      title: 'ZuKas',
      startDate: '2025-09-05',
      endDate: '2025-09-19',
      location: 'Antalya,Kas',
    }
  },
  {
    name: 'No location data',
    input: {
      slug: '4seas',
      url: 'https://app.sola.day/event/4seas',
      title: '4seas',
      dates: 'Nov 01-Dec 31, 2025',
      location: null,
      imageUrl: 'https://app.sola.day/_next/image?url=...'
    },
    expected: {
      title: '4seas',
      startDate: '2025-11-01',
      endDate: '2025-12-31',
      location: null,
    }
  }
];

async function runTests() {
  console.log('Testing Sola.day city details parser\n');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  for (const fixture of fixtures) {
    console.log(`\nTest: ${fixture.name}`);
    console.log(`Input: ${fixture.input.title} | ${fixture.input.dates} | ${fixture.input.location || 'null'}`);

    const result = await scrapeCityDetail(fixture.input);

    // Check title
    const titleMatch = result.title === fixture.expected.title;

    // Check dates
    const datesMatch = result.startDate === fixture.expected.startDate &&
                      result.endDate === fixture.expected.endDate;

    // Check location
    const locationMatch = result.location === fixture.expected.location;

    if (titleMatch && datesMatch && locationMatch) {
      console.log('✓ PASS');
      console.log(`  Title: ${result.title} ✓`);
      console.log(`  Dates: ${result.startDate} to ${result.endDate} ✓`);
      console.log(`  Location: ${result.location} ✓`);
      passed++;
    } else {
      console.log('✗ FAIL');
      if (!titleMatch) {
        console.log(`  Title: expected "${fixture.expected.title}"`);
        console.log(`         got "${result.title}" ✗`);
      } else {
        console.log(`  Title: ${result.title} ✓`);
      }
      if (!datesMatch) {
        console.log(`  Dates: expected ${fixture.expected.startDate} to ${fixture.expected.endDate}`);
        console.log(`         got ${result.startDate} to ${result.endDate} ✗`);
      } else {
        console.log(`  Dates: ${result.startDate} to ${result.endDate} ✓`);
      }
      if (!locationMatch) {
        console.log(`  Location: expected "${fixture.expected.location}"`);
        console.log(`            got "${result.location}" ✗`);
      } else {
        console.log(`  Location: ${result.location} ✓`);
      }
      failed++;
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${fixtures.length} tests`);

  if (failed === 0) {
    console.log('\n✓ All tests passed! Clean data extraction working correctly.');
  } else {
    console.log(`\n✗ ${failed} tests failing`);
  }
}

runTests().catch(console.error);
