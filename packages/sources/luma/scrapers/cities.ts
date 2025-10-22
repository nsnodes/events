import { chromium, Browser, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Luma Cities Scraper
 *
 * Purpose: Extract list of all cities available on Luma
 * Frequency: Run once initially, then daily to detect new cities
 *
 * Usage:
 *   import { scrapeCities, getCities } from './scrapers/cities.js'
 *
 *   // Scrape and save new city list
 *   const cities = await scrapeCities()
 *
 *   // Load existing city list
 *   const cities = getCities()
 */

const DATA_DIR = path.join(process.cwd(), 'packages/sources/luma/data');
const CITIES_FILE = path.join(DATA_DIR, 'cities.json');

interface City {
  city: string;
  slug: string;
  url: string;
  region: string;
  eventCount: number;
  iconUrl: string | null;
}

interface CitiesData {
  timestamp: string;
  totalCities: number;
  totalRegions: number;
  cities: City[];
  byRegion: Record<string, City[]>;
}

interface ScrapeCitiesOptions {
  headless?: boolean;
}

interface CityComparison {
  hasChanges: boolean;
  added: City[];
  removed: City[];
  updated: City[];
  summary: {
    totalBefore: number;
    totalAfter: number;
    added: number;
    removed: number;
    updated: number;
  };
}

/**
 * Scrape all cities from Luma discover page
 * @param options - Configuration options
 * @returns City data with metadata
 */
export async function scrapeCities(options: ScrapeCitiesOptions = {}): Promise<CitiesData> {
  const { headless = true } = options;

  const browser: Browser = await chromium.launch({ headless });
  const page: Page = await browser.newPage();

  const allCities: City[] = [];

  try {
    await page.goto('https://luma.com/discover', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Scroll to "Explore Local Events" section
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find(h =>
        h.textContent?.includes('Explore Local Events')
      );
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await page.waitForTimeout(1000);

    // Get all region tabs
    const regions: string[] = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button.tab'))
        .map(tab => tab.textContent?.trim())
        .filter((text): text is string => Boolean(text));
    });

    // Extract cities from each region
    for (const region of regions) {
      await page.evaluate((regionName) => {
        const tabs = Array.from(document.querySelectorAll('button.tab'));
        const tab = tabs.find(t => t.textContent?.trim() === regionName);
        if (tab) (tab as HTMLButtonElement).click();
      }, region);

      await page.waitForTimeout(1000);

      const cities: City[] = await page.evaluate((regionName) => {
        const cityElements = document.querySelectorAll('.city-grid .place-item');
        return Array.from(cityElements).map(cityLink => {
          const href = cityLink.getAttribute('href');
          const title = cityLink.querySelector('.title')?.textContent?.trim();
          const desc = cityLink.querySelector('.desc')?.textContent?.trim();
          const iconImg = cityLink.querySelector('img');
          const eventCountMatch = desc?.match(/(\d+)/);

          return {
            city: title || '',
            slug: href?.replace('?k=p', '').replace('/', '') || '',
            url: 'https://luma.com' + href?.replace('?k=p', ''),
            region: regionName,
            eventCount: eventCountMatch ? parseInt(eventCountMatch[1]) : 0,
            iconUrl: iconImg?.src || null
          };
        }).filter(c => c.slug);
      }, region);

      allCities.push(...cities);
    }

    const uniqueCities = Array.from(
      new Map(allCities.map(city => [city.slug, city])).values()
    );

    uniqueCities.sort((a, b) => a.city.localeCompare(b.city));

    const byRegion: Record<string, City[]> = {};
    uniqueCities.forEach(city => {
      if (!byRegion[city.region]) byRegion[city.region] = [];
      byRegion[city.region].push(city);
    });

    const result: CitiesData = {
      timestamp: new Date().toISOString(),
      totalCities: uniqueCities.length,
      totalRegions: Object.keys(byRegion).length,
      cities: uniqueCities,
      byRegion
    };

    return result;

  } finally {
    await browser.close();
  }
}

/**
 * Save cities data to disk
 * @param citiesData - City data object
 */
export function saveCities(citiesData: CitiesData): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Save full JSON
  fs.writeFileSync(CITIES_FILE, JSON.stringify(citiesData, null, 2));

  // Save CSV
  const csv = 'slug,city,region,event_count,url\n' +
    citiesData.cities.map(c =>
      `${c.slug},"${c.city}","${c.region}",${c.eventCount},${c.url}`
    ).join('\n');
  fs.writeFileSync(path.join(DATA_DIR, 'cities.csv'), csv);

  // Save slug array
  const slugs = citiesData.cities.map(c => c.slug);
  fs.writeFileSync(
    path.join(DATA_DIR, 'city-slugs.json'),
    JSON.stringify(slugs, null, 2)
  );
}

/**
 * Load cities from disk
 * @returns City data object
 */
export function getCities(): CitiesData {
  if (!fs.existsSync(CITIES_FILE)) {
    throw new Error('Cities data not found. Run scrapeCities() first.');
  }
  return JSON.parse(fs.readFileSync(CITIES_FILE, 'utf8'));
}

/**
 * Compare old and new city data to detect changes
 * @param oldData - Previous city data
 * @param newData - New city data
 * @returns Diff with added/removed/updated cities
 */
export function compareCities(oldData: CitiesData, newData: CitiesData): CityComparison {
  const oldSlugs = new Set(oldData.cities.map(c => c.slug));
  const newSlugs = new Set(newData.cities.map(c => c.slug));

  const added = newData.cities.filter(c => !oldSlugs.has(c.slug));
  const removed = oldData.cities.filter(c => !newSlugs.has(c.slug));

  const updated = newData.cities.filter(newCity => {
    const oldCity = oldData.cities.find(c => c.slug === newCity.slug);
    return oldCity && oldCity.eventCount !== newCity.eventCount;
  });

  return {
    hasChanges: added.length > 0 || removed.length > 0 || updated.length > 0,
    added,
    removed,
    updated,
    summary: {
      totalBefore: oldData.totalCities,
      totalAfter: newData.totalCities,
      added: added.length,
      removed: removed.length,
      updated: updated.length
    }
  };
}
