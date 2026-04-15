const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3200;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'treasury',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// Service-specific endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'treasury service running',
    endpoints: ['/health']
  });
});

app.listen(PORT, () => {
  console.log('treasury listening on port ' + PORT);
});
