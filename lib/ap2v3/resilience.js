/**
 * BRIDGE AI OS — AP2-v3 Resilience Layer
 *
 * Retry, fallback, timeout, and circuit-breaker primitives for reliable
 * agent execution. Every wrapper returns both the result and metadata
 * about retries/fallbacks used, so callers can feed that into contract.js meta.
 */

'use strict';

// ── withRetry ──────────────────────────────────────────────────────────────

/**
 * Retry an async function with exponential backoff.
 *
 * @param {Function} fn            — async function to execute
 * @param {number}   [maxRetries=3]  — maximum retry attempts (0 = no retries)
 * @param {number}   [backoffMs=1000] — base backoff in milliseconds (doubles each retry)
 * @returns {Promise<{ result: *, retries: number, errors: string[] }>}
 */
async function withRetry(fn, maxRetries = 3, backoffMs = 1000) {
  const errors = [];
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await fn();
      return { result, retries: attempt, errors };
    } catch (e) {
      lastError = e;
      errors.push(e.message || String(e));

      if (attempt < maxRetries) {
        const delay = backoffMs * Math.pow(2, attempt);
        await sleep(delay);
      }
    }
  }

  throw Object.assign(
    new Error('withRetry exhausted after ' + (maxRetries + 1) + ' attempts: ' + lastError.message),
    { retries: maxRetries, errors }
  );
}

// ── withFallback ───────────────────────────────────────────────────────────

/**
 * Try a primary function; if it throws, invoke a fallback.
 *
 * @param {Function} primaryFn   — primary async function
 * @param {Function} fallbackFn  — fallback async function (receives the primary error)
 * @returns {Promise<{ result: *, usedFallback: boolean, primaryError: string|null }>}
 */
async function withFallback(primaryFn, fallbackFn) {
  try {
    const result = await primaryFn();
    return { result, usedFallback: false, primaryError: null };
  } catch (primaryError) {
    try {
      const result = await fallbackFn(primaryError);
      return { result, usedFallback: true, primaryError: primaryError.message || String(primaryError) };
    } catch (fallbackError) {
      throw Object.assign(
        new Error('Both primary and fallback failed. Primary: ' + primaryError.message + ' | Fallback: ' + fallbackError.message),
        { primaryError: primaryError.message, fallbackError: fallbackError.message, usedFallback: true }
      );
    }
  }
}

// ── withTimeout ────────────────────────────────────────────────────────────

/**
 * Wrap an async function in a timeout.
 *
 * @param {Function} fn           — async function to execute
 * @param {number}   [timeoutMs=15000] — timeout in milliseconds
 * @returns {Promise<{ result: *, timedOut: boolean, elapsed_ms: number }>}
 */
async function withTimeout(fn, timeoutMs = 15000) {
  const start = Date.now();

  return new Promise(function (resolve, reject) {
    let settled = false;

    const timer = setTimeout(function () {
      if (!settled) {
        settled = true;
        reject(Object.assign(
          new Error('withTimeout: operation timed out after ' + timeoutMs + 'ms'),
          { timedOut: true, elapsed_ms: timeoutMs }
        ));
      }
    }, timeoutMs);

    Promise.resolve()
      .then(function () { return fn(); })
      .then(function (result) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve({ result, timedOut: false, elapsed_ms: Date.now() - start });
        }
      })
      .catch(function (err) {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(err);
        }
      });
  });
}

// ── withCircuitBreaker ─────────────────────────────────────────────────────

/**
 * Create a circuit breaker around an async function.
 *
 * States:
 *   CLOSED  — normal operation, failures counted
 *   OPEN    — all calls rejected immediately (fast-fail)
 *   HALF_OPEN — one probe call allowed; success resets, failure re-opens
 *
 * @param {Function} fn               — async function to protect
 * @param {number}   [threshold=5]    — consecutive failures before opening
 * @param {number}   [resetMs=60000]  — time before OPEN transitions to HALF_OPEN
 * @returns {{ execute: Function, getState: Function, reset: Function }}
 */
function withCircuitBreaker(fn, threshold = 5, resetMs = 60000) {
  let state = 'CLOSED';     // CLOSED | OPEN | HALF_OPEN
  let failureCount = 0;
  let lastFailureTime = 0;
  let successCount = 0;

  /**
   * Execute the wrapped function through the circuit breaker.
   * @returns {Promise<{ result: *, circuitState: string, failures: number }>}
   */
  async function execute() {
    // Check if circuit should transition from OPEN -> HALF_OPEN
    if (state === 'OPEN') {
      if (Date.now() - lastFailureTime >= resetMs) {
        state = 'HALF_OPEN';
      } else {
        throw Object.assign(
          new Error('Circuit breaker is OPEN — rejecting call (failures: ' + failureCount + ')'),
          { circuitState: 'OPEN', failures: failureCount }
        );
      }
    }

    try {
      const result = await fn();

      // Success: reset counters
      if (state === 'HALF_OPEN') {
        state = 'CLOSED';
      }
      failureCount = 0;
      successCount++;

      return { result, circuitState: state, failures: 0 };
    } catch (e) {
      failureCount++;
      lastFailureTime = Date.now();

      if (state === 'HALF_OPEN' || failureCount >= threshold) {
        state = 'OPEN';
      }

      throw Object.assign(e, { circuitState: state, failures: failureCount });
    }
  }

  /**
   * Get the current state of the circuit breaker.
   */
  function getState() {
    // Auto-transition check
    if (state === 'OPEN' && Date.now() - lastFailureTime >= resetMs) {
      state = 'HALF_OPEN';
    }
    return {
      state,
      failureCount,
      successCount,
      lastFailureTime: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
    };
  }

  /**
   * Reset the circuit breaker to CLOSED state.
   */
  function reset() {
    state = 'CLOSED';
    failureCount = 0;
    successCount = 0;
    lastFailureTime = 0;
  }

  return { execute, getState, reset };
}

// ── Utility ────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(function (resolve) { setTimeout(resolve, ms); });
}

module.exports = {
  withRetry,
  withFallback,
  withTimeout,
  withCircuitBreaker,
};
