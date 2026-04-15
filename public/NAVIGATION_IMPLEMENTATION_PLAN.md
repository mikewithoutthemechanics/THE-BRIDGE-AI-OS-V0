# Navigation Implementation Plan
**Updated**: 2026-04-15  
**Status**: PHASE 7 IN PROGRESS — Adding bridge-nav.js to pages missing it

---

## Audit Results

### Pages Missing bridge-nav.js (41 total)

| Priority | Page | Action | Notes |
|----------|------|--------|-------|
| **CRITICAL** | `aoe-unified-finalpublicauth-dashboard.html` | RENAME → `auth-dashboard.html` | Malformed filename! |
| **HIGH** | `index.html` | ADD bridge-nav.js | Landing page, needs nav |
| **HIGH** | `admin.html` | ADD bridge-nav.js | Admin entry point |
| **HIGH** | `billing.html` | ADD bridge-nav.js | User billing page |
| **HIGH** | `wallet.html` | ADD bridge-nav.js | Superadmin finance |
| **HIGH** | `defi.html` | ADD bridge-nav.js | Superadmin finance |
| **HIGH** | `trading.html` | ADD bridge-nav.js | Superadmin finance |
| **HIGH** | `governance.html` | ADD bridge-nav.js | Superadmin finance |
| **HIGH** | `settings.html` | ADD bridge-nav.js | User settings |
| **HIGH** | `dashboard.html` | ADD bridge-nav.js | User dashboard alt |
| **HIGH** | `admin-esim.html` | ADD bridge-nav.js | Admin sub-page |
| **HIGH** | `admin-revenue.html` | ADD bridge-nav.js | Admin sub-page |
| **HIGH** | `admin-withdraw.html` | ADD bridge-nav.js | Admin sub-page |
| **HIGH** | `executive-dashboard.html` | ADD bridge-nav.js | Admin sub-page |
| **HIGH** | `intelligence.html` | ADD bridge-nav.js | Admin sub-page |
| **HIGH** | `supadash.html` | ADD bridge-nav.js | Admin sub-page |
| **MEDIUM** | `ehsa.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `aurora.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `ban.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `hospital.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `rootedearth.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `ubi.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `supac.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `aid.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `esim.html` | ADD bridge-nav.js | Vertical platform |
| **MEDIUM** | `bridge-home.html` | ADD bridge-nav.js | Platform hub |
| **MEDIUM** | `console.html` | ADD bridge-nav.js | System console |
| **MEDIUM** | `tvm.html` | ADD bridge-nav.js | System tool |
| **MEDIUM** | `twin.html` | ADD bridge-nav.js | Digital twin |
| **MEDIUM** | `pipeline.html` | ADD bridge-nav.js | System tool |
| **MEDIUM** | `gateway.html` | ADD bridge-nav.js | System tool |
| **MEDIUM** | `pricing.html` | ADD bridge-nav.js | Public page |
| **LOW** | `404.html` | SKIP | Standalone error page |
| **LOW** | `auth-callback.html` | SKIP | OAuth callback, no nav needed |
| **LOW** | `offline.html` | SKIP | Service worker page |
| **LOW** | `linea-demo.html` | SKIP | Standalone demo |
| **LOW** | `anatomical_face*.html` (5) | SKIP | Educational standalone |

---

## Implementation Phases

### Phase 7A: Critical Bug Fix
- [ ] Rename `aoe-unified-finalpublicauth-dashboard.html` → `auth-dashboard.html`

### Phase 7B: Core App Pages (Priority HIGH)
Add bridge-nav.js to:
- [ ] `index.html` (landing)
- [ ] `admin.html` (admin entry)
- [ ] `billing.html`, `wallet.html`, `defi.html`, `trading.html`, `governance.html` (finance)
- [ ] `settings.html`, `dashboard.html` (user utilities)
- [ ] `admin-*.html` pages (admin sub-pages)
- [ ] `executive-dashboard.html`, `intelligence.html`, `supadash.html` (admin dashboards)

### Phase 7C: Verticals (Priority MEDIUM)
Add bridge-nav.js to all vertical platform pages:
- [ ] `ehsa.html`, `aurora.html`, `ban.html`, `hospital.html`, `rootedearth.html`, `ubi.html`, `supac.html`, `aid.html`, `esim.html`
- [ ] `bridge-home.html`, `console.html`, `tvm.html`, `twin.html`, `pipeline.html`, `gateway.html`
- [ ] `pricing.html`

### Phase 7D: Auth/Flow Pages
- [ ] Check `onboarding.html`, `join.html`, `activate.html`, `activation.html` — these already have bridge-nav.js but might need route additions

---

## Auth Callback Situation

Found `auth-callback.html` with NO bridge-nav.js — this is CORRECT for OAuth callbacks. OAuth callback pages should NOT have navigation as they:
1. Are temporary redirect pages
2. Process auth tokens then redirect
3. Should not show navigation

**No action needed for auth-callback.html**

---

## Duplicate File Issue

| File | Status |
|------|--------|
| `auth-dashboard.html` | ✅ Correct file (92 pages have bridge-nav.js) |
| `aoe-unified-finalpublicauth-dashboard.html` | ❌ Malformed duplicate — needs deletion |

---

## Route Additions Needed

If `billing.html`, `wallet.html`, `defi.html`, `trading.html`, `governance.html` need bridge-nav.js, add these routes to bridge-nav.js:

```javascript
{ label: 'Billing',    href: '/billing',    role: 'user' },
{ label: 'Wallet',     href: '/wallet',     role: 'superadmin' },
{ label: 'DeFi',       href: '/defi',      role: 'superadmin' },
{ label: 'Trading',    href: '/trading',   role: 'superadmin' },
{ label: 'Governance', href: '/governance', role: 'superadmin' },
```

---

## Verification Command

After implementation, run:
```powershell
Get-ChildItem "C:\aoe-unified-final\public\*.html" | Where-Object { (Get-Content $_.FullName -Raw) -notmatch 'bridge-nav\.js' } | Select-Object Name
```

Expected after fixes: ~10 files (404, auth-callback, offline, linea-demo, anatomical_face*, and potential duplicates)