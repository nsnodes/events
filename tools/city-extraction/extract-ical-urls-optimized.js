import { chromium } from 'playwright';
import fs from 'fs';

/**
 * Optimized iCal URL extraction
 * - Uses existing city data (no need to re-extract)
 * - More robust button selector using SVG path matching
 * - Parallel browser contexts for faster processing
 * - Better error handling and retry logic
 */

const CONCURRENT_BROWSERS = 3; // Process 3 cities at once
const RETRY_ATTEMPTS = 2;

async function extractIcalUrls() {
  console.log('🔗 Extracting iCal URLs from Luma city pages (optimized)...\n');

  // Load existing city data
  const cityData = JSON.parse(
    fs.readFileSync('./packages/sources/luma/data/cities.json', 'utf8')
  );

  const cities = cityData.cities;
  const results = [];

  console.log(`📊 Processing ${cities.length} cities with ${CONCURRENT_BROWSERS} concurrent browsers\n`);

  // Create browser pool
  const browser = await chromium.launch({ headless: false });

  try {
    // Process cities in batches
    for (let i = 0; i < cities.length; i += CONCURRENT_BROWSERS) {
      const batch = cities.slice(i, i + CONCURRENT_BROWSERS);
      const batchPromises = batch.map(city => processCity(browser, city));

      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, idx) => {
        const city = batch[idx];
        if (result.status === 'fulfilled') {
          results.push(result.value);
          const url = result.value.icalUrl ? `✅ ${result.value.icalUrl}` : '❌ Not found';
          console.log(`[${i + idx + 1}/${cities.length}] ${city.city}: ${url}`);
        } else {
          results.push({ ...city, icalUrl: null, error: result.reason.message });
          console.log(`[${i + idx + 1}/${cities.length}] ${city.city}: ❌ Error: ${result.reason.message}`);
        }
      });
    }

    // Save results
    await saveResults(results, cities.length);

  } finally {
    await browser.close();
  }
}

async function processCity(browser, city, attempt = 1) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
  });

  const page = await context.newPage();

  try {
    // Navigate with timeout
    await page.goto(`https://luma.com/${city.slug}`, {
      waitUntil: 'domcontentloaded',
      timeout: 15000
    });

    // Wait for content to load
    await page.waitForTimeout(1500);

    // Find and click subscribe button using optimized selector
    const icalUrl = await findAndExtractIcal(page);

    await context.close();

    if (icalUrl) {
      return { ...city, icalUrl, method: 'success' };
    } else if (attempt < RETRY_ATTEMPTS) {
      console.log(`  ⚠️  Retry ${attempt + 1}/${RETRY_ATTEMPTS} for ${city.city}`);
      await context.close();
      return await processCity(browser, city, attempt + 1);
    } else {
      return { ...city, icalUrl: null, method: 'not_found' };
    }

  } catch (error) {
    await context.close();

    if (attempt < RETRY_ATTEMPTS) {
      console.log(`  ⚠️  Retry ${attempt + 1}/${RETRY_ATTEMPTS} for ${city.city}: ${error.message}`);
      return await processCity(browser, city, attempt + 1);
    }

    throw error;
  }
}

async function findAndExtractIcal(page) {
  try {
    // OPTIMIZED: Look for the RSS icon SVG with specific path pattern
    // This is more reliable than button position
    const clicked = await page.evaluate(() => {
      // The RSS icon has this specific SVG structure:
      // <path d="M4 11a9 9 0 0 1 9 9M4 4a16 16 0 0 1 16 16"></path>
      // <circle cx="5" cy="19" r="1"></circle>

      const svgs = Array.from(document.querySelectorAll('svg'));

      for (const svg of svgs) {
        const paths = Array.from(svg.querySelectorAll('path'));
        const circles = Array.from(svg.querySelectorAll('circle'));

        // Check for RSS icon pattern
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

      // Fallback: Look for button with SVG near "Events" heading
      const headings = Array.from(document.querySelectorAll('h2, h3'));
      const eventsHeading = headings.find(h => h.textContent?.trim() === 'Events');

      if (eventsHeading) {
        const section = eventsHeading.closest('section, div');
        const buttons = section?.querySelectorAll('button svg');
        if (buttons && buttons.length > 0) {
          // Find button with an SVG (likely icon buttons)
          const iconButtons = Array.from(buttons).map(svg => svg.closest('button')).filter(Boolean);
          // Try clicking buttons that have SVG children (icon buttons)
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

    if (!clicked) {
      return null;
    }

    // Wait for modal
    await page.waitForTimeout(1000);

    // Extract iCal URL from modal
    const icalUrl = await page.evaluate(() => {
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

      // Search modal HTML
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

    return icalUrl;

  } catch (error) {
    return null;
  }
}

async function saveResults(results, totalCities) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 SUMMARY');
  console.log('='.repeat(70));

  const withIcal = results.filter(r => r.icalUrl);
  const withoutIcal = results.filter(r => !r.icalUrl);

  console.log(`\n✅ Found iCal URLs: ${withIcal.length}/${totalCities}`);
  console.log(`❌ Missing iCal URLs: ${withoutIcal.length}/${totalCities}\n`);

  if (withoutIcal.length > 0 && withoutIcal.length <= 10) {
    console.log('Cities missing iCal URLs:');
    withoutIcal.forEach(city => {
      console.log(`  • ${city.city} (${city.slug})`);
    });
    console.log('');
  }

  // Save full results
  const output = {
    timestamp: new Date().toISOString(),
    totalCities,
    withIcalUrl: withIcal.length,
    withoutIcalUrl: withoutIcal.length,
    cities: results
  };

  fs.writeFileSync(
    './packages/sources/luma/data/cities-with-ical.json',
    JSON.stringify(output, null, 2)
  );
  console.log('💾 Saved to: ./packages/sources/luma/data/cities-with-ical.json');

  // Save URL mapping
  const urlMap = {};
  results.forEach(city => {
    if (city.icalUrl) {
      urlMap[city.slug] = city.icalUrl;
    }
  });

  fs.writeFileSync(
    './packages/sources/luma/data/ical-urls.json',
    JSON.stringify(urlMap, null, 2)
  );
  console.log('💾 Saved URL mapping to: ./packages/sources/luma/data/ical-urls.json');

  // Sample URLs
  if (withIcal.length > 0) {
    console.log('\nSample iCal URLs:');
    withIcal.slice(0, 3).forEach(city => {
      console.log(`  ${city.city}: ${city.icalUrl}`);
    });
  }
}

extractIcalUrls().catch(console.error);
