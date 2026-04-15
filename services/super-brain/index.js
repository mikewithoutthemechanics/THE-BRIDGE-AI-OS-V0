const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3400;

// Health endpoint
app.get('/health', (req, res) => {
  res.json({
    service: 'super-brain',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '3.0.0'
  });
});

// Service-specific endpoints
app.get('/', (req, res) => {
  res.json({
    message: 'super-brain service running',
    endpoints: ['/health']
  });
});

app.listen(PORT, () => {
  console.log('super-brain listening on port ' + PORT);
});
