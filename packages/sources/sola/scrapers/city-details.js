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
 * Parse dates from the date string
 * Format: "Aug 28-Aug 27, 2028" or "Sep 02-Oct 01, 2025"
 * @param {string} dateStr - Date string from city card
 * @returns {Object} Parsed start and end dates in ISO format
 */
function parseDates(dateStr) {
  if (!dateStr) return { startDate: null, endDate: null };

  // Pattern with year: "Aug 28-Aug 27, 2028"
  const datePatternWithYear = /([A-Z][a-z]{2}\s+\d{1,2})-([A-Z][a-z]{2}\s+\d{1,2}),\s*(\d{4})/;
  const matchWithYear = dateStr.match(datePatternWithYear);

  if (matchWithYear) {
    const startDateStr = matchWithYear[1];
    const endDateStr = matchWithYear[2];
    const endYear = parseInt(matchWithYear[3]);

    // The year in the text applies to the END date
    // Parse end date first (use UTC noon to avoid timezone issues)
    const endMonth = endDateStr.split(' ')[0];
    const endDay = parseInt(endDateStr.split(' ')[1]);
    const endDate = new Date(Date.UTC(endYear, getMonthIndex(endMonth), endDay, 12, 0, 0));

    // Parse start date - try with same year first
    const startMonth = startDateStr.split(' ')[0];
    const startDay = parseInt(startDateStr.split(' ')[1]);
    let startDate = new Date(Date.UTC(endYear, getMonthIndex(startMonth), startDay, 12, 0, 0));

    // If start date is after end date, start must be in the previous year
    if (startDate > endDate) {
      startDate = new Date(Date.UTC(endYear - 1, getMonthIndex(startMonth), startDay, 12, 0, 0));
    }

    // Convert to ISO date strings (YYYY-MM-DD)
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  // Fallback: pattern without year (shouldn't happen anymore, but keep for safety)
  const datePatternNoYear = /([A-Z][a-z]{2}\s+\d{1,2})-([A-Z][a-z]{2}\s+\d{1,2})/;
  const matchNoYear = dateStr.match(datePatternNoYear);

  if (matchNoYear) {
    const currentYear = new Date().getFullYear();
    const startDateStr = matchNoYear[1];
    const endDateStr = matchNoYear[2];

    let startDate = new Date(`${startDateStr} ${currentYear}`);
    let endDate = new Date(`${endDateStr} ${currentYear}`);

    // If end date is before start date, assume it's next year
    if (endDate < startDate) {
      endDate = new Date(`${endDateStr} ${currentYear + 1}`);
    }

    // Convert to ISO strings
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }

  return { startDate: null, endDate: null };
}

/**
 * Parse city detail from the city card structured data
 * @param {Object} city - City object from cities.json with title, dates, location, imageUrl
 * @returns {Object} Parsed city information
 */
function parseCityCardData(city) {
  // Parse dates from the clean dates string
  const { startDate, endDate } = parseDates(city.dates);

  // Use title from the structured data (already clean!)
  // Fall back to slug if title is missing
  const title = city.title || (city.slug.charAt(0).toUpperCase() + city.slug.slice(1));

  // Use location from the structured data (already clean!)
  const location = city.location || null;

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
 * @param {Object} city - City object from cities.json with url, slug, title, dates, location, imageUrl
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
