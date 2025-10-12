# NSNodes Events

Event aggregation platform - scraping and normalizing events from multiple sources (Luma.com, Sola.day, and more).

This repository contains tools for discovering, probing, and scraping event platforms.

## Overview

This project runs systematic tests to understand:
- Page rendering behavior (CSR vs SSR)
- API endpoints and network traffic
- DOM structure and optimal selectors
- Dynamic content loading patterns
- Data extraction feasibility
- Anti-bot detection measures

## Installation

```bash
npm install
npx playwright install chromium
```

## Repository Structure

```
.
├── packages/
│   ├── sources/          # Platform-specific scrapers
│   │   └── luma/         # Luma.com scraper
│   │       ├── data/     # City data and metadata
│   │       └── README.md
│   ├── core/             # Shared utilities
│   └── orchestrator/     # Scraping orchestration
├── tools/
│   ├── probes/           # Platform probe tests
│   └── city-extraction/  # City discovery scripts
└── results/              # Test outputs (gitignored)
```

## Usage

### Platform Probing
```bash
# Run all probe tests
npm run probe

# Test specific platforms
npm run probe:luma
npm run probe:sola
```

### City Extraction
```bash
# Extract all Luma cities
npm run extract:luma-cities
```

## Test Suite

### Test 1: Basic Page Load and Rendering Detection
- Measures page load times (DOMContentLoaded vs full load)
- Detects rendering type (CSR/SSR/Hydration)
- Captures screenshots at different load stages
- Analyzes performance metrics
- Determines JavaScript requirements

**Key Findings:**
- Initial HTML content analysis
- Framework detection (React, Next.js)
- Load time benchmarks

### Test 2: Network Inspection for API Endpoints
- Monitors all network requests (XHR, Fetch, etc.)
- Identifies API endpoints used for event data
- Captures request/response patterns
- Analyzes data transfer sizes
- Documents authentication requirements

**Key Findings:**
- Discoverable API endpoints
- Request methods and headers
- Response formats (JSON, GraphQL, etc.)
- Direct API access feasibility

### Test 3: DOM Structure Analysis and Selector Testing
- Tests multiple selector strategies
- Identifies stable vs dynamic selectors
- Analyzes event card HTML structure
- Documents element attributes and classes
- Evaluates selector reliability

**Key Findings:**
- Optimal selectors for event cards
- Data attribute availability
- HTML structure patterns
- Shadow DOM usage (if any)

### Test 4: Dynamic Content Loading (Scroll/Pagination)
- Tests infinite scroll behavior
- Identifies pagination mechanisms
- Measures lazy loading patterns
- Detects "Load More" buttons
- Analyzes URL state changes

**Key Findings:**
- Scroll triggers and thresholds
- Pagination strategy
- Total content availability
- URL-based navigation

### Test 5: Data Extraction and Validation
- Extracts sample event data
- Tests data field completeness
- Validates edge cases
- Checks image accessibility
- Analyzes date/time formats

**Key Findings:**
- Available data fields
- Data completeness percentages
- Field consistency
- Parsing complexity

### Test 6: Anti-bot Detection Checks
- Checks for WebDriver detection
- Identifies CAPTCHA presence
- Tests for protection services (Cloudflare, etc.)
- Evaluates rate limiting
- Analyzes fingerprinting techniques

**Key Findings:**
- Bot detection methods
- Required evasion techniques
- Rate limit thresholds
- CAPTCHA triggers

## Results

All test results are saved to the `./results` directory:

```
results/
├── luma-probe-results.json       # Detailed JSON results for Luma
├── sola-probe-results.json       # Detailed JSON results for Sola
└── screenshots/                  # Screenshots at various load stages
    ├── luma-dom-loaded-*.png
    ├── luma-fully-loaded-*.png
    ├── sola-dom-loaded-*.png
    └── sola-fully-loaded-*.png
```

### Result Structure

Each JSON result file contains:
```json
{
  "platform": "Luma|Sola.day",
  "url": "...",
  "timestamp": "2025-10-12T...",
  "tests": {
    "test1_pageLoadRendering": { ... },
    "test2_networkInspection": { ... },
    "test3_domStructure": { ... },
    "test4_dynamicContent": { ... },
    "test5_dataExtraction": { ... },
    "test6_antibotDetection": { ... }
  }
}
```

## Configuration

### Browser Settings
Tests run with:
- Browser: Chromium (headless: false by default)
- Viewport: 1920x1080
- User Agent: Chrome 131 on macOS

To run headless, modify the launch options in the test files:
```javascript
const browser = await chromium.launch({ headless: true });
```

### Timeouts
- Page navigation: 30s default
- Network idle: 10s
- Element visibility: 5s

## Next Steps

After running these probes, use the results to:

1. **Choose Scraping Strategy**
   - If APIs are available and accessible → Use direct API calls
   - If APIs are protected → Use Playwright with API interception
   - If no APIs → Use DOM scraping with identified selectors

2. **Implement Evasion Techniques**
   - Based on Test 6 findings
   - Add stealth plugins if needed
   - Configure proxies for rate limit handling
   - Implement human-like delays

3. **Build Data Pipeline**
   - Use selectors from Test 3
   - Handle pagination from Test 4
   - Parse data formats from Test 5
   - Implement error handling for edge cases

4. **Monitor and Maintain**
   - Re-run probes periodically to detect changes
   - Update selectors as platforms evolve
   - Adjust to new anti-bot measures

## Best Practices

1. **Always check robots.txt and ToS** before scraping
2. **Respect rate limits** to avoid overloading servers
3. **Use official APIs** when available
4. **Implement retry logic** for transient failures
5. **Cache results** to minimize redundant requests
6. **Monitor for blocking** and adjust techniques
7. **Handle data responsibly** per privacy regulations

## Troubleshooting

### Browser doesn't launch
```bash
npx playwright install chromium --force
```

### Tests timeout
Increase timeout values or check internet connection

### No events extracted
Platform may have changed structure - inspect screenshots and DOM results

### Rate limited
Add delays between requests or use proxies

## Contributing

When adding new tests:
1. Add test function to respective probe file
2. Update test numbering and documentation
3. Add result validation
4. Update README with findings

## License

MIT
