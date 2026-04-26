# Bridge AI OS — Vendor & Inventory Management

## Overview

Complete vendor & inventory management system with Linea on-chain registry integration.

### Architecture

```
[Browser Console / CLI Script]
         ↓
   REST API (gateway.js)
         ↓
   Supabase (PostgreSQL)
         ↓
   DB Triggers → Mint Job Queue
         ↓
   Linea Worker (external) → Onchain ERC-721/ERC-1155
```

### Tables

| Table | Purpose |
|-------|---------|
| `vendors` | Vendor catalog (name, type, contact, wallet, currency) |
| `inventory` | Per-vendor inventory items (SKU, category, cost, location) |
| `vendor_onchain_registry` | Linea blockchain binding (token_id, wallet, mint_status) |
| `mint_jobs` | Idempotent worker queue for Linea minting |
| `vendor_sync_log` | Audit trail of all changes |

### API Endpoints

#### Vendors
- `GET    /api/vendors` — List all vendors
- `POST   /api/vendors` — Create vendor (superadmin only)
- `PATCH  /api/vendors/:id` — Update vendor
- `DELETE /api/vendors/:id` — Delete vendor

#### Inventory
- `GET    /api/inventory` — List all inventory
- `POST   /api/inventory` — Create inventory item (superadmin only)
- `PATCH  /api/inventory/:id` — Update item
- `DELETE /api/inventory/:id` — Delete item

#### Onchain Registry
- `GET    /api/vendors/onchain` — All onchain bindings
- `GET    /api/vendors/:id/onchain` — Vendor's onchain tokens

#### Mint Queue (for Linea worker)
- `GET    /api/mint-jobs?status=queued` — Fetch pending jobs
- `PATCH  /api/mint-jobs/:id` — Update job status (processing/done/failed)

#### Bulk Import
- `POST   /api/bulk-import/vendors` — Bulk vendor insert (superadmin)
- `POST   /api/bulk-import/inventory` — Bulk inventory insert (superadmin)

#### Dashboard
- `GET    /api/vendors/sync-status` — Summary + failures (superadmin)

## Installation

### Step 1: Apply Database Migration

```bash
# Navigate to project root
cd /c/aoe-unified-final-main

# Apply migration to Supabase
# Option A: Via Supabase dashboard SQL editor
#   - Open https://app.supabase.com → Project → SQL Editor
#   - Paste contents of db/migrations/004_vendor_inventory_management.sql
#   - Run

# Option B: Via psql CLI
psql "$DATABASE_URL" -f db/migrations/004_vendor_inventory_management.sql
```

### Step 2: Patch gateway.js

```bash
# On your VPS or local dev environment
python3 patch_gateway_vendor_inventory_routes.py /var/www/bridgeai/gateway.js

# Or for local dev
python3 patch_gateway_vendor_inventory_routes.py ./gateway.js
```

### Step 3: Restart gateway

```bash
# On VPS
sudo systemctl restart bridgeai-gateway

# Or if using PM2
pm2 restart gateway
```

### Step 4: Verify

```bash
# Health check
curl http://127.0.0.1:8080/api/vendors \
  -H "Authorization: Bearer $(cat ~/.bridge_token)"
```

## Usage

### A. Browser Console (Quick Start)

1. Log in to Bridge AI OS Dashboard as superadmin
2. Open DevTools → Console
3. Paste the contents of `linea-auto-add-console.js`
4. Press Enter

Output:
```
⚡ [LINEA AUTO-ADD] Starting injection sequence...
📦 Importing vendors...
  ✅ WebWay Hosting → ID: a1b2c3...
  ...
📊 Vendors: 10/10 imported
📦 Importing inventory...
  ✅ VPS 4-Core Server → ID: d4e5f6...
  ...
🟢 [LINEA AUTO-ADD] Sequence complete.
```

### B. Python CLI (Headless / CI)

```bash
# Get your JWT token from browser localStorage:
#   localStorage.getItem('bridge_token')

python3 bulk_add_vendors.py \
  --token "eyJhbGciOiJIUzI1NiIs..." \
  --api http://127.0.0.1:8080
```

Options:
- `--clear` — Delete all existing vendors/inventory first
- `--skip-vendors` — Only import inventory
- `--skip-inventory` — Only import vendors

### C. Direct API Calls

```bash
# Create vendor
curl -X POST http://127.0.0.1:8080/api/vendors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Vendor",
    "type": "hosting",
    "contact": "support@example.com",
    "currency": "ZAR"
  }'

# Bulk import
curl -X POST http://127.0.0.1:8080/api/bulk-import/vendors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"vendors": [{"name":"V1","type":"hosting"},{"name":"V2","type":"ai-provider"}]}'
```

### D. Admin Dashboard UI Widget

Add to `/admin/crm` page (or any admin route):

```html
<div id="vendor-import-widget" class="card">
  <h3>📦 Vendor & Inventory Bulk Import</h3>
  <div class="controls">
    <button onclick="bridge.bulkImport Vendors()">Import Vendors</button>
    <button onclick="bridge.bulkImportInventory()">Import Inventory</button>
    <button onclick="bridge.fetchSyncStatus()">Refresh Status</button>
  </div>
  <div id="import-log" class="log"></div>
  <div id="sync-summary" class="summary"></div>
</div>

<script>
// Reuse bridge-api.js auth + fetch helpers
bridge.bulkImportVendors = async function() {
  const log = document.getElementById('import-log');
  log.innerHTML = '⏳ Importing vendors...';
  
  const VENDORS = [ /* same array as console script */ ];
  let success = 0;
  
  for (const v of VENDORS) {
    try {
      const r = await fetch('/api/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bridge.token}` },
        body: JSON.stringify(v)
      });
      const d = await r.json();
      if (r.ok) {
        success++;
        log.innerHTML += `<div class="ok">✅ ${v.name}</div>`;
      } else {
        log.innerHTML += `<div class="err">❌ ${v.name}: ${d.error}</div>`;
      }
    } catch(e) {
      log.innerHTML += `<div class="err">⚠️ ${v.name}: ${e.message}</div>`;
    }
    await new Promise(r => setTimeout(r, 100));
  }
  
  log.innerHTML += `<div>📊 ${success}/${VENDORS.length} vendors imported</div>`;
  bridge.fetchSyncStatus();
};

bridge.bulkImportInventory = async function() {
  // Similar pattern
  // Must import vendors first, then map vendor_id
};
</script>
```

## Linea Worker Integration

The `mint_jobs` table is your queue. External worker (Node.js/Python):

```python
import requests, time, os

API = 'http://127.0.0.1:8080'
TOKEN = os.getenv('BRIDGE_TOKEN')

while True:
    r = requests.get(f'{API}/api/mint-jobs?status=queued', headers={'Authorization': f'Bearer {TOKEN}'})
    jobs = r.json().get('jobs', [])
    
    for job in jobs:
        job_id = job['id']
        payload = job['payload']
        
        # Mark as processing
        requests.patch(f'{API}/api/mint-jobs/{job_id}', headers={'Authorization': f'Bearer {TOKEN}'}, json={'status':'processing','worker_id':'worker-1'})
        
        try:
            if job['job_type'] == 'vendor_identity':
                # Mint ERC-721 on Linea
                tx_hash = mint_vendor_nft(payload)  # your Linea SDK call
                # Update vendor_onchain_registry
                requests.patch(f'{API}/api/mint-jobs/{job_id}', json={
                    'status':'done',
                    'tx_hash':tx_hash,
                    'token_id':extract_token_id(tx_hash)
                })
        except Exception as e:
            requests.patch(f'{API}/api/mint-jobs/{job_id}', json={'status':'failed','last_error':str(e)})
    
    time.sleep(5)
```

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Verify token in localStorage matches superadmin email |
| `403 Superadmin access required` | Ensure `SUPERUSERS` env var includes your email |
| Duplicate vendor | Vendor name must be unique; check existing with `/api/vendors` |
| Mint jobs not enqueuing | Check `mint_jobs` table exists; triggers fired on `vendors` insert |
| Worker sees no jobs | Query `status=queued` or `status=retrying` |

## Next Steps

1. Build admin UI widget (React/Vue) for drag-and-drop CSV import
2. Add vendor ownership (link to `user_id` for multi-tenant)
3. Implement inventory tracking (stock levels, reorder alerts)
4. Add vendor revenue analytics (join with `app_revenue_events`)
5. Build Linea worker (Node.js with `viem` or Python with `web3.py`)

## Files

- `db/migrations/004_vendor_inventory_management.sql` — Schema + views + triggers
- `patch_gateway_vendor_inventory_routes.py` — Node.js gateway patcher
- `linea-auto-add-console.js` — Drop-in browser console script
- `bulk_add_vendors.py` — Standalone Python CLI
- `VENDOR_INVENTORY_README.md` — This file

---

**Created for Bridge AI OS — Ryan Cowan sovereign system**
