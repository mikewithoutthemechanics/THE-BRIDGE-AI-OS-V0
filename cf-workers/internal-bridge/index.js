/**
 * Internal Bridge Worker
 * Handles internal bridge.bridge-ai-os.com routes
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    return new Response(JSON.stringify({
      service: "internal-bridge",
      path: url.pathname,
      timestamp: new Date().toISOString()
    }), {
      headers: { "Content-Type": "application/json" }
    });
  }
};
