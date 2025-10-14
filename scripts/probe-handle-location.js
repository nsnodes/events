#!/usr/bin/env node
import { chromium } from 'playwright';

const handle = process.argv[2] || 'ns';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

console.log(`\n🔍 Probing luma.com/${handle} for location info...\n`);

await page.goto(`https://luma.com/${handle}`, {
  waitUntil: 'domcontentloaded',
  timeout: 15000
});

await page.waitForTimeout(2000);

// Try to find and click a "Map" view button
console.log('Looking for map view toggle...');
const mapButton = await page.locator('button, a').filter({ hasText: /map/i }).first();
const mapButtonExists = await mapButton.count() > 0;

if (mapButtonExists) {
  console.log('Found map toggle, clicking...');
  await mapButton.click();
  await page.waitForTimeout(2000);
} else {
  console.log('No map toggle found, scrolling page...');
  // Scroll to load lazy content
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(1000);
}

// Extract all available data
const data = await page.evaluate(() => {
  const result = {
    metaTags: {},
    structuredData: [],
    textContent: {},
    events: []
  };

  // 1. Meta tags
  document.querySelectorAll('meta').forEach(meta => {
    const property = meta.getAttribute('property') || meta.getAttribute('name');
    const content = meta.getAttribute('content');
    if (property && content) {
      result.metaTags[property] = content;
    }
  });

  // 2. Structured data (JSON-LD)
  document.querySelectorAll('script[type="application/ld+json"]').forEach(script => {
    try {
      result.structuredData.push(JSON.parse(script.textContent));
    } catch (e) {
      // ignore parse errors
    }
  });

  // 3. Look for location-related text
  const description = document.querySelector('meta[name="description"]')?.content || '';
  result.textContent.description = description;

  // 4. Sample a few events to find common location patterns
  const eventElements = document.querySelectorAll('[class*="event"]');
  const locationTexts = new Set();

  eventElements.forEach((el, idx) => {
    if (idx < 10) { // Sample first 10
      const text = el.textContent;
      const locationMatch = text.match(/📍\s*([^•\n]+)/);
      if (locationMatch) {
        locationTexts.add(locationMatch[1].trim());
      }
    }
  });

  result.textContent.sampleLocations = Array.from(locationTexts);

  // 5. Look for embedded maps (Google Maps, Mapbox, etc.)
  result.maps = {
    iframes: [],
    mapElements: []
  };

  // Check ALL iframes (not just maps)
  result.allIframes = [];
  document.querySelectorAll('iframe').forEach(iframe => {
    const src = iframe.src;
    result.allIframes.push({
      src: src || '(no src)',
      width: iframe.width,
      height: iframe.height
    });

    // Also check if it's a map iframe
    if (src && (src.includes('google.com/maps') || src.includes('mapbox') || src.includes('openstreetmap'))) {
      result.maps.iframes.push({
        src,
        width: iframe.width,
        height: iframe.height
      });
    }
  });

  // Check for map divs (Mapbox GL, Leaflet, etc.)
  document.querySelectorAll('[class*="map"], [id*="map"]').forEach(el => {
    // Get data attributes that might contain coordinates
    const dataAttrs = {};
    Array.from(el.attributes).forEach(attr => {
      if (attr.name.startsWith('data-')) {
        dataAttrs[attr.name] = attr.value;
      }
    });

    if (Object.keys(dataAttrs).length > 0 || el.className.includes('map') || el.id.includes('map')) {
      result.maps.mapElements.push({
        tag: el.tagName,
        id: el.id,
        className: el.className,
        dataAttributes: dataAttrs,
        innerHTML: el.innerHTML.substring(0, 200) // First 200 chars
      });
    }
  });

  // Extract Mapbox map state (coordinates) if available
  result.maps.mapboxData = null;
  if (window.mapboxgl && window.mapboxgl._maps) {
    // Try to find mapbox map instances
    const maps = Object.values(window.mapboxgl._maps || {});
    if (maps.length > 0) {
      const map = maps[0];
      result.maps.mapboxData = {
        center: map.getCenter(),
        zoom: map.getZoom(),
        bounds: map.getBounds()
      };
    }
  }

  // Alternative: Look for mapbox markers' style transforms (contain coordinates)
  const markers = document.querySelectorAll('.mapboxgl-marker');
  result.maps.markerCoordinates = [];
  markers.forEach(marker => {
    const transform = marker.style.transform;
    // Transform looks like: translate(-50%, -50%) translate(123px, 456px)
    const translateMatch = transform.match(/translate\(([^)]+)\)/g);
    if (translateMatch && translateMatch.length >= 2) {
      result.maps.markerCoordinates.push({
        transform,
        // Note: These are pixel positions, not lat/lng
        // We'll need to use the map's API to convert
      });
    }
  });

  return result;
});

console.log('📋 Meta Tags:');
console.log(JSON.stringify(data.metaTags, null, 2));

console.log('\n📊 Structured Data (JSON-LD):');
if (data.structuredData.length > 0) {
  data.structuredData.forEach((schema, idx) => {
    console.log(`\n  Schema ${idx + 1}:`);
    console.log('  Type:', schema['@type']);

    if (schema.location) {
      console.log('  Location:', JSON.stringify(schema.location, null, 4));
    }

    // Check events array for location patterns
    if (schema.events && Array.isArray(schema.events)) {
      console.log('  Events sample (first 10):');

      // Collect timezone offsets
      const timezones = new Set();

      schema.events.slice(0, 10).forEach((event, i) => {
        console.log(`    Event ${i + 1}:`, event.name);
        if (event.location) {
          const loc = event.location.name || event.location.address;
          console.log('      Location:', loc);
        }
        if (event.startDate) {
          const tzMatch = event.startDate.match(/([+-]\d{2}:\d{2})$/);
          if (tzMatch) {
            timezones.add(tzMatch[1]);
          }
        }
      });

      console.log('  Timezone offsets found:', Array.from(timezones));

      // Find events with full addresses (containing commas)
      const fullAddressEvents = schema.events.filter(e =>
        e.location?.address && e.location.address.includes(',')
      );

      if (fullAddressEvents.length > 0) {
        console.log('\n  Events with full addresses:');
        fullAddressEvents.slice(0, 3).forEach(event => {
          console.log(`    - ${event.name}`);
          console.log(`      Address: ${event.location.address}`);
        });
      }
    }
  });
} else {
  console.log('  (none found)');
}

console.log('\n📝 Text Content:');
console.log('  Description:', data.textContent.description);
console.log('  Sample locations:', data.textContent.sampleLocations);

console.log('\n📺 All iframes:', data.allIframes.length);
if (data.allIframes.length > 0) {
  data.allIframes.forEach((iframe, i) => {
    console.log(`    ${i + 1}. ${iframe.src.substring(0, 100)}`);
  });
}

console.log('\n🗺️  Maps Found:');
console.log('  Map iframes:', data.maps.iframes.length);
if (data.maps.iframes.length > 0) {
  data.maps.iframes.forEach((iframe, i) => {
    console.log(`    ${i + 1}. ${iframe.src.substring(0, 150)}...`);

    // Try to extract coordinates from Google Maps URL
    const coordMatch = iframe.src.match(/[?&](q|center)=([^&]+)/);
    if (coordMatch) {
      console.log(`       Coords: ${coordMatch[2]}`);
    }

    // Try to extract place info
    const placeMatch = iframe.src.match(/[?&]q=([^&]+)/);
    if (placeMatch) {
      console.log(`       Place: ${decodeURIComponent(placeMatch[1])}`);
    }
  });
}

console.log('  Map elements:', data.maps.mapElements.length);
if (data.maps.mapElements.length > 0) {
  data.maps.mapElements.slice(0, 5).forEach((el, i) => {
    console.log(`    ${i + 1}. <${el.tag}> id="${el.id}" class="${el.className.substring(0, 50)}"`);
  });
}

console.log('\n📍 Mapbox State:');
if (data.maps.mapboxData) {
  console.log('  Center:', data.maps.mapboxData.center);
  console.log('  Zoom:', data.maps.mapboxData.zoom);
  console.log('  Bounds:', data.maps.mapboxData.bounds);
} else {
  console.log('  (No mapbox API access - map loaded via iframe or obfuscated)');
}

console.log('\n  Markers found:', data.maps.markerCoordinates?.length || 0);
if (data.maps.markerCoordinates && data.maps.markerCoordinates.length > 0) {
  console.log('  (Markers use pixel transforms, need map API to convert to lat/lng)');
}

console.log('\n✅ Done! Check the data above.\n');

await browser.close();
