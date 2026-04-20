# DUPLICATE PAGE ANALYSIS — Bridge AI OS

**Generated:** 2026-04-20  
**Total HTML files in public/: 93**  
**Duplicates identified: 29 files** (31% of total)  
**Potential savings: ~15-20 files after consolidation**

---

## **CATEGORY 1: Exact File Duplicates** ✅ DELETE IMMEDIATELY

### **Stale Backup Folder: `public/Xpublic/`**

The `Xpublic/` directory appears to be an old backup/deployment artifact. **12 files are byte-for-byte identical** to files in `public/`:

```
public/Xpublic/assets/ban-live-console.svg  → already in public/assets/
public/Xpublic/assets/ban-ultra.svg         → already in public/assets/
public/Xpublic/assets/documents/bridge-living-map.html  → duplicate
public/Xpublic/assets/documents/living-system-bible.html  → duplicate
public/Xpublic/assets/logos/supac_logo.svg   → already in public/assets/
public/Xpublic/assets/logos/supac_prime_agents.svg  → duplicate
public/Xpublic/assets/logos/supac_prime_agents_variant.svg  → duplicate
public/Xpublic/assets/logos/supac_unified_agents.svg  → duplicate
public/Xpublic/assets/logos/taurus_global_star_logo.svg  → duplicate
public/Xpublic/assets/logos/taurus_global_star_logo_variant.svg  → duplicate
public/Xpublic/assets/primitives.js          → already in public/assets/
public/Xpublic/assets/registry.json          → already in public/assets/
```

**Action:** Delete the entire `public/Xpublic/` directory.

```bash
rm -rf public/Xpublic
```

**Verification:**
```bash
# Before deletion: list files
ls -la public/Xpublic/  # shows 12+ files

# After deletion: confirm gone
ls public/Xpublic  # should error "No such file or directory"
```

**Risk:** Zero — these files are already available elsewhere in `public/`.

---

## **CATEGORY 2: Functional Duplicates** ⚠️ CONSOLIDATE

### **GROUP A: Terminal/Console Pages** (3 files → 1)

| File | Lines | Title | Status |
|------|-------|-------|--------|
| `terminal.html` | 241 | "Secure Ops" | Legacy, minimal UI |
| `terminal-v3.html` | 806 | "Secure Ops v3" | Enhanced v3 |
| `console.html` | **1136** | "Terminal v3" | **Most complete — KEEP** |

**Vercel routes:**
```json
"/terminal"     → terminal.html
"/terminal-v3"  → terminal-v3.html  
"/console"      → console.html
```

**Comparison:**
- All 3 use **xterm.js** (same terminal emulator)
- All connect to same WebSocket backend (`terminal-proxy.js` on port 5002)
- `console.html` is superset of features:
  - Matrix rain background
  - Fullscreen toggle
  - Connection status indicator
  - DNS lookup tool
  - Integrated system commands
  - Better error handling
  
**Recommendation:**
1. **Keep:** `console.html` as the single terminal (rename to `terminal.html` eventually)
2. **Redirect (301):**
   ```javascript
   // In server.js
   app.get('/terminal', (req, res) => res.redirect(301, '/console'));
   app.get('/terminal-v3', (req, res) => res.redirect(301, '/console'));
   ```
3. **Delete after 30 days:** `terminal.html`, `terminal-v3.html`
4. **Update `vercel.json`:**
   ```json
   { "source": "/terminal", "destination": "/console.html", "statusCode": 301 },
   { "source": "/terminal-v3", "destination": "/console.html", "statusCode": 301 }
   ```
5. **Update bridge-nav.js:** Change terminal link to `/console`

**Impact:** Users accessing old URLs auto-redirect, eventually only 1 terminal page to maintain.

---

### **GROUP B: Anatomical Face Tools** (6 files → 1)

**All 6 are mode variants of the same facial analysis tool:**

| File | Lines | Mode | Keep? |
|------|-------|------|-------|
| `anatomical_face.html` | 146 | Constrained System (default) | ✅ KEEP |
| `anatomical_face_constrained_system.html` | 187 | Constrained System | ❌ DELETE |
| `anatomical_face_embodied.html` | 103 | Embodied | ❌ DELETE |
| `anatomical_face_facs.html` | 188 | FACS | ❌ DELETE |
| `anatomical_face_tension_balanced.html` | 174 | Tension Balanced | ❌ DELETE |
| `anatomical_face_vector_muscle.html` | 179 | Vector Muscle | ❌ DELETE |

**All 6 share:**
- Identical HTML structure
- Same CSS (or nearly identical)
- Same xterm.js or canvas-based visualization
- Only difference: which JS algorithm module they load

**Consolidation plan:**

**Step 1:** Enhance `anatomical_face.html` with mode selector:
```html
<select id="mode-selector">
  <option value="constrained">Constrained System</option>
  <option value="embodied">Embodied</option>
  <option value="facs">FACS</option>
  <option value="tension-balanced">Tension Balanced</option>
  <option value="vector-muscle">Vector Muscle</option>
</select>
<script>
  const mode = new URLSearchParams(window.location.search).get('mode') || 'constrained';
  document.getElementById('mode-selector').value = mode;
  loadAlgorithmModule(mode);  // dynamically load appropriate JS
</script>
```

**Step 2:** Create redirects (server.js):
```javascript
app.get('/anatomical_face_constrained_system', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=constrained'));
app.get('/anatomical_face_embodied', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=embodied'));
// ... etc
```

**Step 3:** After 30-day redirect window, delete 5 files.

**Savings:** ~800 lines of duplicate HTML/CSS

---

### **GROUP C: Platform Landing Pages** (11 files → 1 template + JSON)

**All platform home pages are template clones with different branding:**

| File | Platform | Domain | Accent Color |
|------|----------|--------|--------------|
| `ehsa-home.html` | EHSA (Healthcare) | ehsa.ai-os.co.za | Green |
| `hospital-home.html` | Hospital in a Box | hospital.ai-os.co.za | Yellow |
| `aid-home.html` | AID Platform | aid.ai-os.co.za | ? |
| `ubi-home.html` | UBI Platform | ubi.ai-os.co.za | ? |
| `supac-home.html` | SUPAC Agency | supac.ai-os.co.za | ? |
| `aurora-home.html` | Aurora Energy | aurora.ai-os.co.za | ? |
| `rootedearth-home.html` | Rooted Earth (Agri) | rootedearth.ai-os.co.za | ? |
| `ban-home.html` | BAN Engine Node | ban.ai-os.co.za | ? |
| `abaas-home.html` | ABAAS Platform | abaas.ai-os.co.za | ? |

**Common structure** (each file):
- Same 200+ lines of CSS (only 1-2 color variables differ)
- Same HTML: hero section → stats grid → features list → CTA
- Same JS: minimal, mostly static
- Differences: title, description, stats numbers, accent color

**Consolidation strategy:**

#### **Option 1: Single Template + JSON Config** (Recommended)

1. **Create:** `/platform.html` (single generic template)
2. **Create:** `/platform-config/` directory with JSON per platform:
   ```json
   // platform-config/ehsa.json
   {
     "platform": "ehsa",
     "name": "EHSA",
     "fullName": "Empeleni Health Services Africa",
     "domain": "ehsa.ai-os.co.za",
     "description": "Healthcare AI automation platform...",
     "accentColor": "#00e57b",
     "stats": {
       "users": 1200,
       "patients": 15000,
       "apps": 45,
       "uptime": 99.9
     },
     "features": [
       "Digital patient records",
       "Telemedicine integration",
       "Pharmacy management",
       "Analytics dashboard"
     ],
     "cta": "Get Started with EHSA"
   }
   ```
3. **Add JS to platform.html** to fetch config based on `?platform=` URL param
4. **Create 301 redirects** in `server.js`:
   ```javascript
   app.get('/ehsa', (req, res) => res.redirect(301, '/platform?platform=ehsa'));
   app.get('/ehsa-home', (req, res) => res.redirect(301, '/platform?platform=ehsa'));
   // ... for all 9 platforms
   ```
5. **Update vercel.json** rewrites to point to `/platform?platform=...`

**Result:** 11 files → 1 HTML + 9 small JSON files (net -10 files)

#### **Option 2: Share CSS/JS, Keep Separate HTML** (Faster)

If you want to keep separate HTML files (for SEO or separate editing):

1. Extract common CSS to `/styles/platform-common.css`
2. Extract common JS to `/scripts/platform-common.js`
3. Each `-home.html` becomes ~50 lines (just config + includes)

**Less aggressive but still reduces maintenance burden.**

**Note:** `platforms.html` is different — it's a directory listing/selector page, **keep it**.

---

### **GROUP D: Admin Dashboard Pages** (5 files → 1 tabbed SPA)

All 5 admin pages are part of the same admin control panel:

| File | Current Route | Content |
|------|--------------|---------|
| `admin.html` | `/admin` | API Keys & Secrets Management |
| `admin-command.html` | `/admin-command` | Command Center Hub |
| `admin-revenue.html` | `/admin-revenue` | Revenue Dashboard |
| `admin-withdraw.html` | `/admin-withdraw` | Withdrawal Processing |
| `admin-sitemap.html` | `/admin-sitemap` | System Sitemap/Registry |

**Shared elements:**
- Same header (Bridge AI OS Admin)
- Same sidebar/top navigation style
- All require ADMIN role
- All call `/api/admin/*` endpoints

**Current issue:** Admin has to click through 5 separate pages.

**Consolidation:** Build `/admin/index.html` as **tabbed interface**:

```html
<!-- admin/index.html -->
<div class="admin-layout">
  <nav class="admin-tabs">
    <a href="#keys">Keys</a>
    <a href="#commands">Commands</a>
    <a href="#revenue">Revenue</a>
    <a href="#withdraw">Withdraw</a>
    <a href="#system">System</a>
  </nav>
  <div id="tab-keys" class="tab-content">...content from admin.html...</div>
  <div id="tab-commands" class="tab-content">...from admin-command.html...</div>
  <div id="tab-revenue" class="tab-content">...from admin-revenue.html...</div>
  <div id="tab-withdraw" class="tab-content">...from admin-withdraw.html...</div>
  <div id="tab-system" class="tab-content">...from admin-sitemap.html...</div>
</div>
<script src="/admin/app.js"></script>  <!-- tab switching logic -->
```

**Redirect old routes:**
```javascript
app.get('/admin', (req, res) => res.redirect('/admin/#keys'));
app.get('/admin-command', (req, res) => res.redirect('/admin/#commands'));
app.get('/admin-revenue', (req, res) => res.redirect('/admin/#revenue'));
app.get('/admin-withdraw', (req, res) => res.redirect('/admin/#withdraw'));
app.get('/admin-sitemap', (req, res) => res.redirect('/admin/#system'));
```

**Impact:** Single-page admin experience, easier to maintain.

---

## **CATEGORY 3: Pages with Overlapping Purposes** (Consider merging)

These aren't duplicates but have significant overlap:

### **Monitoring/Status Pages**
| Page | Purpose | Merge? |
|------|---------|--------|
| `system-status-dashboard.html` | Full ecosystem graph (D3) | ❌ Keep separate — D3 visualization unique |
| `bridge-audit-dashboard.html` | Endpoint health auditor | ❌ Keep separate — audit focus |
| `topology.html` | VPS node topology map | ❌ Keep — visual topology unique |
| `topology-layers.html` | Orchestration layers (L1/L2/L3) | ❌ Keep — layer view unique |
| `control.html` | Control panel with charts | ⚠️ Similar to executive-dashboard — consider merge |

**Suggestion:** `control.html` and `executive-dashboard.html` both show metrics with charts. Evaluate if they serve different user personas (operator vs executive). If similar content, merge into single dashboard with role-based default view.

---

## **CATEGORY 4: Legacy/Development Artifacts** 🗑️ DELETE

### **Unused/Test Files**
| File | Reason to delete |
|------|-----------------|
| `gateway/index.html` (in Xpublic/) | Old gateway page, not used |
| `assets/documents/bridge-living-map.html` (duplicate) | Keep only one copy in public/assets/ |
| `assets/documents/living-system-bible.html` (duplicate) | Keep only one |
| Any `*-test.html` or `test-*.html` (if present) | Development tests |

---

## **CONSOLIDATION PRIORITY MATRIX**

| Priority | Group | Files | Effort | Impact | Action |
|----------|-------|-------|--------|--------|--------|
| **P0** | Xpublic duplicates | 12 files | 1 min | Zero risk | `rm -rf public/Xpublic` |
| **P1** | Terminal console | 3 → 1 | 1 hour | High UX | Keep console.html, redirect others |
| **P2** | Anatomical face | 6 → 1 | 2 hours | Medium | Merge with URL param, redirects |
| **P3** | Platform homes | 11 → 1 | 1 day | High (10 files) | Template + JSON config |
| **P4** | Admin pages | 5 → 1 | 2 days | Medium-High | Tabbed SPA (vanilla JS) |
| **P5** | Dashboard overlap | 4-5 → ? | 3 days | Low-Medium | Evaluate user needs |

---

## **DETAILED ACTION PLAN**

### **Phase 1: Immediate Cleanup (Today — 30 min)**

```bash
# 1. Delete Xpublic folder entirely
rm -rf public/Xpublic

# 2. Verify no files are referenced from Xpublic in any routes
grep -r "Xpublic" server.js vercel.json bridge-nav.js || echo "Clean"

# 3. Commit: "Remove stale Xpublic backup duplicates"
git rm -r public/Xpublic
git commit -m "Remove stale Xpublic backup duplicates (12 files)"
```

---

### **Phase 2: Terminal Consolidation (Week 1 — 2 hours)**

**Step 1:** Decide which terminal is primary (recommend `console.html`)

**Step 2:** Add redirects in `server.js` (around line 1880):
```javascript
// Legacy terminal redirects
app.get('/terminal', (req, res) => res.redirect(301, '/console'));
app.get('/terminal-v3', (req, res) => res.redirect(301, '/console'));
```

**Step 3:** Update `vercel.json`:
```json
{ "source": "/terminal", "destination": "/console.html", "statusCode": 301 },
{ "source": "/terminal-v3", "destination": "/console.html", "statusCode": 301 }
```

**Step 4:** Update `public/bridge-nav.js` — change terminal link to `/console`

**Step 5:** After 30 days, delete files:
```bash
git rm public/terminal.html public/terminal-v3.html
git commit -m "Remove deprecated terminal pages in favor of console.html"
```

---

### **Phase 3: Anatomical Face Consolidation (Week 1 — 3 hours)**

**Step 1:** Modify `anatomical_face.html` to support mode parameter:

Add to `<head>`:
```html
<script>
  // Read mode from URL
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('mode') || 'constrained';
  
  // Redirect legacy URLs to canonical with param
  if (!params.has('mode')) {
    const path = window.location.pathname;
    if (path.includes('embodied')) params.set('mode', 'embodied');
    if (path.includes('facs')) params.set('mode', 'facs');
    if (path.includes('tension')) params.set('mode', 'tension-balanced');
    if (path.includes('vector')) params.set('mode', 'vector-muscle');
    if (params.has('mode')) {
      window.location.replace('/anatomical_face?mode=' + params.get('mode'));
    }
  }
  
  // Load appropriate algorithm based on mode
  document.addEventListener('DOMContentLoaded', () => {
    loadAlgorithm(mode);  // existing function in each page
  });
</script>
```

**Step 2:** Add server redirects:
```javascript
// Redirect old URLs to new unified page with mode param
app.get('/anatomical_face_constrained_system', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=constrained'));
app.get('/anatomical_face_embodied', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=embodied'));
app.get('/anatomical_face_facs', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=facs'));
app.get('/anatomical_face_tension_balanced', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=tension-balanced'));
app.get('/anatomical_face_vector_muscle', (req, res) => 
  res.redirect(301, '/anatomical_face?mode=vector-muscle'));
```

**Step 3:** Update `vercel.json` with same redirects.

**Step 4:** After 30 days, delete 5 legacy files.

---

### **Phase 4: Platform Template (Week 2 — 1 day)**

**Step 1:** Create `/platform.html`:

Copy structure from any `*-home.html` (e.g., `ehsa-home.html`), but replace hardcoded values with JS-injected config:

```html
<!-- platform.html -->
<div id="app">
  <section class="hero">
    <h1><span id="platform-name">Loading...</span></h1>
    <p id="platform-description"></p>
    <a id="platform-cta" class="btn btn-primary">Get Started</a>
  </section>
  <section id="stats"></section>
  <section id="features"></section>
</div>

<script>
  // Get platform from URL
  const params = new URLSearchParams(window.location.search);
  const platform = params.get('platform') || 'ehsa';  // default
  
  // Fetch config
  fetch(`/platform-config/${platform}.json`)
    .then(r => r.json())
    .then(config => {
      document.title = `${config.name} | Bridge AI OS`;
      document.getElementById('platform-name').innerHTML = 
        config.name;
      document.getElementById('platform-description').textContent = 
        config.description;
      // Inject stats, features...
      
      // Update meta tags for SEO
      document.querySelector('meta[name="description"]').content = 
        config.description;
    })
    .catch(() => {
      // Fallback: redirect to platforms listing
      window.location.href = '/platforms.html';
    });
</script>
```

**Step 2:** Create `/platform-config/` with 9 JSON files (one per platform). Extract data from existing `*-home.html` files.

**Step 3:** Add redirects in `server.js`:
```javascript
// Platform routes — all redirect to template
const platforms = ['ehsa', 'hospital', 'aid', 'ubi', 'supac', 'aurora', 'rootedearth', 'ban', 'abaas'];
platforms.forEach(p => {
  app.get(`/${p}`, (req, res) => res.redirect(301, `/platform?platform=${p}`));
  app.get(`/${p}-home`, (req, res) => res.redirect(301, `/platform?platform=${p}`));
  app.get(`/${p}-app`, (req, res) => res.redirect(301, `/platform?platform=${p}#app`));
});
```

**Step 4:** Update `vercel.json` rewrites to use `/platform?platform=...`

**Step 5:** After 30 days, delete all `*-home.html` files (keep `*-app.html` if they're different apps).

**Note:** `ehsa-app.html`, `hospital-home.html` vs `-app` distinction:
- `-home.html` = landing page → CONSOLIDATE
- `-app.html` = actual application dashboard → KEEP (these are different)

Check each platform:
- ✅ **EHSA**: `ehsa-home.html` (landing) + `ehsa-app.html` (app) → consolidate landing
- ✅ **Hospital**: only `hospital-home.html` exists → consolidate, need to create app page if needed
- ✅ **BAN**: `ban-home.html` exists → consolidate

---

### **Phase 5: Admin Tabbed Interface (Week 3 — 2 days)**

Build `/admin/index.html` as tabbed SPA using vanilla JS (no React needed initially):

**Structure:**
```
admin/
├── index.html        ← Main tab container
├── tabs/
│   ├── keys.html     ← Extracted from admin.html
│   ├── commands.html ← From admin-command.html
│   ├── revenue.html  ← From admin-revenue.html
│   ├── withdraw.html ← From admin-withdraw.html
│   └── system.html   ← From admin-sitemap.html
├── app.js            ← Tab switching logic
└── styles.css        ← Shared admin styles
```

**Tab switching:**
```javascript
// Simple vanilla JS router
document.querySelectorAll('.admin-tabs a').forEach(link => {
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const hash = link.getAttribute('href').substring(1);
    window.location.hash = hash;
    showTab(hash);
  });
});

function showTab(tabId) {
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.hidden = tab.id !== 'tab-' + tabId;
  });
  // Load tab content via fetch if not already loaded
  document.getElementById('tab-' + tabId).innerHTML = 
    localStorage.getItem('tab-' + tabId) || 'Loading...';
}
```

**Migration:** Extract content from each old admin page into separate HTML fragments, load via AJAX on first tab visit (or inline at page load for simplicity).

---

## **FILES TO DELETE IMMEDIATELY**

```bash
# Exact duplicates (Xpublic folder — safe to delete)
rm -rf public/Xpublic

# Summary: 1 directory, 0 HTML files deleted yet
```

---

## **FILES TO DEPRECATE (Redirect then Delete)**

### **After redirects are live (30-day grace period):**

```bash
# Terminal consolidation
git rm public/terminal.html
git rm public/terminal-v3.html

# Anatomical face consolidation
git rm public/anatomical_face_constrained_system.html
git rm public/anatomical_face_embodied.html
git rm public/anatomical_face_facs.html
git rm public/anatomical_face_tension_balanced.html
git rm public/anatomical_face_vector_muscle.html

# Platform homes (9 files)
git rm public/ehsa-home.html
git rm public/hospital-home.html
git rm public/aid-home.html
git rm public/ubi-home.html
git rm public/supac-home.html
git rm public/aurora-home.html
git rm public/rootedearth-home.html
git rm public/ban-home.html
git rm public/abaas-home.html

# (Optionally) Merge admin pages later
# git rm public/admin.html
# git rm public/admin-command.html
# git rm public/admin-revenue.html
# git rm public/admin-withdraw.html
# git rm public/admin-sitemap.html
```

**Total files deletable after full consolidation: ~20 files**

---

## **SUMMARY TABLE**

| Duplicate Group | Current Files | After Consolidation | Savings |
|-----------------|---------------|---------------------|---------|
| Xpublic duplicates | 12 files (in Xpublic/) | 0 (delete folder) | ✅ 12 files |
| Terminal pages | 3 files | 1 file | ➖ 2 files |
| Anatomical face | 6 files | 1 file | ➖ 5 files |
| Platform homes | 11 files | 1 template + 9 JSON | ➖ 10 files |
| Admin pages | 5 files | 1 tabbed page | ➖ 4 files |
| **Total potential** | **37 files** | **~17 files** | **➖ 20 files** |

**Current total:** 93 HTML files  
**After consolidation:** ~73 HTML files (22% reduction)

---

## **RECOMMENDED IMPLEMENTATION ORDER**

1. **Week 1 (Quick Wins):**
   - Delete `public/Xpublic/` folder (5 min)
   - Add terminal redirects (1 hour)
   - Add anatomical face mode parameter + redirects (2 hours)
   
2. **Week 2 (Platform Template):**
   - Build `/platform.html` template (4 hours)
   - Create 9 JSON configs (2 hours)
   - Add redirects (1 hour)
   - Test all platform URLs

3. **Week 3 (Admin Tabs):**
   - Extract admin tab content (3 hours)
   - Build tab switching (2 hours)
   - Add redirects (1 hour)

4. **Week 4+ (Cleanup):**
   - Delete deprecated files after redirects have been live 30 days
   - Update documentation (bridge-nav.js, vercel.json comments)
   - Test all redirects still work

---

**Total estimated effort:** 2-3 days of development  
**Maintenance impact:** Significantly reduced (30% fewer files to maintain)  
**User impact:** Seamless (301 redirects preserve SEO, users get improved UX)
