import { chromium } from 'playwright';

/**
 * Quick test to see if iCal URL is in page source without clicking
 */

async function testIcalDetection() {
  console.log('🔍 Testing iCal URL detection strategies...\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    // Test with Amsterdam
    const testCity = 'amsterdam';
    console.log(`Testing: https://luma.com/${testCity}\n`);

    await page.goto(`https://luma.com/${testCity}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Strategy 1: Search page HTML for ics/ical URLs...');
    const htmlSearch = await page.evaluate(() => {
      const html = document.documentElement.innerHTML;

      // Look for any ics URLs
      const icsMatches = html.match(/https?:\/\/[^\s"'<>]+\.ics[^\s"'<>]*/gi);
      const icalMatches = html.match(/https?:\/\/[^\s"'<>]+ical[^\s"'<>]*/gi);
      const apiMatches = html.match(/https?:\/\/api[^\s"'<>]+ics[^\s"'<>]*/gi);

      return {
        icsUrls: icsMatches || [],
        icalUrls: icalMatches || [],
        apiUrls: apiMatches || []
      };
    });

    console.log('  ICS URLs found:', htmlSearch.icsUrls);
    console.log('  iCal URLs found:', htmlSearch.icalUrls);
    console.log('  API URLs found:', htmlSearch.apiUrls);

    console.log('\nStrategy 2: Look for subscribe button...');
    const subscribeButton = await page.evaluate(() => {
      // Find buttons near top
      const buttons = Array.from(document.querySelectorAll('button, a'));
      const topButtons = buttons.filter(btn => {
        const rect = btn.getBoundingClientRect();
        return rect.top < 300; // Top of page
      }).slice(0, 10); // First 10 buttons

      const found = [];
      topButtons.forEach((btn, index) => {
        const text = btn.textContent?.trim();
        const ariaLabel = btn.getAttribute('aria-label');
        const title = btn.getAttribute('title');
        const className = btn.className;

        found.push({
          index,
          tag: btn.tagName,
          text: text?.substring(0, 30),
          ariaLabel,
          title,
          hasIconClass: className.includes('icon'),
          position: {
            top: btn.getBoundingClientRect().top,
            left: btn.getBoundingClientRect().left
          }
        });
      });

      return found;
    });

    console.log('  Top buttons found:');
    subscribeButton.forEach(btn => {
      console.log(`    [${btn.index}] ${btn.tag}: "${btn.text}" (aria: ${btn.ariaLabel}, title: ${btn.title})`);
    });

    console.log('\nStrategy 3: Check Next.js data...');
    const nextData = await page.evaluate(() => {
      const script = document.getElementById('__NEXT_DATA__');
      if (script) {
        try {
          const data = JSON.parse(script.textContent);
          return JSON.stringify(data).substring(0, 500) + '...';
        } catch (e) {
          return 'Error parsing';
        }
      }
      return null;
    });

    if (nextData) {
      console.log('  Found __NEXT_DATA__');
      console.log('  Checking if it contains ical/ics...');
      const hasIcal = nextData.toLowerCase().includes('ical') || nextData.toLowerCase().includes('ics');
      console.log(`  Contains ical/ics: ${hasIcal}`);
    } else {
      console.log('  No __NEXT_DATA__ found');
    }

    console.log('\nStrategy 4: Try clicking second button and checking popup...');
    try {
      // Click the second top button
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button, a'));
        const topButtons = buttons.filter(btn => {
          const rect = btn.getBoundingClientRect();
          return rect.top < 300;
        }).slice(0, 10);

        if (topButtons[1]) {
          topButtons[1].click();
        }
      });

      await page.waitForTimeout(1000);

      // Check for popup/modal
      const popupContent = await page.evaluate(() => {
        // Look for modal/popup
        const modals = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"], [class*="dropdown"]');

        if (modals.length > 0) {
          const modal = modals[modals.length - 1]; // Get last/top modal
          const links = Array.from(modal.querySelectorAll('a, button'));
          const html = modal.innerHTML;

          // Look for ics URL in modal HTML
          const icsMatch = html.match(/https?:\/\/[^\s"'<>]+\.ics[^\s"'<>]*/i);

          return {
            found: true,
            linksCount: links.length,
            icsUrl: icsMatch ? icsMatch[0] : null,
            linkTexts: links.map(l => l.textContent?.trim()).slice(0, 10)
          };
        }

        return { found: false };
      });

      if (popupContent.found) {
        console.log('  ✅ Popup/modal found!');
        console.log(`  Links in modal: ${popupContent.linksCount}`);
        console.log(`  Link texts: ${popupContent.linkTexts.join(', ')}`);
        console.log(`  iCal URL in modal: ${popupContent.icsUrl || 'NOT FOUND'}`);
      } else {
        console.log('  ❌ No popup/modal detected');
      }

      // Take screenshot
      await page.screenshot({ path: './results/screenshots/ical-test.png' });
      console.log('  📸 Screenshot saved to ./results/screenshots/ical-test.png');

    } catch (error) {
      console.log(`  ❌ Error clicking: ${error.message}`);
    }

    console.log('\n⏸️  Keeping browser open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testIcalDetection().catch(console.error);
