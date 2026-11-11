import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

// The discover page we request; the final page URL must match it after navigation
const DISCOVER_URL = 'https://app.sola.day/';

// Markers rendered by sola.day's Next.js error boundary when the page crashes
// (observed 2026-11-11: "Something went wrong!" on https://sola.day/)
const ERROR_BOUNDARY_MARKERS = [
  'Something went wrong',
  'Application error',
  'client-side exception'
];

/**
 * Sola.day Popup Cities Scraper
 *
 * Purpose: Scrape popup city list from app.sola.day/popup-city
 * Method: Playwright
 * Frequency: Daily (to detect new cities and filter out past ones)
 *
 * Usage:
 *   import { scrapePopupCities, saveCities, getCities } from './scrapers/cities.js'
 *
 *   const cities = await scrapePopupCities({ headless: true })
 *   saveCities(cities)
 */

/**
 * Detect anomaly conditions that make a discover result untrustworthy.
 *
 * A silent redirect (e.g. 308 app.sola.day -> sola.day), a rendered error
 * boundary, or an empty city list all mean the page we loaded is not the
 * real discover page - returning such a result as success would overwrite
 * the retained dataset with an empty one.
 *
 * @param {Object} observation - What the scrape actually observed
 * @param {string} observation.requestedUrl - URL the scraper navigated to
 * @param {string} observation.finalUrl - page.url() after navigation
 * @param {Array} observation.cities - City cards extracted from the page
 * @param {string} observation.pageText - Rendered body text of the page
 * @returns {string|null} Anomaly description, or null when the result is healthy
 */
export function detectDiscoveryAnomaly({ requestedUrl, finalUrl, cities, pageText }) {
  if (finalUrl) {
    const requested = new URL(requestedUrl);
    const final = new URL(finalUrl);
    const normalizePath = (p) => p.replace(/\/+$/, '') || '/';

    if (final.origin !== requested.origin || normalizePath(final.pathname) !== normalizePath(requested.pathname)) {
      return `Redirected from ${requestedUrl} to ${finalUrl} - refusing to trust redirected page`;
    }
  }

  if (pageText && ERROR_BOUNDARY_MARKERS.some(marker => pageText.includes(marker))) {
    return `Source rendered an error boundary instead of the city list`;
  }

  if (cities && cities.length === 0) {
    return `Discovery found no popup cities (expected a non-empty list)`;
  }

  return null;
}

/**
 * Scrape popup city list and extract basic info
 * @param {Object} options - Configuration options
 * @param {boolean} options.headless - Run browser in headless mode (default: true)
 * @returns {Promise<Object>} Cities data with metadata
 */
export async function scrapePopupCities(options = {}) {
  const { headless = true } = options;

  const browser = await chromium.launch({ headless });
  const page = await browser.newPage();

  try {
    console.log('Loading popup city list...');
    // Use main page instead of /popup-city because it includes years in dates
    await page.goto(DISCOVER_URL, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const cities = await page.evaluate(() => {
      const cityCards = Array.from(document.querySelectorAll('a[href*="/event/"]'));
      const citiesData = [];
      const seen = new Set();

      cityCards.forEach(card => {
        const href = card.href;

        // Only popup city pages (not event detail pages)
        if (!href.match(/\/event\/[^\/]+$/) || href.includes('/detail/')) {
          return;
        }

        // Avoid duplicates
        if (seen.has(href)) return;
        seen.add(href);

        // Extract city slug from URL
        const slugMatch = href.match(/\/event\/([^\/]+)$/);
        const slug = slugMatch ? slugMatch[1] : null;

        // Extract title from h3 or semibold div
        const h3 = card.querySelector('h3');
        const titleDiv = card.querySelector('.webkit-box-clamp-2.text-lg.font-semibold');
        const title = h3 ? h3.textContent.trim() : (titleDiv ? titleDiv.textContent.trim() : null);

        // Extract dates from the date div (class contains responsive Tailwind classes like sm:text-sm)
        const dateDiv = card.querySelector('[class*="webkit-box-clamp-1"]');
        const dates = dateDiv ? dateDiv.textContent.trim() : null;

        // Extract location - handle two different card layouts:
        let location = null;
        if (dateDiv) {
          const parent = dateDiv.parentElement;

          // Layout 1: Date and location are siblings in a flex container
          // Check if parent is the flex row container
          if (parent.className.includes('flex') && parent.className.includes('flex-row')) {
            const siblings = Array.from(parent.children);
            const dateDivIndex = siblings.indexOf(dateDiv);
            const locationDiv = siblings[dateDivIndex + 1];

            if (locationDiv && locationDiv.textContent) {
              location = locationDiv.textContent.trim();
            }
          }
          // Layout 2: Location is in a different part of the card
          // Find a div that contains location+organizer (has "by " in it)
          else {
            const allDivs = Array.from(card.querySelectorAll('div'));
            const locationOrgDiv = allDivs.find(d => {
              const text = d.textContent.trim();
              // Must have "by " and not be the title div and not contain the dates
              return text.includes('by ') &&
                     !d.className.includes('webkit-box-clamp-2') &&
                     !text.includes(dates || '');
            });

            if (locationOrgDiv) {
              // Extract location part before "by"
              const text = locationOrgDiv.textContent.trim();
              const byIndex = text.toLowerCase().indexOf('by ');
              if (byIndex > 0) {
                location = text.substring(0, byIndex).trim();
              }
            }
          }
        }

        // Extract image
        const img = card.querySelector('img');
        const imageUrl = img ? img.src : null;

        citiesData.push({
          slug,
          url: href,
          title,
          dates,
          location,
          imageUrl
        });
      });

      return citiesData;
    });

    const pageText = await page.evaluate(() => document.body ? document.body.innerText.slice(0, 5000) : '');

    const anomaly = detectDiscoveryAnomaly({
      requestedUrl: DISCOVER_URL,
      finalUrl: page.url(),
      cities,
      pageText
    });

    await browser.close();

    if (anomaly) {
      console.error(`Popup city discovery anomaly: ${anomaly}`);
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: anomaly,
        cities: []
      };
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalCities: cities.length,
      cities
    };

  } catch (error) {
    await browser.close();
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      cities: []
    };
  }
}

/**
 * Save cities data to disk
 *
 * Refuses to save failed or empty results so a scraping anomaly can never
 * overwrite the retained dataset; the caller sees the throw and the previous
 * data files stay intact.
 *
 * @param {Object} citiesData - Cities data from scrapePopupCities()
 * @param {string} [dataDir] - Override target directory (used by tests)
 */
export function saveCities(citiesData, dataDir = DATA_DIR) {
  const citiesPath = join(dataDir, 'cities.json');
  const slugsPath = join(dataDir, 'city-slugs.json');

  if (!citiesData || citiesData.success === false) {
    throw new Error(`Refusing to save cities data: ${citiesData ? citiesData.error : 'no data'} - keeping previous data files`);
  }
  if (!Array.isArray(citiesData.cities) || citiesData.cities.length === 0) {
    throw new Error('Refusing to save cities data: empty city list - keeping previous data files');
  }

  // Save full data
  writeFileSync(citiesPath, JSON.stringify(citiesData, null, 2));

  // Save just slugs for quick access
  const slugs = citiesData.cities.map(c => c.slug);
  writeFileSync(slugsPath, JSON.stringify(slugs, null, 2));

  console.log(`Saved ${citiesData.cities.length} cities to ${citiesPath}`);
}

/**
 * Load cities data from disk
 * @returns {Object} Cities data
 */
export function getCities() {
  const citiesPath = join(DATA_DIR, 'cities.json');

  if (!existsSync(citiesPath)) {
    throw new Error('Cities data not found. Run scrapePopupCities() first.');
  }

  return JSON.parse(readFileSync(citiesPath, 'utf-8'));
}

/**
 * Compare old and new cities data to detect changes
 * @param {Object} oldData - Previous cities data
 * @param {Object} newData - New cities data
 * @returns {Object} Diff with added/removed cities
 */
export function compareCities(oldData, newData) {
  const oldSlugs = new Set(oldData.cities.map(c => c.slug));
  const newSlugs = new Set(newData.cities.map(c => c.slug));

  const added = newData.cities.filter(c => !oldSlugs.has(c.slug));
  const removed = oldData.cities.filter(c => !newSlugs.has(c.slug));

  return {
    hasChanges: added.length > 0 || removed.length > 0,
    added,
    removed,
    summary: `+${added.length} -${removed.length}`
  };
}
