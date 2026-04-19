# MCP Setup Guide - THE BRIDGE AI OS

## WordPress MCP Integration

### Step 1: Configure MCP Settings

Copy the following configuration to your MCP client settings:

```json
{
  "mcpServers": {
    "wpcom-mcp": {
      "url": "https://public-api.wordpress.com/wpcom/v2/mcp/v1"
    }
  }
}
```

### Step 2: Verify Connection

1. Start your MCP client with the configuration above
2. The homepage will show connection status in the bottom-right corner
3. Look for "✅ MCP Connected" indicator

### Step 3: Test Integration

Run these commands in your MCP client:

```bash
# Test basic connectivity
mcp wpcom-mcp health

# Get WordPress site info
mcp wpcom-mcp site-info

# List available tools
mcp wpcom-mcp tools
```

## Homepage Features

### Running the Homepage

```bash
# Install dependencies
npm install

# Start the server
npm start

# Or use development mode
npm run dev

# Open in browser
# http://localhost:3000
```

### API Endpoints

- `GET /api/health` - System health check
- `GET /api/system-status` - Current system status
- `GET /api/economic-data` - Live economic metrics

### Homepage Sections

1. **Hero** - Main introduction with animated AI brain
2. **Features** - Six core AI OS capabilities
3. **Causal Economy** - Economic intelligence flow visualization
4. **Intelligence Engine** - Live terminal demo
5. **Contact** - Integration and demo scheduling

## Testing MCP Connection

### Manual Test

```javascript
// Test from browser console
fetch('https://public-api.wordpress.com/wpcom/v2/mcp/v1', {
  method: 'HEAD',
  mode: 'no-cors'
})
.then(() => console.log('✅ MCP endpoint reachable'))
.catch(() => console.log('❌ MCP endpoint not reachable'));
```

### Integration Test

```bash
# Test API endpoints
curl http://localhost:3000/api/health
curl http://localhost:3000/api/system-status
curl http://localhost:3000/api/economic-data
```

## Troubleshooting

### MCP Connection Issues

1. **Check URL**: Ensure the MCP URL is correct
2. **Network Access**: Verify internet connectivity
3. **CORS**: If using browser, check CORS settings
4. **MCP Client**: Ensure your MCP client is properly configured

### Homepage Issues

1. **Server Not Starting**: Check Node.js version (requires 16+)
2. **Port Conflict**: Change PORT environment variable if 3000 is busy
3. **Dependencies**: Run `npm install` to ensure all packages are installed

### Common Errors

```
Error: EADDRINUSE :::3000
Solution: PORT=3001 npm start

Error: Cannot find module 'express'
Solution: npm install
```

## Advanced Configuration

### Environment Variables

```bash
# Set custom port
PORT=8080 npm start

# Enable debug mode
DEBUG=true npm start

# Mock mode for testing
PROMPT_ENGINE_MODE=mock npm start
```

### Custom MCP Configuration

```json
{
  "mcpServers": {
    "wpcom-mcp": {
      "url": "https://public-api.wordpress.com/wpcom/v2/mcp/v1",
      "timeout": 30000,
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

## Next Steps

1. **Deploy Homepage**: Host on Vercel, Netlify, or any static host
2. **Backend Integration**: Connect to THE BRIDGE AI OS backend
3. **WordPress Integration**: Use MCP to automate WordPress operations
4. **Custom Features**: Extend homepage with additional capabilities

---

**Status**: ✅ MCP Configuration Ready | ✅ Homepage Created | ✅ Server Running