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
    handles: [
      'ns',
      'Prospera-events',
      'zuzalucity'
    ],

    // Enable/disable city scraping (disabled by default)
    cities_enabled: false,
  },

  // Sola configuration
  sola: {
    // Enable/disable popup city tracking (cities as events)
    cities_enabled: true,

    // Enable/disable city events scraping (events within cities)
    cities_events_enabled: false,
  }
}
