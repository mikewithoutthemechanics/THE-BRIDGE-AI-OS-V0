'use strict';
// Global Jest teardown — close Redis + timers from middleware loaded with gateway/auth tests.
afterAll(async () => {
  try {
    const auth = require('./middleware/auth');
    if (typeof auth.shutdownAuthMiddleware === 'function') {
      await auth.shutdownAuthMiddleware();
    }
  } catch (_) {}
  await new Promise((resolve) => setTimeout(resolve, 150));
});
