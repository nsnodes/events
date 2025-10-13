import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false });
const page = await browser.newPage();

await page.goto('https://app.sola.day/event/ethsafari', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

console.log('Clicking RSS icon...');
const clicked = await page.evaluate(() => {
  const rssIcon = document.querySelector('.uil-rss, i.uil-rss, [class*="uil-rss"]');
  if (rssIcon) {
    const button = rssIcon.closest('button') || rssIcon.closest('a');
    if (button) {
      button.click();
      return true;
    }
  }
  return false;
});

console.log('Clicked:', clicked);
await page.waitForTimeout(2000);

// Look for the iCal URL in the modal using the three strategies
const result = await page.evaluate(() => {
  const allLinks = Array.from(document.querySelectorAll('a'));

  let icalUrl = null;

  // Strategy 1: Look for webcal:// links (Apple/System Calendar)
  for (const link of allLinks) {
    if (link.href.startsWith('webcal://')) {
      icalUrl = link.href.replace('webcal://', 'https://');
      break;
    }
  }

  // Strategy 2: Decode from Google Calendar wrapper
  if (!icalUrl) {
    for (const link of allLinks) {
      if (link.href.includes('google.com/calendar') && link.href.includes('cid=')) {
        try {
          const url = new URL(link.href);
          const cid = url.searchParams.get('cid');
          if (cid) {
            const decoded = decodeURIComponent(cid);
            if (decoded.includes('api.sola.day')) {
              icalUrl = decoded.replace('http://', 'https://');
              break;
            }
          }
        } catch (e) {}
      }
    }
  }

  // Strategy 3: Decode from Outlook wrapper
  if (!icalUrl) {
    for (const link of allLinks) {
      if (link.href.includes('outlook.live.com/calendar') && link.href.includes('url=')) {
        try {
          const url = new URL(link.href);
          const urlParam = url.searchParams.get('url');
          if (urlParam && urlParam.includes('api.sola.day')) {
            icalUrl = decodeURIComponent(urlParam);
            break;
          }
        } catch (e) {}
      }
    }
  }

  // Debug: get all links
  const allLinkHrefs = allLinks.map(a => a.href);

  return {
    icalUrl,
    totalLinks: allLinks.length,
    sampleLinks: allLinkHrefs.slice(0, 5)
  };
});

console.log('\nExtracted iCal URL:', result.icalUrl);
console.log('Total links found:', result.totalLinks);
console.log('Sample links:', result.sampleLinks);

console.log('\nWaiting 5s...');
await page.waitForTimeout(5000);

await browser.close();
