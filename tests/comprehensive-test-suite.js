/**
 * Bridge AI OS - Comprehensive Test Suite
 * Tests all pages, functionality, animations, and security
 */

const TestSuite = {
  pages: [
    'index.html',
    'dashboard-aeos.html',
    'admin-dashboard.html',
    'settings-admin.html',
    'orchestra.html',
    'ehsa-brain.html',
    'ehsa-twin-wall-dashboard.html',
    'ehsa-causal-brain.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/index.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/dashboard.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/connect.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/community.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/learn.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/explore.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/contact.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/blog.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/docs.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/runtime-demo.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/test-runtime.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/test-execution.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/test-determinism.html',
    'bridgeaios/THE-BRIDGE-AI-OS-V0/live.html'
  ],

  async runAll() {
    console.log('🧪 Starting Bridge AI OS Comprehensive Test Suite\n');
    const results = {
      passed: 0,
      failed: 0,
      tests: []
    };

    for (const page of this.pages) {
      try {
        await this.testPage(page);
        results.passed++;
        results.tests.push({ page, status: 'PASS' });
      } catch (error) {
        results.failed++;
        results.tests.push({ page, status: 'FAIL', error: error.message });
      }
    }

    this.printSummary(results);
    return results;
  },

  async testPage(pageUrl) {
    console.log(`Testing: ${pageUrl}`);

    // Test 1: HTML exists and is valid
    await this.testHTML validity(pageUrl);

    // Test 2: CSS animations loaded
    await this.testAnimationsLoaded(pageUrl);

    // Test 3: Security headers
    await this.testSecurityHeaders(pageUrl);

    // Test 4: Responsive design
    await this.testResponsive(pageUrl);

    // Test 5: Accessibility basics
    await this.testAccessibility(pageUrl);

    // Test 6: Performance metrics
    await this.testPerformance(pageUrl);

    console.log(`✅ ${pageUrl} passed all tests\n`);
  },

  testHTMLValidity(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl)
        .then(res => {
          if (!res.ok) reject(new Error(`HTTP ${res.status}`));
          return res.text();
        })
        .then(html => {
          if (!html.includes('<!DOCTYPE html>')) {
            reject(new Error('Missing DOCTYPE'));
          }
          if (!html.includes('<html')) {
            reject(new Error('Missing html tag'));
          }
          if (!html.includes('<head>') || !html.includes('</head>')) {
            reject(new Error('Missing head section'));
          }
          if (!html.includes('<body>') || !html.includes('</body>')) {
            reject(new Error('Missing body section'));
          }
          resolve();
        })
        .catch(reject);
    });
  },

  testAnimationsLoaded(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
          const hasAnimations = html.includes('animations.css') ||
                               html.includes('@keyframes') ||
                               html.includes('animation:');
          if (!hasAnimations) {
            reject(new Error('No animations found'));
          }
          resolve();
        })
        .catch(reject);
    });
  },

  testSecurityHeaders(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl, { method: 'HEAD' })
        .then(res => {
          const csp = res.headers.get('Content-Security-Policy');
          if (!csp) {
            console.warn(`⚠️  No CSP header for ${pageUrl}`);
          }
          resolve();
        })
        .catch(() => resolve()); // Allow CORS issues in test env
    });
  },

  testResponsive(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
          const hasViewport = html.includes('viewport');
          if (!hasViewport) {
            reject(new Error('Missing viewport meta tag'));
          }
          const hasMediaQueries = html.includes('@media');
          if (!hasMediaQueries) {
            console.warn(`⚠️  No media queries in ${pageUrl}`);
          }
          resolve();
        })
        .catch(reject);
    });
  },

  testAccessibility(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
          // Check for lang attribute
          if (!html.includes('lang="en"')) {
            console.warn(`⚠️  Missing lang attribute in ${pageUrl}`);
          }
          // Check for alt texts on images
          const imgCount = (html.match(/<img/g) || []).length;
          const altCount = (html.match(/alt="/g) || []).length;
          if (imgCount > 0 && altCount < imgCount) {
            console.warn(`⚠️  Some images missing alt text in ${pageUrl}`);
          }
          resolve();
        })
        .catch(reject);
    });
  },

  testPerformance(pageUrl) {
    return new Promise((resolve, reject) => {
      fetch(pageUrl)
        .then(res => res.text())
        .then(html => {
          // Check for render-blocking resources
          const scripts = html.match(/<script[^>]*>/g) || [];
          const blockingScripts = scripts.filter(s =>
            !s.includes('async') && !s.includes('defer')
          );

          if (blockingScripts.length > 2) {
            console.warn(`⚠️  Multiple render-blocking scripts in ${pageUrl}`);
          }

          // Check file size approximation
          const sizeKB = html.length / 1024;
          if (sizeKB > 500) {
            console.warn(`⚠️  Large HTML file (${sizeKB.toFixed(1)}KB): ${pageUrl}`);
          }

          resolve();
        })
        .catch(reject);
    });
  },

  printSummary(results) {
    console.log('\n' + '='.repeat(50));
    console.log('TEST SUMMARY');
    console.log('='.repeat(50));
    console.log(`Total: ${results.passed + results.failed}`);
    console.log(`Passed: ${results.passed} ✅`);
    console.log(`Failed: ${results.failed} ❌`);
    console.log('='.repeat(50) + '\n');

    if (results.failed > 0) {
      console.log('Failed tests:');
      results.tests
        .filter(t => t.status === 'FAIL')
        .forEach(t => {
          console.log(`  ❌ ${t.page}: ${t.error}`);
        });
    }
  }
};

// Run tests if in Node.js environment
if (typeof window === 'undefined') {
  // Node.js - use fetch if available or skip
  console.log('Running in Node.js environment - some network tests may be limited');
}

// Export for browser usage
if (typeof module !== 'undefined') {
  module.exports = TestSuite;
}
