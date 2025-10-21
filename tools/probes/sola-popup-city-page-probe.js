import { chromium } from 'playwright';

/**
 * Probe the /popup-city page vs main page to compare date formats
 */

async function comparePages(page) {
  console.log('🔍 Comparing /popup-city vs main page for date formats\n');

  // First, check /popup-city
  console.log('='.repeat(80));
  console.log('CHECKING /popup-city PAGE');
  console.log('='.repeat(80));

  await page.goto('https://app.sola.day/popup-city', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const popupCityCards = await page.evaluate(() => {
    const eventLinks = Array.from(document.querySelectorAll('a[href*="/event/"]'));
    return eventLinks.slice(0, 10).map(link => {
      const match = link.href.match(/\/event\/([^/?]+)/);
      const slug = match ? match[1] : null;
      return {
        slug,
        text: link.textContent?.trim()
      };
    });
  });

  console.log('\nCards from /popup-city:');
  popupCityCards.forEach(card => {
    console.log(`  ${card.slug}: ${card.text.substring(0, 100)}`);
  });

  await page.screenshot({ path: './screenshots/sola-popup-city-page.png', fullPage: true });

  // Now check main page
  console.log('\n' + '='.repeat(80));
  console.log('CHECKING MAIN PAGE /');
  console.log('='.repeat(80));

  await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);

  const mainPageCards = await page.evaluate(() => {
    const eventLinks = Array.from(document.querySelectorAll('a[href*="/event/"]'));
    return eventLinks.slice(0, 10).map(link => {
      const match = link.href.match(/\/event\/([^/?]+)/);
      const slug = match ? match[1] : null;

      // Also try to find date-specific elements
      const dateElement = link.querySelector('[class*="date"], .webkit-box-clamp-1');

      return {
        slug,
        text: link.textContent?.trim(),
        dateElementText: dateElement?.textContent?.trim()
      };
    });
  });

  console.log('\nCards from main page /');
  mainPageCards.forEach(card => {
    console.log(`  ${card.slug}: ${card.text.substring(0, 100)}`);
    if (card.dateElementText) {
      console.log(`    Date element: ${card.dateElementText}`);
    }
  });

  await page.screenshot({ path: './screenshots/sola-main-page.png', fullPage: true });

  // Compare specific problem cities
  console.log('\n' + '='.repeat(80));
  console.log('COMPARISON FOR PROBLEM CITIES');
  console.log('='.repeat(80));

  const problemSlugs = ['prospera', 'infinitacity', 'ethiopiapopup'];

  problemSlugs.forEach(slug => {
    const popupCity = popupCityCards.find(c => c.slug === slug);
    const mainPage = mainPageCards.find(c => c.slug === slug);

    console.log(`\n${slug}:`);
    console.log(`  /popup-city: ${popupCity?.text || 'NOT FOUND'}`);
    console.log(`  /          : ${mainPage?.text || 'NOT FOUND'}`);
    if (mainPage?.dateElementText) {
      console.log(`  Date element: ${mainPage.dateElementText}`);
    }
  });
}

async function run() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 300
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });

  const page = await context.newPage();

  try {
    await comparePages(page);
    console.log('\n✅ Comparison complete\n');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
