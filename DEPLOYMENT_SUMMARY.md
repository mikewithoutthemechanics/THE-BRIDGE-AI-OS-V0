# Bridge AI OS — Vendor & Inventory Management System

## 🎯 What Was Built

Complete vendor & inventory management system with Linea blockchain integration for your Bridge AI OS.

---

## 📁 Files Created

### Database Layer
```
db/migrations/004_vendor_inventory_management.sql
```
- **vendors** table — Vendor catalog (name, type, contact, wallet, currency)
- **inventory** table — Per-vendor items (SKU, category, cost, location)
- **vendor_onchain_registry** — Linea blockchain binding (token_id, wallet, mint_status)
- **mint_jobs** — Idempotent worker queue for Linea minting
- **vendor_sync_log** — Audit trail
- Triggers: auto-enqueue mint jobs on vendor/inventory create
- Views: `vendor_dashboard_summary`, `inventory_dashboard_summary`, `pending_mint_jobs`

### API Layer
```
patch_gateway_vendor_inventory_routes.py
```
Inserts **25+ endpoints** into your gateway.js:

**Vendors:**
- `GET    /api/vendors` — List all
- `POST   /api/vendors` — Create (superadmin)
- `PATCH  /api/vendors/:id` — Update
- `DELETE /api/vendors/:id` — Delete

**Inventory:**
- `GET    /api/inventory` — List all
- `POST   /api/inventory` — Create (superadmin)
- `PATCH  /api/inventory/:id` — Update
- `DELETE /api/inventory/:id` — Delete

**Onchain Registry:**
- `GET    /api/vendors/onchain` — All bindings
- `GET    /api/vendors/:id/onchain` — Vendor tokens

**Mint Queue:**
- `GET    /api/mint-jobs` — List (filter by status)
- `PATCH  /api/mint-jobs/:id` — Update job status

**Bulk Import:**
- `POST   /api/bulk-import/vendors`
- `POST   /api/bulk-import/inventory`

**Dashboard:**
- `GET    /api/vendors/sync-status` — Summary + failed jobs

### Client Tools
```
linea-auto-add-console.js   — Browser console script (drop-in)
bulk_add_vendors.py          — Python CLI for headless/CI
verify_vendor_api.py         — Health check + endpoint tester
VendorInventoryWidget.jsx    — React admin widget (copy to /admin/crm)
```

### Deployment
```
setup_vendor_inventory.py     — Interactive setup wizard (local)
deploy_vendor_inventory.sh    — VPS deployment script (Linux)
deploy_vendor_inventory.bat   — VPS deployment script (Windows)
run_migrations.py             — Migration runner (psql)
```

### Documentation
```
VENDOR_INVENTORY_README.md   — Complete documentation
```

---

## 🚀 Deployment Options

### Option A: One-Command (Linux VPS)
```bash
sudo bash deploy_vendor_inventory.sh
```
Applies migrations, patches gateway, restarts service, seeds data.

### Option B: Windows VPS
```batch
deploy_vendor_inventory.bat
```
Follow prompts.

### Option C: Manual (Full Control)

#### 1. Apply Database Migration
**Via Supabase Dashboard:**
1. Go to https://app.supabase.com → Your Project → SQL Editor
2. Paste contents of `db/migrations/004_vendor_inventory_management.sql`
3. Click "Run"

**Or via psql:**
```bash
psql "$DATABASE_URL" -f db/migrations/004_vendor_inventory_management.sql
```

#### 2. Patch gateway.js (on VPS)
```bash
# On your VPS
python3 patch_gateway_vendor_inventory_routes.py /var/www/bridgeai/gateway.js

# Restart
sudo systemctl restart bridgeai-gateway
# or: pm2 restart gateway
```

#### 3. Verify Endpoints
```bash
# Get token from browser:
#   localStorage.getItem('bridge_token')

python3 verify_vendor_api.py --token YOUR_TOKEN --api http://127.0.0.1:8080
```

#### 4. Seed Initial Data (10 vendors + 15 items)

**Browser Console:**
1. Login to Bridge AI OS as superadmin
2. Open DevTools → Console
3. Paste contents of `linea-auto-add-console.js`
4. Press Enter

**Or CLI:**
```bash
python3 bulk_add_vendors.py --token YOUR_TOKEN --api http://127.0.0.1:8080
```

---

## 📊 What Gets Imported

### Vendors (10)
| Name | Type | Currency |
|------|------|----------|
| WebWay Hosting | hosting | ZAR |
| Anthropic | ai-provider | USD |
| OpenAI | ai-provider | USD |
| PayFast | payment-processor | ZAR |
| Paystack | payment-processor | ZAR |
| MetaMask | wallet-provider | USD |
| Linea | blockchain | ETH |
| Supabase | database | USD |
| Stripe | payment-processor | USD |
| Hugging Face | ai-provider | USD |

### Inventory (15 items)
| Name | Category | Currency |
|------|----------|----------|
| VPS 4-Core Server | infrastructure | ZAR |
| Dedicated RAM 16GB | infrastructure | ZAR |
| Claude API Credits | services | USD |
| Claude Opus Credits | services | USD |
| GPT-4 API Credits | services | USD |
| Whisper Transcription | services | USD |
| Payment Processing (PayFast) | services | ZAR |
| Payment Processing (Paystack) | services | ZAR |
| Wallet Infrastructure | services | ETH |
| Gas Fee Credits | crypto | ETH |
| BRDG Token Reserve | crypto | ETH |
| Database Storage 10GB | database | USD |
| Edge Function Credits | compute | USD |
| Stripe Connect Fees | services | USD |
| Inference API Credits | services | USD |

---

## 🔐 Authentication

All endpoints use existing Bridge JWT auth.

**Superadmin check:**
```javascript
SUPERUSERS = (process.env.SUPERUSERS || 'ryanpcowan@gmail.com').split(',')
```
Add your email to `SUPERUSERS` env var on VPS if get 403.

---

## ⛓️ Linea Integration

### How it works:
1. Vendor/inventory created via API
2. DB trigger fires → inserts row into `mint_jobs`
3. External worker polls `/api/mint-jobs?status=queued`
4. Worker mints ERC-721 (vendor) or ERC-1155 (inventory) on Linea
5. Worker patches job with `tx_hash` and `token_id`
6. System updates `vendor_onchain_registry` with on-chain binding

### Worker Polling Example:
```python
while True:
    jobs = requests.get('/api/mint-jobs?status=queued').json()
    for job in jobs['jobs']:
        tx_hash = mint_on_linea(job['payload'])
        requests.patch(f'/api/mint-jobs/{job["id"]}', json={
            'status': 'done',
            'tx_hash': tx_hash,
            'token_id': extract_token_id(tax_hash)
        })
```

---

## 🎛️ Admin Dashboard Widget

Add to `admin/crm` page:

```jsx
import VendorInventoryWidget from './VendorInventoryWidget.jsx';

// Inside your admin page component:
<VendorInventoryWidget 
  apiBase="http://127.0.0.1:8080"
  token={bridge_token} 
/>
```

Features:
- Bulk import buttons
- Real-time sync status (vendors, inventory, mint jobs)
- Retry failed mint jobs
- Live log viewer
- Tables showing current data

---

## ✅ Verification Checklist

After deployment:

- [ ] `db/migrations/004_vendor_inventory_management.sql` applied in Supabase
- [ ] gateway.js patched with vendor/inventory routes
- [ ] gateway service restarted
- [ ] `GET /api/vendors` returns 200 with vendor list
- [ ] `POST /api/vendors` creates vendor (superadmin only)
- [ ] `GET /api/inventory` returns 200
- [ ] `POST /api/inventory` creates item
- [ ] `GET /api/mint-jobs` shows queued jobs
- [ ] Vendor auto-enqueues mint job on create (check `mint_jobs` table)
- [ ] Admin dashboard shows widget
- [ ] Console script (`linea-auto-add-console.js`) runs without errors

---

## 🐛 Troubleshooting

| Issue | Fix |
|-------|-----|
| `401 Unauthorized` | Get fresh token from browser console: `localStorage.getItem('bridge_token')` |
| `403 Superadmin access required` | Add email to `SUPERUSERS` env var on VPS |
| `404 Not Found` | gateway.js not patched or service not restarted |
| Migration fails | Run manually via Supabase SQL Editor |
| Mint jobs not enqueuing | Check triggers exist: `\d vendors` shows `trg_vendor_mint` |
| Worker sees no jobs | Query with `status=queued` or `status=retrying` |
| Duplicate vendor | Vendor name must be unique; check existing first |

---

## 📚 API Examples

### Create Vendor
```bash
curl -X POST http://127.0.0.1:8080/api/vendors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Vendor",
    "type": "hosting",
    "contact": "support@example.com",
    "currency": "ZAR"
  }'
```

### Bulk Import Vendors
```bash
curl -X POST http://127.0.0.1:8080/api/bulk-import/vendors \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "vendors": [
      {"name":"V1","type":"hosting"},
      {"name":"V2","type":"ai-provider"}
    ]
  }'
```

### Get Sync Status
```bash
curl http://127.0.0.1:8080/api/vendors/sync-status \
  -H "Authorization: Bearer $TOKEN"
```

---

## 🧠 Architecture Recap

```
┌─────────────────┐
│  Browser/CLI   │  ← linea-auto-add-console.js / bulk_add_vendors.py
└────────┬────────┘
         │ POST /api/vendors
         ↓
┌─────────────────┐
│  gateway.js     │  ← Patched with 25+ endpoints
│  (Node.js)      │
└────────┬────────┘
         │ Supabase client
         ↓
┌─────────────────┐
│   Supabase      │  ← Tables: vendors, inventory, mint_jobs, vendor_onchain_registry
│  (PostgreSQL)   │
└────────┬────────┘
         │ Triggers fire on INSERT
         ↓
┌─────────────────┐
│  mint_jobs      │  ← Worker queue (idempotent)
│  (status:queued)│
└────────┬────────┘
         │ Worker polls
         ↓
┌─────────────────┐
│  Linea Chain    │  ← ERC-721/ERC-1155 mint
│  (L2)           │
└─────────────────┘
```

---

## 📖 Full Documentation

See `VENDOR_INVENTORY_README.md` for:
- Detailed API reference
- Linea worker implementation guide
- Admin widget customization
- CSV import UI patterns
- Multi-tenant vendor ownership design
- Error handling + retry strategies
- Monitoring + observability

---

## 🎯 What's Next?

1. **Deploy to VPS** — Run `deploy_vendor_inventory.sh` on your server
2. **Verify** — Check `/api/vendors` returns data
3. **Import** — Run browser console script or bulk_add_vendors.py
4. **Build Linea Worker** — Poll `mint_jobs` and mint tokens
5. **Admin UI** — Add `VendorInventoryWidget.jsx` to `/admin/crm`
6. **Expand** — Add CSV upload, vendor ownership (user_id), analytics

---

**All files ready. All endpoints built. Deploy when ready.**
