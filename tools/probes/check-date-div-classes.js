import { chromium } from 'playwright';

async function checkDateDivClasses() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  try {
    await page.goto('https://app.sola.day/', { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);

    const results = await page.evaluate(() => {
      const cityCards = Array.from(document.querySelectorAll('a[href*="/event/"]'))
        .filter(card => {
          const href = card.href;
          return href.match(/\/event\/[^\/]+$/);
        })
        .slice(0, 10);

      return cityCards.map(card => {
        const slug = card.href.match(/\/event\/([^\/]+)$/)[1];
        const allDivs = Array.from(card.querySelectorAll('div'));
        
        const dateDiv = allDivs.find(d => {
          const text = d.textContent.trim();
          return text.match(/^[A-Z][a-z]{2}\s+\d{1,2}-[A-Z][a-z]{2}\s+\d{1,2}/);
        });
        
        return {
          slug,
          dateDivFound: !!dateDiv,
          dateDivClass: dateDiv ? dateDiv.className : null,
          dateDivText: dateDiv ? dateDiv.textContent.trim() : null
        };
      });
    });

    console.log('Date div classes:\n');
    results.forEach(r => {
      console.log(r.slug + ':');
      console.log('  Found: ' + r.dateDivFound);
      if (r.dateDivFound) {
        console.log('  Class: ' + r.dateDivClass);
        console.log('  Text: ' + r.dateDivText);
      }
      console.log('');
    });

  } finally {
    await browser.close();
  }
}

checkDateDivClasses().catch(console.error);
