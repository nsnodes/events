import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Luma iCal URL Scraper
 *
 * Purpose: Extract iCal subscription URLs for each city
 * Frequency: Weekly (to detect if iCal endpoints change)
 *
 * Usage:
 *   import { scrapeIcalUrls, getIcalUrls } from './scrapers/ical-urls.js'
 *
 *   // Scrape iCal URLs for all cities
 *   const urls = await scrapeIcalUrls(cities)
 *
 *   // Load existing iCal URLs
 *   const urls = getIcalUrls()
 */

const DATA_DIR = path.join(process.cwd(), 'packages/sources/luma/data');
const ICAL_URLS_FILE = path.join(DATA_DIR, 'ical-urls.json');
const ICAL_FULL_FILE = path.join(DATA_DIR, 'cities-with-ical.json');

const CONCURRENT_BROWSERS = 3;
const RETRY_ATTEMPTS = 2;

/**
 * Scrape iCal URLs for all cities
 * @param {Array} cities - Array of city objects
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Run in headless mode (default: true)
 * @param {number} options.concurrency - Number of concurrent browsers (default: 3)
 * @returns {Promise<Object>} iCal URL data
 */
export async function scrapeIcalUrls(cities, options = {}) {
  const { headless = true, concurrency = CONCURRENT_BROWSERS } = options;

  const results = [];
  const browser = await chromium.launch({ headless });

  try {
    // Process cities in batches
    for (let i = 0; i < cities.length; i += concurrency) {
      const batch = cities.slice(i, i + concurrency);
      const batchPromises = batch.map(city => processCity(browser, city));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, idx) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            ...batch[idx],
            icalUrl: null,
            error: result.reason.message
          });
        }
      });
    }

    const output = {
      timestamp: new Date().toISOString(),
      totalCities: cities.length,
      withIcalUrl: results.filter(r => r.icalUrl).length,
      withoutIcalUrl: results.filter(r => !r.icalUrl).length,
      cities: results
    };

    return output;

  } finally {
    await browser.close();
  }
}

/**
 * Process a single city to extract iCal URL
 * @private
 */
async function processCity(browser, city, attempt = 1) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    await page.goto(`https://luma.com/${city.slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await page.waitForTimeout(1500);

    const icalUrl = await findAndExtractIcal(page);

    await context.close();

    if (icalUrl) {
      return { ...city, icalUrl };
    } else if (attempt < RETRY_ATTEMPTS) {
      return await processCity(browser, city, attempt + 1);
    } else {
      return { ...city, icalUrl: null };
    }

  } catch (error) {
    await context.close();

    if (attempt < RETRY_ATTEMPTS) {
      return await processCity(browser, city, attempt + 1);
    }

    throw error;
  }
}

/**
 * Find subscribe button and extract iCal URL from modal
 * @private
 */
async function findAndExtractIcal(page) {
  try {
    // Click RSS icon button
    const clicked = await page.evaluate(() => {
      // Look for RSS icon with specific SVG pattern
      const svgs = Array.from(document.querySelectorAll('svg'));

      for (const svg of svgs) {
        const paths = Array.from(svg.querySelectorAll('path'));
        const circles = Array.from(svg.querySelectorAll('circle'));

        const hasRssPath = paths.some(p => {
          const d = p.getAttribute('d');
          return d && (d.includes('M4 11a9') || d.includes('M4 4a16'));
        });

        const hasRssCircle = circles.some(c => {
          return c.getAttribute('cx') === '5' && c.getAttribute('cy') === '19';
        });

        if (hasRssPath && hasRssCircle) {
          const button = svg.closest('button');
          if (button) {
            button.click();
            return true;
          }
        }
      }

      // Fallback: Find button with SVG near "Events" heading
      const headings = Array.from(document.querySelectorAll('h2, h3'));
      const eventsHeading = headings.find(h => h.textContent?.trim() === 'Events');

      if (eventsHeading) {
        const section = eventsHeading.closest('section, div');
        const buttons = section?.querySelectorAll('button svg');
        if (buttons && buttons.length > 0) {
          const iconButtons = Array.from(buttons).map(svg => svg.closest('button')).filter(Boolean);
          for (const btn of iconButtons) {
            const svg = btn.querySelector('svg');
            if (svg && svg.querySelectorAll('path, circle').length >= 2) {
              btn.click();
              return true;
            }
          }
        }
      }

      return false;
    });

    if (!clicked) return null;

    await page.waitForTimeout(1000);

    // Extract iCal URL from modal
    return await page.evaluate(() => {
      const modals = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"]');
      if (modals.length === 0) return null;

      const modal = modals[modals.length - 1];
      const urls = [];

      // Collect all URLs
      modal.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        if (href) urls.push(href);
      });

      modal.querySelectorAll('[data-clipboard-text]').forEach(el => {
        const data = el.getAttribute('data-clipboard-text');
        if (data) urls.push(data);
      });

      const modalHtml = modal.innerHTML;
      const matches = modalHtml.match(/(?:https?|webcal):\/\/[^\s"'<>]+ics[^\s"'<>]*/gi);
      if (matches) urls.push(...matches);

      // Extract API URL
      for (const url of urls) {
        // Direct api2.luma.com
        if (url.includes('api2.luma.com/ics/get')) {
          if (url.startsWith('webcal://')) {
            return 'https://' + url.substring(9);
          }
          if (url.startsWith('http')) {
            return url;
          }
        }

        // Decode from wrappers
        if (url.includes('cid=')) {
          const match = url.match(/cid=([^&]+)/);
          if (match) {
            const decoded = decodeURIComponent(match[1]);
            if (decoded.includes('api2.luma.com/ics/get')) {
              return decoded.replace('webcal://', 'https://');
            }
          }
        }

        if (url.includes('url=')) {
          const match = url.match(/url=([^&]+)/);
          if (match) {
            const decoded = decodeURIComponent(match[1]);
            if (decoded.includes('api2.luma.com/ics/get')) {
              return decoded.replace('webcal://', 'https://');
            }
          }
        }
      }

      return null;
    });

  } catch (error) {
    return null;
  }
}

/**
 * Save iCal URLs to disk
 * @param {Object} icalData - iCal URL data
 */
export function saveIcalUrls(icalData) {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Save full data
  fs.writeFileSync(ICAL_FULL_FILE, JSON.stringify(icalData, null, 2));

  // Save URL mapping (slug -> url)
  const urlMap = {};
  icalData.cities.forEach(city => {
    if (city.icalUrl) {
      urlMap[city.slug] = city.icalUrl;
    }
  });

  fs.writeFileSync(ICAL_URLS_FILE, JSON.stringify(urlMap, null, 2));
}

/**
 * Load iCal URLs from disk
 * @returns {Object} Slug to URL mapping
 */
export function getIcalUrls() {
  if (!fs.existsSync(ICAL_URLS_FILE)) {
    throw new Error('iCal URLs not found. Run scrapeIcalUrls() first.');
  }
  return JSON.parse(fs.readFileSync(ICAL_URLS_FILE, 'utf8'));
}

/**
 * Compare old and new iCal URLs to detect changes
 * @param {Object} oldUrls - Previous URL mapping
 * @param {Object} newUrls - New URL mapping
 * @returns {Object} Diff with changed URLs
 */
export function compareIcalUrls(oldUrls, newUrls) {
  const changed = [];
  const added = [];
  const removed = [];

  // Check for changes and additions
  for (const [slug, newUrl] of Object.entries(newUrls)) {
    if (!oldUrls[slug]) {
      added.push({ slug, url: newUrl });
    } else if (oldUrls[slug] !== newUrl) {
      changed.push({
        slug,
        oldUrl: oldUrls[slug],
        newUrl: newUrl
      });
    }
  }

  // Check for removals
  for (const slug of Object.keys(oldUrls)) {
    if (!newUrls[slug]) {
      removed.push({ slug, url: oldUrls[slug] });
    }
  }

  return {
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
    changed,
    added,
    removed,
    summary: {
      totalBefore: Object.keys(oldUrls).length,
      totalAfter: Object.keys(newUrls).length,
      changed: changed.length,
      added: added.length,
      removed: removed.length
    }
  };
}
