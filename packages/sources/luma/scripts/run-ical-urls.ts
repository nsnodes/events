#!/usr/bin/env node
import { getCities, scrapeIcalUrls, saveIcalUrls } from '../scrapers/index.js';
import config from '../../../../config.js';
import fs from 'fs';
import path from 'path';

interface Entity {
  slug: string;
  [key: string]: any;
}

interface HandlesData {
  handles: Entity[];
}

let entities: Entity[];
let entityType: string;

// Use handles if cities are disabled
if (!config.luma.cities_enabled && config.luma.handles.length > 0) {
  console.log('Using user handles from config:', config.luma.handles);
  entityType = 'handles';

  // Load handles from data file
  const handlesPath = path.join(process.cwd(), 'packages/sources/luma/data/handles.json');
  const handlesData: HandlesData = JSON.parse(fs.readFileSync(handlesPath, 'utf8'));
  entities = handlesData.handles;

  console.log(`Loaded ${entities.length} handles: ${entities.map(h => h.slug).join(', ')}`);
} else if (config.luma.cities_enabled) {
  console.log('Using cities from data file');
  entityType = 'cities';
  const cities = getCities();
  entities = cities.cities;
  console.log(`Loaded ${entities.length} cities`);
} else {
  console.error('No entities configured - check config.js');
  process.exit(1);
}

const data = await scrapeIcalUrls(entities, { headless: false });
saveIcalUrls(data, entityType);
console.log(`Saved ${data.withIcalUrl} iCal URLs for ${entityType}`);

// Fail if scraping looks broken (fewer than 50% success rate)
const successRate = data.withIcalUrl / data.totalEntities;
const MIN_SUCCESS_RATE = 0.5;

if (successRate < MIN_SUCCESS_RATE) {
  console.error(`\n❌ ERROR: Only ${data.withIcalUrl}/${data.totalEntities} iCal URLs found (${Math.round(successRate * 100)}%)`);
  console.error(`This is below the ${MIN_SUCCESS_RATE * 100}% threshold - something may be broken.`);
  console.error('Existing URLs have been preserved, but please investigate.');
  process.exit(1);
}

// Also fail if we got zero URLs (even with preservation, this indicates a problem)
if (data.withIcalUrl === 0) {
  console.error('\n❌ ERROR: Zero iCal URLs found! Scraping is completely broken.');
  process.exit(1);
}
