import { chromium } from 'playwright';
import fs from 'fs';

/**
 * Extract iCal subscription URLs from each Luma city page
 */

async function extractIcalUrls() {
  console.log('🔗 Extracting iCal URLs from Luma city pages...\n');

  // Load city data
  const cityData = JSON.parse(
    fs.readFileSync('./packages/sources/luma/data/cities.json', 'utf8')
  );

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  const results = [];
  let processed = 0;
  const total = cityData.cities.length;

  try {
    for (const city of cityData.cities) {
      processed++;
      console.log(`[${processed}/${total}] ${city.city} (${city.slug})...`);

      try {
        // Navigate to city page
        await page.goto(`https://luma.com/${city.slug}`, {
          waitUntil: 'networkidle',
          timeout: 15000
        });

        await page.waitForTimeout(2000);

        // Find and click the RSS/Subscribe icon button
        let icalUrl = null;

        try {
          // Find the button - look for RSS icon or button near "Events" header
          const clicked = await page.evaluate(() => {
            // Strategy 1: Look for SVG with RSS/feed icon pattern (circle and arcs)
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
                button.click();
                return 'rss_icon';
              }
            }

            // Strategy 2: Find "Events" heading and look for nearby buttons
            const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
            const eventsHeading = headings.find(h => h.textContent?.trim() === 'Events');

            if (eventsHeading) {
              const container = eventsHeading.parentElement;
              const buttons = container?.querySelectorAll('button');
              if (buttons && buttons.length >= 2) {
                buttons[1].click(); // Second button
                return 'events_heading_button';
              }
            }

            // Strategy 3: Look for button with aria-label containing "subscribe" or "feed"
            const buttons = Array.from(document.querySelectorAll('button'));
            const subscribeBtn = buttons.find(btn => {
              const ariaLabel = btn.getAttribute('aria-label')?.toLowerCase();
              const title = btn.getAttribute('title')?.toLowerCase();
              return ariaLabel?.includes('subscribe') || ariaLabel?.includes('feed') ||
                     title?.includes('subscribe') || title?.includes('feed');
            });

            if (subscribeBtn) {
              subscribeBtn.click();
              return 'aria_label';
            }

            return null;
          });

          if (!clicked) {
            throw new Error('Could not find subscribe button');
          }

          await page.waitForTimeout(1500); // Wait for modal to appear

          console.log(`  Clicked button (method: ${clicked}), looking for iCal URL...`);

          // Extract iCal URL from modal
          icalUrl = await page.evaluate(() => {
            // Look for modal/dialog
            const modals = document.querySelectorAll('[role="dialog"], [class*="modal"], [class*="popup"]');

            if (modals.length > 0) {
              const modal = modals[modals.length - 1]; // Get topmost modal

              // Collect all URLs from the modal
              const urls = [];

              // Get all links
              const links = modal.querySelectorAll('a[href]');
              links.forEach(link => {
                const href = link.getAttribute('href');
                if (href) urls.push(href);
              });

              // Get data attributes
              const elementsWithData = modal.querySelectorAll('[data-clipboard-text]');
              elementsWithData.forEach(el => {
                const data = el.getAttribute('data-clipboard-text');
                if (data) urls.push(data);
              });

              // Search modal HTML for any ics URLs
              const modalHtml = modal.innerHTML;
              const htmlMatches = modalHtml.match(/(?:https?|webcal):\/\/[^\s"'<>]+ics[^\s"'<>]*/gi);
              if (htmlMatches) {
                urls.push(...htmlMatches);
              }

              // Now extract the actual API URL from all collected URLs
              for (const url of urls) {
                // Strategy 1: Direct api2.luma.com/ics/get URL
                if (url.includes('api2.luma.com/ics/get')) {
                  // Extract from webcal:// format
                  if (url.startsWith('webcal://')) {
                    return 'https://' + url.substring(9);
                  }
                  // Extract from http:// or https://
                  if (url.startsWith('http')) {
                    return url;
                  }
                }

                // Strategy 2: Decode from Google Calendar wrapper
                if (url.includes('google.com/calendar') && url.includes('cid=')) {
                  const cidMatch = url.match(/cid=([^&]+)/);
                  if (cidMatch) {
                    const decoded = decodeURIComponent(cidMatch[1]);
                    if (decoded.includes('api2.luma.com/ics/get')) {
                      // Convert webcal to https if needed
                      return decoded.replace('webcal://', 'https://');
                    }
                  }
                }

                // Strategy 3: Decode from Outlook Calendar wrapper
                if (url.includes('outlook.live.com') && url.includes('url=')) {
                  const urlMatch = url.match(/url=([^&]+)/);
                  if (urlMatch) {
                    const decoded = decodeURIComponent(urlMatch[1]);
                    if (decoded.includes('api2.luma.com/ics/get')) {
                      return decoded.replace('webcal://', 'https://');
                    }
                  }
                }
              }
            }

            // Fallback: search entire page
            const pageHtml = document.documentElement.innerHTML;
            const apiMatch = pageHtml.match(/(?:https?|webcal):\/\/api2\.luma\.com\/ics\/get[^\s"'<>]*/i);
            if (apiMatch) {
              return apiMatch[0].replace('webcal://', 'https://');
            }

            return null;
          });

          if (icalUrl) {
            console.log(`  ✅ iCal URL: ${icalUrl}`);
            results.push({
              ...city,
              icalUrl: icalUrl.startsWith('http') ? icalUrl : `https://luma.com${icalUrl}`,
              method: 'modal'
            });
          } else {
            console.log('  ⚠️  Modal opened but no iCal URL found');
            results.push({
              ...city,
              icalUrl: null,
              method: 'modal_no_url'
            });

            // Take screenshot for debugging
            await page.screenshot({
              path: `./results/screenshots/city-${city.slug}-no-ical.png`
            });
          }

        } catch (clickError) {
          console.log(`  ❌ Error clicking Subscribe button: ${clickError.message}`);
          results.push({
            ...city,
            icalUrl: null,
            method: 'click_error',
            error: clickError.message
          });
        }

        // Small delay between requests
        await page.waitForTimeout(1000);

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        results.push({
          ...city,
          icalUrl: null,
          method: 'error',
          error: error.message
        });
      }
    }

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 SUMMARY');
    console.log('='.repeat(70));

    const withIcal = results.filter(r => r.icalUrl);
    const withoutIcal = results.filter(r => !r.icalUrl);

    console.log(`\n✅ Found iCal URLs: ${withIcal.length}/${total}`);
    console.log(`❌ Missing iCal URLs: ${withoutIcal.length}/${total}\n`);

    if (withoutIcal.length > 0) {
      console.log('Cities missing iCal URLs:');
      withoutIcal.forEach(city => {
        console.log(`  • ${city.city} (${city.slug}) - ${city.method}`);
      });
      console.log('');
    }

    // Save results
    const output = {
      timestamp: new Date().toISOString(),
      totalCities: total,
      withIcalUrl: withIcal.length,
      withoutIcalUrl: withoutIcal.length,
      cities: results
    };

    fs.writeFileSync(
      './packages/sources/luma/data/cities-with-ical.json',
      JSON.stringify(output, null, 2)
    );
    console.log('💾 Saved to: ./packages/sources/luma/data/cities-with-ical.json\n');

    // Also save just the URL mapping
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
    console.log('💾 Saved URL mapping to: ./packages/sources/luma/data/ical-urls.json\n');

    // Sample iCal URLs
    if (withIcal.length > 0) {
      console.log('Sample iCal URLs:');
      withIcal.slice(0, 5).forEach(city => {
        console.log(`  ${city.city}: ${city.icalUrl}`);
      });
    }

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await browser.close();
  }
}

extractIcalUrls().catch(console.error);
