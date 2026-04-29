/**
 * Bridge AI OS — Vendor & Inventory Admin Widget
 * Drop-in React component for /admin/crm or /admin/economy pages
 * 
 * Usage:
 *   <VendorInventoryWidget apiBase="http://127.0.0.1:8080" token={bridge_token} />
 */

export default function VendorInventoryWidget({ apiBase, token }) {
  const [vendors, setVendors] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState([]);

  const addLog = (msg, type = 'info') => {
    setLog(prev => [...prev, { ts: new Date().toLocaleTimeString(), msg, type }]);
  };

  const api = async (method, path, body) => {
    const res = await fetch(`${apiBase}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [v, i, s] = await Promise.all([
        api('GET', '/api/vendors'),
        api('GET', '/api/inventory'),
        api('GET', '/api/vendors/sync-status')
      ]);
      setVendors(v.vendors || []);
      setInventory(i.inventory || []);
      setSyncStatus(s);
    } catch (e) {
      addLog(`❌ Load error: ${e.message}`, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkVendors = async () => {
    addLog('📦 Starting vendor bulk import...');
    const VENDORS = [
      { name: 'WebWay Hosting', type: 'hosting', contact: 'support@webway.host', currency: 'ZAR' },
      { name: 'Anthropic', type: 'ai-provider', contact: 'api@anthropic.com', currency: 'USD' },
      { name: 'OpenAI', type: 'ai-provider', contact: 'api@openai.com', currency: 'USD' },
      { name: 'PayFast', type: 'payment-processor', contact: 'support@payfast.co.za', currency: 'ZAR' },
      { name: 'Paystack', type: 'payment-processor', contact: 'support@paystack.com', currency: 'ZAR' },
      { name: 'MetaMask', type: 'wallet-provider', contact: 'support@metamask.io', currency: 'USD' },
      { name: 'Linea', type: 'blockchain', contact: 'support@linea.build', currency: 'ETH' },
      { name: 'Supabase', type: 'database', contact: 'support@supabase.io', currency: 'USD' },
      { name: 'Stripe', type: 'payment-processor', contact: 'support@stripe.com', currency: 'USD' },
      { name: 'Hugging Face', type: 'ai-provider', contact: 'support@huggingface.co', currency: 'USD' }
    ];

    let ok = 0, fail = 0;
    for (const v of VENDORS) {
      try {
        await api('POST', '/api/vendors', v);
        addLog(`✅ ${v.name}`);
        ok++;
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        addLog(`❌ ${v.name}: ${e.message}`, 'error');
        fail++;
      }
    }
    addLog(`📊 Vendors: ${ok}/${VENDORS.length} imported`);
    loadData();
  };

  const handleBulkInventory = async () => {
    addLog('📦 Starting inventory bulk import...');
    const INVENTORY = [
      { name: 'VPS 4-Core Server', category: 'infrastructure', sku: 'INF-VPS-01', cost: 0, currency: 'ZAR', location: 'Cloud' },
      { name: 'Claude API Credits', category: 'services', sku: 'SRV-AI-01', cost: 0, currency: 'USD', location: 'Virtual' },
      { name: 'GPT-4 API Credits', category: 'services', sku: 'SRV-AI-GPT4', cost: 0, currency: 'USD', location: 'Virtual' },
      { name: 'Gas Fee Credits', category: 'crypto', sku: 'CRY-LINEA-01', cost: 0, currency: 'ETH', location: 'L2' },
      { name: 'BRDG Token Reserve', category: 'crypto', sku: 'CRY-BRDG-01', cost: 0, currency: 'ETH', location: 'Vault' },
      { name: 'Database Storage 10GB', category: 'database', sku: 'DB-SUP-01', cost: 0, currency: 'USD', location: 'Cloud' }
    ];

    // Map: inventory.name → vendor_id
    const vendorMap = {};
    vendors.forEach(v => {
      vendorMap[v.name.toLowerCase()] = v.id;
      // Also map by type for generic items
      if (v.type === 'blockchain') vendorMap['linea'] = v.id;
      if (v.type === 'ai-provider' && v.name.toLowerCase().includes('anthropic')) vendorMap['anthropic'] = v.id;
    });

    let ok = 0, fail = 0;
    for (const item of INVENTORY) {
      try {
        const vendorName = extractVendorName(item.name);
        const vendor_id = vendorMap[vendorName.toLowerCase()] || vendorMap['linea'];
        if (!vendor_id) {
          addLog(`⚠️  Skipping ${item.name} (vendor not found: ${vendorName})`, 'warn');
          continue;
        }
        await api('POST', '/api/inventory', { ...item, vendor_id });
        addLog(`✅ ${item.name}`);
        ok++;
        await new Promise(r => setTimeout(r, 100));
      } catch (e) {
        addLog(`❌ ${item.name}: ${e.message}`, 'error');
        fail++;
      }
    }
    addLog(`📊 Inventory: ${ok}/${INVENTORY.length} imported`);
    loadData();
  };

  const extractVendorName = (inventoryName) => {
    const n = inventoryName.toLowerCase();
    if (n.includes('claude') || n.includes('ai api')) return 'Anthropic';
    if (n.includes('gpt') || n.includes('whisper')) return 'OpenAI';
    if (n.includes('vps') || n.includes('ram')) return 'WebWay Hosting';
    if (n.includes('gas') || n.includes('brdg') || n.includes('linea')) return 'Linea';
    if (n.includes('supabase') || n.includes('database')) return 'Supabase';
    return 'Linea';
  };

  const retryFailedJobs = async () => {
    addLog('🔄 Retrying failed mint jobs...');
    const jobs = await api('GET', '/api/mint-jobs?status=failed');
    for (const job of jobs.jobs) {
      try {
        await api('PATCH', `/api/mint-jobs/${job.id}`, { status: 'retrying' });
        addLog(`↻ Reset job ${job.id} (${job.vendor_name})`);
      } catch (e) {
        addLog(`❌ Failed to reset job ${job.id}: ${e.message}`, 'error');
      }
    }
    loadData();
  };

  // Initial load
  useEffect(() => { loadData(); }, []);

  return (
    <div className="vendor-inventory-widget card">
      <style>{`
        .vendor-inventory-widget { max-width: 900px; margin: 2rem auto; padding: 1.5rem; }
        .controls { display: flex; gap: 0.5rem; margin: 1rem 0; flex-wrap: wrap; }
        .controls button { padding: 0.5rem 1rem; border: none; border-radius: 4px; cursor: pointer; }
        .btn-primary { background: #2563eb; color: white; }
        .btn-secondary { background: #64748b; color: white; }
        .btn-warning { background: #d97706; color: white; }
        .log { background: #0f172a; color: #16a34a; font-family: monospace; font-size: 0.85rem; padding: 1rem; border-radius: 4px; max-height: 300px; overflow-y: auto; margin-top: 1rem; }
        .log .error { color: #dc2626; }
        .log .warn { color: #d97706; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 1rem; margin-top: 1rem; }
        .stat { background: #1e293b; padding: 1rem; border-radius: 4px; text-align: center; }
        .stat-value { font-size: 1.5rem; font-weight: bold; color: #60a5fa; }
        .stat-label { font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; }
        table { width: 100%; border-collapse: collapse; margin-top: 1rem; }
        th, td { padding: 0.5rem; text-align: left; border-bottom: 1px solid #334155; }
        th { color: #94a3b8; font-weight: 600; font-size: 0.75rem; text-transform: uppercase; }
      `}</style>

      <h3>📦 Vendor & Inventory Management</h3>
      <p className="text-muted">Linea on-chain registry integration • Superadmin only</p>

      <div className="controls">
        <button className="btn-primary" onClick={handleBulkVendors} disabled={loading}>
          Import Vendors
        </button>
        <button className="btn-primary" onClick={handleBulkInventory} disabled={loading}>
          Import Inventory
        </button>
        <button className="btn-secondary" onClick={loadData} disabled={loading}>
          Refresh
        </button>
        {syncStatus?.totals?.failedMintJobs > 0 && (
          <button className="btn-warning" onClick={retryFailedJobs}>
            Retry Failed Jobs ({syncStatus.totals.failedMintJobs})
          </button>
        )}
      </div>

      {/* Sync Status Summary */}
      {syncStatus && (
        <div className="summary">
          <div className="stat">
            <div className="stat-value">{syncStatus.totals.vendors}</div>
            <div className="stat-label">Vendors</div>
          </div>
          <div className="stat">
            <div className="stat-value">{syncStatus.totals.inventory}</div>
            <div className="stat-label">Inventory</div>
          </div>
          <div className="stat">
            <div className="stat-value">{syncStatus.totals.pendingMintJobs}</div>
            <div className="stat-label">Pending Mint</div>
          </div>
          <div className="stat">
            <div className="stat-value">{syncStatus.totals.failedMintJobs}</div>
            <div className="stat-label">Failed</div>
          </div>
        </div>
      )}

      {/* Activity Log */}
      <div className="log">
        {log.map((l, i) => (
          <div key={i} className={l.type}>
            [{l.ts}] {l.msg}
          </div>
        ))}
        {log.length === 0 && <div>Ready. Click "Import Vendors" to begin.</div>}
      </div>

      {/* Vendors Table */}
      {vendors.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h4>Vendors ({vendors.length})</h4>
          <table>
            <thead>
              <tr><th>Name</th><th>Type</th><th>Contact</th><th>Currency</th><th>Created</th></tr>
            </thead>
            <tbody>
              {vendors.map(v => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.type}</td>
                  <td>{v.contact || '—'}</td>
                  <td>{v.currency}</td>
                  <td>{new Date(v.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventory Table */}
      {inventory.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <h4>Inventory ({inventory.length})</h4>
          <table>
            <thead>
              <tr><th>Name</th><th>SKU</th><th>Category</th><th>Cost</th><th>Location</th></tr>
            </thead>
            <tbody>
              {inventory.map(i => (
                <tr key={i.id}>
                  <td>{i.name}</td>
                  <td><code>{i.sku || '—'}</code></td>
                  <td>{i.category}</td>
                  <td>{i.cost} {i.currency}</td>
                  <td>{i.location || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
