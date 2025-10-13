# Event Sync Scheduling Strategy

## Overview

GitHub Actions (public repo = unlimited minutes) with three different schedules based on data change frequency.

## Schedule

### Luma

| Task | Method | Frequency | Duration | Cron |
|------|--------|-----------|----------|------|
| City discovery | Playwright | Daily (midnight) | ~60s | `0 0 * * *` |
| iCal URL extraction | Playwright | Weekly (Sunday) | ~90s | `0 0 * * 0` |
| Event fetching | HTTP | Every 10 minutes | ~15s | `*/10 * * * *` |

### Sola.day

| Task | Method | Frequency | Duration | Cron |
|------|--------|-----------|----------|------|
| Event scraping | Playwright | Every 10 minutes | ~30-60s | `*/10 * * * *` |

## Monthly Compute Estimates

**Luma:**
- Cities: 60s × 30 days = 30 minutes
- iCal URLs: 90s × 4 weeks = 6 minutes
- Events: 15s × 4,320 runs = 18 hours
- **Subtotal: ~18.6 hours**

**Sola.day:**
- Events: 60s × 4,320 runs = 72 hours
- **Subtotal: ~72 hours**

**Total: ~90 hours/month** (free on public repos)

## Workflow Structure

Three separate workflows for independent scheduling:

1. `.github/workflows/luma-cities.yml` - Daily city discovery
2. `.github/workflows/luma-ical.yml` - Weekly iCal URL updates
3. `.github/workflows/sync-events.yml` - 10-minute event sync (all sources)

## Optimization Notes

- Use Playwright browser caching between runs (saves ~20s)
- Only install `chromium` (smallest browser)
- Run event sync workflows concurrently (Luma HTTP + Sola.day Playwright)
- Consider 15-30 minute intervals if 10 minutes proves too aggressive

## Future Considerations

- If more sources added: evaluate if shared scheduling makes sense
- Monitor GitHub Actions usage dashboard (though unlimited for public repos)
- Add alerting if sync jobs fail consistently
