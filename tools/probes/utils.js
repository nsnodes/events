import fs from 'fs';
import path from 'path';

/**
 * Utility functions for web scraping probe tests
 */

// Color codes for console output
export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

/**
 * Log formatted test results
 */
export function logTest(testName, status, details = '') {
  const statusColor = status === 'PASS' ? colors.green :
                     status === 'FAIL' ? colors.red :
                     colors.yellow;

  console.log(`${statusColor}${status}${colors.reset} ${colors.bright}${testName}${colors.reset}`);
  if (details) {
    console.log(`  ${colors.dim}${details}${colors.reset}`);
  }
}

/**
 * Log section headers
 */
export function logSection(title) {
  console.log(`\n${colors.cyan}${'='.repeat(60)}${colors.reset}`);
  console.log(`${colors.cyan}${colors.bright}${title}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(60)}${colors.reset}\n`);
}

/**
 * Save results to JSON file
 */
export function saveResults(filename, data) {
  const resultsDir = path.join(process.cwd(), 'results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const filepath = path.join(resultsDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  console.log(`${colors.green}Results saved to: ${filepath}${colors.reset}`);
}

/**
 * Format bytes to human readable
 */
export function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Format duration in milliseconds
 */
export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * Wait for a specific time
 */
export function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create a timestamp string
 */
export function timestamp() {
  return new Date().toISOString();
}

/**
 * Analyze page performance metrics
 */
export async function getPerformanceMetrics(page) {
  return await page.evaluate(() => {
    const timing = performance.timing;
    const navigation = performance.getEntriesByType('navigation')[0];

    return {
      domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
      loadComplete: timing.loadEventEnd - timing.navigationStart,
      firstPaint: navigation ? navigation.responseStart - navigation.requestStart : 0,
      domInteractive: timing.domInteractive - timing.navigationStart,
      resources: performance.getEntriesByType('resource').length
    };
  });
}

/**
 * Check if element is visible
 */
export async function isElementVisible(page, selector) {
  try {
    const element = await page.locator(selector).first();
    return await element.isVisible({ timeout: 5000 });
  } catch (error) {
    return false;
  }
}

/**
 * Get all text content from selector
 */
export async function getAllText(page, selector) {
  try {
    const elements = await page.locator(selector).all();
    const texts = await Promise.all(elements.map(el => el.textContent()));
    return texts.filter(t => t && t.trim().length > 0);
  } catch (error) {
    return [];
  }
}

/**
 * Take screenshot with error handling
 */
export async function takeScreenshot(page, name) {
  try {
    const screenshotsDir = path.join(process.cwd(), 'results', 'screenshots');
    if (!fs.existsSync(screenshotsDir)) {
      fs.mkdirSync(screenshotsDir, { recursive: true });
    }

    const filepath = path.join(screenshotsDir, `${name}-${Date.now()}.png`);
    await page.screenshot({ path: filepath, fullPage: true });
    return filepath;
  } catch (error) {
    console.error(`Failed to take screenshot: ${error.message}`);
    return null;
  }
}

/**
 * Extract meta information from page
 */
export async function extractMetaInfo(page) {
  return await page.evaluate(() => {
    const getMeta = (name) => {
      const meta = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
      return meta ? meta.content : null;
    };

    return {
      title: document.title,
      description: getMeta('description') || getMeta('og:description'),
      url: window.location.href,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  });
}
