// Load environment variables from .env file
function loadEnv() {
  const fs = require('fs');
  const path = require('path');

  try {
    const envPath = path.join(process.cwd(), '.env');
    if (fs.existsSync(envPath)) {
      const envContent = fs.readFileSync(envPath, 'utf8');
      const lines = envContent.split('\n');

      lines.forEach(line => {
        line = line.trim();
        if (line && !line.startsWith('#') && line.includes('=')) {
          const [key, ...valueParts] = line.split('=');
          const value = valueParts.join('=').trim();
          if (key && value) {
            process.env[key.trim()] = value;
          }
        }
      });

      console.log('✅ Environment variables loaded from .env file');
    } else {
      console.log('⚠️  No .env file found');
    }
  } catch (error) {
    console.error('❌ Error loading .env file:', error.message);
  }
}

module.exports = { loadEnv };