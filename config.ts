/**
 * Root configuration for event sources
 *
 * This config controls which sources are enabled and what entities
 * (cities, handles, groups, etc.) to scrape from each source.
 */

interface LumaConfig {
  /** User handles to scrape (e.g., "ns" for luma.com/ns) */
  handles: string[];
  /** Enable/disable city scraping (disabled by default) */
  cities_enabled: boolean;
}

interface SolaConfig {
  /** Enable/disable popup city tracking (cities as events) */
  cities_enabled: boolean;
  /** Enable/disable city events scraping (events within cities) */
  cities_events_enabled: boolean;
}

interface Config {
  luma: LumaConfig;
  sola: SolaConfig;
}

const config: Config = {
  // Luma configuration
  luma: {
    // User handles to scrape (e.g., "ns" for luma.com/ns)
    handles: [
      'ns',
      'Prospera-events',
      'zuzalucity',
      'ipecity',
      'InfinitaCity',
      '4seas',
      'build_republic',
      'usr-bRtyfgATCOX4Ek3',
      'logos',
      'montelibero',
      'joinvdao',
      'ozcity_patagonia',
      'crecimiento',
      'jamesofarc',
      'commonsmovement'
    ],

    // Enable/disable city scraping (disabled by default)
    cities_enabled: false,
  },

  // Sola configuration
  sola: {
    // Enable/disable popup city tracking (cities as events)
    cities_enabled: true,

    // Enable/disable city events scraping (events within cities)
    cities_events_enabled: true,
  }
}

export default config
