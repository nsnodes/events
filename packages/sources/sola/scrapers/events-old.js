import { chromium } from 'playwright';

/**
 * Sola.day Events Scraper
 *
 * Purpose: Scrape events from app.sola.day (Social Layer)
 * Method: Playwright (client-side rendered React app)
 * Frequency: Every 30 minutes
 *
 * Usage:
 *   import { scrapeDiscoverPage, scrapeEventDetail, scrapeAllEvents } from './scrapers/events.js'
 *
 *   // Get all event URLs from discover page
 *   const urls = await scrapeDiscoverPage()
 *
 *   // Get details for one event
 *   const event = await scrapeEventDetail(url)
 *
 *   // Get all events with details (streaming)
 *   for await (const event of scrapeAllEvents()) {
 *     console.log(event.title)
 *   }
 */

/**
 * Scrape popup city list page to get all popup city URLs
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Run browser in headless mode (default: true)
 * @returns {Promise<Object>} Result with popup city URLs
 */
export async function scrapePopupCityList(options = {}) {
  const { headless = true } = options;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    await page.goto('https://app.sola.day/popup-city', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000); // Let dynamic content load

    const popupCityUrls = await page.evaluate(() => {
      // Get all popup city links from the list
      const links = Array.from(document.querySelectorAll('a[href*="/event/"]'));
      const urls = new Set();

      links.forEach(a => {
        const href = a.href;
        // Include popup city pages (not detail pages)
        if (href.match(/\/event\/[^\/]+$/) && !href.includes('/detail/')) {
          urls.add(href);
        }
      });

      return Array.from(urls);
    });

    await browser.close();

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalCities: popupCityUrls.length,
      popupCityUrls
    };

  } catch (error) {
    await browser.close();
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      popupCityUrls: []
    };
  }
}

/**
 * Scrape group page to get all event detail URLs
 * @param {string} groupUrl - Group page URL (e.g., https://app.sola.day/event/prospera)
 * @param {Object} options - Configuration options
 * @param {Object} options.browser - Existing browser instance (optional)
 * @returns {Promise<Object>} Result with event detail URLs
 */
export async function scrapeGroupPage(groupUrl, options = {}) {
  const { browser: existingBrowser } = options;
  const browser = existingBrowser || await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(groupUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const eventUrls = await page.evaluate(() => {
      // Get all event detail links on this group page
      const links = Array.from(document.querySelectorAll('a[href*="/event/detail/"]'));
      const urls = new Set();

      links.forEach(a => {
        urls.add(a.href);
      });

      return Array.from(urls);
    });

    if (!existingBrowser) {
      await browser.close();
    } else {
      await page.close();
    }

    return {
      success: true,
      groupUrl,
      eventCount: eventUrls.length,
      eventUrls
    };

  } catch (error) {
    if (!existingBrowser) {
      await browser.close();
    } else {
      await page.close();
    }

    return {
      success: false,
      groupUrl,
      error: error.message,
      eventUrls: []
    };
  }
}

/**
 * Scrape event detail page
 * @param {string} url - Event detail URL
 * @param {Object} options - Configuration options
 * @param {Object} options.browser - Existing browser instance (optional)
 * @returns {Promise<Object>} Event data
 */
export async function scrapeEventDetail(url, options = {}) {
  const { browser: existingBrowser } = options;
  const browser = existingBrowser || await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    const event = await page.evaluate((eventUrl) => {
      const text = document.body.innerText;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

      // Helper to find line index
      const findLineIdx = (keyword) => lines.findIndex(l => l === keyword);

      // Extract event ID from URL
      const idMatch = eventUrl.match(/\/event\/detail\/(\d+)/);
      const eventId = idMatch ? idMatch[1] : null;

      // Find key indices
      const signInIdx = findLineIdx('Sign In');
      const pastIdx = findLineIdx('Past');
      const upcomingIdx = findLineIdx('Upcoming');
      const ongoingIdx = findLineIdx('Ongoing');
      const hostIdx = findLineIdx('Host');
      const contentIdx = findLineIdx('Content');

      // Status
      let status = 'upcoming';
      let statusIdx = -1;
      if (ongoingIdx !== -1) {
        status = 'ongoing';
        statusIdx = ongoingIdx;
      } else if (pastIdx !== -1) {
        status = 'past';
        statusIdx = pastIdx;
      } else if (upcomingIdx !== -1) {
        status = 'upcoming';
        statusIdx = upcomingIdx;
      }

      // Title (line before status, after sign in prompts)
      let title = '';
      if (statusIdx > 0 && signInIdx !== -1) {
        // Look backwards from status to find title
        for (let i = statusIdx - 1; i > signInIdx; i--) {
          const line = lines[i];
          if (!line.includes('Sign in to') &&
              !line.includes('Share') &&
              line.length > 3 &&
              line.length < 100) {
            title = line;
            break;
          }
        }
      }

      // Tags (between status and organizer name)
      let tags = [];
      if (statusIdx !== -1 && hostIdx !== -1) {
        for (let i = statusIdx + 1; i < hostIdx; i++) {
          const line = lines[i];
          if (line && line !== 'Host' && line.length < 50) {
            tags.push(line);
          } else {
            break; // Stop when we hit organizer or Host
          }
        }
      }

      // Organizer (last tag before 'Host' is usually the organizer)
      const organizer = tags.length > 0 ? tags[tags.length - 1] : null;
      // Remove organizer from tags
      if (organizer) tags = tags.slice(0, -1);

      // Date, time, location (lines after 'Host')
      let dateRange = null;
      let timeRange = null;
      let location = null;
      let fullAddress = null;

      if (hostIdx !== -1) {
        dateRange = lines[hostIdx + 1];
        timeRange = lines[hostIdx + 2];
        location = lines[hostIdx + 3];
        // Sometimes there's a full address after location
        if (lines[hostIdx + 4] && !lines[hostIdx + 4].includes('View map') && !lines[hostIdx + 4].includes('Copy')) {
          fullAddress = lines[hostIdx + 4];
        }
      }

      // Description (text between Content and Participants/Comments)
      let description = '';
      if (contentIdx !== -1) {
        const participantsIdx = findLineIdx('Participants');
        const commentsIdx = findLineIdx('Comments');
        const endIdx = participantsIdx !== -1 ? participantsIdx : commentsIdx;

        if (endIdx !== -1) {
          const descLines = lines.slice(contentIdx + 1, endIdx);
          // Filter out UI elements
          description = descLines.filter(l =>
            !l.includes('View map') &&
            !l.includes('Copy Address') &&
            !l.includes('Online Meeting')
          ).join('\n');
        }
      }

      // External URL (https:// link in the text, not sola.day)
      const urlMatches = text.match(/https?:\/\/[^\s]+/g) || [];
      const externalUrl = urlMatches.find(u =>
        !u.includes('sola.day') &&
        !u.includes('imagekit.io') &&
        !u.includes('datastore.sola.day')
      ) || null;

      // Main event image (not logo)
      const images = Array.from(document.querySelectorAll('img'));
      const mainImage = images.find(img =>
        img.src.includes('datastore.sola.day') ||
        (img.src.includes('imagekit.io') && !img.alt.includes('Social Layer'))
      )?.src || null;

      return {
        id: eventId,
        url: eventUrl,
        title: title.substring(0, 200),
        status,
        tags,
        organizer,
        dateRange,
        timeRange,
        location,
        fullAddress,
        description: description.substring(0, 2000),
        externalUrl,
        image: mainImage
      };
    }, url);

    if (!existingBrowser) {
      await browser.close();
    } else {
      await page.close();
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      ...event
    };

  } catch (error) {
    if (!existingBrowser) {
      await browser.close();
    } else {
      await page.close();
    }

    return {
      success: false,
      timestamp: new Date().toISOString(),
      url,
      error: error.message
    };
  }
}

/**
 * Scrape all events with streaming (memory-efficient)
 * Yields event details as they are scraped
 *
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Run browser in headless mode (default: true)
 * @param {number} options.concurrency - Number of concurrent page loads (default: 3)
 * @param {boolean} options.includePast - Include past events (default: false)
 * @yields {Object} Event data
 *
 * @example
 * for await (const event of scrapeAllEvents()) {
 *   console.log(`${event.title} - ${event.startDate}`);
 *   await storeInDatabase(event);
 * }
 */
export async function* scrapeAllEvents(options = {}) {
  const { headless = true, concurrency = 3, includePast = false } = options;

  // Step 1: Get all group URLs from discover page
  const discoverResult = await scrapeDiscoverPage({ headless });

  if (!discoverResult.success) {
    throw new Error(`Failed to scrape discover page: ${discoverResult.error}`);
  }

  const groupUrls = discoverResult.groupUrls;

  // Open one browser for all requests
  const browser = await chromium.launch({ headless });

  try {
    // Step 2: Get all event detail URLs from each group page
    const allEventUrls = new Set();

    for (let i = 0; i < groupUrls.length; i += concurrency) {
      const batch = groupUrls.slice(i, i + concurrency);
      const batchPromises = batch.map(url => scrapeGroupPage(url, { browser }));
      const batchResults = await Promise.allSettled(batchPromises);

      for (const result of batchResults) {
        if (result.status === 'fulfilled' && result.value.success) {
          result.value.eventUrls.forEach(url => allEventUrls.add(url));
        }
      }
    }

    const eventUrls = Array.from(allEventUrls);

    // Step 3: Scrape each event detail page
    for (let i = 0; i < eventUrls.length; i += concurrency) {
      const batch = eventUrls.slice(i, i + concurrency);
      const batchPromises = batch.map(url => scrapeEventDetail(url, { browser }));
      const batchResults = await Promise.allSettled(batchPromises);

      // Yield each event as it completes (filter out past events if needed)
      for (const result of batchResults) {
        if (result.status === 'fulfilled') {
          const event = result.value;
          // Skip past events unless explicitly requested
          if (!includePast && event.success && event.status === 'past') {
            continue;
          }
          yield event;
        } else {
          yield {
            success: false,
            error: result.reason?.message || 'Unknown error',
            timestamp: new Date().toISOString()
          };
        }
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * Scrape all events (aggregated in memory)
 * Use scrapeAllEvents() for better memory efficiency
 *
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} All events data
 */
export async function scrapeAllEventsAggregated(options = {}) {
  const events = [];
  let successCount = 0;
  let failureCount = 0;

  for await (const event of scrapeAllEvents(options)) {
    events.push(event);
    if (event.success) {
      successCount++;
    } else {
      failureCount++;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    totalEvents: events.length,
    successCount,
    failureCount,
    events
  };
}
