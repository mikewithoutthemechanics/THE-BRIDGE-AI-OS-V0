# Bridge AI OS — Vendor & Inventory Deployment (Supabase + VPS)

## 📋 Step-by-Step Deployment

### 1️⃣ Apply SQL Migration to Supabase

**Option A: Via Supabase Dashboard (Recommended)**

1. Open: https://app.supabase.com → Your Project → SQL Editor
2. Copy the entire contents of this file:
   ```
   db/migrations/004_vendor_inventory_management.sql
   ```
3. Paste into SQL Editor
4. Click "Run" (or press Ctrl+Enter)
5. Should see: "Success. No rows returned"

**Option B: Via Supabase CLI (if installed on VPS)**

```bash
# On your VPS
supabase db push
# Or direct psql:
psql "$DATABASE_URL" -f db/migrations/004_vendor_inventory_management.sql
```

---

### 2️⃣ Patch gateway.js on VPS

**On your VPS (where gateway.js lives at `/var/www/bridgeai/gateway.js`):**

```bash
# Transfer the patch script to VPS (from your local machine)
scp patch_gateway_vendor_inventory_routes.py root@YOUR_VPS_IP:/tmp/

# SSH into VPS
ssh root@YOUR_VPS_IP

# Run the patch
cd /var/www/bridgeai
python3 /tmp/patch_gateway_vendor_inventory_routes.py /var/www/bridgeai/gateway.js
```

**Output should say:**
```
Backup created: /var/www/bridgeai/gateway.js.bak_YYYYMMDD_HHMMSS
Done. Inserted Vendor/Inventory routes (XXX new lines) before AEOS anchor.
File written: /var/www/bridgeai/gateway.js
```

---

### 3️⃣ Restart gateway service

```bash
# On VPS
sudo systemctl restart bridgeai-gateway

# Or if using PM2
pm2 restart gateway
```

---

### 4️⃣ Verify endpoints are working

```bash
# From your local machine (or VPS)
# Get your bridge_token from browser console:
#   localStorage.getItem('bridge_token')

curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://127.0.0.1:8080/api/vendors

# Should return: {"ok":true,"vendors":[]}
```

If you get `403 Superadmin access required`, ensure your email is in `SUPERUSERS` env var:
```bash
# In /etc/environment or systemd service file
SUPERUSERS=ryanpcowan@gmail.com,your@email.com
```

---

### 5️⃣ Seed initial data

**Option A: Browser Console (Quickest)**

1. Login to Bridge AI OS as superadmin
2. Open DevTools → Console
3. Paste the contents of `linea-auto-add-console.js`
4. Press Enter

You should see:
```
⚡ [LINEA AUTO-ADD] Starting injection sequence...
📦 Importing vendors...
  ✅ WebWay Hosting → ID: a1b2c3...
  ...
📦 Importing inventory...
  ✅ VPS 4-Core Server → ID: d4e5f6...
  ...
🟢 [LINEA AUTO-ADD] Sequence complete.
```

**Option B: CLI (Python)**

```bash
python3 bulk_add_vendors.py --token YOUR_BRIDGE_TOKEN --api http://127.0.0.1:8080
```

---

### 6️⃣ Check Admin Dashboard

1. Go to: http://127.0.0.1:8080/admin/crm (or navigate via menu)
2. You should see the **Vendor & Inventory Management** widget
3. Shows: vendor count, inventory count, pending mint jobs, failed jobs
4. Buttons: "Import Vendors", "Import Inventory", "Refresh"

---

## 🎯 Quick Test Checklist

After deployment, run these checks:

```bash
# 1. Vendors endpoint
curl -H "Authorization: Bearer TOKEN" http://127.0.0.1:8080/api/vendors | python -m json.tool

# 2. Inventory endpoint
curl -H "Authorization: Bearer TOKEN" http://127.0.0.1:8080/api/inventory | python -m json.tool

# 3. Sync status
curl -H "Authorization: Bearer TOKEN" http://127.0.0.1:8080/api/vendors/sync-status | python -m json.tool

# 4. Mint jobs (should have pending jobs)
curl -H "Authorization: Bearer TOKEN" "http://127.0.0.1:8080/api/mint-jobs?status=queued" | python -m json.tool
```

Expected results:
- Vendors: 10 items
- Inventory: 15 items
- Pending mint jobs: ~25 (one per vendor + inventory)

---

## 📁 Files Reference

| File | Purpose |
|------|---------|
| `db/migrations/004_vendor_inventory_management.sql` | Complete schema (tables, triggers, views, indexes) |
| `patch_gateway_vendor_inventory_routes.py` | Patches gateway.js with 25+ endpoints |
| `linea-auto-add-console.js` | Browser console one-click import |
| `bulk_add_vendors.py` | Standalone Python CLI importer |
| `verify_vendor_api.py` | Health check script |
| `VendorInventoryWidget.jsx` | React admin widget (copy to `/admin/crm`) |
| `VENDOR_INVENTORY_README.md` | Full documentation |

---

## ⛓️ Linea Worker Setup (Next Step)

After data is seeded, your `mint_jobs` table will be populated with pending jobs. To actually mint on-chain:

1. Deploy ERC-721/ERC-1155 contract to Linea
2. Create a worker script (Node.js or Python) that:
   - Polls `GET /api/mint-jobs?status=queued`
   - Mints token using your contract
   - Updates job with `PATCH /api/mint-jobs/:id` (status: done, tx_hash, token_id)
3. Update `vendor_onchain_registry` with on-chain binding

See `VENDOR_INVENTORY_README.md` for worker code example.

---

## 🚨 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| `401 Unauthorized` | Invalid/missing token | Get fresh token: `localStorage.getItem('bridge_token')` |
| `403 Superadmin access required` | Email not in SUPERUSERS | Add to env: `SUPERUSERS=your@email.com` |
| `404 Not Found` on `/api/vendors` | gateway.js not patched or service not restarted | Re-run patch, restart gateway |
| Migration fails | SQL syntax error or insufficient DB permissions | Run manually in Supabase SQL Editor |
| No mint jobs enqueued | Triggers missing | Check `SELECT tgname FROM pg_trigger WHERE tgname LIKE '%mint%';` |
| Duplicate vendor name | Vendor name already exists | Use unique names; check with `SELECT * FROM vendors;` |

---

## 💡 One-Line Commands (Copy-Paste)

```bash
# Apply migration (in Supabase SQL Editor)
psql "$DATABASE_URL" -f db/migrations/004_vendor_inventory_management.sql

# Patch gateway (on VPS)
python3 patch_gateway_vendor_inventory_routes.py /var/www/bridgeai/gateway.js && sudo systemctl restart bridgeai-gateway

# Verify
curl -s -H "Authorization: Bearer $(cat ~/.bridge_token)" http://127.0.0.1:8080/api/vendors | python -c "import sys, json; print(json.load(sys.stdin)['ok'])"
```

---

## ✅ All Done?

When all steps complete:
- ✅ 10 vendors in database
- ✅ 15 inventory items
- ✅ Mint jobs queued for Linea worker
- ✅ Admin widget showing sync status
- ✅ API endpoints returning data

Next: Build your Linea mint worker to actually mint the vendor NFTs on-chain.

**Questions?** Check `VENDOR_INVENTORY_README.md` for full API reference and worker implementation.
