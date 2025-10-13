import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

/**
 * Sola.day iCal URL Extractor
 *
 * Purpose: Extract iCal subscription URLs from popup city pages
 * Method: Playwright (clicks RSS icon, extracts iCal URL from modal)
 * Frequency: Weekly (iCal endpoints rarely change)
 *
 * Usage:
 *   import { scrapeIcalUrls, saveIcalUrls, getIcalUrls } from './scrapers/ical-urls.js'
 *
 *   const cities = getCities()
 *   const icalData = await scrapeIcalUrls(cities.cities, { concurrency: 3 })
 *   saveIcalUrls(icalData)
 */

/**
 * Extract iCal URL from a single popup city page
 * @param {Object} city - City object with url and slug
 * @param {Object} options - Configuration options
 * @param {Object} options.browser - Existing browser instance (optional)
 * @returns {Promise<Object>} Result with iCal URL
 */
export async function extractIcalUrl(city, options = {}) {
  const { browser: existingBrowser } = options;
  const browser = existingBrowser || await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto(city.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(1500);

    // Click the RSS icon (uil-rss class)
    const clicked = await page.evaluate(() => {
      const rssIcon = document.querySelector('.uil-rss, i.uil-rss, [class*="uil-rss"]');
      if (rssIcon) {
        const button = rssIcon.closest('button') || rssIcon.closest('a');
        if (button) {
          button.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      if (!existingBrowser) await browser.close();
      else await page.close();
      return {
        success: false,
        citySlug: city.slug,
        error: 'RSS icon not found'
      };
    }

    // Wait for modal to appear
    await page.waitForTimeout(1500);

    // Extract iCal URL from modal
    const icalUrl = await page.evaluate(() => {
      // Strategy 1: Look for webcal:// links (Apple/System Calendar)
      const allLinks = Array.from(document.querySelectorAll('a'));
      for (const link of allLinks) {
        if (link.href.startsWith('webcal://')) {
          // Convert webcal:// to https://
          return link.href.replace('webcal://', 'https://');
        }
      }

      // Strategy 2: Decode from Google Calendar wrapper
      // Format: https://www.google.com/calendar/render?cid=http%3A%2F%2Fapi.sola.day%2F...
      for (const link of allLinks) {
        if (link.href.includes('google.com/calendar') && link.href.includes('cid=')) {
          try {
            const url = new URL(link.href);
            const cid = url.searchParams.get('cid');
            if (cid) {
              // The cid is URL-encoded, so decode it
              const decoded = decodeURIComponent(cid);
              if (decoded.includes('api.sola.day')) {
                // Convert http to https if needed
                return decoded.replace('http://', 'https://');
              }
            }
          } catch (e) {}
        }
      }

      // Strategy 3: Decode from Outlook wrapper
      // Format: https://outlook.live.com/calendar/0/addcalendar?url=https%3A%2F%2Fapi.sola.day%2F...
      for (const link of allLinks) {
        if (link.href.includes('outlook.live.com/calendar') && link.href.includes('url=')) {
          try {
            const url = new URL(link.href);
            const icalUrl = url.searchParams.get('url');
            if (icalUrl && icalUrl.includes('api.sola.day')) {
              return decodeURIComponent(icalUrl);
            }
          } catch (e) {}
        }
      }

      return null;
    });

    if (!existingBrowser) await browser.close();
    else await page.close();

    if (icalUrl) {
      return {
        success: true,
        citySlug: city.slug,
        icalUrl
      };
    } else {
      return {
        success: false,
        citySlug: city.slug,
        error: 'iCal URL not found in modal'
      };
    }

  } catch (error) {
    if (!existingBrowser) await browser.close();
    else await page.close();

    return {
      success: false,
      citySlug: city.slug,
      error: error.message
    };
  }
}

/**
 * Extract iCal URLs for all cities
 * @param {Array} cities - Array of city objects
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Run browser in headless mode (default: true)
 * @param {number} options.concurrency - Number of concurrent page loads (default: 3)
 * @returns {Promise<Object>} Results with iCal URLs
 */
export async function scrapeIcalUrls(cities, options = {}) {
  const { headless = true, concurrency = 3 } = options;

  const browser = await chromium.launch({ headless });
  const results = [];

  try {
    // Process in batches for concurrency control
    for (let i = 0; i < cities.length; i += concurrency) {
      const batch = cities.slice(i, i + concurrency);
      console.log(`Processing cities ${i + 1}-${Math.min(i + concurrency, cities.length)} of ${cities.length}...`);

      const batchPromises = batch.map(city => extractIcalUrl(city, { browser }));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            citySlug: batch[idx].slug,
            error: result.reason?.message || 'Unknown error'
          });
        }
      });
    }

    await browser.close();

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalCities: cities.length,
      withIcalUrl: successful.length,
      failed: failed.length,
      cities: results
    };

  } catch (error) {
    await browser.close();
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      cities: results
    };
  }
}

/**
 * Save iCal URLs to disk
 * @param {Object} icalData - iCal URLs data from scrapeIcalUrls()
 */
export function saveIcalUrls(icalData) {
  const icalUrlsPath = join(DATA_DIR, 'ical-urls.json');

  // Create simple slug -> URL mapping
  const urlMap = {};
  icalData.cities.forEach(city => {
    if (city.success && city.icalUrl) {
      urlMap[city.citySlug] = city.icalUrl;
    }
  });

  writeFileSync(icalUrlsPath, JSON.stringify(urlMap, null, 2));
  console.log(`Saved ${Object.keys(urlMap).length} iCal URLs to ${icalUrlsPath}`);
}

/**
 * Load iCal URLs from disk
 * @returns {Object} Slug -> iCal URL mapping
 */
export function getIcalUrls() {
  const icalUrlsPath = join(DATA_DIR, 'ical-urls.json');

  if (!existsSync(icalUrlsPath)) {
    throw new Error('iCal URLs not found. Run scrapeIcalUrls() first.');
  }

  return JSON.parse(readFileSync(icalUrlsPath, 'utf-8'));
}

/**
 * Compare old and new iCal URLs to detect changes
 * @param {Object} oldUrls - Previous URL mapping
 * @param {Object} newUrls - New URL mapping
 * @returns {Object} Diff with added/removed/changed URLs
 */
export function compareIcalUrls(oldUrls, newUrls) {
  const oldSlugs = Object.keys(oldUrls);
  const newSlugs = Object.keys(newUrls);

  const added = newSlugs.filter(slug => !oldUrls[slug]);
  const removed = oldSlugs.filter(slug => !newUrls[slug]);
  const changed = newSlugs.filter(slug =>
    oldUrls[slug] && newUrls[slug] && oldUrls[slug] !== newUrls[slug]
  );

  return {
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
    added,
    removed,
    changed,
    summary: `+${added.length} -${removed.length} ~${changed.length}`
  };
}
