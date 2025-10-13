#!/usr/bin/env node
import { getIcalUrls, fetchAllCityEventsStreaming } from '../scrapers/index.js';

const urls = getIcalUrls();
let total = 0;
let cities = 0;

for await (const city of fetchAllCityEventsStreaming(urls)) {
  cities++;
  total += city.eventCount;
}

console.log('Fetched', total, 'events from', cities, 'cities');
