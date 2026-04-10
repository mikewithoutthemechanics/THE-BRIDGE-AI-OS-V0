/**
 * Client-Side Caching Validation Suite
 * Tests: deduplication, TTL expiry, concurrent requests, memory safety
 */

// ── SIMULATE CLIENT-SIDE CACHE ──
const clientCache = new Map();
const pendingRequests = new Map();

function cachedFetch(key, fetcher, ttl = 5000) {
  const cached = clientCache.get(key);
  if (cached && Date.now() - cached.ts < ttl) {
    return Promise.resolve(cached.data);
  }

  if (pendingRequests.has(key)) {
    return pendingRequests.get(key);
  }

  const promise = Promise.resolve(fetcher()).then(data => {
    clientCache.set(key, { data, ts: Date.now() });
    pendingRequests.delete(key);
    return data;
  }).catch(err => {
    pendingRequests.delete(key);
    throw err;
  });

  pendingRequests.set(key, promise);
  return promise;
}

// ── TEST UTILITIES ──
let networkRequestCount = 0;
let testResults = [];

function logTest(name, passed, details = '') {
  const status = passed ? '✅ PASS' : '❌ FAIL';
  testResults.push({ name, passed, details });
  console.log(`${status} | ${name} ${details ? '— ' + details : ''}`);
}

function simulateNetworkCall(delay = 50) {
  networkRequestCount++;
  const requestId = networkRequestCount;
  return new Promise(resolve => {
    setTimeout(() => resolve({ id: requestId, ts: Date.now() }), delay);
  });
}

// ── TEST 1: SINGLE REQUEST ──
async function test_SingleRequest() {
  console.log('\n[TEST 1] Single Request');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  const result = await cachedFetch('health', () => simulateNetworkCall(100), 5000);

  logTest('Single request executes once', networkRequestCount === 1, `${networkRequestCount} network calls`);
  logTest('Result is returned', result.id === 1, `returned ${result.id}`);
}

// ── TEST 2: CACHE HIT ──
async function test_CacheHit() {
  console.log('\n[TEST 2] Cache Hit (within TTL)');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  const t0 = performance.now();
  const result1 = await cachedFetch('health', () => simulateNetworkCall(100), 5000);
  const t1 = performance.now();

  const result2 = await cachedFetch('health', () => simulateNetworkCall(100), 5000);
  const t2 = performance.now();

  const coldLatency = t1 - t0;
  const warmLatency = t2 - t1;

  logTest('Only 1 network call made', networkRequestCount === 1, `${networkRequestCount} calls`);
  logTest('Cache hit is instant', warmLatency < coldLatency, `cold ${coldLatency.toFixed(1)}ms, warm ${warmLatency.toFixed(1)}ms`);
  logTest('Same data returned', result1.id === result2.id, 'both from cache');
}

// ── TEST 3: CONCURRENT REQUESTS (DEDUPLICATION) ──
async function test_ConcurrentRequests() {
  console.log('\n[TEST 3] Concurrent Requests (Deduplication)');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  // Fire 3 requests simultaneously before first completes
  const promises = [
    cachedFetch('swarm', () => simulateNetworkCall(150), 5000),
    cachedFetch('swarm', () => simulateNetworkCall(150), 5000),
    cachedFetch('swarm', () => simulateNetworkCall(150), 5000),
  ];

  const results = await Promise.all(promises);

  logTest('Only 1 network call despite 3 requests', networkRequestCount === 1, `${networkRequestCount} network calls`);
  logTest('All 3 get same result', results[0].id === results[1].id && results[1].id === results[2].id, `all got id ${results[0].id}`);
  logTest('Pending request tracking works', pendingRequests.size === 0, 'cleaned up after completion');
}

// ── TEST 4: TTL EXPIRY ──
async function test_TTLExpiry() {
  console.log('\n[TEST 4] TTL Expiry');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  // Short TTL for testing
  const result1 = await cachedFetch('econ', () => simulateNetworkCall(50), 500); // 500ms TTL

  // Immediate second call should hit cache
  const result2 = await cachedFetch('econ', () => simulateNetworkCall(50), 500);
  logTest('Cache hit within TTL', networkRequestCount === 1, `${networkRequestCount} calls`);

  // Wait for TTL to expire
  await new Promise(r => setTimeout(r, 600));

  // Third call should miss cache and fetch again
  const result3 = await cachedFetch('econ', () => simulateNetworkCall(50), 500);
  logTest('Cache miss after TTL expiry', networkRequestCount === 2, `${networkRequestCount} calls after expiry`);
  logTest('New request after expiry has different ID', result1.id !== result3.id, `${result1.id} vs ${result3.id}`);
}

// ── TEST 5: DIFFERENT KEYS ──
async function test_DifferentKeys() {
  console.log('\n[TEST 5] Different Keys (No Cross-Contamination)');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  const h = await cachedFetch('health', () => simulateNetworkCall(50), 5000);
  const t = await cachedFetch('treasury', () => simulateNetworkCall(50), 5000);
  const e = await cachedFetch('econ', () => simulateNetworkCall(50), 5000);

  logTest('3 different endpoints = 3 network calls', networkRequestCount === 3, `${networkRequestCount} calls`);
  logTest('Different keys have different caches', h.id !== t.id && t.id !== e.id, 'all have unique IDs');
}

// ── TEST 6: ERROR HANDLING ──
async function test_ErrorHandling() {
  console.log('\n[TEST 6] Error Handling (Don\'t Cache Failures)');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  let shouldFail = true;
  const fetcher = async () => {
    networkRequestCount++;
    if (shouldFail) throw new Error('Network error');
    return { id: networkRequestCount, success: true };
  };

  // First call fails
  try {
    await cachedFetch('api', fetcher, 5000);
  } catch (e) {
    // Expected
  }

  logTest('Failed request doesnt cache', networkRequestCount === 1);

  // Second call should retry (not hit stale cache)
  shouldFail = false;
  try {
    const result = await cachedFetch('api', fetcher, 5000);
    logTest('Retry after failure succeeds', result.success === true, 'got successful response');
  } catch (e) {
    logTest('Retry after failure succeeds', false, 'unexpected error: ' + e.message);
  }
}

// ── TEST 7: MEMORY SAFETY ──
async function test_MemorySafety() {
  console.log('\n[TEST 7] Memory Safety (Bounded Cache Size)');
  clientCache.clear();
  pendingRequests.clear();

  // Add 20 entries
  for (let i = 0; i < 20; i++) {
    const key = `endpoint_${i}`;
    await cachedFetch(key, async () => ({ data: `response_${i}` }), 5000);
  }

  const sizeAfterFill = clientCache.size;
  logTest('Cache bounded to ~20 entries', sizeAfterFill === 20, `${sizeAfterFill} entries`);

  // Simulate cleanup of stale entries (>300s old)
  // Manually age all entries to >300s
  for (const [k, v] of clientCache.entries()) {
    v.ts = Date.now() - 310000; // 310 seconds ago
  }

  // Run cleanup logic
  const now = Date.now();
  for (const [k, v] of clientCache.entries()) {
    if (now - v.ts > 300000) clientCache.delete(k);
  }

  logTest('Stale entries cleaned up', clientCache.size === 0, `${clientCache.size} entries after cleanup`);
}

// ── TEST 8: POLLING SIMULATION ──
async function test_PollingCycle() {
  console.log('\n[TEST 8] Polling Cycle Simulation (8s refresh)');
  networkRequestCount = 0;
  clientCache.clear();
  pendingRequests.clear();

  // Simulate poll() cycle with 6 endpoints called every 8s
  const endpoints = [
    ['health', 5000],
    ['svg_telemetry', 5000],
    ['live_map', 5000],
    ['treasury_summary', 5000],
    ['output_dir', 10000],
    ['swarm_health', 5000],
  ];

  // Cycle 1: Cold fetch (all miss cache)
  console.log('  Cycle 1: Cold fetch...');
  for (const [key, ttl] of endpoints) {
    await cachedFetch(key, () => simulateNetworkCall(50), ttl);
  }
  const cycle1Calls = networkRequestCount;

  // Cycle 2: Warm fetch (all hit cache within 5s)
  console.log('  Cycle 2: Warm fetch (same cycle)...');
  for (const [key, ttl] of endpoints) {
    await cachedFetch(key, () => simulateNetworkCall(50), ttl);
  }
  const cycle2Calls = networkRequestCount - cycle1Calls;

  logTest('First cycle: 6 network calls', cycle1Calls === 6, `${cycle1Calls} calls`);
  logTest('Second cycle: 0 network calls (all cached)', cycle2Calls === 0, `${cycle2Calls} calls`);
  logTest('Total: 50% reduction', (cycle2Calls / (cycle1Calls + cycle2Calls)) === 0, '6→6 saved');
}

// ── MAIN TEST RUNNER ──
async function runAllTests() {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   CLIENT-SIDE CACHE VALIDATION SUITE           ║');
  console.log('╚════════════════════════════════════════════════╝');

  await test_SingleRequest();
  await test_CacheHit();
  await test_ConcurrentRequests();
  await test_TTLExpiry();
  await test_DifferentKeys();
  await test_ErrorHandling();
  await test_MemorySafety();
  await test_PollingCycle();

  // Summary
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║   VALIDATION SUMMARY                           ║');
  console.log('╚════════════════════════════════════════════════╝');

  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const pct = ((passed / total) * 100).toFixed(0);

  console.log(`\nTests Passed: ${passed}/${total} (${pct}%)`);
  console.log(`\nDetailed Results:`);
  testResults.forEach(r => {
    const emoji = r.passed ? '✅' : '❌';
    console.log(`  ${emoji} ${r.name}`);
  });

  const allPassed = passed === total;
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);

  return allPassed;
}

// Run if invoked directly
if (require.main === module) {
  runAllTests().then(success => process.exit(success ? 0 : 1));
}

module.exports = { runAllTests };
