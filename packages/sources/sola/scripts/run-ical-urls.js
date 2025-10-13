#!/usr/bin/env node
import { getCities, scrapeIcalUrls, saveIcalUrls } from '../scrapers/index.js';

const cities = getCities();
const data = await scrapeIcalUrls(cities.cities, { headless: true, concurrency: 5 });
saveIcalUrls(data);
console.log('Saved', data.withIcalUrl, 'iCal URLs');
console.log('Failed:', data.failed);
console.log('Total:', data.totalCities);
