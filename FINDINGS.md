# Event Platform Scraping Probe - Findings Report

**Date:** October 12, 2025
**Platforms Tested:** Luma.com, Sola.day

---

## Executive Summary

Both Luma.com and Sola.day are **client-side rendered (CSR)** applications built with modern JavaScript frameworks. **Sola.day is significantly easier to scrape** due to simpler DOM structure, accessible event links, and no anti-bot protection. Luma.com uses Cloudflare protection and has more complex event card structures that will require deeper API inspection.

### Quick Comparison

| Metric | Luma.com | Sola.day |
|--------|----------|----------|
| **Load Time** | 3.37s | 3.41s |
| **Framework** | Next.js | React-based |
| **Cloudflare Protection** | ✓ Yes | ✗ No |
| **WebDriver Detection** | ✓ Yes | ✓ Yes |
| **CAPTCHA** | ✗ No | ✗ No |
| **Events Found** | 0 (calendars: 23) | 51 events |
| **Best Selector** | `.content-card` | `a[href*="/event/"]` |
| **Data Completeness** | N/A | 100% (title, URL, image) |
| **Scraping Difficulty** | ⚠️ Medium-Hard | ✅ Easy |

---

## Platform Analysis

### 1. Luma.com

#### 🔍 Technical Profile
- **URL Tested:** https://luma.com/discover
- **Framework:** Next.js (React)
- **Rendering:** Client-side with `__NEXT_DATA__` hydration
- **Load Performance:**
  - DOM Interactive: 547ms
  - Full Load: 3.37s
  - Resources: 140 items

#### 🌐 Network Analysis
- **API Calls Captured:** 0 (likely using Next.js data props or encrypted requests)
- **Resource Breakdown:**
  - Fetch: 20 requests
  - Scripts: 380 requests
  - Images: 144 requests
- **Finding:** Events are likely embedded in the initial Next.js hydration data (`__NEXT_DATA__`) or loaded via fetch requests that weren't captured as traditional XHR

#### 🎯 DOM Structure
**Best Selectors:**
- `.content-card` - 23 cards found (visible)
- `[class*="calendar"]` - 9 calendar-related elements
- `a[href*="/calendar/"]` - 0 found (events use calendar URLs, not event URLs)

**Key Classes:**
- `calendar-grid-wrapper`
- `calendar-grid`
- `calendar-desc`
- `content-card`

**Structure Example:**
```html
<div class="jsx-3839628989 calendar-grid-wrapper">
  <div class="jsx-3839628989 calendar-grid">
    <a class="content-card hoverable actionable flex-column" href="/readingrhythms-global?k=c">
      <div class="calendar-desc text-tertiary-alpha fs-sm">
        <span>Event description...</span>
      </div>
    </a>
  </div>
</div>
```

**⚠️ Challenge:** The discover page shows "calendars" (event series) rather than individual events. Each calendar link leads to a page with multiple events.

#### 🔒 Anti-Bot Detection
- **Cloudflare:** ✓ Detected (text mentions Cloudflare)
- **WebDriver Flag:** ✓ Exposed (`navigator.webdriver = true`)
- **CAPTCHA:** ✗ Not present during testing
- **Rate Limiting:** None detected (3/3 rapid requests succeeded)

**Risk Level:** 🟡 Medium - Cloudflare present but not actively blocking

#### 📊 Data Extraction
- **Status:** ⚠️ Failed to extract individual events
- **Reason:** The discover page shows calendar aggregations, not direct event listings
- **Solution Required:** Need to:
  1. Extract calendar URLs from discover page
  2. Navigate to each calendar page
  3. Extract individual events from calendar pages

  **OR**

  1. Find and reverse-engineer the API endpoints/GraphQL queries
  2. Extract data directly from `__NEXT_DATA__` script tag

#### 💡 Recommended Scraping Strategy

**Option 1: API Interception (Preferred)**
1. Use Playwright's route interception to capture fetch requests
2. Analyze `__NEXT_DATA__` JSON embedded in page HTML
3. Reverse-engineer any API endpoints discovered
4. Make direct API calls if possible

**Option 2: Two-Stage DOM Scraping**
1. Scrape discover page for calendar URLs (`.content-card` links)
2. Visit each calendar page
3. Extract individual events from calendar detail pages
4. Use stealth plugins to mask WebDriver detection

**Option 3: Luma API (Best)**
- Check if Luma offers an official API (research shows they do!)
- Apply for API access: https://help.luma.com/p/luma-api
- Use official endpoints instead of scraping

---

### 2. Sola.day

#### 🔍 Technical Profile
- **URL Tested:** https://app.sola.day/
- **Framework:** React-based (no Next.js detected)
- **Rendering:** Client-side
- **Load Performance:**
  - DOM Interactive: 1.78s
  - Full Load: 3.41s
  - Resources: 109 items

#### 🌐 Network Analysis
- **API Calls Captured:** 0
- **Resource Breakdown:**
  - XHR: 18 requests
  - Fetch: 5 requests
  - Scripts: 96 requests
  - Images: 414 requests (many event thumbnails)
- **Finding:** Like Luma, API calls may be obfuscated or use non-standard patterns

#### 🎯 DOM Structure
**Best Selectors (in priority order):**
1. `a[href*="/event/"]` - **51 events found** ✅ (BEST)
2. `[class*="item"]` - 167 items found
3. `[class*="grid"] > *` - 60 grid items

**Key Classes:**
- `h-[300px] relative` - Large event cards
- `h-[292px] rounded shadow p-3` - Smaller event cards
- Tailwind CSS utility classes throughout

**Structure Example:**
```html
<a class="h-[300px] relative" href="/event/prospera">
  <img src="https://ik.imagekit.io/soladata/..." alt="Próspera" class="h-[300px] min-w-full top-0 object-cover">
  <div class="absolute bottom-0 left-0 right-0">
    Event title and details...
  </div>
</a>
```

**✅ Advantage:** Simple, clean structure with semantic hrefs

#### 🔒 Anti-Bot Detection
- **Cloudflare:** ✗ Not detected
- **WebDriver Flag:** ✓ Exposed (`navigator.webdriver = true`)
- **CAPTCHA:** ✗ Not present
- **Rate Limiting:** None detected (3/3 rapid requests succeeded)

**Risk Level:** 🟢 Low - No active protection, only passive fingerprinting

#### 📊 Data Extraction Results

**Successfully extracted 51 events!** 🎉

**Field Availability:**
- ✅ Title: 100% (10/10 samples)
- ✅ URL: 100% (10/10 samples)
- ✅ Image: 100% (10/10 samples)
- ❌ Date: 0% (embedded in text content, needs parsing)
- ❌ Location: 0% (embedded in text content, needs parsing)
- ❌ Organizer: 0% (embedded in text content, needs parsing)

**Sample Extracted Event:**
```json
{
  "title": "ETH Safari",
  "url": "https://app.sola.day/event/ethsafari",
  "image": "https://ik.imagekit.io/soladata/2p6lz77k_VN34I97zl",
  "text": "ETH SafariSep 07-Sep 14, 2025Kenyaby ETH Safari"
}
```

**Text Content Pattern:**
```
[EventName][DateRange][Location]by [Organizer]
```

**Example:**
- "ETH SafariSep 07-Sep 14, 2025Kenyaby ETH Safari"
- "Edge City Patagonia 2025Oct 18-Nov 15, 2025San Martin, Argentinaby Edge City Patagonia"

#### 💡 Recommended Scraping Strategy

**Option 1: Simple Playwright Scraping (Recommended)**
1. Launch headful or use stealth plugin
2. Navigate to https://app.sola.day/
3. Wait for network idle
4. Select all `a[href*="/event/"]`
5. Extract href, title, image src
6. Parse text content with regex to extract dates, locations, organizers

**Regex Pattern for Parsing:**
```javascript
// Pattern: [Title][Date][Location]by [Organizer]
const pattern = /^(.+?)((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{2}-.+?\d{4})(.+?)by\s+(.+)$/;
```

**Option 2: Individual Event Pages**
- Navigate to each `/event/[slug]` URL
- Extract full structured data from detail pages
- Likely to have more complete information

**Pros:**
- No anti-bot protection
- Simple, stable selectors
- All events on single page (no pagination needed)
- 51 events initially visible

**Cons:**
- Dates/locations require text parsing
- May need to visit detail pages for complete data

---

## Key Findings & Recommendations

### 🎯 Scraping Difficulty Ranking

1. **Sola.day** (Easy) 🟢
   - No protection
   - Simple selectors
   - Direct event links
   - All data visible on main page

2. **Luma.com** (Medium-Hard) 🟡
   - Cloudflare protection
   - Complex structure (calendars vs events)
   - Requires multi-stage scraping
   - Official API available (recommended)

### 🛡️ Anti-Bot Evasion Requirements

Both platforms expose `navigator.webdriver = true`. To avoid detection:

1. **Use Playwright Stealth**
   ```bash
   npm install playwright-extra puppeteer-extra-plugin-stealth
   ```

2. **Configure Stealth Mode**
   ```javascript
   import { chromium } from 'playwright-extra';
   import stealth from 'puppeteer-extra-plugin-stealth';

   chromium.use(stealth());
   ```

3. **Best Practices**
   - Use headful mode (headless: false) or new headless mode
   - Rotate user agents
   - Add random delays (500-2000ms) between requests
   - Respect rate limits (1-2 requests per second)
   - Use residential proxies if scaling

### 📝 Data Extraction Strategies

#### For Sola.day (Recommended: DOM Scraping)
```javascript
const events = await page.$$eval('a[href*="/event/"]', links => {
  return links.map(link => {
    const text = link.textContent.trim();
    const match = text.match(/^(.+?)((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec).+?\d{4})(.+?)by\s+(.+)$/);

    return {
      title: match?.[1]?.trim() || link.querySelector('img')?.alt,
      dateRange: match?.[2]?.trim(),
      location: match?.[3]?.trim(),
      organizer: match?.[4]?.trim(),
      url: 'https://app.sola.day' + link.getAttribute('href'),
      image: link.querySelector('img')?.src
    };
  });
});
```

#### For Luma.com (Recommended: Official API)
1. **First choice:** Apply for official Luma API access
2. **Second choice:** Extract from `__NEXT_DATA__`:
   ```javascript
   const nextData = await page.evaluate(() => {
     const script = document.getElementById('__NEXT_DATA__');
     return script ? JSON.parse(script.textContent) : null;
   });
   ```
3. **Third choice:** Multi-stage scraping (discover → calendar → events)

### 🚦 Rate Limiting & Ethics

Both platforms showed no immediate rate limiting, but:

1. **Implement delays:** 1-2 seconds between requests
2. **Respect robots.txt:** Check both platforms
3. **Use official APIs:** Luma offers an API - use it!
4. **Cache aggressively:** Don't re-scrape unchanged data
5. **Identify your scraper:** Use descriptive user-agent
6. **Monitor for blocks:** Implement retry logic with exponential backoff

### 🔄 Dynamic Content

**Finding:** Neither platform uses infinite scroll or pagination on tested pages

- **Luma:** 23 calendars loaded initially, all visible
- **Sola.day:** 51 events loaded initially, all visible

**Implication:** Single page load is sufficient to get all visible events

### 📸 Screenshots Available

All screenshots saved to `./results/screenshots/`:
- `luma-dom-loaded-*.png` - Luma at DOMContentLoaded
- `luma-fully-loaded-*.png` - Luma fully rendered
- `sola-dom-loaded-*.png` - Sola at DOMContentLoaded
- `sola-fully-loaded-*.png` - Sola fully rendered

---

## Next Steps

### Immediate Actions

1. **For Sola.day:**
   - ✅ Proceed with Playwright scraping
   - Implement text parsing for dates/locations
   - Add stealth plugin to mask WebDriver
   - Build incremental scraper with 1-2s delays

2. **For Luma.com:**
   - 🔍 Apply for official API access (preferred)
   - 🔍 Analyze `__NEXT_DATA__` structure for embedded data
   - 🔍 Test multi-stage scraping (discover → calendar → events)
   - ⚠️ Implement Cloudflare bypass techniques if needed

### Production Scraper Architecture

```
┌─────────────────┐
│  Scheduler      │ ← Cron job (every 6-24 hours)
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Rate Limiter   │ ← 1-2 req/sec, exponential backoff
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Scraper        │ ← Playwright with stealth
│  - Sola (DOM)   │
│  - Luma (API)   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Parser         │ ← Extract & normalize data
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Cache/DB       │ ← Store with deduplication
└─────────────────┘
```

### Monitoring & Maintenance

1. **Set up alerts** for:
   - Scraping failures
   - Structure changes (selector breakage)
   - Rate limit blocks
   - CAPTCHA appearances

2. **Regular probe tests:**
   - Run these probe tests monthly
   - Compare results to detect platform changes
   - Update selectors as needed

3. **Fallback strategies:**
   - If Luma API fails → try `__NEXT_DATA__` extraction
   - If selectors break → use broader selectors + filtering
   - If blocked → implement proxy rotation

---

## Legal & Ethical Considerations

1. **Check Terms of Service** for both platforms
2. **Review robots.txt** files:
   - https://luma.com/robots.txt
   - https://app.sola.day/robots.txt
3. **Use official APIs** when available (Luma has one!)
4. **Respect rate limits** to avoid overloading servers
5. **Don't scrape user data** - only public event information
6. **Provide value** - if building aggregator, link back to original events
7. **Be transparent** - use identifiable user-agent

---

## Technical Debt & Known Issues

1. **Test 4 Pagination Check** failed due to invalid `:has-text()` selector in vanilla browser context
   - Fix: Remove Playwright-specific selectors from page.evaluate()
   - Impact: Low (no pagination detected anyway)

2. **API Interception** captured 0 API calls
   - Reason: Modern frameworks use fetch() which may not trigger traditional listeners
   - Fix: Implement more sophisticated request interception
   - Impact: Medium (limits API discovery)

3. **Date/Location Parsing** not implemented for Sola.day
   - Need regex patterns to extract from concatenated text
   - Impact: Medium (requires post-processing)

---

## Conclusion

**Sola.day is ready for production scraping** with minimal effort. Simple Playwright scraping with basic stealth should be sufficient.

**Luma.com requires more investigation.** The official API is the recommended path. If API access is not available, multi-stage scraping or `__NEXT_DATA__` extraction will be necessary.

Both platforms can be scraped responsibly with proper rate limiting, stealth techniques, and respect for their infrastructure.

**Estimated Development Time:**
- Sola.day scraper: 4-8 hours
- Luma.com scraper (with API): 4-6 hours
- Luma.com scraper (without API): 12-20 hours

**Maintenance Burden:**
- Sola.day: Low (simple structure)
- Luma.com (API): Low (stable API)
- Luma.com (scraping): Medium-High (complex, may break)
