/**
 * Root configuration for event sources
 *
 * This config controls which sources are enabled and what entities
 * (cities, handles, groups, etc.) to scrape from each source.
 */

export default {
  // Luma configuration
  luma: {
    // User handles to scrape (e.g., "ns" for luma.com/ns)
    handles: ['ns'],

    // Enable/disable city scraping (disabled by default)
    cities_enabled: false,
  },

  // Sola configuration
  sola: {
    // Enable/disable city scraping
    cities_enabled: true,
  }
}
