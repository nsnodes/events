import { chromium } from 'playwright';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

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
    await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
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

    await browser.close();

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
 * @param {Object} citiesData - Cities data from scrapePopupCities()
 */
export function saveCities(citiesData) {
  const citiesPath = join(DATA_DIR, 'cities.json');
  const slugsPath = join(DATA_DIR, 'city-slugs.json');

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
