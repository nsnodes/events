#!/usr/bin/env node
import { getCities } from '../scrapers/cities.js';
import { scrapeCityDetails, saveCityDetails } from '../scrapers/city-details.js';
import { normalizePopupCities } from '../normalize.js';

console.log('Loading popup cities...');
const citiesData = getCities();
console.log(`Found ${citiesData.totalCities} cities\n`);

console.log('Parsing city details...');
const cityDetailsResult = await scrapeCityDetails(citiesData.cities);
saveCityDetails(cityDetailsResult);
console.log(`Parsed ${cityDetailsResult.successful}/${cityDetailsResult.totalCities} cities successfully\n`);

console.log('Normalizing popup cities as events...');
const normalized = await normalizePopupCities(cityDetailsResult);
console.log(`Normalized ${normalized.length} popup cities as events\n`);

// Show sample normalized event
if (normalized.length > 0) {
  const sample = normalized[0];
  console.log('Sample normalized popup city event:');
  console.log(`  Title: ${sample.title}`);
  console.log(`  Dates: ${sample.startAt} to ${sample.endAt}`);
  console.log(`  Tags: ${sample.tags.join(', ')}`);
  console.log(`  URL: ${sample.sourceUrl}`);
}
