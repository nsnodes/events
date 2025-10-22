import https from 'https';
import http from 'http';
import ical from 'node-ical';
import { VEvent, CalendarComponent } from 'node-ical';

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

interface RawEvent {
  uid: string;
  title?: string;
  description?: string;
  lumaUrl?: string;
  startDate?: string;
  endDate?: string;
  location?: string;
  geo?: {
    lat: number;
    lon: number;
  };
  organizer?: string;
  status?: string;
  sequence?: number;
  url?: string;
}

interface CityResult {
  citySlug: string;
  success: boolean;
  timestamp: string;
  eventCount: number;
  events: RawEvent[];
  error?: string;
}

interface AllEventsResult {
  timestamp: string;
  totalCities: number;
  successfulCities: number;
  failedCities: number;
  totalEvents: number;
  cities: CityResult[];
  events: RawEvent[];
}

interface FetchOptions {
  concurrency?: number;
}

interface UrlMap {
  [citySlug: string]: string;
}

/**
 * Fetch and parse iCal feed for a single city
 * @param citySlug - City identifier
 * @param icalUrl - iCal feed URL
 * @returns Parsed events data
 */
export async function fetchEvents(citySlug: string, icalUrl: string): Promise<CityResult> {
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
      error: (error as Error).message,
      eventCount: 0,
      events: []
    };
  }
}

/**
 * Fetch events for all cities (streaming with async generator)
 * Yields city results as they complete to avoid holding all events in memory
 *
 * @param icalUrls - Mapping of citySlug to iCal URL
 * @param options - Configuration options
 * @yields City result with events: { citySlug, success, timestamp, eventCount, events, error? }
 *
 * @example
 * for await (const cityResult of fetchAllCityEventsStreaming(urls)) {
 *   console.log(`${cityResult.citySlug}: ${cityResult.eventCount} events`);
 *   await storeInDatabase(cityResult.events);
 * }
 */
export async function* fetchAllCityEventsStreaming(
  icalUrls: UrlMap,
  options: FetchOptions = {}
): AsyncGenerator<CityResult, void, unknown> {
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
 * @param icalUrls - Mapping of citySlug to iCal URL
 * @param options - Configuration options
 * @returns Aggregated events from all cities
 */
export async function fetchAllCityEvents(icalUrls: UrlMap, options: FetchOptions = {}): Promise<AllEventsResult> {
  const results: CityResult[] = [];
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
function fetchUrl(url: string, maxRedirects: number = 5): Promise<string> {
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
async function parseIcal(icalData: string): Promise<RawEvent[]> {
  try {
    // Parse iCal data using node-ical
    const parsed = ical.sync.parseICS(icalData);
    const events: RawEvent[] = [];

    // Convert node-ical format to our internal format
    for (const [key, component] of Object.entries(parsed)) {
      // Only process VEVENT components
      if (component.type !== 'VEVENT') continue;

      const vevent = component as VEvent;
      const event: RawEvent = {
        uid: vevent.uid
      };

      // Map properties to our expected format
      if (vevent.summary) event.title = vevent.summary;
      if (vevent.description) {
        event.description = vevent.description;
        // Extract Luma URL from description (matches both lu.ma and luma.com)
        const urlMatch = vevent.description.match(/https?:\/\/(luma\.com|lu\.ma)\/[^\s]+/);
        if (urlMatch) event.lumaUrl = urlMatch[0];
      }

      // Handle dates - node-ical returns Date objects
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

      // Handle GEO property
      if (vevent.geo) {
        event.geo = {
          lat: parseFloat(vevent.geo.lat as any),
          lon: parseFloat(vevent.geo.lon as any)
        };
      }

      // Handle organizer - node-ical provides full object
      if (vevent.organizer) {
        // Organizer can be string or object with val/params
        if (typeof vevent.organizer === 'string') {
          event.organizer = vevent.organizer;
        } else if (vevent.organizer.params?.CN) {
          event.organizer = vevent.organizer.params.CN;
        } else if ((vevent.organizer as any).val) {
          // Extract name from mailto: URL
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

      // Only include events with a UID
      if (event.uid) events.push(event);
    }

    return events;
  } catch (error) {
    console.error('[parseIcal] Error parsing iCal data:', (error as Error).message);
    throw new Error(`Failed to parse iCal data: ${(error as Error).message}`);
  }
}

/**
 * Filter events by date range
 * @param events - Array of events
 * @param startDate - Start date
 * @param endDate - End date
 * @returns Filtered events
 */
export function filterEventsByDateRange(events: RawEvent[], startDate: Date, endDate: Date): RawEvent[] {
  return events.filter(event => {
    if (!event.startDate) return false;
    const eventStart = new Date(event.startDate);
    return eventStart >= startDate && eventStart <= endDate;
  });
}

/**
 * Group events by city
 * @param events - Array of events with citySlug
 * @returns Events grouped by city
 */
export function groupEventsByCity(events: Array<RawEvent & { citySlug?: string }>): Record<string, RawEvent[]> {
  return events.reduce((acc, event) => {
    const citySlug = event.citySlug;
    if (!citySlug) return acc;

    if (!acc[citySlug]) {
      acc[citySlug] = [];
    }
    acc[citySlug].push(event);
    return acc;
  }, {} as Record<string, RawEvent[]>);
}
