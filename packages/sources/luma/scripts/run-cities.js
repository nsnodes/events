#!/usr/bin/env node
import { scrapeCities, saveCities } from '../scrapers/cities.js';

const data = await scrapeCities({ headless: false });
saveCities(data);
console.log('Saved', data.totalCities, 'cities');
