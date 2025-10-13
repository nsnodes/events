#!/usr/bin/env node
import { scrapePopupCities, saveCities } from '../scrapers/cities.js';

const data = await scrapePopupCities({ headless: false });
saveCities(data);
console.log('Saved', data.totalCities, 'popup cities');
