import https from 'https';
import http from 'http';
import ical from 'node-ical';

/**
 * Luma Events Fetcher
 *
 * Purpose: Fetch events from iCal feeds
 * Frequency: Every 10 minutes (high frequency polling)
 *
 * Usage:
 *   import { fetchEvents, fetchAllCityEvents } from './scrapers/events.js'
 *
 *   // Fetch events for a single city
 *   const events = await fetchEvents('amsterdam', icalUrl)
 *
 *   // Fetch events for all cities
 *   const allEvents = await fetchAllCityEvents(icalUrls)
 */

/**
 * Fetch and parse iCal feed for a single city
 * @param {string} citySlug - City identifier
 * @param {string} icalUrl - iCal feed URL
 * @returns {Promise<Object>} Parsed events data
 */
export async function fetchEvents(citySlug, icalUrl) {
  try {
    const icalData = await fetchUrl(icalUrl);
    const events = await parseIcal(icalData);

    return {
      citySlug,
      success: true,
      timestamp: new Date().toISOString(),
      eventCount: events.length,
      events
    };

  } catch (error) {
    return {
      citySlug,
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      events: []
    };
  }
}

/**
 * Fetch events for all cities (streaming with async generator)
 * Yields city results as they complete to avoid holding all events in memory
 *
 * @param {Object} icalUrls - Mapping of citySlug to iCal URL
 * @param {Object} options - Configuration options
 * @param {number} options.concurrency - Number of concurrent requests (default: 5)
 * @yields {Object} City result with events: { citySlug, success, timestamp, eventCount, events, error? }
 *
 * @example
 * for await (const cityResult of fetchAllCityEventsStreaming(urls)) {
 *   console.log(`${cityResult.citySlug}: ${cityResult.eventCount} events`);
 *   await storeInDatabase(cityResult.events);
 * }
 */
export async function* fetchAllCityEventsStreaming(icalUrls, options = {}) {
  const { concurrency = 5 } = options;
  const cities = Object.entries(icalUrls);

  console.log(`[scraper] Starting to fetch ${cities.length} cities in batches of ${concurrency}`)

  // Process in batches for concurrency control
  for (let i = 0; i < cities.length; i += concurrency) {
    const batch = cities.slice(i, i + concurrency);
    console.log(`[scraper] Fetching batch ${Math.floor(i/concurrency) + 1}: ${batch.map(([slug]) => slug).join(', ')}`)
    const batchPromises = batch.map(([slug, url]) => fetchEvents(slug, url));
    const batchResults = await Promise.allSettled(batchPromises);

    // Yield each city result as it completes
    for (let idx = 0; idx < batchResults.length; idx++) {
      const result = batchResults[idx];
      if (result.status === 'fulfilled') {
        yield result.value;
      } else {
        yield {
          citySlug: batch[idx][0],
          success: false,
          timestamp: new Date().toISOString(),
          error: result.reason?.message || 'Unknown error',
          eventCount: 0,
          events: []
        };
      }
    }
  }
}

/**
 * Fetch events for all cities (aggregated in memory)
 * Use fetchAllCityEventsStreaming() for better memory efficiency
 *
 * @param {Object} icalUrls - Mapping of citySlug to iCal URL
 * @param {Object} options - Configuration options
 * @param {number} options.concurrency - Number of concurrent requests (default: 5)
 * @returns {Promise<Object>} Aggregated events from all cities
 */
export async function fetchAllCityEvents(icalUrls, options = {}) {
  const results = [];
  let totalEvents = 0;
  let successCount = 0;

  for await (const cityResult of fetchAllCityEventsStreaming(icalUrls, options)) {
    results.push(cityResult);
    totalEvents += cityResult.eventCount;
    if (cityResult.success) successCount++;
  }

  const allEvents = results.flatMap(r => r.events);

  return {
    timestamp: new Date().toISOString(),
    totalCities: Object.keys(icalUrls).length,
    successfulCities: successCount,
    failedCities: Object.keys(icalUrls).length - successCount,
    totalEvents,
    cities: results,
    events: allEvents
  };
}

/**
 * Fetch URL content with redirect support
 * @private
 */
function fetchUrl(url, maxRedirects = 5) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    // Configure agent to not keep connections alive (prevents process hanging)
    const options = {
      agent: new client.Agent({ keepAlive: false })
    };

    client.get(url, options, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        if (maxRedirects === 0) {
          reject(new Error('Too many redirects'));
          return;
        }
        const redirectUrl = response.headers.location;
        if (!redirectUrl) {
          reject(new Error('Redirect without location header'));
          return;
        }
        // Follow redirect
        fetchUrl(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      let data = '';
      response.on('data', chunk => data += chunk);
      response.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Parse iCal data to extract events using node-ical library
 * @private
 */
async function parseIcal(icalData) {
  try {
    // Parse iCal data using node-ical
    const parsed = ical.sync.parseICS(icalData);
    const events = [];

    // Convert node-ical format to our internal format
    for (const [key, component] of Object.entries(parsed)) {
      // Only process VEVENT components
      if (component.type !== 'VEVENT') continue;

      const event = {
        uid: component.uid,
      };

      // Map properties to our expected format
      if (component.summary) event.title = component.summary;
      if (component.description) {
        event.description = component.description;
        // Extract Luma URL from description (matches both lu.ma and luma.com)
        const urlMatch = component.description.match(/https?:\/\/(luma\.com|lu\.ma)\/[^\s]+/);
        if (urlMatch) event.lumaUrl = urlMatch[0];
      }

      // Handle dates - node-ical returns Date objects
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

      // Handle GEO property
      if (component.geo) {
        event.geo = {
          lat: parseFloat(component.geo.lat),
          lon: parseFloat(component.geo.lon)
        };
      }

      // Handle organizer - node-ical provides full object
      if (component.organizer) {
        // Organizer can be string or object with val/params
        if (typeof component.organizer === 'string') {
          event.organizer = component.organizer;
        } else if (component.organizer.params?.CN) {
          event.organizer = component.organizer.params.CN;
        } else if (component.organizer.val) {
          // Extract name from mailto: URL
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

      // Only include events with a UID
      if (event.uid) events.push(event);
    }

    return events;
  } catch (error) {
    console.error('[parseIcal] Error parsing iCal data:', error.message);
    throw new Error(`Failed to parse iCal data: ${error.message}`);
  }
}

/**
 * Filter events by date range
 * @param {Array} events - Array of events
 * @param {Date} startDate - Start date
 * @param {Date} endDate - End date
 * @returns {Array} Filtered events
 */
export function filterEventsByDateRange(events, startDate, endDate) {
  return events.filter(event => {
    const eventStart = new Date(event.startDate);
    return eventStart >= startDate && eventStart <= endDate;
  });
}

/**
 * Group events by city
 * @param {Array} events - Array of events with citySlug
 * @returns {Object} Events grouped by city
 */
export function groupEventsByCity(events) {
  return events.reduce((acc, event) => {
    if (!acc[event.citySlug]) {
      acc[event.citySlug] = [];
    }
    acc[event.citySlug].push(event);
    return acc;
  }, {});
}
