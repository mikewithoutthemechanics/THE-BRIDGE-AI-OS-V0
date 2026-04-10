# NeuroLink + Reward Distribution Integration

Complete guide for wiring NeuroLink cognitive state inferences into the attribution and reward distribution pipeline.

## Architecture

```
NeuroLink Service
  ├─ MultiUserStream (state ingestion)
  │   └─ Emits: state:ingested, user:registered
  ├─ LiveMonetizationOrchestrator (trigger execution)
  │   └─ Emits: trigger:executed
  └─ Attribution Integration Layer
      ├─ Logs state inferences
      ├─ Logs monetization triggers
      └─ Logs outputs → trigger reward distribution
              ↓
      Attribution Events Table
      ├─ neurolink_state_inference
      ├─ neurolink_output
      ├─ monetization_trigger_*
      └─ monetization_action_*
              ↓
      Reward Distributor (Cron)
      ├─ Query unrewarded events
      ├─ Calculate rewards
      ├─ Create ledger entries
      └─ Mark events rewarded
              ↓
      Treasury Ledger (on-chain later)
```

## Setup

### 1. Database Migrations

Already done via `db/migrations/003-wallet-attribution.sql`.

```bash
# Run in Supabase SQL editor
-- Applies wallet_identities, attribution_events, and helper functions
```

### 2. NeuroLink Attribution Integration

**Already wired in:** `api/neurolink/index.js` line 20

When NeuroLink starts, it automatically initializes attribution logging:

```javascript
const { initializeAttribution } = require('./attribution-setup');
initializeAttribution(neurolink);
```

This:
- Hooks into `MultiUserStream` events (state ingestion, user registration)
- Hooks into `LiveMonetizationOrchestrator` events (trigger execution)
- Logs all events to `attribution_events` table with idempotency keys

### 3. Event Types Being Logged

**State Inference Events:**
```
event_type: 'neurolink_state_inference'
metadata: {
  observation_count: number,
  state_v: float,  // Valence (0-1)
  state_a: float,  // Arousal (0-1)
  state_d: float,  // Dominance (0-1)
  has_predictions: boolean
}
```

**User Registration:**
```
event_type: 'neurolink_user_registered'
metadata: { ... user metadata ... }
```

**Monetization Triggers:**
```
event_type: 'monetization_trigger_high_conversion_window'
event_type: 'monetization_trigger_churn_risk'
event_type: 'monetization_trigger_fatigue_dropoff'
metadata: {
  trigger_type: string,
  action_type: string,
  success: boolean,
  revenue: number | null
}
```

### 4. Manual Event Logging

If you generate outputs manually (inference, idea, model run), log them:

```javascript
const integration = require('./lib/neurolink-attribution-integration');

// Log a NeuroLink output
await integration.logNeuroLinkOutput(
  userId,
  'output-uuid',
  {
    tokens: 1542,
    quality_score: 0.87,
    model: 'neurolink-v3'
  }
);

// Log a monetization action
await integration.logMonetizationAction(
  userId,
  'offer_campaign',
  'action-uuid',
  {
    success: true,
    revenue: 50.00,
    users_affected: 1
  }
);
```

### 5. Set Up Reward Distribution Cron

Two options:

**Option A: Vercel Crons**

Add to `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/distribute-rewards",
      "schedule": "0 * * * *"
    }
  ]
}
```

Then Vercel will POST to that endpoint hourly.

**Option B: External Cron (GitHub Actions, AWS Lambda, etc)**

```bash
curl -X POST https://yourapp.com/api/cron/distribute-rewards \
  -H "X-Cron-Token: $CRON_SECRET" \
  -H "Content-Type: application/json"
```

**Option C: Local Cron (Development)**

```javascript
const cron = require('node-cron');
const cronRoutes = require('./api/cron');

// Run every hour
cron.schedule('0 * * * *', async () => {
  console.log('[Cron] Running reward distribution...');
  try {
    const result = await distributor.distributeRewards('neurolink_output', { hoursBack: 1 });
    console.log('[Cron] Completed:', result);
  } catch (err) {
    console.error('[Cron] Failed:', err);
  }
});
```

### 6. Treasury Integration

The reward distributor creates ledger entries but assumes a `ledger` table exists.

If your table is named differently, edit `reward-distributor.js`:

```javascript
async function createRewardLedgerEntry(params) {
  const { user_id, amount, event_id } = params;

  // Change 'ledger' to your actual table name
  const { data, error } = await supabase
    .from('ledger')  // ← Your table here
    .insert({
      user_id,
      amount,
      source: 'reward',
      reference_id: event_id,
    });
}
```

## API Endpoints

### Cron Job (Automated)

```bash
POST /api/cron/distribute-rewards
  query: {
    eventType?: 'neurolink_output',
    hoursBack?: 1,
    token?: CRON_SECRET
  }
  response: {
    success: boolean,
    processed: number,
    skipped: number,
    totalReward: number
  }
```

### Query Attribution Events

```bash
GET /api/neurolink/attribution-stats?userId=<id>
  response: {
    overall: { total_events, total_tokens, avg_quality, ... },
    inference_count: number,
    output_count: number,
    triggered_count: number,
    latest_inference: timestamp,
    latest_output: timestamp
  }
```

(Create this endpoint if you need it)

## Data Flow Example

### 1. User Session Starts
```
NeuroLink collects ambient data
  → inferState() produces VAD (valence, arousal, dominance)
  → MultiUserStream.ingestState() called
    → emit('state:ingested', { userId, state, ... })
      → [Attribution Hook] logEvent('neurolink_state_inference', ...)
        → INSERT attribution_events (neurolink_state_inference)
```

### 2. Monetization Trigger Fires
```
LiveMonetizationOrchestrator detects high_conversion_window
  → _executeTrigger(trigger)
    → emit('trigger:executed', { userId, trigger, action, result })
      → [Attribution Hook] logEvent('monetization_trigger_high_conversion_window', ...)
        → INSERT attribution_events (monetization_trigger_high_conversion_window)
```

### 3. Reward Distribution (Hourly Cron)

```
Cron fires at 00:00, 01:00, 02:00, etc
  → GET /api/cron/distribute-rewards?hoursBack=1
    → distributeRewards('neurolink_output', { hoursBack: 1 })
      → Query unrewarded events (last 1 hour)
        → For each event:
          → calculateEventReward(event)
            = tokens * quality_score * agent_weight
          → createRewardLedgerEntry({ user_id, amount, event_id })
          → markEventRewarded(event_id, amount)
          → UPDATE attribution_events SET rewarded_at=NOW(), reward_amount=X
```

## Monitoring & Debugging

### Check Attribution Events

```javascript
const events = require('./lib/attribution-events');

// Get user's recent inferences
const inferences = await events.getEventsByUser(userId, {
  eventType: 'neurolink_state_inference',
  limit: 100
});
console.log(`User ${userId}: ${inferences.length} inferences logged`);

// Get unrewarded events
const unrewarded = await events.getUnrewardedEvents('neurolink_output');
console.log(`Pending rewards: ${unrewarded.length} events`);

// Get stats
const stats = await events.getUserEventStats(userId);
console.log('User stats:', stats);
```

### Check Reward Distribution

```javascript
const distributor = require('./lib/reward-distributor');

// Manual trigger
const result = await distributor.distributeRewards('neurolink_output', {
  hoursBack: 1,
  batchSize: 100
});
console.log('Distributed:', result);

// Check stats
const stats = await distributor.getRewardStats('neurolink_output');
console.log('Reward stats:', stats);
```

### Verify Cron Execution

Check logs:
```bash
# Vercel logs
vercel logs --filter distribute-rewards

# or in database
SELECT * FROM attribution_events 
WHERE event_type = 'neurolink_output' 
  AND rewarded_at IS NOT NULL 
ORDER BY rewarded_at DESC 
LIMIT 20;
```

## Troubleshooting

### Events Not Logging

1. Check NeuroLink is enabled: `process.env.NEUROLINK_ENABLED !== 'false'`
2. Check MultiUserStream exists: `neurolink.multiUserStream` should be initialized
3. Check Supabase connection: Attribution errors log to console
4. Verify user_id is being passed (not null)

```javascript
// Debug: Add temporary logging
const stream = neurolink.multiUserStream;
stream.on('state:ingested', (data) => {
  console.log('[DEBUG] State ingested:', data.userId, data.state);
});
```

### Rewards Not Distributing

1. Check cron is being called: `/api/cron/distribute-rewards` should execute hourly
2. Check unrewarded events exist:
   ```javascript
   const unrewarded = await events.getUnrewardedEvents('neurolink_output');
   console.log('Unrewarded:', unrewarded.length);
   ```
3. Check ledger table exists and has correct schema
4. Check CRON_SECRET matches (if using token auth)

### Duplicate Events

Idempotency keys prevent duplicates:
```javascript
// Same user/event/type = same key = no duplicate
const key = generateIdempotencyKey(userId, 'neurolink_output', result.id);
// key will be same every time, preventing duplicate inserts
```

## Files Created/Modified

**New:**
- `lib/neurolink-attribution-integration.js` — NeuroLink event hooks
- `api/neurolink/attribution-setup.js` — Initialization
- `api/cron/distribute-rewards.js` — Reward distribution endpoint
- `api/cron/index.js` — Cron routes

**Modified:**
- `api/neurolink/index.js` — Added attribution initialization

**Previously Created:**
- `db/migrations/003-wallet-attribution.sql`
- `lib/attribution-events.js`
- `lib/reward-distributor.js`
- `lib/user-identity.js` (extended with wallet functions)

## Next Steps

1. **Test Attribution Logging**
   - Trigger NeuroLink inference
   - Check database for events
   - Verify user_id and metadata

2. **Test Reward Distribution**
   - Manually call `POST /api/cron/distribute-rewards`
   - Check ledger entries created
   - Verify `rewarded_at` timestamp set

3. **Verify On-Chain Integration**
   - Map ledger entries to wallet addresses
   - Batch payouts to wallets (future)

4. **Build Leaderboards**
   - Query total_tokens by user
   - Rankings by quality_score
   - Real-time dashboards

---

**Status:** Ready for testing and monitoring. All components wired. No additional setup needed unless using specific cron service (Vercel, GitHub Actions, etc).
