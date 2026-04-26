// 004_populate_services_registry.js
// Initialize Redis service registry for gateway discovery
// This script populates Redis with known services for dynamic discovery

const { createClient } = require('redis');

async function populateServiceRegistry() {
  const redis = createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
  });

  try {
    await redis.connect();

    const services = [
      {
        id: 'gateway',
        name: 'API Gateway',
        port: 8080,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'api-gateway',
        version: 'v2.0'
      },
      {
        id: 'system',
        name: 'System Core',
        port: 3000,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'core-service',
        version: 'v1.5'
      },
      {
        id: 'brain',
        name: 'AI Brain',
        port: 8000,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'ai-service',
        version: 'v3.1'
      },
      {
        id: 'auth',
        name: 'Authentication Service',
        port: 5001,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'auth-service',
        version: 'v2.0'
      },
      {
        id: 'terminal',
        name: 'Terminal Service',
        port: 5002,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'terminal-service',
        version: 'v1.0'
      },
      {
        id: 'marketplace',
        name: 'Marketplace',
        port: 3030,
        host: 'localhost',
        health_endpoint: '/health',
        type: 'marketplace',
        version: 'v1.2'
      },
      {
        id: 'treasury',
        name: 'Treasury Service',
        port: 3000,
        host: 'localhost',
        health_endpoint: '/api/treasury',
        type: 'finance-service',
        version: 'v2.1'
      }
    ];

    console.log('Populating Redis service registry...');

    for (const service of services) {
      const key = `services:registry:${service.id}`;
      const data = {
        ...service,
        registered_at: new Date().toISOString(),
        status: 'active',
        last_health_check: null,
        health_status: 'unknown'
      };

      await redis.hset(key, data);
      console.log(`✓ Registered service: ${service.id} (${service.port})`);
    }

    // Create service index
    const serviceIds = services.map(s => s.id);
    await redis.sadd('services:index', serviceIds);

    console.log(`\n✅ Service registry populated with ${services.length} services`);
    console.log('Gateway can now discover services dynamically via Redis');

  } catch (error) {
    console.error('❌ Failed to populate service registry:', error);
    process.exit(1);
  } finally {
    await redis.disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  populateServiceRegistry().catch(console.error);
}

module.exports = { populateServiceRegistry };