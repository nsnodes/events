import { chromium } from 'playwright';

/**
 * Test iCal extraction on a single city to debug
 */

async function testSingleCity() {
  console.log('🔍 Testing iCal extraction on Amsterdam...\n');

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  try {
    await page.goto('https://luma.com/amsterdam', { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    console.log('Finding subscribe button...');

    // Find the button
    const clicked = await page.evaluate(() => {
      // Strategy 1: Look for SVG with RSS/feed icon pattern
      const svgs = Array.from(document.querySelectorAll('svg'));
      const rssIcon = svgs.find(svg => {
        const paths = svg.querySelectorAll('path, circle');
        const hasCircle = Array.from(paths).some(p => p.tagName === 'circle');
        const hasArc = svg.innerHTML.includes('M4 ') || svg.innerHTML.includes('arc');
        return hasCircle && hasArc;
      });

      if (rssIcon) {
        const button = rssIcon.closest('button');
        if (button) {
          console.log('Found RSS icon button!');
          button.click();
          return 'rss_icon';
        }
      }

      // Strategy 2: Find "Events" heading and look for nearby buttons
      const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
      const eventsHeading = headings.find(h => h.textContent?.trim() === 'Events');

      if (eventsHeading) {
        console.log('Found Events heading');
        const container = eventsHeading.parentElement;
        const buttons = container?.querySelectorAll('button');
        console.log(`Buttons in container: ${buttons?.length}`);
        if (buttons && buttons.length >= 2) {
          buttons[1].click();
          return 'events_heading_button';
        }
      }

      return null;
    });

    console.log(`Button clicked via: ${clicked}`);
    await page.waitForTimeout(2000);

    console.log('\nSearching for iCal URL in modal...');

    // Extract iCal URL
    const result = await page.evaluate(() => {
      // Look for modal/dialog
      const modals = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"]');
      console.log(`Modals found: ${modals.length}`);

      if (modals.length > 0) {
        const modal = modals[modals.length - 1];
        console.log('Inspecting modal...');

        // Collect all URLs
        const urls = [];
        const links = Array.from(modal.querySelectorAll('a[href]'));
        console.log(`Links in modal: ${links.length}`);

        const linkData = links.map(link => {
          const href = link.getAttribute('href');
          if (href) urls.push(href);
          return { href, text: link.textContent?.trim() };
        });

        // Get data attributes
        modal.querySelectorAll('[data-clipboard-text]').forEach(el => {
          const data = el.getAttribute('data-clipboard-text');
          if (data) urls.push(data);
        });

        // Search modal HTML
        const modalHtml = modal.innerHTML;
        const htmlMatches = modalHtml.match(/(?:https?|webcal):\/\/[^\s"'<>]+ics[^\s"'<>]*/gi);
        if (htmlMatches) urls.push(...htmlMatches);

        console.log('All URLs found:', urls);

        // Extract actual API URL
        for (const url of urls) {
          // Direct api2.luma.com URL
          if (url.includes('api2.luma.com/ics/get')) {
            if (url.startsWith('webcal://')) {
              return { found: true, url: 'https://' + url.substring(9), method: 'direct_webcal', linkData, allUrls: urls };
            }
            if (url.startsWith('http')) {
              return { found: true, url, method: 'direct_http', linkData, allUrls: urls };
            }
          }

          // Decode from Google Calendar
          if (url.includes('google.com/calendar') && url.includes('cid=')) {
            const cidMatch = url.match(/cid=([^&]+)/);
            if (cidMatch) {
              const decoded = decodeURIComponent(cidMatch[1]);
              if (decoded.includes('api2.luma.com/ics/get')) {
                return { found: true, url: decoded.replace('webcal://', 'https://'), method: 'google_decoded', linkData, allUrls: urls };
              }
            }
          }

          // Decode from Outlook
          if (url.includes('outlook.live.com') && url.includes('url=')) {
            const urlMatch = url.match(/url=([^&]+)/);
            if (urlMatch) {
              const decoded = decodeURIComponent(urlMatch[1]);
              if (decoded.includes('api2.luma.com/ics/get')) {
                return { found: true, url: decoded.replace('webcal://', 'https://'), method: 'outlook_decoded', linkData, allUrls: urls };
              }
            }
          }
        }

        return { found: false, linkData, allUrls: urls, modalHtml: modalHtml.substring(0, 1000) };
      }

      return { found: false, noModal: true };
    });

    console.log('\nResult:', JSON.stringify(result, null, 2));

    if (result.found) {
      console.log(`\n✅ SUCCESS! iCal URL: ${result.url}`);
      console.log(`   Method: ${result.method}`);
    } else {
      console.log('\n❌ Failed to extract iCal URL');
      if (result.linkData) {
        console.log('\nLinks found in modal:');
        result.linkData.forEach(link => {
          console.log(`  - ${link.text}: ${link.href}`);
        });
      }
      if (result.modalHtml) {
        console.log('\nModal HTML (first 1000 chars):');
        console.log(result.modalHtml);
      }
    }

    // Take screenshot
    await page.screenshot({ path: './results/screenshots/ical-extraction-test.png' });
    console.log('\n📸 Screenshot saved');

    console.log('\n⏸️  Keeping browser open for 15 seconds...');
    await page.waitForTimeout(15000);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await browser.close();
  }
}

testSingleCity().catch(console.error);
