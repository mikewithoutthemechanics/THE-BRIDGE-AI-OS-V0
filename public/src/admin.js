// admin.js — API Key Management UI logic
const KEY_GROUPS = {
  'AI Providers': ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'KILO_API_KEY'],
  'Database': ['SUPABASE_URL', 'SUPABASE_SERVICE_KEY', 'SUPABASE_ANON_KEY'],
  'Payments': ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE'],
  'Security': ['JWT_SECRET', 'BRIDGE_INTERNAL_SECRET', 'BRIDGE_VERIFY_SECRET', 'TVM_SECRET'],
  'Integrations': ['GH_TOKEN', 'BREVO_SMTP_KEY', 'TELEGRAM_BOT_TOKEN'],
};

let keyStatuses = {};

function getSecret() {
  return localStorage.getItem('bridge_admin_secret') || '';
}

function promptForSecret() {
  var container = document.getElementById('keyGroups');
  if (!container) return;
  container.textContent = '';

  var box = document.createElement('div');
  box.style.cssText = 'padding:24px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:12px;text-align:center;';

  var label = document.createElement('p');
  label.textContent = 'Enter your admin secret to access key management:';
  label.style.cssText = 'color:var(--text-secondary);font-size:14px;margin-bottom:14px;';
  box.appendChild(label);

  var input = document.createElement('input');
  input.type = 'password';
  input.id = 'adminSecretInput';
  input.placeholder = 'BRIDGE_INTERNAL_SECRET';
  input.style.cssText = 'padding:10px 14px;width:100%;max-width:400px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:"JetBrains Mono",monospace;font-size:13px;margin-bottom:12px;';
  box.appendChild(input);

  box.appendChild(document.createElement('br'));

  var btn = document.createElement('button');
  btn.textContent = 'Authenticate';
  btn.style.cssText = 'padding:10px 28px;background:linear-gradient(135deg,#63ffda,#38bdf8);color:#060810;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:13px;';
  btn.onclick = function () {
    var val = input.value.trim();
    if (val) {
      localStorage.setItem('bridge_admin_secret', val);
      loadKeys();
    }
  };
  box.appendChild(btn);

  input.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') btn.click();
  });

  container.appendChild(box);
}

async function loadKeys() {
  var secret = getSecret();
  if (!secret) { promptForSecret(); return; }
  try {
    var r = await fetch('/api/admin/keys', {
      headers: { 'x-bridge-secret': secret },
    });
    var d = await r.json();
    if (!d.ok) {
      localStorage.removeItem('bridge_admin_secret');
      promptForSecret();
      showStatus('error', d.error || 'Invalid secret. Try again.');
      return;
    }
    keyStatuses = d.keys || {};
    renderGroups();
  } catch (e) {
    showStatus('error', 'Could not reach API: ' + e.message);
  }
}

function renderGroups() {
  const container = document.getElementById('keyGroups');
  if (!container) return;
  container.textContent = '';

  for (const [group, keys] of Object.entries(KEY_GROUPS)) {
    const section = document.createElement('div');
    section.className = 'key-group';
    section.style.cssText = 'margin-bottom:24px;padding:18px;background:var(--bg-tertiary);border:1px solid var(--border-color);border-radius:12px;';

    const title = document.createElement('h3');
    title.textContent = group;
    title.style.cssText = 'font-size:14px;font-weight:600;color:var(--accent-cyan);margin-bottom:14px;';
    section.appendChild(title);

    for (const key of keys) {
      const status = keyStatuses[key] || 'unknown';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';

      const dot = document.createElement('span');
      dot.style.cssText = 'width:8px;height:8px;border-radius:50%;flex-shrink:0;background:' +
        (status === 'set' ? 'var(--accent-green)' : status === 'weak' ? 'var(--accent-orange)' : 'var(--accent-red)');
      row.appendChild(dot);

      const label = document.createElement('label');
      label.textContent = key;
      label.style.cssText = 'font-family:"JetBrains Mono",monospace;font-size:12px;color:var(--text-secondary);min-width:220px;';
      row.appendChild(label);

      const input = document.createElement('input');
      input.type = 'password';
      input.id = 'key-' + key;
      input.placeholder = status === 'set' ? '(set — leave blank to keep)' : 'Enter value...';
      input.style.cssText = 'flex:1;padding:8px 12px;background:var(--bg-secondary);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-family:"JetBrains Mono",monospace;font-size:12px;';
      row.appendChild(input);

      const statusLabel = document.createElement('span');
      statusLabel.textContent = status;
      statusLabel.style.cssText = 'font-size:11px;min-width:50px;color:' +
        (status === 'set' ? 'var(--accent-green)' : status === 'weak' ? 'var(--accent-orange)' : 'var(--accent-red)');
      row.appendChild(statusLabel);

      section.appendChild(row);
    }
    container.appendChild(section);
  }
}

function showStatus(type, message) {
  var banner = document.querySelector('.status-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'status-banner';
    var shell = document.querySelector('.shell');
    if (shell) shell.insertBefore(banner, shell.children[1]);
  }
  banner.className = 'status-banner ' + type;
  banner.style.display = 'flex';
  banner.textContent = message;
  setTimeout(function () { banner.style.display = 'none'; }, 5000);
}

// Global saveKeys called by onclick
window.saveKeys = async function () {
  var secret = localStorage.getItem('bridge_admin_secret') || '';
  var updates = {};
  for (var keys of Object.values(KEY_GROUPS)) {
    for (var key of keys) {
      var input = document.getElementById('key-' + key);
      if (input && input.value.trim()) {
        updates[key] = input.value.trim();
      }
    }
  }
  if (Object.keys(updates).length === 0) {
    showStatus('error', 'No keys to update — fill in at least one field.');
    return;
  }
  try {
    var r = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bridge-secret': secret },
      body: JSON.stringify({ keys: updates }),
    });
    var d = await r.json();
    if (d.ok) {
      showStatus('success', 'Keys saved. Restart backend for changes to take effect.');
      loadKeys();
    } else {
      showStatus('error', d.error || 'Save failed.');
    }
  } catch (e) {
    showStatus('error', 'Save failed: ' + e.message);
  }
};

loadKeys();
