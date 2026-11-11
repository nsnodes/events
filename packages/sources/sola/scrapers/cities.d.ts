/**
 * Type declarations for the Sola popup cities scraper (cities.js)
 */

export interface PopupCity {
  slug: string | null;
  url: string;
  title: string | null;
  dates: string | null;
  location: string | null;
  imageUrl: string | null;
}

export interface CitiesData {
  success: boolean;
  timestamp: string;
  totalCities?: number;
  /** Present when success is false: why the discovery was rejected */
  error?: string;
  cities: PopupCity[];
}

export interface DiscoveryObservation {
  requestedUrl: string;
  finalUrl?: string;
  cities?: PopupCity[];
  pageText?: string;
}

export declare function detectDiscoveryAnomaly(observation: DiscoveryObservation): string | null;

export declare function scrapePopupCities(options?: { headless?: boolean }): Promise<CitiesData>;

export declare function saveCities(citiesData: CitiesData, dataDir?: string): void;

export declare function getCities(): CitiesData;

export declare function compareCities(oldData: CitiesData, newData: CitiesData): {
  hasChanges: boolean;
  added: PopupCity[];
  removed: PopupCity[];
  summary: string;
};
