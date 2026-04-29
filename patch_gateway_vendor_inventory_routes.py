"""
patch_gateway_vendor_inventory_routes.py
────────────────────────────────────────
Run on the VPS (Ubuntu) to insert Vendor & Inventory routes into gateway.js.

Usage:
    python3 patch_gateway_vendor_inventory_routes.py [path/to/gateway.js]

Default path: /var/www/bridgeai/gateway.js
"""

import sys, os, shutil, datetime

GATEWAY_PATH = sys.argv[1] if len(sys.argv) > 1 else '/var/www/bridgeai/gateway.js'

ANCHOR = '// ── AEOS: User Provisioning ───────────────────────────────────────────────────'

NEW_ROUTES = r'''// ── VENDOR & INVENTORY MANAGEMENT ─────────────────────────────────────────────
// ── Vendors CRUD ────────────────────────────────────────────────────────────────
app.get('/api/vendors', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // For now: all users see all vendors (system-wide catalog)
    // Later: filter by ownership / tenant
    const { data, error } = await supabaseAdmin
      .from('vendors')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, vendors: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/vendors', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // Superadmin-only for now
    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { name, type, contact, wallet_address, status, currency, spend_mtd } = req.body || {};
    if (!name || !type) return res.status(400).json({ ok:false, error:'name and type are required' });

    const { data, error } = await supabaseAdmin
      .from('vendors')
      .insert({ 
        name, 
        type, 
        contact, 
        wallet_address, 
        status: status || 'active',
        currency: currency || 'ZAR',
        spend_mtd: spend_mtd || 0
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, vendor: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/vendors/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { id } = req.params;
    const { name, type, contact, wallet_address, status, currency, spend_mtd } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (contact !== undefined) updates.contact = contact;
    if (wallet_address !== undefined) updates.wallet_address = wallet_address;
    if (status !== undefined) updates.status = status;
    if (currency !== undefined) updates.currency = currency;
    if (spend_mtd !== undefined) updates.spend_mtd = spend_mtd;

    const { data, error } = await supabaseAdmin
      .from('vendors')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, vendor: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.delete('/api/vendors/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { id } = req.params;
    const { error } = await supabaseAdmin.from('vendors').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── Inventory CRUD ───────────────────────────────────────────────────────────────
app.get('/api/inventory', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const { data, error } = await supabaseAdmin
      .from('inventory')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, inventory: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/inventory', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { vendor_id, name, category, sku, cost, currency, location, status } = req.body || {};
    if (!vendor_id || !name || !category) return res.status(400).json({ ok:false, error:'vendor_id, name, and category are required' });

    // Verify vendor exists
    const { data: vendor, error: vErr } = await supabaseAdmin
      .from('vendors')
      .select('id')
      .eq('id', vendor_id)
      .single();
    if (vErr || !vendor) return res.status(404).json({ ok:false, error:'Vendor not found' });

    const { data, error } = await supabaseAdmin
      .from('inventory')
      .insert({
        vendor_id,
        name,
        category,
        sku: sku || null,
        cost: cost || 0,
        currency: currency || 'ZAR',
        location: location || null,
        status: status || 'active'
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, inventory: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/inventory/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { id } = req.params;
    const { name, category, sku, cost, currency, location, status } = req.body || {};
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (category !== undefined) updates.category = category;
    if (sku !== undefined) updates.sku = sku;
    if (cost !== undefined) updates.cost = cost;
    if (currency !== undefined) updates.currency = currency;
    if (location !== undefined) updates.location = location;
    if (status !== undefined) updates.status = status;

    const { data, error } = await supabaseAdmin
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, inventory: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.delete('/api/inventory/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { id } = req.params;
    const { error } = await supabaseAdmin.from('inventory').delete().eq('id', id);
    if (error) throw new Error(error.message);
    return res.json({ ok:true });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── Vendor Onchain Registry (Linea Integration) ─────────────────────────────────
app.get('/api/vendors/onchain', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const { data, error } = await supabaseAdmin
      .from('vendor_onchain_registry')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, registry: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.get('/api/vendors/:id/onchain', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const { id } = req.params;
    const { data, error } = await supabaseAdmin
      .from('vendor_onchain_registry')
      .select('*')
      .eq('vendor_id', id)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return res.json({ ok:true, registry: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── Mint Job Queue (for Linea worker polling) ───────────────────────────────────
app.get('/api/mint-jobs', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    // Only superadmins can see mint jobs
    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { status, limit } = req.query;
    let query = supabaseAdmin
      .from('mint_jobs')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(parseInt(limit) || 100);

    if (status) query = query.eq('status', status);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return res.json({ ok:true, jobs: data || [] });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.patch('/api/mint-jobs/:id', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { id } = req.params;
    const { status, worker_id, last_error, tx_hash, token_id } = req.body || {};
    const updates = {};
    if (status !== undefined) updates.status = status;
    if (worker_id !== undefined) updates.worker_id = worker_id;
    if (last_error !== undefined) updates.last_error = last_error;
    if (tx_hash !== undefined) updates.tx_hash = tx_hash;
    if (token_id !== undefined) updates.token_id = token_id;

    // Auto-set timestamps
    if (status === 'processing') updates.started_at = new Date().toISOString();
    if (status === 'done' || status === 'failed') updates.completed_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from('mint_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return res.json({ ok:true, job: data });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── Bulk Import Operations ──────────────────────────────────────────────────────
app.post('/api/bulk-import/vendors', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { vendors: vendorList } = req.body || {};
    if (!Array.isArray(vendorList)) return res.status(400).json({ ok:false, error:'vendors array required' });

    const results = [];
    for (const v of vendorList) {
      try {
        const { name, type, contact, status = 'active', currency = 'ZAR', spend_mtd = 0, wallet_address } = v;
        const { data, error } = await supabaseAdmin
          .from('vendors')
          .insert({ name, type, contact, status, currency, spend_mtd, wallet_address })
          .select()
          .single();
        if (error) {
          results.push({ name, success: false, error: error.message });
        } else {
          results.push({ name, success: true, id: data.id });
        }
      } catch (err) {
        results.push({ name: v.name, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return res.json({ ok:true, results, successCount, total: vendorList.length });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

app.post('/api/bulk-import/inventory', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const { inventory: inventoryList } = req.body || {};
    if (!Array.isArray(inventoryList)) return res.status(400).json({ ok:false, error:'inventory array required' });

    const results = [];
    for (const item of inventoryList) {
      try {
        const { vendor_id, name, category, sku, cost = 0, currency = 'ZAR', location, status = 'active' } = item;

        // Verify vendor exists
        const { data: vendor, error: vErr } = await supabaseAdmin
          .from('vendors')
          .select('id')
          .eq('id', vendor_id)
          .single();
        if (vErr || !vendor) {
          results.push({ name, success: false, error: 'Vendor not found' });
          continue;
        }

        const { data, error } = await supabaseAdmin
          .from('inventory')
          .insert({ vendor_id, name, category, sku, cost, currency, location, status })
          .select()
          .single();
        if (error) {
          results.push({ name, success: false, error: error.message });
        } else {
          results.push({ name, success: true, id: data.id });
        }
      } catch (err) {
        results.push({ name: item.name, success: false, error: err.message });
      }
    }

    const successCount = results.filter(r => r.success).length;
    return res.json({ ok:true, results, successCount, total: inventoryList.length });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

// ── Sync Status & Dashboard ─────────────────────────────────────────────────────
app.get('/api/vendors/sync-status', async (req, res) => {
  try {
    const token = (req.headers.authorization||'').replace(/^Bearer\s+/,'') || req.cookies?.access_token;
    if (!token) return res.status(401).json({ ok:false, error:'Auth required' });
    const payload = require('jsonwebtoken').verify(token, process.env.JWT_SECRET);
    const { supabaseAdmin } = require('./lib/supabase');
    const userId = payload.sub || payload.id;

    const SUPERUSERS = (process.env.SUPERUSERS || process.env.SUPERADMIN_EMAIL || 'ryanpcowan@gmail.com').split(',').map(s => s.trim());
    const userEmail = payload.email || '';
    if (!SUPERUSERS.includes(userEmail)) {
      return res.status(403).json({ ok:false, error:'Superadmin access required' });
    }

    const [
      { count: totalVendors },
      { count: totalInventory },
      { count: pendingMintJobs },
      { count: failedMintJobs },
      { data: recentMintJobs }
    ] = await Promise.all([
      supabaseAdmin.from('vendors').select('id', { count:'exact', head:true }),
      supabaseAdmin.from('inventory').select('id', { count:'exact', head:true }),
      supabaseAdmin.from('mint_jobs').select('id', { count:'exact', head:true }).eq('status', 'queued'),
      supabaseAdmin.from('mint_jobs').select('id', { count:'exact', head:true }).eq('status', 'failed'),
      supabaseAdmin.from('mint_jobs').select('vendor_id,vendor_name:vendor_id->vendors(name),job_type,status,created_at').eq('status', 'failed').order('created_at', { ascending: false }).limit(10)
    ]);

    return res.json({
      ok: true,
      totals: {
        vendors: totalVendors || 0,
        inventory: totalInventory || 0,
        pendingMintJobs: pendingMintJobs || 0,
        failedMintJobs: failedMintJobs || 0
      },
      recentFailures: recentMintJobs || []
    });
  } catch (e) {
    return res.status(500).json({ ok:false, error: e.message });
  }
});

'''

def main():
    if not os.path.isfile(GATEWAY_PATH):
        print(f'ERROR: File not found: {GATEWAY_PATH}')
        sys.exit(1)

    with open(GATEWAY_PATH, 'r', encoding='utf-8') as f:
        content = f.read()

    if ANCHOR not in content:
        print(f'ERROR: Anchor not found in {GATEWAY_PATH}')
        print(f'Searched for: {ANCHOR!r}')
        sys.exit(1)

    if '// ── VENDOR & INVENTORY MANAGEMENT ─────────────────────────────────────────────' in content:
        print('WARNING: Vendor/Inventory routes already appear to be present in gateway.js. Aborting to avoid duplicate insertion.')
        sys.exit(1)

    # backup
    import datetime
    ts = datetime.datetime.now().strftime('%Y%m%d_%H%M%S')
    backup_path = GATEWAY_PATH + f'.bak_{ts}'
    shutil.copy2(GATEWAY_PATH, backup_path)
    print(f'Backup created: {backup_path}')

    new_content = content.replace(ANCHOR, NEW_ROUTES + ANCHOR, 1)

    if new_content == content:
        print('ERROR: Replacement produced no change. Anchor may contain non-printable chars.')
        sys.exit(1)

    with open(GATEWAY_PATH, 'w', encoding='utf-8') as f:
        f.write(new_content)

    added = new_content.count('\n') - content.count('\n')
    print(f'Done. Inserted Vendor/Inventory routes ({added} new lines) before AEOS anchor.')
    print(f'File written: {GATEWAY_PATH}')

if __name__ == '__main__':
    main()
