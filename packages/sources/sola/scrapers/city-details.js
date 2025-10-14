import { writeFileSync, readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../data');

/**
 * Sola.day Popup City Details Parser
 *
 * Purpose: Parse detailed information for each popup city from the city list data
 * Method: Text parsing (no web scraping needed - data is in the city cards)
 * Frequency: Daily (runs after cities discovery)
 *
 * Usage:
 *   import { scrapeCityDetails, saveCityDetails, getCityDetails } from './scrapers/city-details.js'
 *
 *   const cities = getCities()
 *   const cityDetails = await scrapeCityDetails(cities.cities)
 *   saveCityDetails(cityDetails)
 */

/**
 * Helper function to convert month abbreviation to zero-based month index
 * @param {string} monthStr - Month abbreviation like "Jan", "Feb", etc.
 * @returns {number} Month index (0-11)
 */
function getMonthIndex(monthStr) {
  const months = {
    'Jan': 0, 'Feb': 1, 'Mar': 2, 'Apr': 3, 'May': 4, 'Jun': 5,
    'Jul': 6, 'Aug': 7, 'Sep': 8, 'Oct': 9, 'Nov': 10, 'Dec': 11
  };
  return months[monthStr] ?? 0;
}

/**
 * Parse city detail from the city card text
 * The text format can be:
 * - With year: "Aug 28-Aug 27, 2028TitleLocationby Organizer"
 * - Without year: "Aug 28-Aug 27TitleLocationby Organizer"
 * @param {Object} city - City object from cities.json
 * @returns {Object} Parsed city information
 */
function parseCityCardData(city) {
  const text = city.text || '';

  // Extract dates - look for pattern with optional year
  // Pattern 1: "Aug 28-Aug 27, 2028" (with year)
  // Pattern 2: "Aug 28-Aug 27" (without year - fallback)
  const datePatternWithYear = /([A-Z][a-z]{2}\s+\d{1,2})-([A-Z][a-z]{2}\s+\d{1,2}),\s*(\d{4})/;
  const datePatternNoYear = /^([A-Z][a-z]{2}\s+\d{1,2})-([A-Z][a-z]{2}\s+\d{1,2})/;

  let startDate = null;
  let endDate = null;
  let textWithoutDates = text;

  // Try pattern with year first
  const matchWithYear = text.match(datePatternWithYear);
  if (matchWithYear) {
    const startDateStr = matchWithYear[1];
    const endDateStr = matchWithYear[2];
    const endYear = parseInt(matchWithYear[3]);

    // The year in the text applies to the END date
    // Parse end date first (use UTC noon to avoid timezone issues)
    const endMonth = endDateStr.split(' ')[0];
    const endDay = parseInt(endDateStr.split(' ')[1]);
    endDate = new Date(Date.UTC(endYear, getMonthIndex(endMonth), endDay, 12, 0, 0));

    // Parse start date - try with same year first
    const startMonth = startDateStr.split(' ')[0];
    const startDay = parseInt(startDateStr.split(' ')[1]);
    startDate = new Date(Date.UTC(endYear, getMonthIndex(startMonth), startDay, 12, 0, 0));

    // If start date is after end date, start must be in the previous year
    if (startDate > endDate) {
      startDate = new Date(Date.UTC(endYear - 1, getMonthIndex(startMonth), startDay, 12, 0, 0));
    }

    // Convert to ISO date strings (YYYY-MM-DD)
    startDate = startDate.toISOString().split('T')[0];
    endDate = endDate.toISOString().split('T')[0];

    // Remove dates from text
    textWithoutDates = text.replace(matchWithYear[0], '');
  }
  // Fallback to pattern without year
  else {
    const matchNoYear = text.match(datePatternNoYear);
    if (matchNoYear) {
      const currentYear = new Date().getFullYear();
      const startDateStr = matchNoYear[1];
      const endDateStr = matchNoYear[2];

      startDate = new Date(`${startDateStr} ${currentYear}`);
      endDate = new Date(`${endDateStr} ${currentYear}`);

      // If end date is before start date, assume it's next year
      if (endDate < startDate) {
        endDate = new Date(`${endDateStr} ${currentYear + 1}`);
      }

      // Convert to ISO strings
      startDate = startDate.toISOString().split('T')[0];
      endDate = endDate.toISOString().split('T')[0];

      // Remove dates from text
      textWithoutDates = text.substring(matchNoYear[0].length);
    }
  }

  // Use slug as title (most reliable)
  const title = city.slug.charAt(0).toUpperCase() + city.slug.slice(1);

  // Don't try to parse location - the text format is too inconsistent
  // Location will be null, normalization can handle it
  const location = null;

  return {
    id: null,
    title,
    location,
    startDate,
    endDate,
    imageUrl: city.imageUrl,
    website: null,
    description: null,
    timezone: null,
    tags: [],
  };
}

/**
 * Get detailed information for a single popup city
 * @param {Object} city - City object from cities.json with url, slug, text, imageUrl
 * @param {Object} options - Configuration options (unused, for compatibility)
 * @returns {Promise<Object>} Detailed city information
 */
export async function scrapeCityDetail(city, options = {}) {
  try {
    const cityData = parseCityCardData(city);

    return {
      success: true,
      citySlug: city.slug,
      ...cityData
    };

  } catch (error) {
    return {
      success: false,
      citySlug: city.slug,
      error: error.message
    };
  }
}

/**
 * Parse details for all cities from city list data
 * @param {Array} cities - Array of city objects from cities.json
 * @param {Object} options - Configuration options (unused, for compatibility)
 * @returns {Promise<Object>} Results with city details
 */
export async function scrapeCityDetails(cities, options = {}) {
  const results = [];

  try {
    console.log(`Parsing details for ${cities.length} cities...`);

    for (const city of cities) {
      const result = await scrapeCityDetail(city);
      results.push(result);
    }

    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    return {
      success: true,
      timestamp: new Date().toISOString(),
      totalCities: cities.length,
      successful: successful.length,
      failed: failed.length,
      cities: results
    };

  } catch (error) {
    return {
      success: false,
      timestamp: new Date().toISOString(),
      error: error.message,
      cities: results
    };
  }
}

/**
 * Save city details to disk
 * @param {Object} cityDetailsData - City details data from scrapeCityDetails()
 */
export function saveCityDetails(cityDetailsData) {
  const cityDetailsPath = join(DATA_DIR, 'city-details.json');

  writeFileSync(cityDetailsPath, JSON.stringify(cityDetailsData, null, 2));
  console.log(`Saved ${cityDetailsData.cities.length} city details to ${cityDetailsPath}`);
}

/**
 * Load city details from disk
 * @returns {Object} City details data
 */
export function getCityDetails() {
  const cityDetailsPath = join(DATA_DIR, 'city-details.json');

  if (!existsSync(cityDetailsPath)) {
    throw new Error('City details not found. Run scrapeCityDetails() first.');
  }

  return JSON.parse(readFileSync(cityDetailsPath, 'utf-8'));
}

/**
 * Compare old and new city details to detect changes
 * @param {Object} oldData - Previous city details
 * @param {Object} newData - New city details
 * @returns {Object} Diff with changed cities
 */
export function compareCityDetails(oldData, newData) {
  const oldMap = new Map(oldData.cities.map(c => [c.citySlug, c]));
  const newMap = new Map(newData.cities.map(c => [c.citySlug, c]));

  const added = [];
  const removed = [];
  const changed = [];

  // Find new cities
  for (const [slug, city] of newMap) {
    if (!oldMap.has(slug)) {
      added.push(city);
    }
  }

  // Find removed and changed cities
  for (const [slug, oldCity] of oldMap) {
    const newCity = newMap.get(slug);
    if (!newCity) {
      removed.push(oldCity);
    } else {
      // Check if any important fields changed
      const fieldsToCompare = ['title', 'startDate', 'endDate', 'location', 'description'];
      const hasChanges = fieldsToCompare.some(field =>
        JSON.stringify(oldCity[field]) !== JSON.stringify(newCity[field])
      );
      if (hasChanges) {
        changed.push({ slug, old: oldCity, new: newCity });
      }
    }
  }

  return {
    hasChanges: added.length > 0 || removed.length > 0 || changed.length > 0,
    added,
    removed,
    changed,
    summary: `+${added.length} -${removed.length} ~${changed.length}`
  };
}
