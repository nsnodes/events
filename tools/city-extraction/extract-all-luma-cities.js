import { chromium } from 'playwright';
import fs from 'fs';

/**
 * Extract ALL Luma cities by clicking through region tabs
 */

async function extractAllLumaCities() {
  console.log('🌍 Extracting complete Luma city list across all regions...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const allCities = [];

  try {
    await page.goto('https://luma.com/discover', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // Scroll to the "Explore Local Events" section
    await page.evaluate(() => {
      const heading = Array.from(document.querySelectorAll('h1, h2, h3')).find(h =>
        h.textContent?.includes('Explore Local Events')
      );
      if (heading) {
        heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    await page.waitForTimeout(1000);

    // Find all region tabs
    const regions = await page.evaluate(() => {
      const tabs = [];
      const tabElements = document.querySelectorAll('button.tab');
      tabElements.forEach(tab => {
        tabs.push(tab.textContent?.trim());
      });
      return tabs;
    });

    console.log(`📊 Found ${regions.length} regions:`, regions.join(', '));
    console.log('');

    // Click through each region tab
    for (const region of regions) {
      console.log(`\n🌏 Extracting cities from: ${region}`);

      // Click the tab
      await page.evaluate((regionName) => {
        const tabs = Array.from(document.querySelectorAll('button.tab'));
        const tab = tabs.find(t => t.textContent?.trim() === regionName);
        if (tab) tab.click();
      }, region);

      await page.waitForTimeout(1000); // Wait for transition

      // Extract cities from this region
      const cities = await page.evaluate((regionName) => {
        const cityElements = document.querySelectorAll('.city-grid .place-item');
        const extracted = [];

        cityElements.forEach(cityLink => {
          const href = cityLink.getAttribute('href');
          const title = cityLink.querySelector('.title')?.textContent?.trim();
          const desc = cityLink.querySelector('.desc')?.textContent?.trim();
          const iconImg = cityLink.querySelector('img');

          // Extract event count from description (e.g., "39 Events")
          const eventCountMatch = desc?.match(/(\d+)/);

          if (href && title) {
            extracted.push({
              city: title,
              slug: href.replace('?k=p', '').replace('/', ''),
              url: 'https://luma.com' + href.replace('?k=p', ''),
              region: regionName,
              eventCount: eventCountMatch ? parseInt(eventCountMatch[1]) : 0,
              iconUrl: iconImg?.src || null
            });
          }
        });

        return extracted;
      }, region);

      console.log(`   ✅ Found ${cities.length} cities`);
      cities.forEach(city => {
        console.log(`      • ${city.city} (${city.eventCount} events)`);
      });

      allCities.push(...cities);
    }

    // Sort and deduplicate
    const uniqueCities = Array.from(
      new Map(allCities.map(city => [city.slug, city])).values()
    );

    uniqueCities.sort((a, b) => a.city.localeCompare(b.city));

    // Group by region
    const byRegion = {};
    uniqueCities.forEach(city => {
      if (!byRegion[city.region]) {
        byRegion[city.region] = [];
      }
      byRegion[city.region].push(city);
    });

    // Print summary
    console.log('\n\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));
    console.log(`\n✅ Total unique cities: ${uniqueCities.length}\n`);

    Object.entries(byRegion).forEach(([region, cities]) => {
      console.log(`\n${region}: ${cities.length} cities`);
      cities.forEach(city => {
        console.log(`  • ${city.city.padEnd(20)} ${city.slug.padEnd(20)} (${city.eventCount} events)`);
      });
    });

    // Save results
    const results = {
      timestamp: new Date().toISOString(),
      totalCities: uniqueCities.length,
      totalRegions: Object.keys(byRegion).length,
      cities: uniqueCities,
      byRegion: byRegion
    };

    fs.writeFileSync('./results/luma-cities-complete.json', JSON.stringify(results, null, 2));
    console.log('\n\n💾 Complete data saved to: ./results/luma-cities-complete.json');

    // Save as simple text list
    const simpleList = uniqueCities.map(c =>
      `${c.slug}\t${c.city}\t${c.region}\t${c.eventCount}\thttps://luma.com/${c.slug}`
    ).join('\n');

    const header = 'slug\tcity\tregion\tevents\turl\n' + '-'.repeat(80) + '\n';
    fs.writeFileSync('./results/luma-cities-list.txt', header + simpleList);
    console.log('💾 Tab-separated list saved to: ./results/luma-cities-list.txt');

    // Save as CSV
    const csv = 'slug,city,region,event_count,url\n' +
      uniqueCities.map(c =>
        `${c.slug},"${c.city}","${c.region}",${c.eventCount},https://luma.com/${c.slug}`
      ).join('\n');

    fs.writeFileSync('./results/luma-cities.csv', csv);
    console.log('💾 CSV saved to: ./results/luma-cities.csv');

    // Print slug-only list for easy copy/paste
    console.log('\n\n📋 City slugs (for programmatic use):');
    console.log('='.repeat(70));
    const slugs = uniqueCities.map(c => c.slug);
    console.log(JSON.stringify(slugs, null, 2));

    const slugsFile = './results/luma-city-slugs.json';
    fs.writeFileSync(slugsFile, JSON.stringify(slugs, null, 2));
    console.log(`\n💾 Slugs saved to: ${slugsFile}`);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  } finally {
    await browser.close();
  }
}

extractAllLumaCities().catch(console.error);
