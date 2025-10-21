import { chromium } from 'playwright';

/**
 * Probe specific popup cities to understand date extraction issues
 * Focus on cities with problematic date ranges like "Aug 28-Aug 27"
 */

const PROBLEM_CITIES = [
  { slug: 'prospera', url: 'https://app.sola.day/event/prospera' },
  { slug: 'infinitacity', url: 'https://app.sola.day/event/infinitacity' },
  { slug: 'wamotopia', url: 'https://app.sola.day/event/wamotopia' },
  { slug: 'ethiopiapopup', url: 'https://app.sola.day/event/ethiopiapopup' }
];

async function probeCityPage(page, city) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Probing: ${city.slug}`);
  console.log(`URL: ${city.url}`);
  console.log('='.repeat(60));

  try {
    await page.goto(city.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Extract all visible text
    const pageData = await page.evaluate(() => {
      // Get all text content
      const bodyText = document.body.textContent;

      // Look for date patterns in the page
      const datePatterns = [
        /(\w+\s+\d{1,2})\s*-\s*(\w+\s+\d{1,2})/g,  // "Aug 28 - Aug 27" or "Aug 28-Aug 27"
        /(\d{4}-\d{2}-\d{2})/g,  // ISO dates "2025-08-28"
        /(\w{3,9}\s+\d{1,2},?\s+\d{4})/g  // "August 28, 2025" or "Aug 28 2025"
      ];

      const foundDates = [];
      datePatterns.forEach((pattern, index) => {
        const matches = bodyText.match(pattern);
        if (matches) {
          foundDates.push({
            pattern: index,
            matches: [...new Set(matches)].slice(0, 10) // Unique matches, limit 10
          });
        }
      });

      // Look for specific date elements
      const dateElements = [];

      // Check time elements
      document.querySelectorAll('time').forEach(el => {
        dateElements.push({
          type: 'time',
          text: el.textContent?.trim(),
          datetime: el.getAttribute('datetime'),
          classes: el.className
        });
      });

      // Check elements with date in class
      document.querySelectorAll('[class*="date"]').forEach((el, i) => {
        if (i < 5) { // Limit to 5
          dateElements.push({
            type: 'date-class',
            text: el.textContent?.trim().substring(0, 100),
            classes: el.className,
            tag: el.tagName
          });
        }
      });

      // Get page title and main heading
      const title = document.title;
      const h1 = document.querySelector('h1')?.textContent?.trim();

      // Check for any JSON data in script tags (like __NEXT_DATA__)
      let nextData = null;
      const nextDataScript = document.querySelector('#__NEXT_DATA__');
      if (nextDataScript) {
        try {
          nextData = JSON.parse(nextDataScript.textContent);
        } catch (e) {
          nextData = { error: 'Failed to parse' };
        }
      }

      // Get the card text from the main page (if this is from a listing)
      const eventLinks = Array.from(document.querySelectorAll('a[href*="/event/"]'));
      let cardText = null;
      eventLinks.forEach(link => {
        if (link.href.includes(window.location.pathname)) {
          cardText = link.textContent?.trim();
        }
      });

      // Look for description or details section
      const description = document.querySelector('[class*="description"], [class*="detail"], [class*="about"]')?.textContent?.trim();

      return {
        title,
        h1,
        foundDates,
        dateElements,
        description: description?.substring(0, 500),
        cardText,
        nextDataKeys: nextData ? Object.keys(nextData) : null,
        url: window.location.href
      };
    });

    console.log('\nPage Title:', pageData.title);
    console.log('H1:', pageData.h1);

    if (pageData.foundDates.length > 0) {
      console.log('\nDate Patterns Found:');
      pageData.foundDates.forEach(pd => {
        console.log(`  Pattern ${pd.pattern}:`, pd.matches.join(', '));
      });
    }

    if (pageData.dateElements.length > 0) {
      console.log('\nDate Elements:');
      pageData.dateElements.forEach(el => {
        console.log(`  [${el.type}] ${el.text}`);
        if (el.datetime) console.log(`    datetime: ${el.datetime}`);
      });
    }

    if (pageData.description) {
      console.log('\nDescription preview:');
      console.log(`  ${pageData.description.substring(0, 200)}...`);
    }

    // Take a screenshot
    const screenshotPath = `./screenshots/sola-${city.slug}-dates.png`;
    await page.screenshot({ path: screenshotPath, fullPage: false });
    console.log(`\nScreenshot saved: ${screenshotPath}`);

    // Also check the main popup cities listing page
    console.log('\n--- Checking main listing page for this city ---');
    await page.goto('https://app.sola.day/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const listingData = await page.evaluate((slug) => {
      // Find the card for this specific city
      const eventLinks = Array.from(document.querySelectorAll('a[href*="/event/"]'));
      const cityCard = eventLinks.find(link => link.href.includes(`/event/${slug}`));

      if (cityCard) {
        const img = cityCard.querySelector('img');
        return {
          found: true,
          text: cityCard.textContent?.trim(),
          imageUrl: img?.src,
          imageAlt: img?.alt,
          classes: cityCard.className,
          innerHTML: cityCard.innerHTML.substring(0, 300)
        };
      }

      return { found: false };
    }, city.slug);

    if (listingData.found) {
      console.log('Card text from listing:', listingData.text);
      console.log('Image URL:', listingData.imageUrl);
    } else {
      console.log('Card not found on main listing page');
    }

    return {
      slug: city.slug,
      success: true,
      pageData,
      listingData
    };

  } catch (error) {
    console.error(`Error probing ${city.slug}:`, error.message);
    return {
      slug: city.slug,
      success: false,
      error: error.message
    };
  }
}

async function run() {
  console.log('🔍 Sola.day Popup Cities Date Probe\n');
  console.log('Investigating date extraction issues for popup cities...\n');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // Slow down to see what's happening
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  const results = [];

  for (const city of PROBLEM_CITIES) {
    const result = await probeCityPage(page, city);
    results.push(result);
    await page.waitForTimeout(2000); // Brief pause between cities
  }

  await browser.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  results.forEach(r => {
    console.log(`\n${r.slug}: ${r.success ? '✓' : '✗'}`);
    if (r.success && r.listingData?.text) {
      console.log(`  Card text: ${r.listingData.text.substring(0, 100)}...`);
    }
  });

  console.log('\n✅ Probe complete\n');
}

run().catch(console.error);
