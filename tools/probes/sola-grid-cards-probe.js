import { chromium } from 'playwright';

/**
 * Probe the main Sola.day page to extract actual date text from popup city cards
 */

const PROBLEM_CITIES = ['prospera', 'infinitacity', 'wamotopia', 'ethiopiapopup'];

async function probeGridCards(page) {
  console.log('🔍 Probing main Sola.day page for popup city cards...\n');

  await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000); // Wait for cards to load

  // Take screenshot of the page
  await page.screenshot({ path: './screenshots/sola-main-grid.png', fullPage: true });
  console.log('Screenshot saved: ./screenshots/sola-main-grid.png\n');

  // Extract all city cards
  const cards = await page.evaluate(() => {
    const eventLinks = Array.from(document.querySelectorAll('a[href*="/event/"]'));

    return eventLinks.map(link => {
      // Get the slug from the URL
      const match = link.href.match(/\/event\/([^/?]+)/);
      const slug = match ? match[1] : null;

      // Get all text content
      const text = link.textContent?.trim() || '';

      // Try to find the image
      const img = link.querySelector('img');
      const imageUrl = img?.src || null;

      // Get all child elements to understand structure
      const children = Array.from(link.children).map(child => ({
        tag: child.tagName,
        class: child.className,
        text: child.textContent?.trim().substring(0, 100)
      }));

      // Try to identify date text specifically
      // Look for elements that might contain dates
      const dateElements = [];
      link.querySelectorAll('*').forEach(el => {
        const text = el.textContent?.trim();
        // Look for month patterns like "Aug 28" or "Jan 09"
        if (text && /^[A-Z][a-z]{2}\s+\d{1,2}/.test(text)) {
          dateElements.push({
            tag: el.tagName,
            class: el.className,
            text: text.substring(0, 50)
          });
        }
      });

      return {
        slug,
        url: link.href,
        text,
        imageUrl,
        children: children.slice(0, 5), // Limit to first 5 children
        dateElements: dateElements.slice(0, 3), // Limit to first 3
        innerHTML: link.innerHTML.substring(0, 500) // Sample of HTML
      };
    });
  });

  console.log(`Found ${cards.length} city cards\n`);

  // Focus on problem cities
  console.log('='.repeat(80));
  console.log('PROBLEM CITIES ANALYSIS');
  console.log('='.repeat(80));

  PROBLEM_CITIES.forEach(slug => {
    const card = cards.find(c => c.slug === slug);
    if (card) {
      console.log(`\n${slug.toUpperCase()}`);
      console.log('-'.repeat(80));
      console.log('URL:', card.url);
      console.log('Full text:', card.text);
      console.log('\nDate elements found:');
      if (card.dateElements.length > 0) {
        card.dateElements.forEach(de => {
          console.log(`  [${de.tag}.${de.class}] ${de.text}`);
        });
      } else {
        console.log('  None found');
      }
      console.log('\nHTML sample:', card.innerHTML.substring(0, 200));
    } else {
      console.log(`\n${slug.toUpperCase()}: NOT FOUND`);
    }
  });

  // Show all cards for reference
  console.log('\n\n' + '='.repeat(80));
  console.log('ALL CARDS (first 10)');
  console.log('='.repeat(80));

  cards.slice(0, 10).forEach(card => {
    console.log(`\n${card.slug || 'unknown'}`);
    console.log(`  Text: ${card.text.substring(0, 150)}`);
  });

  return cards;
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
    const cards = await probeGridCards(page);

    // Save results
    const fs = await import('fs');
    fs.writeFileSync(
      './tools/probes/sola-grid-cards-results.json',
      JSON.stringify(cards, null, 2)
    );
    console.log('\n\n✅ Results saved to: tools/probes/sola-grid-cards-results.json');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
