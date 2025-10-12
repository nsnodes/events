import { chromium } from 'playwright';
import {
  logSection,
  logTest,
  saveResults,
  formatBytes,
  formatDuration,
  wait,
  timestamp,
  getPerformanceMetrics,
  isElementVisible,
  getAllText,
  takeScreenshot,
  extractMetaInfo
} from './utils.js';

const SOLA_URL = 'https://app.sola.day/';
const results = {
  platform: 'Sola.day',
  url: SOLA_URL,
  timestamp: timestamp(),
  tests: {}
};

async function runAllTests() {
  console.log('\n🔍 Starting Sola.day Probe Tests\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();

  try {
    // Test 1: Basic Page Load and Rendering
    await test1_pageLoadRendering(page);

    // Test 2: Network Inspection
    await test2_networkInspection(page);

    // Test 3: DOM Structure Analysis
    await test3_domStructure(page);

    // Test 4: Dynamic Content Loading
    await test4_dynamicContent(page);

    // Test 5: Data Extraction
    await test5_dataExtraction(page);

    // Test 6: Anti-bot Detection
    await test6_antibotDetection(page, context);

  } catch (error) {
    console.error('Error running tests:', error);
    results.error = error.message;
  } finally {
    await browser.close();
    saveResults('sola-probe-results.json', results);
  }
}

// Test 1: Basic Page Load and Rendering Detection
async function test1_pageLoadRendering(page) {
  logSection('TEST 1: Basic Page Load and Rendering Detection');

  const testResults = {
    passed: false,
    timings: {},
    screenshots: [],
    renderingType: null
  };

  try {
    // Navigate and measure initial load
    const startTime = Date.now();
    const response = await page.goto(SOLA_URL, { waitUntil: 'domcontentloaded' });
    const domLoadTime = Date.now() - startTime;

    testResults.timings.domContentLoaded = domLoadTime;
    testResults.httpStatus = response.status();

    logTest('Page navigation', 'PASS', `Status: ${response.status()}, Time: ${formatDuration(domLoadTime)}`);

    // Take screenshot at DOMContentLoaded
    const screenshot1 = await takeScreenshot(page, 'sola-dom-loaded');
    if (screenshot1) testResults.screenshots.push(screenshot1);

    // Wait for network idle to see full rendering
    await page.waitForLoadState('networkidle', { timeout: 10000 });
    const fullLoadTime = Date.now() - startTime;
    testResults.timings.fullLoad = fullLoadTime;

    logTest('Full page load', 'PASS', `Time: ${formatDuration(fullLoadTime)}`);

    // Take screenshot after full load
    const screenshot2 = await takeScreenshot(page, 'sola-fully-loaded');
    if (screenshot2) testResults.screenshots.push(screenshot2);

    // Check if JavaScript is required
    const htmlContent = await page.content();
    const hasReactRoot = htmlContent.includes('__NEXT_DATA__') || htmlContent.includes('react') || htmlContent.includes('_app');
    const hasEventCards = htmlContent.includes('event') || htmlContent.includes('pop-up');

    testResults.hasNextData = htmlContent.includes('__NEXT_DATA__');
    testResults.initialHtmlHasContent = hasEventCards;

    if (hasReactRoot) {
      testResults.renderingType = 'Client-side (React/Next.js)';
      logTest('Rendering detection', 'INFO', 'Client-side rendered (React/Next.js detected)');
    }

    // Get performance metrics
    const metrics = await getPerformanceMetrics(page);
    testResults.metrics = metrics;
    logTest('Performance metrics', 'INFO',
      `DOM Interactive: ${formatDuration(metrics.domInteractive)}, ` +
      `Resources: ${metrics.resources}`
    );

    // Extract meta information
    const metaInfo = await extractMetaInfo(page);
    testResults.metaInfo = metaInfo;
    logTest('Page metadata', 'INFO', `Title: "${metaInfo.title}"`);

    testResults.passed = true;

  } catch (error) {
    logTest('Page load test', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test1_pageLoadRendering = testResults;
}

// Test 2: Network Inspection for API Endpoints
async function test2_networkInspection(page) {
  logSection('TEST 2: Network Inspection for API Endpoints');

  const testResults = {
    passed: false,
    apiCalls: [],
    resources: {
      xhr: 0,
      fetch: 0,
      script: 0,
      stylesheet: 0,
      image: 0,
      other: 0
    },
    totalDataTransferred: 0
  };

  try {
    const apiCalls = [];
    const resourceStats = { ...testResults.resources };

    // Listen to all requests
    page.on('request', request => {
      const type = request.resourceType();
      if (resourceStats[type] !== undefined) {
        resourceStats[type]++;
      } else {
        resourceStats.other++;
      }
    });

    // Listen to responses
    page.on('response', async response => {
      const url = response.url();
      const request = response.request();
      const type = request.resourceType();

      // Track API calls
      if (type === 'xhr' || type === 'fetch') {
        try {
          const headers = response.headers();
          const apiCall = {
            url,
            method: request.method(),
            status: response.status(),
            contentType: headers['content-type'] || 'unknown',
            timing: response.timing()
          };

          // Try to get response body for API calls
          if (url.includes('/api/') || url.includes('graphql') || headers['content-type']?.includes('json')) {
            try {
              const body = await response.text();
              apiCall.bodySize = body.length;
              testResults.totalDataTransferred += body.length;

              // Sample of response for analysis
              if (body.length < 1000) {
                apiCall.bodySample = body;
              } else {
                apiCall.bodySample = body.substring(0, 500) + '... (truncated)';
              }
            } catch (e) {
              // Some responses can't be read
            }
          }

          apiCalls.push(apiCall);
        } catch (e) {
          // Ignore errors in tracking
        }
      }
    });

    // Reload page to capture all network traffic
    await page.reload({ waitUntil: 'networkidle' });
    await wait(2000); // Wait for any delayed requests

    testResults.apiCalls = apiCalls;
    testResults.resources = resourceStats;

    // Log findings
    logTest('Network monitoring', 'PASS', `Captured ${apiCalls.length} API calls`);

    if (apiCalls.length > 0) {
      console.log('\n  API Endpoints discovered:');
      apiCalls.slice(0, 10).forEach(call => {
        console.log(`    ${call.method} ${call.url}`);
        console.log(`      Status: ${call.status}, Type: ${call.contentType}`);
        if (call.bodySize) {
          console.log(`      Size: ${formatBytes(call.bodySize)}`);
        }
      });

      if (apiCalls.length > 10) {
        console.log(`    ... and ${apiCalls.length - 10} more`);
      }
    }

    logTest('Resource summary', 'INFO',
      `XHR: ${resourceStats.xhr}, Fetch: ${resourceStats.fetch}, ` +
      `Scripts: ${resourceStats.script}, Images: ${resourceStats.image}`
    );

    testResults.passed = true;

  } catch (error) {
    logTest('Network inspection', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test2_networkInspection = testResults;
}

// Test 3: DOM Structure Analysis and Selector Testing
async function test3_domStructure(page) {
  logSection('TEST 3: DOM Structure Analysis and Selector Testing');

  const testResults = {
    passed: false,
    selectors: {},
    eventCards: []
  };

  try {
    // Common selector patterns to test
    const selectorsToTest = [
      { name: 'Event cards by class', selector: '[class*="event"]' },
      { name: 'Event items', selector: '[class*="item"]' },
      { name: 'Pop-up city cards', selector: '[class*="popup"], [class*="city"]' },
      { name: 'Card containers', selector: '[class*="card"]' },
      { name: 'List items', selector: 'li' },
      { name: 'Article elements', selector: 'article' },
      { name: 'Grid items', selector: '[class*="grid"] > *' },
      { name: 'Event links', selector: 'a[href*="/event/"]' },
      { name: 'Image containers', selector: '[class*="image"]' },
      { name: 'Date elements', selector: '[class*="date"], time' }
    ];

    for (const { name, selector } of selectorsToTest) {
      try {
        const count = await page.locator(selector).count();
        const visible = count > 0 ? await isElementVisible(page, selector) : false;

        testResults.selectors[name] = {
          selector,
          count,
          visible
        };

        if (count > 0) {
          logTest(`Selector: ${name}`, 'FOUND', `Count: ${count}, Visible: ${visible}`);
        }
      } catch (error) {
        testResults.selectors[name] = {
          selector,
          error: error.message
        };
      }
    }

    // Analyze event card structure
    const eventCards = await page.evaluate(() => {
      const cards = [];

      // Try multiple selector strategies
      const selectors = [
        'a[href*="/event/"]',
        '[class*="event"]',
        '[class*="card"]',
        'article',
        'li'
      ];

      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements.length > 0) {
          Array.from(elements).slice(0, 5).forEach(el => {
            const card = {
              tagName: el.tagName,
              className: el.className,
              innerHTML: el.innerHTML.substring(0, 200),
              textContent: el.textContent?.substring(0, 100),
              attributes: {}
            };

            // Get all attributes
            for (const attr of el.attributes) {
              card.attributes[attr.name] = attr.value;
            }

            cards.push(card);
          });

          if (cards.length > 0) break;
        }
      }

      return cards;
    });

    testResults.eventCards = eventCards;

    if (eventCards.length > 0) {
      logTest('Event card structure', 'PASS', `Analyzed ${eventCards.length} cards`);
      console.log('\n  Sample card structure:');
      console.log(`    Tag: ${eventCards[0].tagName}`);
      console.log(`    Classes: ${eventCards[0].className}`);
      console.log(`    Attributes: ${Object.keys(eventCards[0].attributes).join(', ')}`);
      console.log(`    Text preview: ${eventCards[0].textContent?.substring(0, 60)}...`);
    } else {
      logTest('Event card structure', 'WARN', 'No event cards found');
    }

    testResults.passed = true;

  } catch (error) {
    logTest('DOM structure analysis', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test3_domStructure = testResults;
}

// Test 4: Dynamic Content Loading (Scroll/Pagination)
async function test4_dynamicContent(page) {
  logSection('TEST 4: Dynamic Content Loading (Scroll/Pagination)');

  const testResults = {
    passed: false,
    scrollBehavior: {},
    pagination: {}
  };

  try {
    // Get initial event count - try multiple selectors
    let initialCount = await page.locator('a[href*="/event/"]').count();
    if (initialCount === 0) {
      initialCount = await page.locator('[class*="event"]').count();
    }
    if (initialCount === 0) {
      initialCount = await page.locator('[class*="card"]').count();
    }

    testResults.initialEventCount = initialCount;
    logTest('Initial event count', 'INFO', `${initialCount} items`);

    // Test scroll behavior
    const scrollTest = await page.evaluate(() => {
      const initialHeight = document.body.scrollHeight;
      window.scrollTo(0, document.body.scrollHeight / 2);

      return {
        initialHeight,
        viewportHeight: window.innerHeight,
        scrollPosition: window.scrollY
      };
    });

    await wait(2000); // Wait for potential lazy load

    let afterScrollCount = await page.locator('a[href*="/event/"]').count();
    if (afterScrollCount === 0) {
      afterScrollCount = await page.locator('[class*="event"]').count();
    }

    testResults.scrollBehavior = {
      ...scrollTest,
      countAfterScroll: afterScrollCount,
      newItemsLoaded: afterScrollCount - initialCount
    };

    if (afterScrollCount > initialCount) {
      logTest('Infinite scroll', 'DETECTED', `Loaded ${afterScrollCount - initialCount} new items`);
    } else {
      logTest('Infinite scroll', 'NOT DETECTED', 'No new items after scroll');
    }

    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await wait(2000);

    let finalCount = await page.locator('a[href*="/event/"]').count();
    if (finalCount === 0) {
      finalCount = await page.locator('[class*="event"]').count();
    }
    testResults.finalEventCount = finalCount;

    // Check for pagination elements
    const paginationElements = await page.evaluate(() => {
      const elements = {
        nextButton: !!document.querySelector('[class*="next"], [aria-label*="next"], button:has-text("Next")'),
        prevButton: !!document.querySelector('[class*="prev"], [aria-label*="previous"], button:has-text("Previous")'),
        pageNumbers: !!document.querySelector('[class*="page"]'),
        loadMore: !!document.querySelector('button:has-text("Load"), button:has-text("More"), button:has-text("Show")')
      };
      return elements;
    });

    testResults.pagination = paginationElements;

    if (Object.values(paginationElements).some(v => v)) {
      logTest('Pagination elements', 'FOUND', JSON.stringify(paginationElements));
    } else {
      logTest('Pagination elements', 'NOT FOUND', 'No pagination controls detected');
    }

    logTest('Total events after scroll', 'INFO', `${finalCount} items`);

    testResults.passed = true;

  } catch (error) {
    logTest('Dynamic content test', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test4_dynamicContent = testResults;
}

// Test 5: Data Extraction and Validation
async function test5_dataExtraction(page) {
  logSection('TEST 5: Data Extraction and Validation');

  const testResults = {
    passed: false,
    extractedEvents: []
  };

  try {
    // Scroll to top first
    await page.evaluate(() => window.scrollTo(0, 0));
    await wait(1000);

    // Extract event data - try multiple strategies
    const events = await page.evaluate(() => {
      const extracted = [];

      // Strategy 1: Look for event links
      let eventElements = document.querySelectorAll('a[href*="/event/"]');

      // Strategy 2: Look for elements with event in class
      if (eventElements.length === 0) {
        eventElements = document.querySelectorAll('[class*="event"]');
      }

      // Strategy 3: Look for any cards
      if (eventElements.length === 0) {
        eventElements = document.querySelectorAll('[class*="card"]');
      }

      eventElements.forEach((el, index) => {
        if (index >= 10) return; // Limit to 10 for testing

        const event = {
          url: el.href || window.location.href + el.getAttribute('href'),
          text: el.textContent?.trim().substring(0, 200) || ''
        };

        // Try to find title
        const titleEl = el.querySelector('[class*="title"], [class*="name"], h1, h2, h3, h4, strong');
        if (titleEl) event.title = titleEl.textContent?.trim();

        // If no title element, try to extract from text
        if (!event.title && event.text) {
          const lines = event.text.split('\n').filter(l => l.trim().length > 0);
          if (lines.length > 0) event.title = lines[0].trim();
        }

        // Try to find date
        const dateEl = el.querySelector('[class*="date"], time, [datetime]');
        if (dateEl) {
          event.date = dateEl.textContent?.trim();
          if (dateEl.getAttribute('datetime')) {
            event.datetime = dateEl.getAttribute('datetime');
          }
        }

        // Try to find location
        const locationEl = el.querySelector('[class*="location"], [class*="place"]');
        if (locationEl) event.location = locationEl.textContent?.trim();

        // Try to find organizer
        const organizerEl = el.querySelector('[class*="organizer"], [class*="host"], [class*="by"]');
        if (organizerEl) event.organizer = organizerEl.textContent?.trim();

        // Try to find image
        const imgEl = el.querySelector('img');
        if (imgEl) {
          event.image = imgEl.src;
          event.imageAlt = imgEl.alt;
        }

        // Get all classes for analysis
        event.classes = el.className;

        // Get data attributes
        event.dataAttributes = {};
        for (const attr of el.attributes) {
          if (attr.name.startsWith('data-')) {
            event.dataAttributes[attr.name] = attr.value;
          }
        }

        extracted.push(event);
      });

      return extracted;
    });

    testResults.extractedEvents = events;
    testResults.totalExtracted = events.length;

    logTest('Data extraction', 'PASS', `Extracted ${events.length} events`);

    if (events.length > 0) {
      console.log('\n  Sample extracted event:');
      const sample = events[0];
      console.log(`    Title: ${sample.title || 'N/A'}`);
      console.log(`    Date: ${sample.date || 'N/A'}`);
      console.log(`    Location: ${sample.location || 'N/A'}`);
      console.log(`    Organizer: ${sample.organizer || 'N/A'}`);
      console.log(`    URL: ${sample.url}`);
      console.log(`    Has Image: ${!!sample.image}`);

      // Validate completeness
      const complete = events.filter(e => e.title && e.url);
      const completeness = events.length > 0 ? (complete.length / events.length) * 100 : 0;
      testResults.completeness = completeness;

      logTest('Data completeness', 'INFO', `${completeness.toFixed(1)}% have title and URL`);

      // Check what fields are most common
      const fieldPresence = {
        title: events.filter(e => e.title).length,
        date: events.filter(e => e.date).length,
        location: events.filter(e => e.location).length,
        organizer: events.filter(e => e.organizer).length,
        image: events.filter(e => e.image).length
      };

      testResults.fieldPresence = fieldPresence;
      console.log('\n  Field presence:');
      Object.entries(fieldPresence).forEach(([field, count]) => {
        const percent = events.length > 0 ? ((count / events.length) * 100).toFixed(0) : 0;
        console.log(`    ${field}: ${count}/${events.length} (${percent}%)`);
      });
    }

    testResults.passed = true;

  } catch (error) {
    logTest('Data extraction', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test5_dataExtraction = testResults;
}

// Test 6: Anti-bot Detection Checks
async function test6_antibotDetection(page, context) {
  logSection('TEST 6: Anti-bot Detection Checks');

  const testResults = {
    passed: false,
    headless: {},
    captcha: {},
    fingerprinting: {}
  };

  try {
    // Check for bot detection signals
    const botChecks = await page.evaluate(() => {
      return {
        webdriver: navigator.webdriver,
        chrome: !!window.chrome,
        permissions: navigator.permissions ? true : false,
        plugins: navigator.plugins.length,
        languages: navigator.languages?.length || 0,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        userAgent: navigator.userAgent
      };
    });

    testResults.fingerprinting = botChecks;

    logTest('WebDriver flag', botChecks.webdriver ? 'DETECTED' : 'PASS',
      `navigator.webdriver = ${botChecks.webdriver}`);

    // Check for CAPTCHA
    const captchaPresent = await page.evaluate(() => {
      const captchaIndicators = [
        document.querySelector('[class*="captcha"]'),
        document.querySelector('[id*="captcha"]'),
        document.querySelector('iframe[src*="captcha"]'),
        document.querySelector('iframe[src*="recaptcha"]'),
        document.querySelector('[class*="challenge"]'),
        document.querySelector('[class*="verify"]')
      ];
      return captchaIndicators.some(el => el !== null);
    });

    testResults.captcha.present = captchaPresent;
    logTest('CAPTCHA detection', captchaPresent ? 'FOUND' : 'PASS',
      captchaPresent ? 'CAPTCHA present on page' : 'No CAPTCHA detected');

    // Check for Cloudflare or similar protection
    const protectionCheck = await page.evaluate(() => {
      const title = document.title.toLowerCase();
      const body = document.body.textContent.toLowerCase();

      return {
        cloudflare: title.includes('cloudflare') || body.includes('cloudflare'),
        accessDenied: title.includes('access denied') || body.includes('access denied'),
        blocked: title.includes('blocked') || body.includes('you have been blocked'),
        checking: title.includes('checking') || body.includes('checking your browser')
      };
    });

    testResults.protection = protectionCheck;

    if (Object.values(protectionCheck).some(v => v)) {
      logTest('Protection detected', 'WARN', JSON.stringify(protectionCheck));
    } else {
      logTest('Protection check', 'PASS', 'No blocking detected');
    }

    // Test rate limiting (make multiple rapid requests)
    const rateLimitTest = { attempts: 0, failed: 0 };
    for (let i = 0; i < 3; i++) {
      try {
        rateLimitTest.attempts++;
        await page.reload({ waitUntil: 'domcontentloaded', timeout: 5000 });
        await wait(500);
      } catch (error) {
        rateLimitTest.failed++;
      }
    }

    testResults.rateLimit = rateLimitTest;
    logTest('Rate limit test', rateLimitTest.failed === 0 ? 'PASS' : 'WARN',
      `${rateLimitTest.attempts - rateLimitTest.failed}/${rateLimitTest.attempts} succeeded`);

    testResults.passed = true;

  } catch (error) {
    logTest('Anti-bot detection', 'FAIL', error.message);
    testResults.error = error.message;
  }

  results.tests.test6_antibotDetection = testResults;
}

// Run all tests
runAllTests().catch(console.error);
