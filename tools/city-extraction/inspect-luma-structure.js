import { chromium } from 'playwright';
import fs from 'fs';

/**
 * Inspect the actual DOM structure to find cities
 */

async function inspectLumaStructure() {
  console.log('🔍 Inspecting Luma discover page structure...\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    await page.goto('https://luma.com/discover', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // Scroll down to load city sections
    console.log('Scrolling to find city sections...');
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(300);
    }

    // Look for text patterns that mention cities
    const pageAnalysis = await page.evaluate(() => {
      const results = {
        allLinks: [],
        headings: [],
        textSamples: [],
        cityKeywords: []
      };

      // Get all links
      document.querySelectorAll('a[href]').forEach(link => {
        const href = link.getAttribute('href');
        const text = link.textContent?.trim();
        if (text && text.length > 0 && text.length < 100) {
          results.allLinks.push({
            href,
            text,
            classes: link.className
          });
        }
      });

      // Get all headings
      document.querySelectorAll('h1, h2, h3, h4').forEach(h => {
        results.headings.push({
          tag: h.tagName,
          text: h.textContent?.trim(),
          classes: h.className
        });
      });

      // Look for divs/sections that might contain city lists
      document.querySelectorAll('section, div[class*="grid"], div[class*="list"]').forEach((el, i) => {
        if (i < 20) { // Limit to avoid too much data
          const text = el.textContent?.substring(0, 500);
          if (text && (
            text.toLowerCase().includes('city') ||
            text.toLowerCase().includes('location') ||
            text.toLowerCase().includes('explore') ||
            text.match(/amsterdam|berlin|london|paris|nyc|tokyo/i)
          )) {
            results.textSamples.push({
              classes: el.className,
              textPreview: text,
              innerHTML: el.innerHTML.substring(0, 500)
            });
          }
        }
      });

      // Search for city name patterns in the entire page text
      const bodyText = document.body.innerText;
      const cityMatches = bodyText.match(/(?:Amsterdam|Barcelona|Berlin|Brussels|Copenhagen|Dublin|London|Madrid|Milan|Paris|Prague|Rome|Stockholm|Vienna|Bangkok|Hong Kong|Singapore|Sydney|Tokyo|Seoul|Atlanta|Austin|Boston|Chicago|Dallas|Denver|Houston|Los Angeles|Miami|New York|NYC|Philadelphia|Portland|San Diego|San Francisco|Seattle|Washington|Toronto|Vancouver|Lagos|Nairobi|Medellín|Bogotá|Mexico City)/gi);

      if (cityMatches) {
        results.cityKeywords = [...new Set(cityMatches)];
      }

      return results;
    });

    console.log('\n📊 Analysis Results:\n');
    console.log(`Total links found: ${pageAnalysis.allLinks.length}`);
    console.log(`Headings found: ${pageAnalysis.headings.length}`);
    console.log(`City-related sections: ${pageAnalysis.textSamples.length}`);
    console.log(`City names detected: ${pageAnalysis.cityKeywords.length}`);

    console.log('\n🏙️  City keywords found:');
    pageAnalysis.cityKeywords.forEach(city => console.log(`  • ${city}`));

    console.log('\n📝 Headings on page:');
    pageAnalysis.headings.slice(0, 20).forEach(h => {
      console.log(`  ${h.tag}: ${h.text}`);
    });

    console.log('\n🔗 Sample links (first 30):');
    pageAnalysis.allLinks.slice(0, 30).forEach(link => {
      console.log(`  ${link.text} -> ${link.href}`);
    });

    // Save detailed analysis
    fs.writeFileSync('./results/luma-structure-analysis.json', JSON.stringify(pageAnalysis, null, 2));
    console.log('\n💾 Full analysis saved to: ./results/luma-structure-analysis.json');

    // Take screenshot
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Look specifically for "Explore Local Events" section
    console.log('\n\n🔎 Looking for "Explore Local Events" section...');
    const localEventsSection = await page.evaluate(() => {
      const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'));
      const localEventsHeading = headings.find(h => h.textContent?.includes('Explore Local Events'));

      if (localEventsHeading) {
        // Find the parent container
        let container = localEventsHeading.parentElement;
        while (container && container.querySelectorAll('a').length < 10) {
          container = container.parentElement;
        }

        if (container) {
          const cities = [];
          container.querySelectorAll('a[href^="/"]').forEach(link => {
            const href = link.getAttribute('href');
            const text = link.textContent?.trim();

            cities.push({
              href,
              text,
              fullText: link.parentElement?.textContent?.trim()
            });
          });

          return {
            found: true,
            sectionHTML: container.innerHTML.substring(0, 2000),
            cities
          };
        }
      }

      return { found: false };
    });

    if (localEventsSection.found) {
      console.log('✅ Found "Explore Local Events" section!');
      console.log(`   ${localEventsSection.cities.length} city links found\n`);

      localEventsSection.cities.slice(0, 20).forEach(city => {
        console.log(`  • ${city.text} -> ${city.href}`);
      });

      fs.writeFileSync('./results/local-events-section.json', JSON.stringify(localEventsSection, null, 2));
      console.log('\n💾 Section saved to: ./results/local-events-section.json');
    } else {
      console.log('❌ Could not find "Explore Local Events" section');
    }

    console.log('\n⏳ Keeping browser open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

inspectLumaStructure().catch(console.error);
