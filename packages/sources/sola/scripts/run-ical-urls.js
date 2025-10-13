#!/usr/bin/env node
import { getCities, scrapeIcalUrls, saveIcalUrls } from '../scrapers/index.js';

const cities = getCities();
const data = await scrapeIcalUrls(cities.cities, { headless: false, concurrency: 3 });
saveIcalUrls(data);
console.log('Saved', data.withIcalUrl, 'iCal URLs');
