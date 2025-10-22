import { chromium, Browser, BrowserContext, Page } from 'playwright';
import fs from 'fs';
import path from 'path';

/**
 * Luma iCal URL Scraper
 *
 * Purpose: Extract iCal subscription URLs for any Luma entity (cities, user handles, etc.)
 * Frequency: Weekly (to detect if iCal endpoints change)
 *
 * Note: This scraper works generically for any Luma page with the same layout:
 *   - Cities: luma.com/amsterdam
 *   - User handles: luma.com/ns
 *   - Any other entity with an RSS/iCal subscribe button
 *
 * Usage:
 *   import { scrapeIcalUrls, getIcalUrls } from './scrapers/ical-urls.js'
 *
 *   // Scrape iCal URLs for any entities (cities, handles, etc.)
 *   const urls = await scrapeIcalUrls(entities)
 *
 *   // Load existing iCal URLs
 *   const urls = getIcalUrls()
 */

const DATA_DIR = path.join(process.cwd(), 'packages/sources/luma/data');
const ICAL_URLS_FILE = path.join(DATA_DIR, 'ical-urls.json');
const ICAL_FULL_FILE = path.join(DATA_DIR, 'cities-with-ical.json');

const CONCURRENT_BROWSERS = 3;
const RETRY_ATTEMPTS = 2;

interface Entity {
  slug: string;
  [key: string]: any;
}

interface EntityWithIcal extends Entity {
  icalUrl: string | null;
  error?: string;
}

interface IcalUrlsData {
  timestamp: string;
  totalEntities: number;
  withIcalUrl: number;
  withoutIcalUrl: number;
  entities: EntityWithIcal[];
}

interface IcalFullData extends IcalUrlsData {
  entityType: string;
}

interface ScrapeOptions {
  headless?: boolean;
  concurrency?: number;
}

interface UrlMap {
  [slug: string]: string;
}

interface IcalComparison {
  hasChanges: boolean;
  changed: Array<{ slug: string; oldUrl: string; newUrl: string }>;
  added: Array<{ slug: string; url: string }>;
  removed: Array<{ slug: string; url: string }>;
  summary: {
    totalBefore: number;
    totalAfter: number;
    changed: number;
    added: number;
    removed: number;
  };
}

/**
 * Scrape iCal URLs for any Luma entities (cities, handles, etc.)
 * Works generically for any entity with a slug that maps to luma.com/{slug}
 *
 * @param entities - Array of entity objects with { slug, ... } structure
 * @param options - Configuration options
 * @returns iCal URL data
 */
export async function scrapeIcalUrls(entities: Entity[], options: ScrapeOptions = {}): Promise<IcalUrlsData> {
  const { headless = true, concurrency = CONCURRENT_BROWSERS } = options;

  const results: EntityWithIcal[] = [];
  const browser: Browser = await chromium.launch({ headless });

  try {
    // Process entities in batches
    for (let i = 0; i < entities.length; i += concurrency) {
      const batch = entities.slice(i, i + concurrency);
      const batchPromises = batch.map(entity => processEntity(browser, entity));
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

    const output: IcalUrlsData = {
      timestamp: new Date().toISOString(),
      totalEntities: entities.length,
      withIcalUrl: results.filter(r => r.icalUrl).length,
      withoutIcalUrl: results.filter(r => !r.icalUrl).length,
      entities: results
    };

    return output;

  } finally {
    await browser.close();
  }
}

/**
 * Process a single entity (city, handle, etc.) to extract iCal URL
 * Works for any luma.com/{slug} page with the same layout
 * @private
 */
async function processEntity(browser: Browser, entity: Entity, attempt: number = 1): Promise<EntityWithIcal> {
  const context: BrowserContext = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const page: Page = await context.newPage();

  try {
    await page.goto(`https://luma.com/${entity.slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    await page.waitForTimeout(1500);

    const icalUrl = await findAndExtractIcal(page);

    await context.close();

    if (icalUrl) {
      return { ...entity, icalUrl };
    } else if (attempt < RETRY_ATTEMPTS) {
      return await processEntity(browser, entity, attempt + 1);
    } else {
      return { ...entity, icalUrl: null };
    }

  } catch (error) {
    await context.close();

    if (attempt < RETRY_ATTEMPTS) {
      return await processEntity(browser, entity, attempt + 1);
    }

    throw error;
  }
}

/**
 * Find subscribe button and extract iCal URL from modal
 * @private
 */
async function findAndExtractIcal(page: Page): Promise<string | null> {
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
            (button as HTMLButtonElement).click();
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
          const iconButtons = Array.from(buttons).map(svg => svg.closest('button')).filter((btn): btn is HTMLButtonElement => Boolean(btn));
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
      const urls: string[] = [];

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
 * @param icalData - iCal URL data with entities array
 * @param entityType - Type of entities ('cities' or 'handles')
 */
export function saveIcalUrls(icalData: IcalUrlsData, entityType: string = 'cities'): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Save full data with entity type metadata
  const fullData: IcalFullData = {
    ...icalData,
    entityType
  };
  fs.writeFileSync(ICAL_FULL_FILE, JSON.stringify(fullData, null, 2));

  // Save URL mapping (slug -> url) - works for any entity type
  const urlMap: UrlMap = {};
  icalData.entities.forEach(entity => {
    if (entity.icalUrl) {
      urlMap[entity.slug] = entity.icalUrl;
    }
  });

  fs.writeFileSync(ICAL_URLS_FILE, JSON.stringify(urlMap, null, 2));
}

/**
 * Load iCal URLs from disk
 * @returns Slug to URL mapping
 */
export function getIcalUrls(): UrlMap {
  if (!fs.existsSync(ICAL_URLS_FILE)) {
    throw new Error('iCal URLs not found. Run scrapeIcalUrls() first.');
  }
  return JSON.parse(fs.readFileSync(ICAL_URLS_FILE, 'utf8'));
}

/**
 * Load full iCal data with metadata
 * @returns Full iCal data including entityType
 */
export function getIcalData(): IcalFullData {
  if (!fs.existsSync(ICAL_FULL_FILE)) {
    throw new Error('iCal data not found. Run scrapeIcalUrls() first.');
  }
  return JSON.parse(fs.readFileSync(ICAL_FULL_FILE, 'utf8'));
}

/**
 * Compare old and new iCal URLs to detect changes
 * @param oldUrls - Previous URL mapping
 * @param newUrls - New URL mapping (can be IcalUrlsData or UrlMap)
 * @returns Diff with changed URLs
 */
export function compareIcalUrls(oldUrls: UrlMap, newUrls: IcalUrlsData | UrlMap): IcalComparison {
  // Handle both formats: convert IcalUrlsData to UrlMap if needed
  const newUrlMap: UrlMap = 'entities' in newUrls
    ? Object.fromEntries(newUrls.entities.filter(e => e.icalUrl).map(e => [e.slug, e.icalUrl!]))
    : newUrls;

  const changed: Array<{ slug: string; oldUrl: string; newUrl: string }> = [];
  const added: Array<{ slug: string; url: string }> = [];
  const removed: Array<{ slug: string; url: string }> = [];

  // Check for changes and additions
  for (const [slug, newUrl] of Object.entries(newUrlMap)) {
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
    if (!newUrlMap[slug]) {
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
      totalAfter: Object.keys(newUrlMap).length,
      changed: changed.length,
      added: added.length,
      removed: removed.length
    }
  };
}
