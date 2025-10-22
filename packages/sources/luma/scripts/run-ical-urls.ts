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
