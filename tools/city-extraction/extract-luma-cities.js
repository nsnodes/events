import { chromium } from 'playwright';
import fs from 'fs';

/**
 * Extract complete list of cities available on Luma
 */

async function extractLumaCities() {
  console.log('🌍 Extracting Luma city list...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Navigate to discover page
    console.log('Loading https://luma.com/discover...');
    await page.goto('https://luma.com/discover', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000); // Wait for any lazy loading

    // Try scrolling to ensure all cities are loaded
    console.log('Scrolling to load all content...');
    await page.evaluate(async () => {
      const scrolls = 5;
      for (let i = 0; i < scrolls; i++) {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(1000);

    // Extract city information
    console.log('Extracting city data...\n');

    const cities = await page.evaluate(() => {
      const cityData = [];

      // Strategy 1: Look for links with city patterns
      const cityLinks = document.querySelectorAll('a[href^="/"]');

      cityLinks.forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent?.trim();

        // Filter for city-like URLs (short paths, not /event/, /calendar/, etc.)
        if (href &&
            !href.includes('/event/') &&
            !href.includes('/calendar/') &&
            !href.includes('/discover') &&
            !href.includes('/create') &&
            !href.includes('?') &&
            href.length > 1 &&
            href.length < 50 &&
            href.match(/^\/[a-z-]+$/)) {

          // Look for associated text that might indicate event count
          const parent = link.closest('div, section');
          const eventCount = parent?.textContent?.match(/(\d+)\s*events?/i)?.[1];

          cityData.push({
            slug: href.replace('/', ''),
            url: 'https://luma.com' + href,
            name: text,
            eventCount: eventCount ? parseInt(eventCount) : null
          });
        }
      });

      // Strategy 2: Look for sections with city headers
      const sections = document.querySelectorAll('section, div[class*="city"], div[class*="location"]');
      sections.forEach(section => {
        const heading = section.querySelector('h1, h2, h3, h4');
        if (heading) {
          const regionText = heading.textContent;

          // Look for city links within this section
          const links = section.querySelectorAll('a[href^="/"]');
          links.forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();

            if (href && href.match(/^\/[a-z-]+$/)) {
              const eventCountMatch = link.textContent?.match(/(\d+)/);

              cityData.push({
                slug: href.replace('/', ''),
                url: 'https://luma.com' + href,
                name: text?.replace(/\d+/g, '').trim(),
                region: regionText,
                eventCount: eventCountMatch ? parseInt(eventCountMatch[0]) : null
              });
            }
          });
        }
      });

      // Strategy 3: Look for all text mentioning cities in the page
      const pageText = document.body.innerText;
      const cityPatterns = [
        /(?:Amsterdam|Barcelona|Berlin|Brussels|Copenhagen|Dublin|Edinburgh|Geneva|Hamburg|Helsinki|Istanbul|Lisbon|London|Madrid|Milan|Munich|Oslo|Paris|Prague|Rome|Stockholm|Vienna|Warsaw|Zurich)/gi,
        /(?:Bangkok|Beijing|Hong Kong|Mumbai|Seoul|Shanghai|Singapore|Sydney|Tokyo|Melbourne|Auckland)/gi,
        /(?:Atlanta|Austin|Boston|Chicago|Dallas|Denver|Houston|Los Angeles|Miami|New York|NYC|Philadelphia|Portland|San Diego|San Francisco|Seattle|Washington|Toronto|Vancouver|Montreal)/gi,
        /(?:Lagos|Nairobi|Cape Town|Johannesburg)/gi,
        /(?:Buenos Aires|São Paulo|Rio de Janeiro|Medellín|Bogotá|Mexico City|Lima|Santiago)/gi
      ];

      return cityData;
    });

    // Deduplicate by slug
    const uniqueCities = Array.from(
      new Map(cities.map(city => [city.slug, city])).values()
    );

    // Sort by slug
    uniqueCities.sort((a, b) => a.slug.localeCompare(b.slug));

    console.log(`\n✅ Found ${uniqueCities.length} unique cities:\n`);

    // Display in organized format
    const regions = {};
    uniqueCities.forEach(city => {
      const region = city.region || 'Unknown';
      if (!regions[region]) regions[region] = [];
      regions[region].push(city);
    });

    Object.entries(regions).forEach(([region, citiesList]) => {
      console.log(`\n${region}:`);
      citiesList.forEach(city => {
        const eventInfo = city.eventCount ? ` (${city.eventCount} events)` : '';
        console.log(`  • ${city.name || city.slug}${eventInfo}`);
        console.log(`    ${city.url}`);
      });
    });

    // Save to JSON
    const outputPath = './results/luma-cities.json';
    fs.writeFileSync(outputPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      totalCities: uniqueCities.length,
      cities: uniqueCities,
      byRegion: regions
    }, null, 2));

    console.log(`\n💾 Complete list saved to: ${outputPath}`);

    // Also save as simple list
    const simplePath = './results/luma-cities-simple.txt';
    const simpleList = uniqueCities.map(c => `${c.slug} - https://luma.com/${c.slug}`).join('\n');
    fs.writeFileSync(simplePath, simpleList);
    console.log(`💾 Simple list saved to: ${simplePath}`);

    // Take screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: './results/screenshots/luma-cities-page.png',
      fullPage: true
    });
    console.log('📸 Screenshot saved');

  } catch (error) {
    console.error('❌ Error:', error.message);
    throw error;
  } finally {
    await browser.close();
  }
}

// Run extraction
extractLumaCities().catch(console.error);
