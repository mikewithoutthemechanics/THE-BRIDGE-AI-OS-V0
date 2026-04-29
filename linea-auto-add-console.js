// ============================================================================
// BRIDGE AI OS — AUTO-ADD VENDORS & INVENTORY (ADMIN CONSOLE SCRIPT)
// ============================================================================
// Paste this into your browser console on any Bridge AI OS dashboard page
// Requires: admin/superadmin privileges
// ============================================================================

// Auto-detect API base from current page
const API_BASE = (() => {
  const host = window.location.hostname;
  const port = window.location.port || (window.location.protocol === 'https:' ? 443 : 80);
  return `${window.location.protocol}//${host}:${port}`;
})();

function getAuthHeaders() {
  const token = localStorage.getItem('bridge_token') || sessionStorage.getItem('bridge_token');
  if (!token) {
    console.error('❌ No bridge_token found in localStorage/sessionStorage');
    console.log('💡 Make sure you are logged in as a superadmin');
    return null;
  }
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
}

// -----------------------------------------------------------------------------
// 1. VENDORS TO IMPORT
// -----------------------------------------------------------------------------
const VENDORS = [
  { name: 'WebWay Hosting', type: 'hosting', contact: 'support@webway.host', currency: 'ZAR', spend_mtd: 0 },
  { name: 'Anthropic', type: 'ai-provider', contact: 'api@anthropic.com', currency: 'USD', spend_mtd: 0 },
  { name: 'OpenAI', type: 'ai-provider', contact: 'api@openai.com', currency: 'USD', spend_mtd: 0 },
  { name: 'PayFast', type: 'payment-processor', contact: 'support@payfast.co.za', currency: 'ZAR', spend_mtd: 0 },
  { name: 'Paystack', type: 'payment-processor', contact: 'support@paystack.com', currency: 'ZAR', spend_mtd: 0 },
  { name: 'MetaMask', type: 'wallet-provider', contact: 'support@metamask.io', currency: 'USD', spend_mtd: 0 },
  { name: 'Linea', type: 'blockchain', contact: 'support@linea.build', currency: 'ETH', spend_mtd: 0 },
  { name: 'Supabase', type: 'database', contact: 'support@supabase.io', currency: 'USD', spend_mtd: 0 },
  { name: 'Stripe', type: 'payment-processor', contact: 'support@stripe.com', currency: 'USD', spend_mtd: 0 },
  { name: 'Hugging Face', type: 'ai-provider', contact: 'support@huggingface.co', currency: 'USD', spend_mtd: 0 }
];

// -----------------------------------------------------------------------------
// 2. INVENTORY TO IMPORT (will auto-map to vendor_ids after vendors are created)
// -----------------------------------------------------------------------------
const INVENTORY = [
  // WebWay Hosting
  { name: 'VPS 4-Core Server', category: 'infrastructure', sku: 'INF-VPS-01', cost: 0, currency: 'ZAR', location: 'Cloud' },
  { name: 'Dedicated RAM 16GB', category: 'infrastructure', sku: 'INF-RAM-01', cost: 0, currency: 'ZAR', location: 'Cloud' },

  // Anthropic
  { name: 'Claude API Credits (1M tokens)', category: 'services', sku: 'SRV-AI-01', cost: 0, currency: 'USD', location: 'Virtual' },
  { name: 'Claude Opus Credits', category: 'services', sku: 'SRV-AI-OPUS', cost: 0, currency: 'USD', location: 'Virtual' },

  // OpenAI
  { name: 'GPT-4 API Credits', category: 'services', sku: 'SRV-AI-GPT4', cost: 0, currency: 'USD', location: 'Virtual' },
  { name: 'Whisper Transcription Credits', category: 'services', sku: 'SRV-AI-WHISPER', cost: 0, currency: 'USD', location: 'Virtual' },

  // PayFast
  { name: 'Payment Processing Credits', category: 'services', sku: 'PAY-CRED-01', cost: 0, currency: 'ZAR', location: 'Gateway' },

  // Paystack
  { name: 'Payment Processing Credits', category: 'services', sku: 'PAY-CRED-02', cost: 0, currency: 'ZAR', location: 'Gateway' },

  // MetaMask
  { name: 'Wallet Infrastructure', category: 'services', sku: 'WALLET-001', cost: 0, currency: 'ETH', location: 'EVM' },

  // Linea
  { name: 'Gas Fee Credits', category: 'crypto', sku: 'CRY-LINEA-01', cost: 0, currency: 'ETH', location: 'L2' },
  { name: 'BRDG Token Reserve', category: 'crypto', sku: 'CRY-BRDG-01', cost: 0, currency: 'ETH', location: 'Vault' },

  // Supabase
  { name: 'Database Storage 10GB', category: 'database', sku: 'DB-SUP-01', cost: 0, currency: 'USD', location: 'Cloud' },
  { name: 'Edge Function Credits', category: 'compute', sku: 'COMP-FUNC-01', cost: 0, currency: 'USD', location: 'Edge' },

  // Stripe
  { name: 'Stripe Connect Fees', category: 'services', sku: 'PAY-STRIPE-01', cost: 0, currency: 'USD', location: 'Gateway' },

  // Hugging Face
  { name: 'Inference API Credits', category: 'services', sku: 'SRV-AI-HF', cost: 0, currency: 'USD', location: 'Virtual' }
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

async function api(method, endpoint, body = null) {
  const headers = getAuthHeaders();
  if (!headers) throw new Error('No auth headers');

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${API_BASE}${endpoint}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

async function wait(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// -----------------------------------------------------------------------------
// STEP 1: Clear existing (optional)
// -----------------------------------------------------------------------------
async function clearAll() {
  console.log('🧹 Clearing existing vendors & inventory...');
  try {
    // Get all vendors
    const vendorsData = await api('GET', '/api/vendors');
    for (const v of vendorsData.vendors) {
      await api('DELETE', `/api/vendors/${v.id}`);
      console.log(`  ✗ Deleted vendor: ${v.name}`);
    }
    console.log('✅ Cleared all vendors');
  } catch (e) {
    console.error('❌ Error clearing vendors:', e.message);
  }
}

// -----------------------------------------------------------------------------
// STEP 2: Bulk import vendors
// -----------------------------------------------------------------------------
async function importVendors() {
  console.log('\n📦 Importing vendors...');
  const results = [];
  for (const v of VENDORS) {
    try {
      const data = await api('POST', '/api/vendors', v);
      console.log(`  ✅ ${v.name} → ID: ${data.vendor.id}`);
      results.push({ ...v, id: data.vendor.id, success: true });
      await wait(100); // Rate limit buffer
    } catch (e) {
      console.log(`  ❌ ${v.name} → ${e.message}`);
      results.push({ ...v, error: e.message, success: false });
    }
  }
  const success = results.filter(r => r.success).length;
  console.log(`\n📊 Vendors: ${success}/${VENDORS.length} imported`);
  return results;
}

// -----------------------------------------------------------------------------
// STEP 3: Bulk import inventory (requires vendor IDs)
// -----------------------------------------------------------------------------
async function importInventory(vendorResults) {
  console.log('\n📦 Importing inventory...');
  const vendorMap = {};
  vendorResults.filter(r => r.success).forEach(r => {
    vendorMap[r.name.toLowerCase()] = r.id;
  });

  let successCount = 0;
  for (const item of INVENTORY) {
    try {
      // Map vendor name to vendor_id
      const vendorName = extractVendorName(item.name); // derive from SKU or item metadata
      const vendor_id = vendorMap[vendorName.toLowerCase()] || vendorMap['linea']; // fallback for Linea items

      if (!vendor_id) {
        console.log(`  ⚠️  Skipping ${item.name} — vendor not found in map`);
        continue;
      }

      const payload = { ...item, vendor_id };
      const data = await api('POST', '/api/inventory', payload);
      console.log(`  ✅ ${item.name} → ID: ${data.inventory.id}`);
      successCount++;
      await wait(100);
    } catch (e) {
      console.log(`  ❌ ${item.name} → ${e.message}`);
    }
  }
  console.log(`\n📊 Inventory: ${successCount}/${INVENTORY.length} imported`);
}

// -----------------------------------------------------------------------------
// HELPER: Map inventory item to vendor
// -----------------------------------------------------------------------------
function extractVendorName(inventoryName) {
  const name = inventoryName.toLowerCase();
  if (name.includes('claude') || name.includes('ai api')) return 'Anthropic';
  if (name.includes('gpt') || name.includes('whisper')) return 'OpenAI';
  if (name.includes('vps') || name.includes('ram')) return 'WebWay Hosting';
  if (name.includes('payment') || name.includes('payfast')) return 'PayFast';
  if (name.includes('paystack')) return 'Paystack';
  if (name.includes('wallet') || name.includes('metamask')) return 'MetaMask';
  if (name.includes('gas') || name.includes('brdg') || name.includes('linea')) return 'Linea';
  if (name.includes('supabase') || name.includes('database')) return 'Supabase';
  if (name.includes('stripe')) return 'Stripe';
  if (name.includes('hugging') || name.includes('inference')) return 'Hugging Face';
  return 'Linea'; // default fallback
}

// -----------------------------------------------------------------------------
// MAIN EXECUTION
// ============================================================================
async function runLineaAutoAdd() {
  console.log('⚡ [LINEA AUTO-ADD] Starting injection sequence...\n');

  // Step 0: Verify auth
  const headers = getAuthHeaders();
  if (!headers) return;

  // Step 1: Optional clear
  // await clearAll(); // Uncomment to wipe first

  // Step 2: Import vendors
  const vendorResults = await importVendors();

  // Step 3: Import inventory
  await importInventory(vendorResults);

  console.log('\n🟢 [LINEA AUTO-ADD] Sequence complete.');
  console.log('💡 Check your Admin → CRM → Vendors page to verify.');
}

// Run it
runLineaAutoAdd().catch(err => {
  console.error('🔥 Fatal error:', err);
});
