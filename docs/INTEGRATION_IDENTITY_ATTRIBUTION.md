# Integration Guide: Identity + Attribution Pipeline

This document shows how to wire the new **Wallet Identity** and **Attribution Events** system into Bridge AI.

## Architecture

```
User (OAuth/Email)
  ├─ Auth Identity (oauth_provider, oauth_id)
  ├─ Wallet Identity (ethereum address, solana address, etc)
  └─ Attribution Events
      ├─ neurolink_output
      ├─ idea_submitted
      └─ model_inference
         └─ Triggers Reward Distribution
            └─ Treasury Ledger Entry
               └─ (Future) On-Chain Payout
```

## Setup Steps

### 1. Run SQL Migration

```sql
-- Copy the entire contents of:
-- db/migrations/003-wallet-attribution.sql
-- Into Supabase SQL editor and execute
```

This creates:
- `wallet_identities` table (users ↔ crypto wallets)
- `attribution_events` table (action logging)
- Helper functions (for reward processing)

### 2. Extend user-identity.js

Already done. New functions available:

```javascript
const userIdentity = require('./lib/user-identity');

// Link a wallet to a user
await userIdentity.linkWallet(userId, '0x123...', 'ethereum');

// Get user's wallets
const wallets = await userIdentity.getUserWallets(userId);

// Find user by wallet
const user = await userIdentity.getUserByWallet('0x123...', 'ethereum');

// Unlink a wallet
await userIdentity.unlinkWallet(userId, '0x123...');
```

### 3. Log Events from NeuroLink

In your NeuroLink completion handler:

```javascript
const { createStream } = require('./lib/ap2v3/streaming');
const attributionEvents = require('./lib/attribution-events');

// In your agent handler...
const stream = createStream(res, agentName);

// ... agent processing ...

// On completion:
stream.sendComplete(result);

// Log the event (non-blocking, catch errors)
if (userId) {
  attributionEvents.logEvent(
    userId,
    'neurolink_output',
    result.id,
    {
      agent: agentName,
      tokens: result.tokens_used || 0,
      quality_score: result.quality_score || null,
      timestamp: new Date().toISOString(),
    },
    attributionEvents.generateIdempotencyKey(userId, 'neurolink_output', result.id)
  ).catch(err => {
    console.warn('[Attribution] async log failed', err.message);
  });
}
```

### 4. Set Up Reward Distribution

Create a cron job or background task:

```javascript
// Every hour, distribute rewards for neurolink outputs
const distributor = require('./lib/reward-distributor');

async function rewardLoop() {
  try {
    const stats = await distributor.distributeRewards('neurolink_output', {
      hoursBack: 1,
      batchSize: 100,
    });
    console.log('[Rewards] Distributed:', stats);
  } catch (err) {
    console.error('[Rewards] Loop failed:', err);
  }
}

// Call this:
// - Every 60 minutes via cron
// - After agent execution batch completes
// - On-demand via API endpoint
```

Example cron setup (in your main app):

```javascript
const cron = require('node-cron');
const distributor = require('./lib/reward-distributor');

// Run reward distribution hourly
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Starting reward distribution...');
  try {
    await distributor.distributeRewards('neurolink_output', { hoursBack: 1 });
  } catch (err) {
    console.error('[Cron] Reward loop failed:', err);
  }
});
```

### 5. Wire Wallet Linking into User Flow

Add to your auth flow (after successful OAuth login):

```javascript
const userIdentity = require('./lib/user-identity');

// After user created/authenticated:
// Show wallet linking prompt
app.get('/auth/link-wallet', (req, res) => {
  const userId = req.user.id;
  res.render('wallet-link', { userId });
});

app.post('/auth/link-wallet', async (req, res) => {
  const { userId, walletAddress, chain } = req.body;

  try {
    // In real app: verify signature (SIWE)
    const wallet = await userIdentity.linkWallet(
      userId,
      walletAddress,
      chain || 'ethereum'
    );

    res.json({ success: true, wallet });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
```

## Usage Examples

### Log Different Event Types

```javascript
const events = require('./lib/attribution-events');

// NeuroLink output
await events.logEvent(userId, 'neurolink_output', outputId, {
  agent: 'intelligence',
  tokens: 1542,
  quality_score: 0.87,
});

// Idea submission
await events.logEvent(userId, 'idea_submitted', ideaId, {
  category: 'feature',
  description_length: 350,
});

// Model inference
await events.logEvent(userId, 'model_inference', runId, {
  model: 'gpt-4-turbo',
  latency_ms: 1245,
  prompt_tokens: 500,
});
```

### Query Attribution Data

```javascript
const events = require('./lib/attribution-events');

// Get user's recent neurolink outputs
const outputs = await events.getEventsByUser(userId, {
  eventType: 'neurolink_output',
  since: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(), // last 7 days
  limit: 50,
});

// Get user's stats
const stats = await events.getUserEventStats(userId);
console.log(stats);
// {
//   total_events: 127,
//   total_tokens: 15420,
//   avg_quality: 0.76,
//   unrewarded_count: 5,
//   last_event_at: "2026-04-10T15:32:00Z"
// }

// Get events by type (for leaderboards)
const topOutputs = await events.getEventsByType('neurolink_output', {
  limit: 10,
  unrewardedOnly: false,
});
```

### Manual Reward Processing

```javascript
const distributor = require('./lib/reward-distributor');

// Manually process rewards
const result = await distributor.distributeRewards('neurolink_output', {
  hoursBack: 1,
  batchSize: 100,
});

console.log(result);
// { processed: 45, skipped: 2, totalReward: 3245.50 }

// Get reward stats
const stats = await distributor.getRewardStats('neurolink_output');
console.log(stats);
// { total_rewarded: 1523, total_distributed: 152300.45 }
```

## API Endpoints (Optional)

You can expose these as REST endpoints:

```javascript
// Link wallet
POST /api/wallet/link
  body: { wallet_address, chain }
  response: { success, wallet_identity }

// Get user wallets
GET /api/wallet/list
  query: none
  response: { wallets: [...] }

// Get attribution events
GET /api/events
  query: { type?, since?, limit? }
  response: { events: [...] }

// Get user stats
GET /api/stats
  query: none
  response: { total_events, total_tokens, avg_quality, ... }

// Manual reward processing (admin only)
POST /api/admin/distribute-rewards
  body: { eventType?, hoursBack? }
  response: { processed, skipped, totalReward }
```

## Data Flow Diagram

```
User completes action (NeuroLink output)
         ↓
    [sendComplete(result)]
         ↓
  Log attribution event
   (logEvent + idempotency)
         ↓
  Event stored in Supabase
         ↓
  Cron/trigger fires reward loop
         ↓
  Query unrewarded events
         ↓
  Calculate reward per event
   (tokens × quality × agent weight)
         ↓
  Create ledger entry
   (debit treasury, credit user)
         ↓
  Mark event rewarded
         ↓
  (Future) Batch wallet payouts
```

## Troubleshooting

### Duplicate Event Logging

If the same event logs twice:

```javascript
// Use idempotency key
const key = attributionEvents.generateIdempotencyKey(
  userId,
  'neurolink_output',
  result.id
);
await attributionEvents.logEvent(userId, 'neurolink_output', result.id, {...}, key);
```

### Rewards Not Processing

Check:
1. Events logged with `rewarded_at IS NULL`
2. Database connection in reward-distributor.js
3. User exists in `users` table
4. Ledger table exists for treasury entries

```javascript
// Debug: get unrewarded events
const unrewarded = await attributionEvents.getUnrewardedEvents('neurolink_output');
console.log(unrewarded); // should show pending events
```

### Wallet Linking Fails

Check:
1. User exists in database
2. Wallet address format (lowercase)
3. Chain name matches allowed values

```javascript
// Debug
const user = await userIdentity.getUserById(userId);
console.log(user); // verify user exists

const wallets = await userIdentity.getUserWallets(userId);
console.log(wallets); // see existing wallets
```

## Next Steps

1. **Integrate into NeuroLink** — Wire event logging into completion handler
2. **Set up Cron** — Run reward distributor hourly
3. **Add Wallet UI** — Let users link wallets
4. **Treasury Integration** — Wire distributor to actual ledger/payout logic
5. **Leaderboards** — Build analytics on top of `attribution_events`
6. **On-Chain Payouts** — Batch wallet transfers periodically

---

**Files Created:**
- `db/migrations/003-wallet-attribution.sql` — Database schema
- `lib/attribution-events.js` — Event logging module
- `lib/reward-distributor.js` — Reward calculation & distribution
- `lib/user-identity.js` — Extended with wallet functions (updated)

**Status:** Ready for integration.
