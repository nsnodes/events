import { chromium } from 'playwright';

async function checkNullDateCards() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const cityData = await page.evaluate(() => {
      const cityCards = Array.from(document.querySelectorAll('a[href*="/event/"]'))
        .filter(card => {
          const href = card.href;
          return href.match(/\/event\/[^\/]+$/) && !href.includes('/detail/');
        });

      // Find zuzalukas card
      const zuzalukasCard = cityCards.find(c => c.href.includes('/event/zuzalukas'));
      
      if (!zuzalukasCard) return { found: false };

      const h3 = zuzalukasCard.querySelector('h3');
      const titleDiv = zuzalukasCard.querySelector('.webkit-box-clamp-2.text-lg.font-semibold');
      const dateDiv = zuzalukasCard.querySelector('.webkit-box-clamp-1.text-sm');

      const allDivs = Array.from(zuzalukasCard.querySelectorAll('div'));

      return {
        found: true,
        slug: zuzalukasCard.href.match(/\/event\/([^\/]+)$/)[1],
        hasH3: !!h3,
        h3Text: h3 ? h3.textContent.trim() : null,
        hasTitleDiv: !!titleDiv,
        titleDivText: titleDiv ? titleDiv.textContent.trim() : null,
        hasDateDiv: !!dateDiv,
        dateDivText: dateDiv ? dateDiv.textContent.trim() : null,
        fullText: zuzalukasCard.textContent.trim(),
        divsCount: allDivs.length,
        firstTenDivs: allDivs.slice(0, 10).map(d => d.textContent.trim().substring(0, 60))
      };
    });

    console.log('Checking card with null dates (zuzalukas):');
    console.log(JSON.stringify(cityData, null, 2));

  } finally {
    await browser.close();
  }
}

checkNullDateCards().catch(console.error);
