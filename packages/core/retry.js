/**
 * Generic retry utility with exponential backoff
 *
 * Provides configurable retry logic for operations that may fail transiently.
 * Distinguishes between permanent errors (don't retry) and transient errors.
 */

/**
 * Error categories for retry logic
 */
export class PermanentError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'PermanentError';
    this.cause = cause;
  }
}

export class TransientError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'TransientError';
    this.cause = cause;
  }
}

/**
 * Retry configuration
 * @typedef {Object} RetryOptions
 * @property {number} maxAttempts - Maximum number of attempts (default: 3)
 * @property {number} initialDelay - Initial delay in ms (default: 1000)
 * @property {number} maxDelay - Maximum delay in ms (default: 30000)
 * @property {number} backoffMultiplier - Multiplier for exponential backoff (default: 2)
 * @property {Function} shouldRetry - Custom function to determine if error is retryable
 * @property {Function} onRetry - Callback called before each retry attempt
 */

/**
 * Default retry configuration
 */
const DEFAULT_OPTIONS = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  shouldRetry: (error) => {
    // Don't retry permanent errors
    if (error instanceof PermanentError) return false;

    // Always retry transient errors
    if (error instanceof TransientError) return true;

    // Retry common transient error patterns
    const message = error.message?.toLowerCase() || '';
    const transientPatterns = [
      'timeout',
      'econnreset',
      'econnrefused',
      'etimedout',
      'network',
      'rate limit',
      'too many requests',
      'service unavailable',
      '503',
      '429',
      '502',
      '504'
    ];

    return transientPatterns.some(pattern => message.includes(pattern));
  },
  onRetry: null
};

/**
 * Execute a function with retry logic
 *
 * @param {Function} fn - Async function to execute
 * @param {RetryOptions} options - Retry configuration
 * @returns {Promise<any>} Result of the function
 * @throws {Error} Last error if all attempts fail
 *
 * @example
 * const result = await retry(async () => {
 *   return await fetchData();
 * }, {
 *   maxAttempts: 5,
 *   initialDelay: 500,
 *   onRetry: (error, attempt) => console.log(`Retry ${attempt}: ${error.message}`)
 * });
 */
export async function retry(fn, options = {}) {
  const config = { ...DEFAULT_OPTIONS, ...options };
  let lastError;

  for (let attempt = 1; attempt <= config.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if it's not retryable
      if (!config.shouldRetry(error)) {
        throw error;
      }

      // Don't retry if this was the last attempt
      if (attempt === config.maxAttempts) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
        config.maxDelay
      );

      // Call retry callback if provided
      if (config.onRetry) {
        config.onRetry(error, attempt, delay);
      }

      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // All attempts failed
  throw lastError;
}

/**
 * Create a retryable version of an async function
 *
 * @param {Function} fn - Async function to wrap
 * @param {RetryOptions} options - Retry configuration
 * @returns {Function} Wrapped function with retry logic
 *
 * @example
 * const fetchWithRetry = retryable(fetchData, { maxAttempts: 5 });
 * const data = await fetchWithRetry(url);
 */
export function retryable(fn, options = {}) {
  return async function(...args) {
    return retry(() => fn(...args), options);
  };
}

/**
 * Determine if an error is likely permanent or transient
 *
 * @param {Error} error - Error to categorize
 * @returns {'permanent'|'transient'|'unknown'} Error category
 */
export function categorizeError(error) {
  if (error instanceof PermanentError) return 'permanent';
  if (error instanceof TransientError) return 'transient';

  const message = error.message?.toLowerCase() || '';

  // Permanent error patterns
  const permanentPatterns = [
    'not found',
    '404',
    'unauthorized',
    '401',
    'forbidden',
    '403',
    'invalid',
    'malformed',
    'parse error',
    'validation failed',
    'missing required'
  ];

  if (permanentPatterns.some(pattern => message.includes(pattern))) {
    return 'permanent';
  }

  // Transient error patterns
  const transientPatterns = [
    'timeout',
    'econnreset',
    'econnrefused',
    'etimedout',
    'network',
    'rate limit',
    'too many requests',
    'service unavailable',
    '503',
    '429',
    '502',
    '504'
  ];

  if (transientPatterns.some(pattern => message.includes(pattern))) {
    return 'transient';
  }

  return 'unknown';
}
