'use strict';
// Global Jest teardown — drains the event loop after every suite.
// Gives Node.js one tick to close any lingering handles before Jest
// force-exits and prints the "worker process failed to exit" warning.
afterAll(async () => {
  await new Promise((resolve) => setTimeout(resolve, 50));
});
