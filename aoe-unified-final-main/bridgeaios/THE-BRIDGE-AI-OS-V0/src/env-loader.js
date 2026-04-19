// Load environment variables from .env file
function loadEnv() {
  const fs = require('fs');
  const path = require('path');

  // Try multiple possible .env file locations
  const possiblePaths = [
    path.join(process.cwd(), '.env'),                    // Current directory
    path.join(process.cwd(), '../.env'),                 // Parent directory
    path.join(process.cwd(), '../../.env'),              // Grandparent directory
    path.join(process.cwd(), '../../../.env'),           // Great-grandparent directory
    '/var/www/bridgeai/.env',                            // Absolute VPS path
  ];

  for (const envPath of possiblePaths) {
    try {
      if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const lines = envContent.split('\n');

        lines.forEach(line => {
          line = line.trim();
          if (line && !line.startsWith('#') && line.includes('=')) {
            const [key, ...valueParts] = line.split('=');
            const value = valueParts.join('=').trim();
            if (key && value && !process.env[key.trim()]) { // Don't override existing env vars
              process.env[key.trim()] = value;
            }
          }
        });

        console.log(`✅ Environment variables loaded from: ${envPath}`);
        return; // Found and loaded, exit function
      }
    } catch (error) {
      // Continue to next path
    }
  }

  console.log('⚠️  No .env file found in any expected location');
}

module.exports = { loadEnv };