const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3600;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'svg-engine',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// Service-specific endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'svg-engine service running',
    endpoints: ['/health']
  });
});

app.listen(PORT, () => {
  console.log('svg-engine listening on port ' + PORT);
});
