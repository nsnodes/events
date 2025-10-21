# Error Handling

This document describes the error handling strategy implemented across the event aggregation platform.

## Overview

The platform now includes comprehensive error handling with automatic retries for transient failures:

- **Retry Utility**: Generic retry logic with exponential backoff
- **Error Classification**: Distinguishes permanent vs transient errors
- **Intelligent Caching**: Only caches permanent failures, retries transient ones
- **Partial Success**: Batch operations continue even if individual batches fail

## Components

### 1. Retry Utility (`packages/core/retry.js`)

Generic retry functionality with exponential backoff.

#### Error Classes

```javascript
import { PermanentError, TransientError } from './retry.js'

// Permanent errors (don't retry)
throw new PermanentError('Not found')  // 404, validation errors, etc.

// Transient errors (will retry)
throw new TransientError('Network timeout')  // Timeouts, rate limits, etc.
```

#### Usage

```javascript
import { retry } from './retry.js'

const result = await retry(
  async () => {
    return await someAPICall()
  },
  {
    maxAttempts: 3,
    initialDelay: 1000,    // Start with 1s delay
    maxDelay: 30000,       // Cap at 30s
    backoffMultiplier: 2,  // Double each time: 1s, 2s, 4s...
    onRetry: (error, attempt, delay) => {
      console.log(`Retry ${attempt} after ${delay}ms: ${error.message}`)
    }
  }
)
```

#### Default Retry Logic

The retry utility automatically recognizes common error patterns:

**Transient (will retry):**
- Network timeouts
- Connection resets (ECONNRESET, ECONNREFUSED)
- Rate limiting (429, "rate limit")
- Service unavailable (503, 502, 504)

**Permanent (won't retry):**
- Not found (404)
- Unauthorized (401, 403)
- Invalid input/validation errors
- Malformed requests

### 2. Geocoding Service (`packages/core/geocoding.js`)

Enhanced with retry logic and better error handling.

#### Features

- **3 automatic retries** for transient failures
- **Exponential backoff** starting at 1s
- **Distinguishes API failures from "no data found"**
- **Only caches permanent failures** (API failures aren't cached)
- **Rate limiting** preserved (8 req/sec)

#### Behavior

```javascript
const result = await reverseGeocode(lat, lng)

// Returns:
// { city: 'London', country: 'United Kingdom', timezone: 'Europe/London' }

// On transient failure (network error):
// - Retries up to 3 times with backoff
// - If all retries fail: returns null but DOESN'T cache (will try again next time)

// On permanent failure (no data found):
// - Returns null and caches it (won't retry same coords)
```

#### Error Logging

```
[geocoding] Retry 1 for 51.5,-0.1 after 1000ms: Rate limited
[geocoding] Retry 2 for 51.5,-0.1 after 2000ms: Rate limited
✓ Success on retry 3
```

### 3. Database Service (`packages/core/database.ts`)

Supabase operations with retry logic and partial failure support.

#### Features

- **3 automatic retries** for connection/timeout errors
- **Batch operations continue** even if individual batches fail
- **Detailed error reporting** for failed batches
- **Preserves first_seen** timestamps correctly

#### Batch Error Handling

```javascript
await db.upsertEvents(1500 events)  // Split into 3 batches of 500

// If batch 2 fails after retries:
// - Batches 1 and 3 still succeed
// - Error thrown with details: "Failed to upsert 1 batch(es): 2"
// - 1000 events saved successfully
```

#### Error Classification

- **Transient (retries):**
  - Connection timeouts
  - Network errors
  - Temporary Supabase issues

- **Permanent (fails immediately):**
  - Constraint violations (23xxx errors)
  - Schema mismatches
  - Invalid data

## Testing

### Run Tests

```bash
# Retry utility tests
node tests/retry.test.js

# Error handling integration tests
node tests/error-handling.test.js

# All tests
node tests/retry.test.js && node tests/error-handling.test.js
```

### Test Coverage

- ✅ Retry logic (25 tests)
- ✅ Exponential backoff timing
- ✅ Permanent vs transient error classification
- ✅ Geocoding with invalid input
- ✅ Module integration

## Best Practices

### When to Use Retry

```javascript
// ✅ Good: External API calls
await retry(() => mapboxAPI.geocode(coords))

// ✅ Good: Database operations
await retry(() => db.upsert(events))

// ❌ Bad: Pure computation (no I/O)
await retry(() => calculateFingerprint(event))  // Don't retry this!
```

### Custom Error Classification

```javascript
await retry(
  async () => {
    const response = await fetch(url)
    if (response.status === 404) {
      throw new PermanentError('Resource not found')
    }
    if (response.status >= 500) {
      throw new TransientError('Server error')
    }
    return response
  },
  { maxAttempts: 5 }
)
```

### Logging Retries

Always provide an `onRetry` callback for visibility:

```javascript
await retry(
  () => operation(),
  {
    onRetry: (error, attempt, delay) => {
      console.warn(`[my-service] Retry ${attempt}: ${error.message}`)
    }
  }
)
```

## Migration Guide

### Before (No Retries)

```javascript
try {
  const result = await geocoder.reverse({ lat, lon: lng })
  return result
} catch (error) {
  console.error('Geocoding failed:', error.message)
  return null
}
```

### After (With Retries)

```javascript
try {
  const result = await retry(
    async () => {
      const data = await geocoder.reverse({ lat, lon: lng })
      if (!data) {
        throw new PermanentError('No data found')
      }
      return data
    },
    {
      maxAttempts: 3,
      initialDelay: 1000,
      onRetry: (error, attempt) => {
        console.warn(`Retry ${attempt}: ${error.message}`)
      }
    }
  )
  return result
} catch (error) {
  if (error instanceof PermanentError) {
    // Cache this - we won't get different results
    return null
  }
  // Transient - don't cache, try again later
  console.error('All retries failed:', error.message)
  return null
}
```

## Monitoring

### Key Metrics to Track

- **Retry success rate**: How often do retries succeed?
- **Average retries per operation**: Are we hitting rate limits?
- **Permanent vs transient errors**: What's failing permanently?
- **Failed batches**: Which database batches consistently fail?

### Log Patterns

```
# Successful retry
[geocoding] Retry 2 for 51.5,-0.1 after 2000ms: Network timeout

# Permanent error (no spam)
[geocoding] Permanent error for 0,0: No geocoding data found

# Transient failure (all retries exhausted)
[geocoding] All retries failed for 51.5,-0.1: Rate limit exceeded

# Database batch failure
[database] Batch 2/3 failed after retries: Connection timeout
```

## Future Improvements

Potential enhancements for error handling:

1. **Circuit Breaker**: Stop trying after N consecutive failures
2. **Metrics Collection**: Track retry rates and failure patterns
3. **Alerting**: Notify when error rates exceed thresholds
4. **Jitter**: Add randomness to backoff to prevent thundering herd
5. **Retry Budget**: Limit total retries across all operations
