import https from 'https';
import http from 'http';

/**
 * Sola.day Events Fetcher
 *
 * Purpose: Fetch events from iCal feeds
 * Method: HTTP (no Playwright needed!)
 * Frequency: Every 10-30 minutes (high frequency polling)
 *
 * Usage:
 *   import { fetchEvents, fetchAllCityEventsStreaming } from './scrapers/events.js'
 *
 *   // Fetch events for a single city
 *   const events = await fetchEvents('prospera', icalUrl)
 *
 *   // Fetch events for all cities (streaming)
 *   for await (const cityResult of fetchAllCityEventsStreaming(icalUrls)) {
 *     await storeInDatabase(cityResult.events)
 *   }
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
 * Fetch events for all cities (streaming - memory efficient)
 * @param {Object} icalUrls - Mapping of citySlug to iCal URL
 * @param {Object} options - Configuration options
 * @param {number} options.concurrency - Number of concurrent requests (default: 5)
 * @yields {Object} City result with events
 */
export async function* fetchAllCityEventsStreaming(icalUrls, options = {}) {
  const { concurrency = 5 } = options;

  const cities = Object.entries(icalUrls);

  // Process in batches for concurrency control
  for (let i = 0; i < cities.length; i += concurrency) {
    const batch = cities.slice(i, i + concurrency);
    const batchPromises = batch.map(([slug, url]) => fetchEvents(slug, url));
    const batchResults = await Promise.allSettled(batchPromises);

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        yield result.value;
      } else {
        yield {
          citySlug: 'unknown',
          success: false,
          timestamp: new Date().toISOString(),
          error: result.reason?.message || 'Unknown error',
          events: []
        };
      }
    }
  }
}

/**
 * Fetch events for all cities (aggregated in memory)
 * Use fetchAllCityEventsStreaming() for better memory efficiency
 * @param {Object} icalUrls - Mapping of citySlug to iCal URL
 * @param {Object} options - Configuration options
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

    client.get(url, (response) => {
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
 * Parse iCal data to extract events
 * @private
 */
async function parseIcal(icalData) {
  // Simple iCal parser - extract VEVENT blocks
  const events = [];
  const veventRegex = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let match;

  while ((match = veventRegex.exec(icalData)) !== null) {
    const veventBlock = match[1];
    const event = parseVEvent(veventBlock);
    if (event) events.push(event);
  }

  return events;
}

/**
 * Parse a single VEVENT block
 * @private
 */
function parseVEvent(veventBlock) {
  // Handle iCal line folding (RFC 5545): lines are folded by inserting CRLF followed by space
  // Unfold by removing CRLF + space sequences
  const unfoldedBlock = veventBlock.replace(/\r?\n[ \t]/g, '');
  const lines = unfoldedBlock.split('\n').map(l => l.trim()).filter(Boolean);
  const event = {};

  for (const line of lines) {
    if (line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      // Extract property name (remove parameters like ;VALUE=DATE)
      const propName = key.split(';')[0];

      switch (propName) {
        case 'UID':
          event.uid = value;
          break;
        case 'SUMMARY':
          event.title = value;
          break;
        case 'DESCRIPTION':
          event.description = value;
          // Extract Sola URL from description
          const urlMatch = value.match(/https?:\/\/app\.sola\.day\/[^\s]+/);
          if (urlMatch) event.solaUrl = urlMatch[0];
          break;
        case 'DTSTART':
          event.startDate = parseIcalDate(value);
          break;
        case 'DTEND':
          event.endDate = parseIcalDate(value);
          break;
        case 'LOCATION':
          event.location = value;
          break;
        case 'GEO':
          const [lat, lon] = value.split(';').map(parseFloat);
          event.geo = { lat, lon };
          break;
        case 'ORGANIZER':
          // Extract name from ORGANIZER:CN=Name:mailto:email
          const nameMatch = value.match(/CN=([^:]+)/);
          if (nameMatch) event.organizer = nameMatch[1];
          break;
        case 'STATUS':
          event.status = value; // CONFIRMED, TENTATIVE, CANCELLED
          break;
        case 'SEQUENCE':
          event.sequence = parseInt(value) || 0;
          break;
        case 'URL':
          event.url = value;
          break;
      }
    }
  }

  return event.uid ? event : null;
}

/**
 * Parse iCal date format (YYYYMMDDTHHMMSSZ)
 * @private
 */
function parseIcalDate(dateString) {
  // Handle date-only format (YYYYMMDD)
  if (dateString.length === 8) {
    const year = dateString.substring(0, 4);
    const month = dateString.substring(4, 6);
    const day = dateString.substring(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00Z`).toISOString();
  }

  // Handle datetime format (YYYYMMDDTHHMMSSZ or YYYYMMDDTHHMMSS)
  const year = dateString.substring(0, 4);
  const month = dateString.substring(4, 6);
  const day = dateString.substring(6, 8);
  const hour = dateString.substring(9, 11);
  const minute = dateString.substring(11, 13);
  const second = dateString.substring(13, 15);

  return new Date(`${year}-${month}-${day}T${hour}:${minute}:${second}Z`).toISOString();
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
