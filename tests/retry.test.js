#!/usr/bin/env node
/**
 * Tests for retry utility
 */

import { retry, retryable, PermanentError, TransientError, categorizeError } from '../packages/core/retry.js';

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    console.error(`  ❌ ${message}`);
    testsFailed++;
    throw new Error(message);
  } else {
    console.log(`  ✓ ${message}`);
    testsPassed++;
  }
}

async function test(name, fn) {
  console.log(`\n${name}:`);
  try {
    await fn();
  } catch (error) {
    console.error(`  Test failed: ${error.message}`);
  }
}

// Test 1: Success on first attempt
await test('Success on first attempt', async () => {
  let attempts = 0;
  const result = await retry(async () => {
    attempts++;
    return 'success';
  });

  assert(result === 'success', 'Should return the result');
  assert(attempts === 1, 'Should only attempt once');
});

// Test 2: Success after retries
await test('Success after retries', async () => {
  let attempts = 0;
  const result = await retry(async () => {
    attempts++;
    if (attempts < 3) {
      throw new TransientError('Network timeout');
    }
    return 'success';
  }, { maxAttempts: 5, initialDelay: 10 });

  assert(result === 'success', 'Should eventually succeed');
  assert(attempts === 3, 'Should take 3 attempts');
});

// Test 3: Fail with permanent error (no retry)
await test('Permanent error stops immediately', async () => {
  let attempts = 0;
  try {
    await retry(async () => {
      attempts++;
      throw new PermanentError('Not found');
    }, { maxAttempts: 5, initialDelay: 10 });
    assert(false, 'Should have thrown error');
  } catch (error) {
    assert(error instanceof PermanentError, 'Should throw permanent error');
    assert(attempts === 1, 'Should only attempt once for permanent errors');
  }
});

// Test 4: Exhausts all retries
await test('Exhausts all retries', async () => {
  let attempts = 0;
  try {
    await retry(async () => {
      attempts++;
      throw new TransientError('Temporary failure');
    }, { maxAttempts: 3, initialDelay: 10 });
    assert(false, 'Should have thrown error');
  } catch (error) {
    assert(error instanceof TransientError, 'Should throw the last error');
    assert(attempts === 3, 'Should attempt maxAttempts times');
  }
});

// Test 5: Exponential backoff
await test('Exponential backoff delays', async () => {
  const delays = [];
  let attempts = 0;

  try {
    await retry(async () => {
      attempts++;
      throw new TransientError('Fail');
    }, {
      maxAttempts: 4,
      initialDelay: 100,
      backoffMultiplier: 2,
      onRetry: (error, attempt, delay) => {
        delays.push(delay);
      }
    });
  } catch (error) {
    // Expected to fail
  }

  assert(delays.length === 3, 'Should have 3 delays (4 attempts = 3 retries)');
  assert(delays[0] === 100, 'First delay should be 100ms');
  assert(delays[1] === 200, 'Second delay should be 200ms');
  assert(delays[2] === 400, 'Third delay should be 400ms');
});

// Test 6: Max delay cap
await test('Max delay cap', async () => {
  const delays = [];

  try {
    await retry(async () => {
      throw new TransientError('Fail');
    }, {
      maxAttempts: 5,
      initialDelay: 1000,
      maxDelay: 2000,
      backoffMultiplier: 3,
      onRetry: (error, attempt, delay) => {
        delays.push(delay);
      }
    });
  } catch (error) {
    // Expected
  }

  assert(delays[0] === 1000, 'First delay: 1000ms');
  assert(delays[1] === 2000, 'Second delay capped at 2000ms (would be 3000ms)');
  assert(delays[2] === 2000, 'Third delay capped at 2000ms (would be 9000ms)');
});

// Test 7: Custom shouldRetry function
await test('Custom shouldRetry function', async () => {
  let attempts = 0;

  try {
    await retry(async () => {
      attempts++;
      throw new Error('Special error');
    }, {
      maxAttempts: 5,
      initialDelay: 10,
      shouldRetry: (error) => error.message === 'Special error'
    });
  } catch (error) {
    // Expected
  }

  assert(attempts === 5, 'Should retry based on custom logic');
});

// Test 8: retryable function wrapper
await test('retryable function wrapper', async () => {
  let attempts = 0;

  const fetchData = retryable(async (value) => {
    attempts++;
    if (attempts < 2) {
      throw new TransientError('Fail');
    }
    return `Result: ${value}`;
  }, { maxAttempts: 3, initialDelay: 10 });

  const result = await fetchData('test');
  assert(result === 'Result: test', 'Should return result with arguments');
  assert(attempts === 2, 'Should retry once');
});

// Test 9: Error categorization
await test('Error categorization', () => {
  assert(
    categorizeError(new PermanentError('test')) === 'permanent',
    'PermanentError is permanent'
  );

  assert(
    categorizeError(new TransientError('test')) === 'transient',
    'TransientError is transient'
  );

  assert(
    categorizeError(new Error('404 not found')) === 'permanent',
    '404 errors are permanent'
  );

  assert(
    categorizeError(new Error('Rate limit exceeded')) === 'transient',
    'Rate limit errors are transient'
  );

  assert(
    categorizeError(new Error('ETIMEDOUT connection timeout')) === 'transient',
    'Timeout errors are transient'
  );

  assert(
    categorizeError(new Error('Invalid input')) === 'permanent',
    'Validation errors are permanent'
  );

  assert(
    categorizeError(new Error('Something weird')) === 'unknown',
    'Unknown errors return unknown'
  );
});

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed`);
console.log('='.repeat(50));

if (testsFailed > 0) {
  process.exit(1);
} else {
  console.log('\n✅ All retry utility tests passed!\n');
  process.exit(0);
}
