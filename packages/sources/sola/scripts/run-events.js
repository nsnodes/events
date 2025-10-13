#!/usr/bin/env node
import { scrapeAllEvents } from '../scrapers/index.js';

let total = 0;
let successful = 0;
let failed = 0;

console.log('Scraping Sola.day events...\n');

for await (const event of scrapeAllEvents({ headless: false, concurrency: 3 })) {
  total++;

  if (event.success) {
    successful++;
    console.log(`[${total}] ${event.title || 'Untitled'}`);
    console.log(`    📅 ${event.startDate || 'Date unknown'}`);
    console.log(`    📍 ${event.location || 'Location unknown'}`);
    console.log(`    🔗 ${event.url}\n`);
  } else {
    failed++;
    console.log(`[${total}] ❌ Failed: ${event.error}\n`);
  }
}

console.log(`\n✅ Scraped ${successful} events successfully`);
if (failed > 0) {
  console.log(`❌ ${failed} events failed`);
}
