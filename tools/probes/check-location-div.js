import { chromium } from 'playwright';

async function checkLocationDiv() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('a[href*="/event/"]'))
        .filter(card => {
          const href = card.href;
          return href.match(/\/event\/[^\/]+$/);
        });

      const prospera = cards.find(c => c.href.includes('/event/prospera'));
      const zuzalukas = cards.find(c => c.href.includes('/event/zuzalukas'));
      
      function analyzeCard(card, slug) {
        const dateDiv = card.querySelector('[class*="webkit-box-clamp-1"]');
        if (!dateDiv) return { slug, found: false };

        const parent = dateDiv.parentElement;
        const siblings = Array.from(parent.children);
        
        return {
          slug,
          found: true,
          dateDiv: {
            className: dateDiv.className,
            text: dateDiv.textContent.trim()
          },
          parent: {
            className: parent.className,
            text: parent.textContent.trim()
          },
          siblings: siblings.map((s, i) => ({
            index: i,
            className: s.className,
            text: s.textContent.trim().substring(0, 60)
          }))
        };
      }

      return {
        prospera: analyzeCard(prospera, 'prospera'),
        zuzalukas: analyzeCard(zuzalukas, 'zuzalukas')
      };
    });

    console.log('DOM structure analysis:\n');
    console.log(JSON.stringify(result, null, 2));

  } finally {
    await browser.close();
  }
}

checkLocationDiv().catch(console.error);
