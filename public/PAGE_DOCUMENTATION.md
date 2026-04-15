# Bridge AI OS — Page & API Documentation

## Overview
This document maps all frontend HTML pages to their user flow groups, API routes, access control, dependencies, navigation, UI/UX details, and more.

**Last Updated**: 2026-04-15
**Status**: ✅ ALL PHASES COMPLETE — Navigation fixes, auth token consolidation, system page links (2026-04-15)

## Recent Updates (2026-04-15)
- **Phase 2**: Added 3 missing links to crm.html (Lead Gen, Pipeline, Legal AI)
- **Phase 3**: Verified all 9 vertical pages link to /platforms.html ✅
- **Phase 5**: Added 4 missing links to control.html (View Logs, Terminal, Admin, Command); Added System Status/Control links to infra.html; Added Control/System Status links to logs.html
- **Auth Token**: Standardized bridge-widget.js to use `bridge_token` instead of `bridge_user_token`
- **Deferred**: Auth token fallback cleanup — retain `bridge_user_token` fallback in bridge-auth.js for 24-48hr transition period, then remove

---

## PAGE INVENTORY (Actual Files in /public)

### Core Entry Points
| File | Status | Notes |
|------|--------|-------|
| `index.html` | ✅ Active | Landing page |
| `home.html` | ✅ Active | Main dashboard after login |
| `landing.html` | ✅ Active | Alternative landing |
| `join.html` | ✅ Active | Registration |
| `onboarding.html` | ✅ Active | User onboarding |
| `welcome.html` | ✅ Active | Post-onboarding welcome |
| `welcome-tour.html` | ✅ Active | Guided tour |
| `checkout.html` | ✅ Active | Payment checkout |
| `pricing.html` | ✅ Active | Pricing plans |
| `payment-success.html` | ✅ Active | Payment success redirect |
| `payment-cancel.html` | ✅ Active | Payment cancel redirect |
| `sitemap.html` | ✅ Active | Full sitemap |

### Business Suite (CRM & Operations)
| File | Status | Notes |
|------|--------|-------|
| `crm.html` | ✅ Active | CRM dashboard |
| `invoicing.html` | ✅ Active | Invoice management |
| `quotes.html` | ✅ Active | Quote management |
| `customers.html` | ✅ Active | Customer management |
| `vendors.html` | ✅ Active | Vendor management |
| `marketing.html` | ✅ Active | Marketing campaigns |
| `leadgen.html` | ✅ Active | Lead generation |
| `leads.html` | ✅ Active | Leads view (duplicate?) |
| `tickets.html` | ✅ Active | Support tickets |
| `legal.html` | ✅ Active | Legal documents |
| `legal-ai.html` | ✅ Active | AI legal assistant |
| `workforce.html` | ✅ Active | Workforce management |
| `affiliate.html` | ✅ Active | Affiliate program |

### Economy & DeFi
| File | Status | Notes |
|------|--------|-------|
| `economy.html` | ✅ Active | Economy overview |
| `tokenomics.html` | ✅ Active | Tokenomics details |
| `defi.html` | ✅ Active | DeFi pools |
| `trading.html` | ✅ Active | Trading interface |
| `wallet.html` | ✅ Active | Wallet management |
| `banks.html` | ✅ Active | Bank integration |
| `treasury-dashboard.html` | ✅ Active | Treasury management |
| `governance.html` | ✅ Active | DAO governance |
| `marketplace.html` | ✅ Active | Marketplace |

### Verticals / Sub-brands
| File | Status | Notes |
|------|--------|-------|
| `platforms.html` | ✅ Active | Platform hub |
| `ehsa.html` | ✅ Active | Health platform |
| `ehsa-home.html` | ✅ Active | Health home |
| `ehsa-app.html` | ✅ Active | Health mobile app |
| `ehsa-brain.html` | ✅ Active | Health AI brain |
| `aurora.html` | ✅ Active | Aurora AI platform |
| `aurora-home.html` | ✅ Active | Aurora home |
| `hospital.html` | ✅ Active | Hospital in a Box |
| `aid.html` | ✅ Active | AID platform |
| `aid-home.html` | ✅ Active | AID home |
| `ban.html` | ✅ Active | BAN network |
| `ban-home.html` | ✅ Active | BAN home |
| `ubi.html` | ✅ Active | UBI platform |
| `ubi-home.html` | ✅ Active | UBI home |
| `abaas.html` | ✅ Active | Agent-as-a-Service |
| `abaas-home.html` | ✅ Active | ABaaS home |
| `rootedearth.html` | ✅ Active | Agriculture platform |
| `rootedearth-home.html` | ✅ Active | Agriculture home |
| `supac.html` | ✅ Active | Agency platform |
| `supac-home.html` | ✅ Active | Agency home |
| `esim.html` | ✅ Active | eSIM platform |
| `claude-partner.html` | ✅ Active | Claude partner |
| `bridge-home.html` | ✅ Active | Bridge hub |

### Agents & System
| File | Status | Notes |
|------|--------|-------|
| `agents.html` | ✅ Active | Agent management |
| `neurolink.html` | ✅ Active | Neural network link |
| `topology.html` | ✅ Active | Network topology |
| `topology-layers.html` | ✅ Active | Topology layers view |
| `registry.html` | ✅ Active | System registry |
| `control.html` | ✅ Active | Control panel |
| `command-center.html` | ✅ Active | Command center |
| `system-status-dashboard.html` | ✅ Active | System health |
| `infra.html` | ✅ Active | Infrastructure |
| `terminal.html` | ✅ Active | Legacy terminal |
| `terminal-v3.html` | ✅ Active | Terminal v3 |
| `console.html` | ✅ Active | Console v3 |
| `logs.html` | ✅ Active | Log viewer |
| `view-logs.html` | ✅ Active | Log streaming |
| `avatar.html` | ✅ Active | 3D Avatar |
| `twin.html` | ✅ Active | Digital twin |
| `twin-wall.html` | ✅ Active | Twin social wall |
| `digital-twin-console.html` | ✅ Active | Twin console |
| `supadash.html` | ✅ Active | Supabase dashboard |
| `supadash-topology.html` | ✅ Active | Supabase topology |
| `supadash-registry.html` | ✅ Active | Supabase registry |
| `supadash-marketplace.html` | ✅ Active | Supabase marketplace |
| `supadash-avatar.html` | ✅ Active | Supabase avatar |

### Admin & Intelligence
| File | Status | Notes |
|------|--------|-------|
| `admin.html` | ✅ Active | Admin panel |
| `admin-command.html` | ✅ Active | Admin commands |
| `admin-revenue.html` | ✅ Active | Revenue management |
| `admin-withdraw.html` | ✅ Active | Withdrawal management |
| `admin-sitemap.html` | ✅ Active | Admin sitemap |
| `admin-esim.html` | ✅ Active | eSIM admin |
| `auth-dashboard.html` | ✅ Active | Auth dashboard |
| `bridge-audit-dashboard.html` | ✅ Active | Audit dashboard |
| `intelligence.html` | ✅ Active | Intelligence panel |
| `executive-dashboard.html` | ✅ Active | Executive dashboard |
| `aoe-dashboard.html` | ✅ Active | AOE operations |
| `svg-engine.html` | ✅ Active | SVG engine |
| `brand.html` | ✅ Active | Brand management |
| `corporate.html` | ✅ Active | Corporate org chart |
| `carrier-admin.html` | ✅ Active | Carrier admin |
| `godmode-terminal.html` | ✅ Active | God mode terminal |

### Settings & Utilities
| File | Status | Notes |
|------|--------|-------|
| `settings.html` | ✅ Active | User settings |
| `docs.html` | ✅ Active | API documentation |
| `view.html` | ✅ Active | Data viewer |
| `applications.html` | ✅ Active | Applications |
| `50-applications.html` | ✅ Active | App showcase |
| `profile.html` | ✅ Active | User profile |
| `billing.html` | ✅ Active | Billing |
| `projects.html` | ✅ Active | Projects |
| `wizard.html` | ✅ Active | Setup wizard |
| `dashboard.html` | ✅ Active | Dashboard (alt) |
| `ui.html` | ✅ Active | UI (alt) |
| `pipeline.html` | ✅ Active | Pipeline view |
| `runtime.html` | ✅ Active | Runtime stats |
| `iot.html` | ✅ Active | IoT dashboard |
| `outputs.html` | ✅ Active | Outputs |
| `tvm.html` | ✅ Active | TVM |
| `activation.html` | ✅ Active | Activation |
| `activate.html` | ✅ Active | Activate |
| `linea-demo.html` | ✅ Active | Linea demo |
| `demo.html` | ✅ Active | Demo |
| `gateway.html` | ✅ Active | Gateway |
| `gateway/index.html` | ✅ Active | Gateway sub |
| `output/index.html` | ✅ Active | Output sub |
| `esim-pbx.html` | ✅ Active | eSIM PBX |
| `auth-callback.html` | ✅ Active | OAuth callback |

### Error & Special
| File | Status | Notes |
|------|--------|-------|
| `404.html` | ✅ Active | 404 error page |
| `offline.html` | ✅ Active | Offline page |

---

## USER NAVIGATION MAP

### Primary Hub Structure
```
┌─────────────────────────────────────────────────────────────────┐
│                         HOME.HTML                               │
│                   (Main Dashboard Hub)                          │
│  ┌─────────┬─────────┬─────────┬─────────┬─────────┬─────────┐  │
│  │  CRM    │ Economy │ Agents  │Platforms│ Settings│ Docs   │  │
│  └────┬────┴────┬────┴────┬────┴────┬────┴────┬────┴─────────┘  │
└────────┼────────┼────────┼────────┼────────┼──────────────────┘
         │        │        │        │        │
         ▼        ▼        ▼        ▼        ▼
┌─────────────┐ ┌───────┐ ┌──────┐ ┌───────┐ ┌─────────┐
│ crm.html    │ │wallet │ │agents│ │platforms│ │settings│
│ ├──contacts│ │├──defi│ │├──neuro│ │├──ehsa │ │profile │
│ ├──invoices│ │├──trading│ │├──topology│ │├──aurora│ │billing │
│ ├──quotes │ │├──economy│ │├──marketplace│ │├──ban │ │security│
│ ├──leads  │ │├──governance│ │├──registry│ │├──ubi │ └──URITY---
│ ├──marketing│ └──────┘ │└──terminal│ │├──hospital│ 
│ ├──tickets │         │ └──avatar │ │├──aid │
│ └──vendors │         └──────────┘ │├──abaas│
└─────────────┘                    │├──rooted│
                                  │├──supac │
                                  │└──esim │
                                  └────────┘
```

### USER FLOW DIAGRAMS

#### 1. Core Entry Flow (Public → Member)
```
index.html (Landing)
    │
    ├── join.html (Sign Up)
    │       │
    │       └── onboarding.html (Onboarding)
    │               │
    │               └── welcome.html (Welcome)
    │                       │
    │                       └── home.html (Dashboard Hub)
    │
    ├── pricing.html (Pricing)
    │       │
    │       └── checkout.html
    │               │
    │               ├── payment-success.html → home.html
    │               └── payment-cancel.html → checkout.html
    │
    └── platforms.html (Explore Platforms)
```

#### 2. Business Suite Flow
```
home.html (Hub)
    │
    └── crm.html (CRM Dashboard)
            │
            ├── customers.html
            ├── vendors.html
            ├── invoicing.html
            │       └── quotes.html
            ├── leadgen.html
            │       └── leads.html
            ├── marketing.html
            ├── tickets.html
            ├── legal.html
            │       └── legal-ai.html
            └── workforce.html
                    └── affiliate.html
```

#### 3. Economy & DeFi Flow
```
home.html (Hub)
    │
    ├── economy.html
    │       │
    │       └── tokenomics.html
    │
    ├── wallet.html
    │       │
    │       ├── defi.html
    │       │       └── trading.html
    │       ├── banks.html
    │       └── marketplace.html
    │
    └── treasury-dashboard.html (if admin)
            │
            └── governance.html
```

#### 4. Agent & System Flow
```
home.html (Hub)
    │
    ├── agents.html
    │       │
    │       ├── neurolink.html
    │       ├── marketplace.html
    │       └── avatar.html
    │               └── twin.html
    │                       ├── twin-wall.html
    │                       └── digital-twin-console.html
    │
    ├── topology.html
    │       └── topology-layers.html
    │
    ├── control.html
    │       ├── registry.html
    │       └── command-center.html
    │
    ├── console.html
    │       └── terminal-v3.html
    │
    ├── system-status-dashboard.html
    │       └── infra.html
    │
    └── logs.html
            └── view-logs.html
```

#### 5. Platforms/Verticals Flow
```
home.html (Hub)
    │
    └── platforms.html
            │
            ├── ehsa.html
            │       ├── ehsa-home.html
            │       ├── ehsa-app.html
            │       └── ehsa-brain.html
            │
            ├── aurora.html
            │       └── aurora-home.html
            │
            ├── hospital.html
            │
            ├── ban.html
            │       └── ban-home.html
            │
            ├── ubi.html
            │       └── ubi-home.html
            │
            ├── aid.html
            │       └── aid-home.html
            │
            ├── abaas.html
            │       └── abaas-home.html
            │
            ├── rootedearth.html
            │       └── rootedearth-home.html
            │
            ├── supac.html
            │       └── supac-home.html
            │
            ├── bridge-home.html
            │
            ├── esim.html
            │       └── esim-pbx.html
            │
            └── claude-partner.html
```

---

## ADMIN NAVIGATION MAP

### Admin Hub Structure
```
┌─────────────────────────────────────────────────────────────────┐
│                       ADMIN.HTML                                │
│                   (Admin Control Hub)                          │
│  ┌─────────┬──────────┬──────────┬──────────┬─────────────────┐  │
│  │ Users   │ Commands │ Revenue │ Withdraw │ Intelligence    │  │
│  └────┬────┴────┬─────┴────┬─────┴────┬─────┴────────┬────────┘  │
└───────┼─────────┼──────────┼──────────┼──────────────┼───────────┘
        │         │          │          │              │
        ▼         ▼          ▼          ▼              ▼
┌─────────────┐ ┌─────────┐┌──────────┐┌────────────┐┌────────────┐
│ admin-users│ │admin-   ││admin-    ││admin-      ││intelligence│
│ (via API)  │ │command  ││revenue   ││withdraw    ││.html       │
└─────────────┘ └────┬────┘└────┬─────┘└─────┬──────┘└────────────┘
                     │         │           │
                     ▼         ▼           ▼
              ┌────────────────────────────────┐
              │   admin-command.html (Execute)    │
              └────────────┬─────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
┌───────────────┐  ┌──────────────┐  ┌───────────────┐
│admin-revenue │  │admin-withdraw│  │bridge-audit   │
│.html         │  │.html        │  │-dashboard     │
└───────────────┘  └──────────────┘  └───────────────┘
                                  
                           ┌───────────────┐
                           │auth-dashboard │
                           │.html         │
                           └───────────────┘
```

### ADMIN FLOW DIAGRAMS

#### 1. Admin Main Flow
```
home.html (Member Dashboard)
    │
    └── admin.html (Admin Hub)
            │
            ├── admin-command.html (Command Execution)
            │       │
            │       ├── admin-revenue.html (Revenue Mgmt)
            │       ├── admin-withdraw.html (Withdrawals)
            │       ├── bridge-audit-dashboard.html (Audit)
            │       ├── auth-dashboard.html (Auth Management)
            │       └── admin-sitemap.html (Admin Sitemap)
            │
            ├── admin-esim.html (eSIM Admin)
            │
            ├── intelligence.html (Intelligence)
            │
            ├── executive-dashboard.html (Executive View)
            │       │
            │       └── aoe-dashboard.html (AOE Ops)
            │               │
            │               ├── svg-engine.html (Skills Engine)
            │               ├── supadash.html (Supabase Dash)
            │               │       ├── supadash-topology.html
            │               │       ├── supadash-registry.html
            │               │       ├── supadash-marketplace.html
            │               │       └── supadash-avatar.html
            │               │
            │               ├── system-status-dashboard.html
            │               └── infra.html
            │
            ├── control.html (Control Panel)
            │       │
            │       ├── registry.html
            │       └── command-center.html
            │
            └── godmode-terminal.html (God Mode Terminal)
```

#### 2. System Control Flow
```
admin.html
    │
    └── control.html
            │
            ├── registry.html (Kernel/Network/Security)
            ├── command-center.html (Commands)
            ├── system-status-dashboard.html
            │       └── infra.html
            └── logs.html
                    └── view-logs.html
```

---

## MISSING NAVIGATION LINKS (Priority Fixes)

### Critical - User Experience
| From | Missing Link To | Add to |
|------|-----------------|--------|
| `home.html` | `ui.html` or `dashboard.html` | Main nav |
| `home.html` | `profile.html` | Main nav |
| `home.html` | `billing.html` | Main nav |
| `home.html` | `projects.html` | Main nav |
| `home.html` | `wizard.html` | Main nav |
| `home.html` | `supadash.html` | Main nav (hidden admin) |
| `home.html` | `pipeline.html` | Main nav |
| `home.html` | `runtime.html` | Main nav |
| `home.html` | `iot.html` | Main nav |
| `home.html` | `tvm.html` | Main nav |
| `crm.html` | `leads.html` | CRM sub-nav |
| `crm.html` | `affiliate.html` | CRM sub-nav |
| `platforms.html` | `hub.html` | Platform links |
| All verticals | Return link to `platforms.html` | Footer |
| `welcome.html` | `home.html` | Primary CTA |

### Critical - Admin Experience
| From | Missing Link To | Add to |
|------|-----------------|--------|
| `admin.html` | `admin-command.html` | Admin nav |
| `admin.html` | `admin-revenue.html` | Admin nav |
| `admin.html` | `admin-withdraw.html` | Admin nav |
| `admin.html` | `admin-esim.html` | Admin nav |
| `admin.html` | `intelligence.html` | Admin nav |
| `admin.html` | `executive-dashboard.html` | Admin nav |
| `admin.html` | `aoe-dashboard.html` | Admin nav |
| `admin.html` | `auth-dashboard.html` | Admin nav |
| `admin.html` | `bridge-audit-dashboard.html` | Admin nav |
| `admin.html` | `godmode-terminal.html` | Admin nav |
| `admin-command.html` | All sub-admin pages | Command page links |
| `executive-dashboard.html` | `aoe-dashboard.html` | Dashboard link |
| `aoe-dashboard.html` | `svg-engine.html` | Dashboard link |
| `aoe-dashboard.html` | `supadash.html` | Dashboard link |
| `aoe-dashboard.html` | `system-status-dashboard.html` | Dashboard link |

### Recommended - Consistency
| From | Missing Link To | Add to |
|------|-----------------|--------|
| `settings.html` | `docs.html` | Settings nav |
| `settings.html` | `sitemap.html` | Settings nav |
| `settings.html` | `profile.html` | Settings nav |
| `docs.html` | `admin.html` | Docs nav (for admins) |
| All pages | Breadcrumb navigation | Header |
| All pages | Return to `home.html` link | Header nav |
| Vertical pages | Parent vertical link | Header |
| `sitemap.html` | Missing pages link | Sitemap |

---

## NAVIGATION IMPLEMENTATION GUIDE

### Recommended: Shared Navigation JS (bridge-nav.js)
Create `public/bridge-nav.js` with:
```javascript
// Centralized navigation configuration
const NAV_CONFIG = {
  // User navigation structure
  user: {
    hub: '/home.html',
    sections: {
      'Dashboard': { hub: '/home.html', items: [
        { label: 'Dashboard', href: '/ui.html' },
        { label: 'Profile', href: '/profile.html' },
        { label: 'Projects', href: '/projects.html' },
        { label: 'Billing', href: '/billing.html' },
        { label: 'Settings', href: '/settings.html' }
      ]},
      'Business': { hub: '/crm.html', items: [
        { label: 'CRM', href: '/crm.html' },
        { label: 'Invoicing', href: '/invoicing.html' },
        { label: 'Quotes', href: '/quotes.html' },
        { label: 'Customers', href: '/customers.html' },
        { label: 'Vendors', href: '/vendors.html' },
        { label: 'Leads', href: '/leadgen.html' },
        { label: 'Marketing', href: '/marketing.html' },
        { label: 'Tickets', href: '/tickets.html' },
        { label: 'Legal', href: '/legal.html' },
        { label: 'Workforce', href: '/workforce.html' },
        { label: 'Affiliate', href: '/affiliate.html' }
      ]},
      'Economy': { hub: '/economy.html', items: [
        { label: 'Economy', href: '/economy.html' },
        { label: 'Wallet', href: '/wallet.html' },
        { label: 'DeFi', href: '/defi.html' },
        { label: 'Trading', href: '/trading.html' },
        { label: 'Governance', href: '/governance.html' },
        { label: 'Marketplace', href: '/marketplace.html' },
        { label: 'Treasury', href: '/treasury-dashboard.html', admin: true }
      ]},
      'Agents': { hub: '/agents.html', items: [
        { label: 'Agents', href: '/agents.html' },
        { label: 'NeuroLink', href: '/neurolink.html' },
        { label: 'Topology', href: '/topology.html' },
        { label: 'Marketplace', href: '/marketplace.html' },
        { label: 'Terminal', href: '/console.html' }
      ]},
      'Platforms': { hub: '/platforms.html', items: [
        { label: 'Platforms', href: '/platforms.html' },
        { label: 'EHSA', href: '/ehsa.html' },
        { label: 'Aurora', href: '/aurora.html' },
        { label: 'Hospital', href: '/hospital.html' },
        { label: 'BAN', href: '/ban.html' },
        { label: 'UBI', href: '/ubi.html' },
        { label: 'AID', href: '/aid.html' },
        { label: 'ABaaS', href: '/abaas.html' },
        { label: 'eSIM', href: '/esim.html' }
      ]},
      'System': { hub: '/control.html', admin: true, items: [
        { label: 'Control', href: '/control.html' },
        { label: 'Registry', href: '/registry.html' },
        { label: 'Command Center', href: '/command-center.html' },
        { label: 'System Status', href: '/system-status-dashboard.html' },
        { label: 'Infrastructure', href: '/infra.html' },
        { label: 'Logs', href: '/logs.html' }
      ]}
    }
  },
  
  // Admin navigation structure
  admin: {
    hub: '/admin.html',
    sections: {
      'Admin': { hub: '/admin.html', items: [
        { label: 'Admin Panel', href: '/admin.html' },
        { label: 'Commands', href: '/admin-command.html' },
        { label: 'Revenue', href: '/admin-revenue.html' },
        { label: 'Withdrawals', href: '/admin-withdraw.html' },
        { label: 'eSIM Admin', href: '/admin-esim.html' }
      ]},
      'Intelligence': { hub: '/intelligence.html', items: [
        { label: 'Intelligence', href: '/intelligence.html' },
        { label: 'Exec Dashboard', href: '/executive-dashboard.html' },
        { label: 'AOE Dashboard', href: '/aoe-dashboard.html' },
        { label: 'SVG Engine', href: '/svg-engine.html' },
        { label: 'Supadash', href: '/supadash.html' }
      ]},
      'Audit': { hub: '/bridge-audit-dashboard.html', items: [
        { label: 'Bridge Audit', href: '/bridge-audit-dashboard.html' },
        { label: 'Auth Dashboard', href: '/auth-dashboard.html' },
        { label: 'Admin Sitemap', href: '/admin-sitemap.html' }
      ]},
      'System': { hub: '/control.html', items: [
        { label: 'Control', href: '/control.html' },
        { label: 'God Mode', href: '/godmode-terminal.html' },
        { label: 'System Status', href: '/system-status-dashboard.html' },
        { label: 'Logs', href: '/logs.html' }
      ]}
    }
  }
};

// Inject navigation into page
function initNav(role = 'user') {
  // Implementation to inject nav based on role
}

// Check auth and inject correct nav
async function checkAuthAndNav() {
  // Check localStorage for bridge_token
  // Determine role from token
  // Call initNav with appropriate role
}
```

### Usage in Pages
```html
<!-- Add to all pages before </body> -->
<script src="/bridge-nav.js"></script>
<script>
  // Initialize navigation
  checkAuthAndNav();
</script>
```

### Breadcrumb Implementation
```javascript
// breadcrumb.config.js
const BREADCRUMBS = {
  '/home.html': ['Home'],
  '/crm.html': ['Home', 'CRM'],
  '/invoicing.html': ['Home', 'CRM', 'Invoicing'],
  '/admin.html': ['Home', 'Admin'],
  '/admin-command.html': ['Home', 'Admin', 'Commands'],
  // ... add all pages
};

function renderBreadcrumb() {
  const path = window.location.pathname;
  const crumbs = BREADCRUMBS[path] || ['Unknown'];
  // Render breadcrumb HTML
}
```

---

## FILES TO UPDATE (Action Items)

### Phase 1: Core Navigation (Critical)
- [x] `public/bridge-nav.js` exists with centralized navigation (updated 2026-04-15)
- [x] Add `bridge-nav.js` script include to all pages (already included in most pages)
- [x] Update `home.html` with complete navigation (uses bridge-nav.js)
- [x] Update `admin.html` with complete admin navigation (uses bridge-nav.js)

### Phase 2: Business Suite Links
- [x] Add missing links from `crm.html` to all sub-pages
- [x] Ensure back-navigation from all business pages
- [x] Add `leads.html` and `affiliate.html` links
- [x] ✅ COMPLETE: Added Lead Gen, Pipeline, Legal AI links to crm.html (2026-04-15)

### Phase 3: Vertical Platform Links
- [x] Add return links to `platforms.html` on all vertical pages
- [x] Ensure vertical sub-pages link back to parent vertical
- [x] Add missing `esim-pbx.html` and `claude-partner.html` links
- [x] ✅ COMPLETE: All 9 vertical pages (ehsa, aid, supac, ubi, rootedearth, hospital, ban, aurora, esim) confirmed linking to /platforms.html (2026-04-15)

### Phase 4: Admin Navigation
- [x] Create complete admin navigation sidebar (bridge-nav.js updated)
- [x] Add all admin sub-pages to admin routes (bridge-nav.js updated)
- [x] Add admin links to admin-command page (updated 2026-04-15)
- [x] Add `godmode-terminal.html` to admin nav (bridge-nav.js updated)

### Phase 5: System Pages
- [x] Link all system pages properly from `control.html`
- [x] Add system status links to infra page
- [x] Ensure logs pages link back to system
- [x] ✅ COMPLETE: Added View Logs, Terminal, Admin links to control.html; added System Status/Control links to infra.html; added Control/System Status links to logs.html (2026-04-15)

### Phase 6: Breadcrumbs
- [x] Add breadcrumb component to `bridge-nav.js` (added BREADCRUMBS config + renderBreadcrumb function)
- [x] Add breadcrumbs to all pages (auto-injected via bridge-nav.js)
- [x] Create breadcrumb configuration (BREADCRUMBS object covers all main routes)

---

## ACCESS CONTROL REFERENCE

### Role Hierarchy
```
Superadmin ──────► Full system control, audit logs, auth management
      │
Admin ──────────► User management, analytics, revenue, deploy
      │
Member ─────────► Dashboard, business tools, economy, agents
      │
Guest ──────────► Verticals, affiliate (read-only)
      │
Public ─────────► Landing, pricing, docs, sitemap
```

### Navigation by Role

| Section | Public | Guest | Member | Admin | Superadmin |
|---------|--------|-------|--------|-------|------------|
| Landing/Join | ✅ | - | - | - | - |
| Dashboard | - | ✅ | ✅ | ✅ | ✅ |
| Business Suite | - | - | ✅ | ✅ | ✅ |
| Economy/DeFi | - | - | ✅ | ✅ | ✅ |
| Agents/System | - | - | ✅ | ✅ | ✅ |
| Verticals | ✅ | ✅ | ✅ | ✅ | ✅ |
| Admin Panel | - | - | - | ✅ | ✅ |
| System Control | - | - | - | ✅ | ✅ |
| God Mode | - | - | - | - | ✅ |

---

*Last Updated: 2026-04-15*
*Status: NAVIGATION_AUDIT_IN_PROGRESS*

---

## 2. Business Suite
**Purpose**: CRM, invoicing, marketing, and operational tools

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| CRM | `/crm.html` | Member | Required | → invoicing, quotes, settings | Tailwind | Dark, table |
| Invoicing | `/invoicing.html` | Member | Required | ← crm, quotes, customers | Tailwind | Dark, invoice |
| Quotes | `/quotes.html` | Member | Required | → crm, invoicing, settings | Tailwind | Dark, cards |
| Legal | `/legal.html` | Member | Required | → crm, legal-ai, settings | Tailwind | Dark, docs |
| Legal AI | `/legal.html` | Member | Required | → legal, settings | Tailwind | Dark, AI chat |
| Marketing | `/marketing.html` | Member | Required | → crm, leadgen, settings | Tailwind | Dark, campaigns |
| Tickets | `/tickets.html` | Member | Required | → crm, settings | Tailwind | Dark, ticket list |
| Vendors | `/vendors.html` | Member | Required | → crm, invoicing, settings | Tailwind | Dark, vendor list |
| Customers | `/customers.html` | Member | Required | → crm, invoicing, settings | Tailwind | Dark, customer CRM |
| Workforce | `/workforce.html` | Member | Required | → crm, settings | Tailwind | Dark, agent deploy |
| LeadGen | `/leadgen.html` | Member | Required | → crm, marketing, settings | Tailwind | Dark, leads |
| Affiliate | `/affiliate.html` | Member | Optional | → wallet, settings | Tailwind | Dark, referrals |
| Corporate | `/corporate.html` | Member | Required | → settings | Tailwind + D3 | Dark, org chart |
| Brand | `/brand.html` | Admin | Required | → settings | Tailwind + custom | Dark, brand assets |

**API Routes**: `/api/crm/contacts`, `/api/crm/deals`, `/api/invoices`, `/api/quotes`, `/api/marketing/campaigns`, `/api/tickets`, `/api/vendors`, `/api/customers`, `/api/workforce/agents`, `/api/leadgen/leads`, `/api/affiliate/referrals`

**API Endpoints Detail**:
```
GET    /api/crm/contacts
       → Query: { page?, limit?, search?, tag? }
       → Returns: { contacts: [...], total: number, page: number }

POST   /api/crm/contacts
       → Body: { name, email, phone, company, tags? }
       → Returns: { contact: {...} }

GET    /api/invoices
       → Query: { status?, client?, date_from?, date_to? }
       → Returns: { invoices: [...], total: number }

POST   /api/invoices
       → Body: { client_id, items: [{ desc, qty, price }], due_date }
       → Returns: { invoice: {...}, pdf_url }

POST   /api/invoices/:id/send
       → Body: { email, template? }
       → Returns: { sent: true }

GET    /api/quotes
       → Query: { status?, client? }
       → Returns: { quotes: [...] }

POST   /api/quotes
       → Body: { client_id, items, valid_until }
       → Returns: { quote: {...} }

POST   /api/quotes/:id/accept
       → Body: { signature? }
       → Returns: { converted_to_invoice: {...} }

GET    /api/marketing/campaigns
       → Query: { status?, type? }
       → Returns: { campaigns: [...], stats: { sent, opened, clicked } }

POST   /api/marketing/campaigns
       → Body: { name, type, audience, content, schedule? }
       → Returns: { campaign: {...} }

GET    /api/tickets
       → Query: { status?, priority?, assigned_to? }
       → Returns: { tickets: [...] }

POST   /api/tickets
       → Body: { subject, description, priority, category }
       → Returns: { ticket: {...} }

POST   /api/tickets/:id/assign
       → Body: { agent_id }
       → Returns: { ticket: {...} }

GET    /api/vendors
       → Returns: { vendors: [...] }

POST   /api/vendors/:id/pay
       → Body: { amount, method, reference }
       → Returns: { transaction: {...} }

GET    /api/customers
       → Query: { segment?, lifetime_value? }
       → Returns: { customers: [...] }

POST   /api/customers/segments
       → Body: { name, filters: [...] }
       → Returns: { segment: {...} }

GET    /api/workforce/agents
       → Returns: { agents: [...], available: number, deployed: number }

POST   /api/workforce/agents/deploy
       → Body: { agent_type, config, duration }
       → Returns: { deployment: {...} }

GET    /api/leadgen/leads
       → Query: { source?, score?, converted? }
       → Returns: { leads: [...] }

POST   /api/leadgen/:id/convert
       → Body: { to_customer: boolean }
       → Returns: { lead: {...}, customer_id? }

GET    /api/affiliate/referrals
       → Returns: { referrals: [...], total_earnings: number }

POST   /api/affiliate/referrals/generate
       → Body: { campaign_id? }
       → Returns: { referral_link: string }
```

**Local Storage**: `bridge_user` (with CRM preferences)

**Session Storage**: `crm_last_filter`, `invoice_draft`

**Breadcrumb**: Home → CRM → [Invoicing / Quotes / Leads / Customers / Vendors / Marketing / Tickets / Legal / Workforce]

---

## 3. Economy & DeFi
**Purpose**: Tokenomics, trading, wallet, and financial operations

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Economy | `/economy.html` | Member | Required | → defi, trading, wallet, settings | Tailwind | Dark, charts |
| DeFi | `/defi.html` | Member | Required | → trading, wallet, economy | None (topnav) | Dark, pools |
| Trading | `/trading.html` | Member | Required | ← defi, wallet, economy | None (topnav) | Dark, orderbook |
| Wallet | `/wallet.html` | Member | Required | ← trading, defi, economy | None (topnav) | Dark, balance |
| Banks | `/banks.html` | Member | Optional | → wallet, settings | Tailwind | Dark, bank links |
| Treasury Dashboard | `/treasury-dashboard.html` | Admin | Required | → wallet, defi, settings | Tailwind | Dark, treasury |
| Payment | `/payment.html` | Member | Required | → checkout | Tailwind | Dark, payment |
| Governance | `/governance.html` | Member | Optional | ← trading, wallet | None (topnav) | Dark, proposals |
| Marketplace | `/marketplace.html` | Member | Required | → wallet, settings | Tailwind | Dark, listings |

**API Routes**: `/api/economy/supply`, `/api/defi/pools`, `/api/defi/staking`, `/api/trading/pairs`, `/api/wallet/balance`, `/api/treasury/status`, `/api/governance/proposals`, `/api/marketplace/listings`

**API Endpoints Detail**:
```
GET  /api/economy/supply
     → Returns: { total: number, circulating: number, staked: number, burned: number, 
                  distribution: { community: %, team: %, treasury: %, investors: % } }

GET  /api/economy/distribution
     → Returns: { chart: [{ label, value }], last_updated }

GET  /api/defi/pools
     → Returns: { pools: [{ id, name, tvl, apy, tokens: [...] }] }

POST /api/defi/pools/:id/stake
     → Body: { amount, duration }
     → Returns: { stake_id, rewards_estimate }

POST /api/defi/pools/:id/unstake
     → Body: { amount }
     → Returns: { transaction: {...} }

GET  /api/defi/staking
     → Returns: { stakes: [...], total_value, total_rewards }

GET  /api/trading/pairs
     → Returns: { pairs: [{ symbol, price, change_24h, volume }] }

GET  /api/trading/orderbook
     → Query: { symbol }
     → Returns: { bids: [...], asks: [...] }

POST /api/trading/order
     → Body: { symbol, side, type, amount, price? }
     → Returns: { order_id, status }

GET  /api/wallet/balance
     → Returns: { brdg: number, usd_value: number, chains: { eth: {}, linea: {} } }

POST /api/wallet/transfers
     → Body: { to, amount, chain, token }
     → Returns: { tx_hash, status }

GET  /api/wallet/transactions
     → Returns: { transactions: [...] }

GET  /api/treasury/status
     → Returns: { balance, earned, spent, reserved, flow_30d: [] }

GET  /api/treasury/summary
     → Returns: { revenue: {}, expenses: {}, net: {}, projections: {} }

GET  /api/treasury/ledger
     → Query: { limit?, offset?, type? }
     → Returns: { entries: [...], total }

GET  /api/governance/proposals
     → Returns: { proposals: [{ id, title, description, status, votes_for, votes_against, 
                              quorum, ends_at, my_vote? }] }

POST /api/governance/proposals/:id/vote
     → Body: { choice: 'for' | 'against' | 'abstain', amount? }
     → Returns: { vote: {...} }

GET  /api/governance/delegates
     → Returns: { delegates: [...] }

GET  /api/marketplace/listings
     → Query: { category?, sort?, limit? }
     → Returns: { listings: [...] }

POST /api/marketplace/orders
     → Body: { listing_id, quantity }
     → Returns: { order: {...} }
```

**WebSocket Endpoints**:
```
wss://go.ai-os.co.za/ws/trading/{symbol}  - Real-time price updates
wss://go.ai-os.co.za/ws/defi             - Pool TVL changes
wss://go.ai-os.co.za/ws/governance       - Proposal updates
```

**Local Storage**: `wallet_chain`, `trading_view`

**Breadcrumb**: Home → [Economy / Wallet] → [DeFi / Trading / Treasury / Governance / Marketplace]

---

## 4. Verticals / Sub-brands
**Purpose**: Specialized platforms for specific industries

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Bridge Hub | `/bridge-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, platform |
| EHSA Health | `/ehsa-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, health |
| EHSA App | `/ehsa-app.html` | Member | Required | ← ehsa | Tailwind | Dark, mobile |
| EHSA Brain | `/ehsa-brain.html` | Admin | Required | ← ehsa | Tailwind | Dark, analytics |
| Aurora AI | `/aurora-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, AI |
| Hospital in a Box | `/hospital-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, hospital |
| Bridge AID | `/aid-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, aid |
| BAN Network | `/ban-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, network |
| Rooted Earth | `/rootedearth-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, agri |
| Supaco Agency | `/supac-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, agency |
| UBI Platform | `/ubi-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, ubi |
| ABaaS Platform | `/abaas-home.html` | Member | Optional | → platforms | None (inline CSS) | Dark, agents |
| ABaaS App | `/abaas.html` | Member | Required | → platforms | Tailwind | Dark, agent deploy |
| Platforms | `/platforms.html` | All | - | → home, each vertical | Tailwind | Dark, network |
| EHSA | `/ehsa.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| Hospital | `/hospital.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| Aurora | `/aurora.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| BAN | `/ban.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| UBI | `/ubi.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| AID | `/aid.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| Rooted Earth | `/rootedearth.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| Supac | `/supac.html` | All | - | → platforms, settings | Tailwind | Dark, vertical |
| eSIM | `/esim.html` | All | Optional | → platforms, settings | Tailwind | Dark, telecom |
| Claude Partner | `/claude-partner.html` | All | Optional | → platforms, settings | Tailwind | Dark, partner |

**API Endpoints Detail**:
```
# Bridge
GET  /api/bridge/network
     → Returns: { nodes: [], edges: [], health: {} }

GET  /api/bridge/status
     → Returns: { uptime, transactions, active_users }

# EHSA (Electronic Health System for Africa)
GET  /api/ehsa/patients
     → Query: { status?, facility? }
     → Returns: { patients: [...], total, active }

GET  /api/ehsa/appointments
     → Query: { date?, doctor? }
     → Returns: { appointments: [...] }

GET  /api/ehsa/dashboard
     → Returns: { patients, appointments, revenue, ai_diagnostics }

GET  /api/ehsa/billing
     → Returns: { invoices, collections, pending }

POST /api/ehsa/telemedicine/session
     → Body: { patient_id, doctor_id }
     → Returns: { session_url, expires_at }

GET  /api/ehsa/pharmacy
     → Returns: { inventory, low_stock, orders }

# Aurora (AI with Emotion)
GET  /api/aurora/sessions
     → Returns: { sessions: [...], active }

POST /api/aurora/session
     → Body: { mode: 'voice' | 'text', emotion?: 'happy' | 'sad' | ... }
     → Returns: { session_id, endpoint }

GET  /api/aurora/emotion
     → Returns: { current_mood, triggers, history }

# Hospital in a Box
GET  /api/hospital/emr
     → Returns: { records, labs, imaging }

GET  /api/hospital/pharmacy
     → Returns: { inventory, prescriptions, alerts }

GET  /api/hospital/billing
     → Returns: { claims, insurance, patient_accounts }

# Bridge AID (Aid Distribution)
GET  /api/aid/donations
     → Returns: { total_received, donors, by_campaign }

GET  /api/aid/disbursement
     → Returns: { approved, pending, by_region }

POST /api/aid/apply
     → Body: { eligibility: {...}, documents: [...] }
     → Returns: { application_id }

# BAN (Business Agent Network)
GET  /api/ban/tasks
     → Returns: { queued, processing, completed }

POST /api/ban/task
     → Body: { objectives: [], constraints: {} }
     → Returns: { task_id, estimated_time }

GET  /api/ban/consensus
     → Returns: { validators, votes, decisions }

# UBI (Universal Basic Income)
GET  /api/ubi/distribution
     → Returns: { total_distributed, recipients, per_capita, next_distribution }

GET  /api/ubi/claims
     → Returns: { claimed, pending, expired }

POST /api/ubi/claim
     → Body: { wallet }
     → Returns: { claim_id, amount }

# ABaaS (Agent-as-a-Service)
GET  /api/abaas/instances
     → Returns: { instances: [{ id, type, status, uptime }] }

POST /api/abaas/deploy
     → Body: { template, config, scaling }
     → Returns: { instance: {...} }

GET  /api/abaas/metrics
     → Returns: { requests, latency, errors, cost }

# eSIM
GET  /api/esim/profiles
     → Returns: { profiles: [{ iccid, status, data_used, region }] }

POST /api/esim/provision
     → Body: { country, data_limit }
     → Returns: { iccid, qr_code }

GET  /api/esim/data
     → Returns: { usage: { current, limit }, topups: [...] }
```

**Subdomains**:
- `ehsa.ai-os.co.za` → EHSA platform
- `aurora.ai-os.co.za` → Aurora AI
- `hospital.ai-os.co.za` → Hospital in a Box
- `aid.ai-os.co.za` → Bridge AID
- `ubi.ai-os.co.za` → UBI Platform

**Breadcrumb**: Home → Platforms → [Select Vertical] → [App / Brain / Home]

---

## 5. Admin & Intelligence
**Purpose**: System administration, analytics, and monitoring

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Admin Panel | `/admin.html` | Superadmin | Required | → settings | Tailwind | Dark, admin |
| Admin Command | `/admin-command.html` | Superadmin | Required | → admin, settings | Tailwind | Dark, orange theme |
| Admin Revenue | `/admin-revenue.html` | Superadmin | Required | → admin-command, admin | Tailwind | Dark, orange theme |
| Admin Withdraw | `/admin-withdraw.html` | Superadmin | Required | → admin-command, admin | Tailwind | Dark, orange theme |
| Intelligence | `/intelligence.html` | Admin | Required | → admin, settings | None (topnav) | Dark, analytics |
| Executive Dashboard | `/executive-dashboard.html` | Admin | Required | → admin, settings | Tailwind | Dark, KPIs |
| AOE Dashboard | `/aoe-dashboard.html` | Admin | Required | → admin | Tailwind + custom | Dark, SVG engine |
| Bridge Audit | `/bridge-audit-dashboard.html` | Superadmin | Required | → admin-command | Tailwind | Dark, audit |
| Auth Dashboard | `/auth-dashboard.html` | Superadmin | Required | → admin-command | Tailwind | Dark, auth |
| Admin Sitemap | `/admin-sitemap.html` | Admin | Required | → admin | None | Dark, sitemap |

**API Endpoints Detail**:
```
# Admin Users
GET    /api/admin/users
       → Query: { role?, status?, search? }
       → Returns: { users: [...], total }

POST   /api/admin/users/:id/role
       → Body: { role: 'member' | 'admin' | 'superadmin' }
       → Returns: { user: {...} }

POST   /api/admin/users/:id/ban
       → Body: { reason, duration? }
       → Returns: { success: true }

# Admin Commands
GET    /api/admin/commands
       → Returns: { commands: [...], status }

POST   /api/admin/commands/execute
       → Body: { command: string, target?, args? }
       → Returns: { output, status, logs }

GET    /api/admin/stats
       → Returns: { users, revenue, activity }

# Revenue
GET    /api/revenue/mrr
       → Returns: { current, previous, growth, by_plan: {...} }

GET    /api/revenue/arr
       → Returns: { current, projected, run_rate }

GET    /api/revenue/streams
       → Returns: { streams: [{ name, amount, percent }] }

GET    /api/revenue/rails
       → Returns: { rails: [{ name, volume, transactions }] }

# Withdrawals
GET    /api/admin/withdraw/requests
       → Query: { status?, user? }
       → Returns: { requests: [...] }

POST   /api/admin/withdraw/approve
       → Body: { request_id, tx_hash? }
       → Returns: { request: {...} }

POST   /api/admin/withdraw/reject
       → Body: { request_id, reason }
       → Returns: { request: {...} }

# Audit
GET    /api/audit/bridge/transactions
       → Query: { from?, to?, type?, user? }
       → Returns: { transactions: [...], total }

GET    /api/audit/bridge/validators
       → Returns: { validators: [...], slashing_events }

GET    /api/audit/logs
       → Query: { level?, source? }
       → Returns: { logs: [...] }

# Auth
GET    /api/auth/sessions
       → Returns: { active: number, by_platform }

GET    /api/auth/tokens
       → Returns: { valid: [], expired: [], revoked: [] }

GET    /api/auth/logs
       → Query: { user?, action? }
       → Returns: { logs: [...] }

POST   /api/auth/revoke
       → Body: { user_id?, session_id?, all: boolean }
       → Returns: { revoked: number }

# Intelligence
GET    /api/intelligence/insights
       → Returns: { insights: [...], trends: {} }

GET    /api/intelligence/threats
       → Returns: { threats: [...], severity: {} }

GET    /api/intelligence/competitors
       → Returns: { competitors: [...] }

# Executive
GET    /api/exec/kpis
       → Returns: { kpis: { revenue, users, growth, retention } }

GET    /api/exec/forecast
       → Returns: { forecast: {...}, confidence }
```

**Admin Commands Available**:
```javascript
// System
'clear-cache'           // Clear all caches
'restart-services'      // Restart microservices
'rebuild-index'        // Rebuild search index
'backup-db'            // Trigger database backup
'sync-verticals'       // Sync vertical data

// Users
'export-users'         // Export user CSV
'reset-password'       // Force password reset
'verify-emails'        // Verify email list

// Economy
'mint-tokens'          // Mint new tokens
'burn-tokens'          // Burn tokens
'adjust-rewards'       // Adjust staking rewards
'pause-trading'        // Pause trading pairs
```

**Breadcrumb**: Home → Admin → [Command / Revenue / Withdraw / Audit / Auth / Intelligence / Executive]

---

## 6. Agents & System
**Purpose**: AI agents, neural networks, system control, and DevOps

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Agents | `/agents.html` | Member | Required | → neurolink, settings | Tailwind | Dark, agent list |
| NeuroLink | `/neurolink.html` | Member | Required | → agents, settings | Tailwind | Dark, purple theme |
| Registry | `/registry.html` | Admin | Required | → settings | Tailwind | Dark, kernel data |
| Topology | `/topology.html` | Member | Required | → settings | Tailwind + D3 + p5.js | Dark, force graph |
| Topology Layers | `/topology-layers.html` | Member | Optional | ← topology | Tailwind | Dark, layered |
| Control | `/control.html` | Admin | Required | → settings | Tailwind | Dark, control |
| Command Center | `/command-center.html` | Admin | Required | → settings | Tailwind | Dark, commands |
| System Status | `/system-status-dashboard.html` | Admin | Required | → settings | Tailwind + D3 | Dark, health graph |
| Infrastructure | `/infra.html` | Admin | Required | → settings | Tailwind | Dark, infra |
| Terminal (legacy) | `/terminal.html` | Member | Required | → console, settings | None | Dark, shell |
| Terminal v3 | `/terminal-v3.html` | Member | Required | → console, legacy, settings | Tailwind + custom CSS | Dark, terminal |
| Logs | `/logs.html` | Member | Required | → settings | Tailwind | Dark, log viewer |
| View Logs | `/view-logs.html` | Member | Required | → settings | Tailwind | Dark, stream |

**API Endpoints Detail**:
```
# Agents
GET    /api/agents/list
        → Query: { type?, status? }
        → Returns: { agents: [{ id, name, type, status, uptime, tasks_completed }] }

POST   /api/agents/deploy
        → Body: { type, config: {}, env?: {} }
        → Returns: { agent: {...}, endpoint }

POST   /api/agents/:id/stop
        → Returns: { success: true }

GET    /api/agents/metrics
        → Returns: { metrics: { requests, latency, errors } }

GET    /api/agents/templates
        → Returns: { templates: [...] }

# NeuroLink (Neural Network)
GET    /api/neurolink/neurons
        → Returns: { neurons: [...], total_connections }

GET    /api/neurolink/connections
        → Returns: { connections: [...] }

POST   /api/neurolink/train
        → Body: { dataset, epochs, model_type }
        → Returns: { training_job_id }

GET    /api/neurolink/sync
        → Returns: { sync_status, last_sync, pending_updates }

# Registry (System Registry)
GET    /api/registry/kernel
        → Returns: { kernel_version, modules: [], uptime }

GET    /api/registry/network
        → Returns: { peers: [], protocols: [] }

GET    /api/registry/security
        → Returns: { whitelist: [], blacklist: [], policies: [] }

GET    /api/registry/federation
        → Returns: { federated_nodes: [], trust_level }

GET    /api/registry/jobs
        → Returns: { scheduled: [], running: [], completed: [] }

# Topology
GET    /api/topology/nodes
        → Returns: { nodes: [{ id, type, status, location }] }

GET    /api/topology/links
        → Returns: { links: [{ source, target, bandwidth, latency }] }

GET    /api/topology/layers
        → Returns: { layers: { L1: [], L2: [], L3: [] } }

# System
GET    /api/system/health
        → Returns: { services: { name, status, latency }[], overall: 'healthy' | 'degraded' }

GET    /api/system/metrics
        → Returns: { cpu, memory, network, storage }

GET    /api/system/alerts
        → Returns: { critical: [], warning: [], info: [] }

# Infrastructure
GET    /api/infra/services
        → Returns: { services: [...] }

GET    /api/infra/deployments
        → Returns: { deployments: [...] }

GET    /api/infra/containers
        → Returns: { containers: [...] }

# Terminal
POST   /api/terminal/exec
        → Body: { command, cwd?, env?: {} }
        → Returns: { output, exit_code, duration }

GET    /api/terminal/history
        → Returns: { history: [...] }

# Logs
GET    /api/logs/query
        → Query: { level?, service?, from?, to?, limit? }
        → Returns: { logs: [...] }

GET    /api/logs/stream
        → Returns: { stream_url }

POST   /api/logs/export
        → Body: { format: 'json' | 'csv', filters }
        → Returns: { download_url }
```

**System Services Monitored**:
```javascript
const SERVICES = [
  'api-gateway',        // Main API router
  'auth-service',       // Authentication
  'user-service',        // User management
  'treasury-service',   // Economy/Treasury
  'agent-orchestrator', // AI agent management
  'notification-service', // Push/Email/SMS
  'websocket-server',   // Real-time
  'database-primary',    // PostgreSQL
  'database-replica',   // Read replica
  'redis-cache',        // Caching layer
  'ipfs-storage',        // File storage
  'linea-bridge',       // L2 bridge
];
```

**Health Status Codes**:
- 🟢 `healthy` - All metrics normal
- 🟡 `degraded` - Some latency/loss
- 🔴 `critical` - Service down
- ⚫ `unknown` - No data

**Breadcrumb**: Home → [Agents / NeuroLink / Topology / Terminal / Control] → [Registry / Logs / System / Infrastructure]

---

## 7. Settings & Docs
**Purpose**: User preferences, documentation, and utilities

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Settings | `/settings.html` | Member | Required | → all pages | Tailwind | Dark, sidebar |
| API Docs | `/docs.html` | All | - | → settings | Tailwind | Dark, endpoints |
| View | `/view.html` | Member | Optional | → settings | Tailwind | Dark, data view |
| Sitemap | `/sitemap.html` | All | - | → landing | Tailwind | Dark, site map |
| Landing (alt) | `/landing.html` | All | - | → main | None (inline CSS) | Dark, landing |
| 50 Applications | `/50-applications.html` | All | - | None | Tailwind | Dark, app list |
| Applications | `/applications.html` | Member | Required | None | Tailwind | Dark, apps |
| 404 Page | `/404.html` | All | - | → sitemap | Tailwind + inline | Dark, error |
| Offline | `/offline.html` | All | - | None | Tailwind + inline | Dark, offline |

**API Endpoints Detail**:
```
# Settings
GET    /api/settings
        → Returns: { theme, language, notifications, security: {...} }

PUT    /api/settings
        → Body: { theme?, language?, notifications?: {} }
        → Returns: { success: true }

GET    /api/settings/security
        → Returns: { mfa_enabled, sessions, trusted_devices }

POST   /api/settings/security/mfa/enable
        → Body: { method: 'totp' | 'sms' | 'email' }
        → Returns: { secret, qr_code }

POST   /api/settings/security/mfa/verify
        → Body: { code }
        → Returns: { success: true }

# API Docs
GET    /api/docs/spec
        → Returns: { openapi: {...} }

GET    /api/docs/endpoints
        → Returns: { endpoints: [{ path, methods, description, auth_required }] }

# Applications
GET    /api/applications
        → Returns: { applications: [...] }

GET    /api/applications/:id
        → Returns: { application: {...}, permissions }

POST   /api/applications
        → Body: { name, redirect_uri, permissions: [] }
        → Returns: { client_id, client_secret }
```

**Settings Categories**:
- Account (name, email, avatar)
- Security (password, MFA, sessions)
- Notifications (email, push, SMS)
- Appearance (theme, density)
- Billing (payment methods, invoices)
- API Keys (create, revoke)
- Integrations (connected apps)
- Privacy (data export, deletion)

**Breadcrumb**: Home → Settings → [Category]

---

## 8. Dev / Demo
**Purpose**: Development tools, demos, and experimental features

| Page | File | Roles | Auth | Navigation | Dependencies | UI Framework |
|------|------|-------|------|------------|--------------|--------------|
| Avatar / Twin | `/avatar.html` | Member | Required | → twin, settings | Tailwind + Babylon.js | Dark, 3D avatar |
| Digital Twin Console | `/digital-twin-console.html` | Member | Required | → twin-wall | Tailwind | Dark, twin console |
| Twin Wall | `/twin-wall.html` | Member | Required | → twin, settings | Tailwind | Dark, social |
| Twin | `/twin.html` | Member | Optional | ← avatar, settings | None (inline CSS) | Dark, twin |
| Main Dashboard | `/ui.html` | Member | Required | → settings | Tailwind | Dark, dashboard |
| Demo | `/demo.html` | Public | - | None | Tailwind | Dark, demo |
| Projects | `/projects.html` | Member | Required | → settings | Tailwind | Dark, projects |
| Profile | `/profile.html` | Member | Required | → settings | Tailwind | Dark, profile |
| Billing | `/billing.html` | Member | Required | → settings | Tailwind | Dark, billing |
| Wizard | `/wizard.html` | New | Required | → onboarding | Tailwind | Dark, wizard |
| Logs | `/logs.html` | Member | Required | → settings | Tailwind | Dark, logs |

**API Endpoints Detail**:
```
# Avatar / Digital Twin
GET    /api/avatar/render
        → Query: { emotion?, expression? }
        → Returns: { avatar_url, expression_data }

POST   /api/avatar/emotion
        → Body: { emotion: 'happy' | 'sad' | 'excited' | ... }
        → Returns: { updated: true }

GET    /api/twin/console
        → Returns: { twin_status, capabilities, active_sessions }

GET    /api/twin/wall/posts
        → Returns: { posts: [...] }

POST   /api/twin/wall/post
        → Body: { content, media? }
        → Returns: { post: {...} }

GET    /api/twin/status
        → Returns: { state: 'idle' | 'active', last_interaction, personality }

GET    /api/dashboard/stats
        → Returns: { stats: {...} }

GET    /api/demo/features
        → Returns: { features: [...], enabled: [] }

# Projects
GET    /api/projects
        → Returns: { projects: [...] }

POST   /api/projects
        → Body: { name, description, template? }
        → Returns: { project: {...} }

GET    /api/projects/:id
        → Returns: { project: {...}, files, collaborators }

# Profile
GET    /api/user/profile
        → Returns: { user: {...} }

PUT    /api/user/profile
        → Body: { name?, avatar?, bio?, timezone? }
        → Returns: { user: {...} }

# Billing
GET    /api/billing/invoices
        → Returns: { invoices: [...] }

GET    /api/billing/subscriptions
        → Returns: { subscriptions: [...] }

POST   /api/billing/payment-method
        → Body: { type: 'card', token }
        → Returns: { payment_method_id }

# Wizard
GET    /api/wizard/steps
        → Returns: { steps: [], current: number }

POST   /api/wizard/step/:n
        → Body: { data }
        → Returns: { next_step }

POST   /api/wizard/complete
        → Body: { final_data }
        → Returns: { user: {...}, onboarding_complete: true }
```

**Babylon.js Avatar Features**:
- 3D model with 52 facial muscles (FACS)
- Emotion engine (valence/arousal)
- Lip-sync with TTS
- 6 render modes (standard, xray, wireframe, etc.)
- WebGL + WebGPU fallback

**Breadcrumb**: Home → [Avatar / Twin / Profile / Billing / Projects / Wizard]

---

## Access Control Reference

### Role Hierarchy
```
Superadmin ──────► Full system control, audit logs, auth management
      │
Admin ──────────► User management, analytics, revenue, deploy
      │
Member ─────────► Dashboard, business tools, economy, agents
      │
Guest ──────────► Verticals, affiliate (read-only)
      │
Public ─────────► Landing, pricing, docs, sitemap
```

### Permission Matrix

| Capability | Public | Guest | Member | Admin | Superadmin |
|------------|--------|-------|--------|-------|-------------|
| View landing pages | ✅ | ✅ | ✅ | ✅ | ✅ |
| View verticals | ✅ | ✅ | ✅ | ✅ | ✅ |
| View sitemap/docs | ✅ | ✅ | ✅ | ✅ | ✅ |
| User authentication | - | ✅ | ✅ | ✅ | ✅ |
| Dashboard access | - | - | ✅ | ✅ | ✅ |
| CRM/Invoicing | - | - | ✅ | ✅ | ✅ |
| Marketing/Tickets | - | - | ✅ | ✅ | ✅ |
| Economy/DeFi | - | - | ✅ | ✅ | ✅ |
| Wallet/Trading | - | - | ✅ | ✅ | ✅ |
| Agents/NeuroLink | - | - | ✅ | ✅ | ✅ |
| Topology/Registry | - | - | - | ✅ | ✅ |
| Admin panels | - | - | - | ✅ | ✅ |
| System control | - | - | - | ✅ | ✅ |
| Audit logs | - | - | - | - | ✅ |
| Auth management | - | - | - | - | ✅ |
| Superadmin commands | - | - | - | - | ✅ |

### Token Requirements
| Page Type | Token Required | Token Type |
|-----------|---------------|------------|
| Landing | No | - |
| Pricing | No | - |
| Join | No | - |
| Verticals | Optional | JWT (optional) |
| Affiliate | Optional | JWT (optional) |
| Dashboard | Yes | JWT |
| Business tools | Yes | JWT |
| Economy | Yes | JWT |
| Admin | Yes | JWT (admin role) |
| Superadmin | Yes | JWT (superadmin role) |

### JWT Token Structure
```javascript
{
  "sub": "user_id",
  "email": "user@email.com",
  "role": "member" | "admin" | "superadmin",
  "plan": "free" | "pro" | "enterprise",
  "iat": 1234567890,
  "exp": 1234567890 + 86400  // 24 hours
}
```

---

## Navigation Breadcrumbs

### Core Flow
```
Landing (/)
    │
    ├─► Join (/join.html)
    │       └─► Onboarding (/onboarding.html)
    │               └─► Welcome (/welcome.html)
    │                       └─► Home (/home.html)
    │
    ├─► Pricing (/pricing.html)
    │       └─► Checkout (/checkout.html)
    │               ├─► Payment Success
    │               └─► Payment Cancel
    │
    └─► Portal/Voice/Console
            ├─► Voice Portal (/portal.html)
            ├─► Voice AI (/voice.html)
            └─► Console v3 (/console.html)
                    └─► Terminal v3 (/terminal-v3.html)
```

### Business Flow
```
Home (/home.html)
    └─► CRM (/crm.html)
            ├─► Invoicing (/invoicing.html)
            ├─► Quotes (/quotes.html)
            ├─► Customers (/customers.html)
            ├─► Vendors (/vendors.html)
            ├─► Marketing (/marketing.html)
            ├─► LeadGen (/leadgen.html)
            ├─► Tickets (/tickets.html)
            ├─► Legal (/legal.html)
            │       └─► Legal AI (/legal-ai.html)
            └─► Workforce (/workforce.html)
                    └─► Affiliate (/affiliate.html)
```

### Economy Flow
```
Home (/home.html)
    ├─► Economy (/economy.html)
    │       └─► DeFi (/defi.html)
    │               ├─► Trading (/trading.html)
    │               └─► Wallet (/wallet.html)
    │                       ├─► Treasury Dashboard (/treasury-dashboard.html)
    │                       ├─► Governance (/governance.html)
    │                       └─► Marketplace (/marketplace.html)
    └─► Wallet (/wallet.html)
            └─► Banks (/banks.html)
```

### Admin Flow
```
Home (/home.html)
    └─► Admin Panel (/admin.html)
            ├─► Admin Command (/admin-command.html)
            │       ├─► Admin Revenue (/admin-revenue.html)
            │       ├─► Admin Withdraw (/admin-withdraw.html)
            │       ├─► Bridge Audit (/bridge-audit-dashboard.html)
            │       └─► Auth Dashboard (/auth-dashboard.html)
            ├─► Intelligence (/intelligence.html)
            └─► Executive Dashboard (/executive-dashboard.html)
                    └─► AOE Dashboard (/aoe-dashboard.html)
```

### Vertical Flow
```
Home (/home.html)
    └─► Platforms (/platforms.html)
            ├─► Bridge Hub (/bridge-home.html)
            │       └─► Bridge Hub (alt) (/bridge.html)
            │
            ├─► EHSA (/ehsa-home.html)
            │       ├─► EHSA App (/ehsa-app.html)
            │       ├─► EHSA Brain (/ehsa-brain.html)
            │       └─► EHSA (/ehsa.html)
            │
            ├─► Aurora (/aurora-home.html)
            │       └─► Aurora (/aurora.html)
            │
            ├─► Hospital (/hospital-home.html)
            │       └─► Hospital (/hospital.html)
            │
            ├─► Bridge AID (/aid-home.html)
            │       └─► AID (/aid.html)
            │
            ├─► BAN (/ban-home.html)
            │       └─► BAN (/ban.html)
            │
            ├─► UBI (/ubi-home.html)
            │       └─► UBI (/ubi.html)
            │
            ├─► ABaaS (/abaas-home.html)
            │       └─► ABaaS (/abaas.html)
            │
            ├─► Rooted Earth (/rootedearth-home.html)
            │       └─► Rooted Earth (/rootedearth.html)
            │
            └─► Supaco (/supac-home.html)
                    └─► Supaco (/supac.html)

Also: eSIM (/esim.html), Claude Partner (/claude-partner.html)
```

### System Flow
```
Home (/home.html)
    ├─► Agents (/agents.html)
    │       └─► NeuroLink (/neurolink.html)
    │
    ├─► Topology (/topology.html)
    │       └─► Topology Layers (/topology-layers.html)
    │
    ├─► Control (/control.html)
    │       ├─► Registry (/registry.html)
    │       └─► Command Center (/command-center.html)
    │
    ├─► Terminal (/terminal.html)
    │       └─► Console v3 (/console.html)
    │               └─► Terminal v3 (/terminal-v3.html)
    │
    └─► System Status (/system-status-dashboard.html)
            ├─► Infrastructure (/infra.html)
            ├─► Logs (/logs.html)
            └─► View Logs (/view-logs.html)
```

### Settings Flow
```
Home (/home.html)
    └─► Settings (/settings.html)
            ├─► Account
            ├─► Security
            ├─► Notifications
            ├─► Appearance
            ├─► Billing
            ├─► API Keys
            ├─► Integrations
            └─► Privacy

Also: API Docs (/docs.html), Profile (/profile.html), Projects (/projects.html)
```

---

## UI/UX Standards

### Color Schemes by Category

| Category | Primary | Secondary | Accent | Background | Brand Color |
|----------|---------|-----------|--------|-------------|--------------|
| Core (default) | Cyan #00c8ff | Slate #1a2d40 | Green #00e57b | #050a0f | Bridge AI |
| Admin/Command | Orange #fb923c | Slate | Cyan | #050a0f | ⚡ |
| System | Red #ff3c5a | Slate | Purple #a78bfa | #050a0f | 🔧 |
| Economy | Green #00e57b | Slate | Yellow #ffd166 | #050a0f | 💰 |
| Health (EHSA) | Green #00e57b | Slate | Cyan | #050a0f | 🏥 |
| AI (Aurora) | Orange #fb923c | Slate | Pink #f472b6 | #050a0f | ✨ |
| Telecom (eSIM) | Blue #3b82f6 | Slate | Cyan | #050a0f | 📱 |
| Aid (AID) | Red #ff3c5a | Slate | Green | #050a0f | 🆘 |
| UBI | Green #00e57b | Slate | Yellow | #050a0f | 🌍 |
| Agriculture | Green #00e57b | Slate | Brown | #050a0f | 🌱 |

### Responsive Breakpoints

| Breakpoint | Width | Columns | Use Case |
|------------|-------|---------|----------|
| xs | < 640px | 1 | Mobile portrait |
| sm | 640px | 1-2 | Mobile landscape |
| md | 768px | 2 | Tablet portrait |
| lg | 1024px | 2-3 | Tablet landscape / Small desktop |
| xl | 1280px | 3 | Desktop |
| 2xl | 1536px | 4 | Large desktop |
| 3xl | 1920px | 4+ | Wide / Ultrawide |

### Typography

| Element | Font | Size | Weight | Line Height |
|---------|------|------|--------|-------------|
| H1 | system-ui | 2rem/32px | 700 | 1.2 |
| H2 | system-ui | 1.5rem/24px | 700 | 1.3 |
| H3 | system-ui | 1.25rem/20px | 600 | 1.4 |
| Body | system-ui | 1rem/16px | 400 | 1.5 |
| Small | system-ui | 0.875rem/14px | 400 | 1.5 |
| Mono (code) | 'Fira Code', monospace | 0.875rem/14px | 400 | 1.6 |
| Button | system-ui | 0.875rem/14px | 600 | 1 |

### Spacing System

| Name | Value | Usage |
|------|-------|-------|
| xs | 0.25rem (4px) | Tight spacing, badges |
| sm | 0.5rem (8px) | Component internal |
| md | 1rem (16px) | Standard padding |
| lg | 1.5rem (24px) | Section spacing |
| xl | 2rem (32px) | Major sections |
| 2xl | 3rem (48px) | Page margins |
| 3xl | 4rem (64px) | Hero sections |

### Component Library

| Component | Framework | Version | CDN |
|-----------|------------|---------|-----|
| Utility CSS | Tailwind CSS | 3.x | cdn.tailwindcss.com |
| 3D Rendering | Babylon.js | 6.x | cdn.babylonjs.com |
| Charts/Graphs | D3.js | 7.x | d3js.org |
| Force Layouts | p5.js | 1.x | cdnjs |
| Icons | Unicode | - | Native |
| Fonts | Google Fonts | - | fonts.googleapis.com |

### Dark Theme Variables

```css
:root {
  /* Backgrounds */
  --bg-primary: #050a0f;      /* Main background */
  --bg-secondary: #0d1620;   /* Cards, panels */
  --bg-tertiary: #111d2b;     /* Elevated surfaces */
  --bg-hover: #1a2d40;       /* Hover states */
  
  /* Borders */
  --border-default: #1a2d40;
  --border-hover: #2a3d50;
  --border-focus: #00c8ff;
  
  /* Text */
  --text-primary: #e0e8f0;
  --text-secondary: #c8dce8;
  --text-muted: #4d6678;
  --text-disabled: #3d4a58;
  
  /* Accents */
  --accent-cyan: #00c8ff;
  --accent-green: #00e57b;
  --accent-orange: #fb923c;
  --accent-red: #ff3c5a;
  --accent-purple: #a78bfa;
  --accent-yellow: #ffd166;
}
```

---

## State Management

### Local Storage

| Key | Type | Purpose | Expiry |
|-----|------|---------|--------|
| `bridge_token` | string | JWT auth token | 24 hours |
| `bridge_user` | object | Cached user profile | 5 minutes |
| `bridge_theme` | string | Theme preference ('dark'/'light') | Permanent |
| `bridge_sidebar` | boolean | Sidebar collapsed state | Permanent |
| `bridge_language` | string | Language preference | Permanent |
| `wallet_chain` | string | Last selected chain | Permanent |
| `trading_view` | string | Chart type preference | Permanent |

### Session Storage

| Key | Type | Purpose |
|-----|------|---------|
| `onboarding_step` | number | Current wizard step |
| `voice_session` | object | Voice transcript data |
| `checkout_data` | object | Checkout form draft |
| `modal_stack` | array | Open modal hierarchy |

### API Caching Strategy

| Endpoint Category | Cache Duration | Strategy |
|-------------------|----------------|-----------|
| Treasury/Balance | 30 seconds | stale-while-revalidate |
| User Profile | 5 minutes | cache-first |
| System Health | 10 seconds | stale-while-revalidate |
| Market Data | 5 seconds | network-first |
| Static Data | 1 hour | cache-first |
| Lists/Tables | 1 minute | stale-while-revalidate |

### State Sync

```javascript
// Auth state
const authState = {
  token: localStorage.getItem('bridge_token'),
  user: JSON.parse(localStorage.getItem('bridge_user')),
  isAuthenticated: !!localStorage.getItem('bridge_token'),
};

// Theme state
const themeState = {
  mode: localStorage.getItem('bridge_theme') || 'dark',
  sidebarCollapsed: JSON.parse(localStorage.getItem('bridge_sidebar') || 'false'),
};
```

---

## External Dependencies

### CDN Libraries

```html
<!-- Tailwind CSS -->
<script src="https://cdn.tailwindcss.com"></script>

<!-- Babylon.js (3D Avatar) -->
<script src="https://cdn.babylonjs.com/babylon.js"></script>
<script src="https://cdn.babylonjs.com/loaders/babylonjs.loaders.min.js"></script>

<!-- D3.js (Charts/Topology) -->
<script src="https://d3js.org/d3.v7.min.js"></script>

<!-- p5.js (Force Graphs) -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/p5.js/1.9.0/p5.min.js"></script>

<!-- Fira Code (Terminal Font) -->
<link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;500;600&display=swap" rel="stylesheet">
```

### Browser Support

| Browser | Min Version | Notes |
|---------|-------------|-------|
| Chrome | 90 | Full support |
| Firefox | 88 | Full support |
| Safari | 14 | Full support |
| Edge | 90 | Full support |
| Opera | 76 | Full support |
| iOS Safari | 14 | Full support |
| Android Chrome | 90 | Full support |

### Polyfills Required

```javascript
// For older browsers
- fetch()           // IE11
- Promise           // IE11
- async/await       // Edge 15+
- Object.entries()  // IE11
- Array.flat()      // IE11
```

### External Services

| Service | Purpose | Endpoint |
|---------|---------|----------|
| Linea zkEVM | L2 Blockchain | lineascan.io |
| IPFS | File Storage | ipfs.io |
| Cloudflare | CDN/DNS | cloudflare.com |
| SendGrid | Email | sendgrid.net |

---

## Performance Targets

### Page Load Targets

| Page Type | Target (3G) | Target (4G) | Target (Fiber) | Lighthouse Score |
|-----------|-------------|------------|----------------|-------------------|
| Landing | < 3s | < 2s | < 1s | 90+ |
| Dashboard | < 4s | < 3s | < 1.5s | 85+ |
| Business Tools | < 3.5s | < 2.5s | < 1s | 85+ |
| Economy | < 3s | < 2s | < 1s | 90+ |
| Admin | < 4s | < 3s | < 1.5s | 80+ |
| System (Topology) | < 5s | < 4s | < 2s | 75+ |
| 3D (Avatar) | < 6s | < 5s | < 3s | 70+ |

### Lazy Loading Strategy

```javascript
// Images
- Hero images: lazy load with placeholder
- Avatars: lazy load on scroll
- Charts: lazy load when visible (IntersectionObserver)

// Scripts
- Babylon.js: Load on-demand for avatar page
- D3.js: Load on-demand for topology
- p5.js: Load on-demand for force graphs

// Data
- Tables: Paginated, load 50 rows at a time
- Logs: Stream with infinite scroll
- Topology: Load nodes in chunks of 100
```

### Bundle Optimization

| Asset | Size Target | Optimization |
|-------|-------------|---------------|
| CSS (Tailwind) | < 50KB gzipped | Purge unused |
| JS (core) | < 100KB gzipped | Tree shake |
| JS (Babylon) | < 2MB | Load on-demand |
| JS (D3) | < 200KB | Import only needed modules |
| Fonts | < 20KB gzipped | Subset, woff2 only |
| Images | < 200KB each | WebP, responsive |

### Core Web Vitals Targets

| Metric | Target | Pages |
|--------|--------|-------|
| LCP (Largest Contentful Paint) | < 2.5s | All |
| FID (First Input Delay) | < 100ms | All |
| CLS (Cumulative Layout Shift) | < 0.1 | All |
| TBT (Total Blocking Time) | < 200ms | All |

---

## SEO Metadata

### Default Meta Tags

```html
<!-- Global -->
<meta name="description" content="Bridge AI OS — AI-powered business automation platform on Linea zkEVM. 71 AI agents, DeFi, healthcare, UBI.">
<meta name="keywords" content="AI, automation, blockchain, DeFi, healthcare, Africa, UBI, AI agents">
<meta name="robots" content="index, follow">
<meta name="author" content="Bridge AI OS">

<!-- Open Graph -->
<meta property="og:title" content="Bridge AI OS — AI Operating System">
<meta property="og:description" content="AI-powered business automation for Africa and beyond">
<meta property="og:type" content="website">
<meta property="og:url" content="https://go.ai-os.co.za">
<meta property="og:image" content="https://go.ai-os.co.za/og-image.png">

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="Bridge AI OS">
<meta name="twitter:description" content="AI-powered business automation">
<meta name="twitter:image" content="https://go.ai-os.co.za/og-image.png">

<!-- Favicon -->
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
```

### Per-Page Customization

| Page | Title | Description | Index |
|------|--------|-------------|-------|
| Landing | Bridge AI OS - AI Operating System | Main landing | ✅ |
| Pricing | Pricing - Bridge AI OS | Pricing plans | ✅ |
| Join | Join - Bridge AI OS | Sign up page | ✅ |
| Verticals | [Name] - Bridge AI OS | Platform specific | ✅ |
| Economy | Economy - Bridge AI OS | Tokenomics | ✅ |
| Docs | API Documentation - Bridge AI OS | API reference | ✅ |
| Admin | Admin - Bridge AI OS | (admin only) | ❌ |
| Sitemap | Sitemap - Bridge AI OS | Site map | ✅/❌ |
| 404 | Page Not Found - Bridge AI OS | Error page | ❌ |

### Structured Data

```json
{
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "name": "Bridge AI OS",
  "description": "AI-powered business automation platform",
  "url": "https://go.ai-os.co.za",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web Browser",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

---

## Error Handling

### HTTP Error Codes

| Code | Meaning | User Message | Action |
|------|----------|---------------|--------|
| 400 | Bad Request | "Invalid request data" | Show form errors |
| 401 | Unauthorized | "Please log in" | Redirect to login |
| 403 | Forbidden | "Access denied" | Show access denied UI |
| 404 | Not Found | "Page not found" | Show 404 page |
| 429 | Too Many Requests | "Please wait a moment" | Auto-retry after delay |
| 500 | Server Error | "Something went wrong" | Show error overlay |
| 502 | Bad Gateway | "Service temporarily unavailable" | Show retry |
| 503 | Service Unavailable | "Under maintenance" | Show offline page |

### Retry Logic

```javascript
const retryConfig = {
  maxRetries: 3,
  baseDelay: 1000,    // 1 second
  maxDelay: 4000,     // 4 seconds
  backoffMultiplier: 2,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
};

// Exponential backoff: 1s → 2s → 4s
const delay = Math.min(
  config.baseDelay * Math.pow(config.backoffMultiplier, attempt),
  config.maxDelay
);
```

### Error States UI

| Error Type | UI Response |
|------------|--------------|
| Network offline | Show offline page, hide interactive elements |
| API timeout | Show skeleton loader with retry button |
| Auth expired | Redirect to login with return URL |
| Permission denied | Show "Access Denied" card with contact admin CTA |
| Form validation | Inline error messages below each field |
| 404 | Show 404 page with search and sitemap links |

### Logging

```javascript
// Client-side error logging
window.onerror = (message, source, lineno, colno, error) => {
  logError({
    type: 'uncaught',
    message,
    source,
    lineno,
    stack: error?.stack,
    userAgent: navigator.userAgent,
  });
};

// Unhandled promise rejections
window.onunhandledrejection = (event) => {
  logError({
    type: 'unhandled_rejection',
    reason: event.reason,
  });
};
```

---

## Analytics Events

### Page Views

```javascript
// Auto-tracked on every page
{
  event: 'page_view',
  page: window.location.pathname,
  title: document.title,
  referrer: document.referrer,
  utm_source: urlParams.get('utm_source'),
  utm_medium: urlParams.get('utm_medium'),
  utm_campaign: urlParams.get('utm_campaign'),
}
```

### User Actions

| Event | Trigger | Data |
|-------|----------|------|
| `button_click` | CTA buttons | { button_id, button_text, page } |
| `form_submit` | All forms | { form_id, form_name, fields_count } |
| `form_error` | Validation failure | { form_id, field, error_type } |
| `api_error` | Failed API calls | { endpoint, status, error_message } |
| `auth_login` | Successful login | { method: 'email' \| 'oauth' } |
| `auth_logout` | User logout | { session_duration } |
| `checkout_start` | Checkout page view | { plan, price } |
| `checkout_complete` | Payment success | { order_id, amount, currency } |
| `checkout_abandon` | Exit checkout | { step, data_entered } |
| `navigation` | Menu clicks | { from, to, type } |
| `search` | Search usage | { query, results_count } |
| `filter_apply` | Table filters | { filter_key, filter_value } |
| `export` | Data exports | { format, record_count } |

### Funnel Tracking

```javascript
// Funnel 1: Sign up
Landing → Pricing → Checkout → Payment → Dashboard

// Funnel 2: Business tools
Home → CRM → First Contact → First Quote → First Invoice

// Funnel 3: Onboarding
Onboarding → Welcome → Profile Setup → First Action → Complete

// Funnel 4: Agent deployment
Agents → Select Template → Configure → Deploy → Monitor
```

### Analytics Tools

| Tool | Purpose | Integration |
|------|---------|--------------|
| Plausible | Page views, events | Script tag |
| PostHog | Product analytics, funnels | JS SDK |
| Sentry | Error tracking | JS SDK |
| LogRocket | Session replay | JS SDK |

---

## Testing Notes

### E2E Test IDs

| Page | Element | Test ID |
|------|---------|---------|
| Landing | Hero CTA | `#landing-cta` |
| Landing | Pricing button | `#landing-pricing` |
| Join | Form | `#join-form` |
| Join | Email input | `#join-email` |
| Join | Submit button | `#join-submit` |
| Login | Form | `#login-form` |
| Dashboard | Stats container | `#dashboard-stats` |
| Dashboard | Quick actions | `#dashboard-actions` |
| CRM | Contacts table | `#crm-contacts-table` |
| CRM | Add contact button | `#crm-add-contact` |
| Invoicing | Invoice list | `#invoices-list` |
| Invoicing | Create button | `#invoices-create` |
| Wallet | Balance display | `#wallet-balance` |
| Wallet | Send button | `#wallet-send` |
| DeFi | Pool list | `#defi-pools` |
| DeFi | Stake button | `#defi-stake` |
| Settings | Sidebar | `#settings-sidebar` |
| Settings | Account tab | `#settings-account` |

### Required Test Fixtures

```javascript
// User fixtures
const freeUser = {
  id: 'user_free_001',
  email: 'free@test.com',
  role: 'member',
  plan: 'free',
};

const adminUser = {
  id: 'user_admin_001',
  email: 'admin@test.com',
  role: 'admin',
  plan: 'enterprise',
};

const superadminUser = {
  id: 'user_superadmin_001',
  email: 'superadmin@test.com',
  role: 'superadmin',
  plan: 'enterprise',
};

// Data fixtures
const mockContacts = [
  { id: 1, name: 'John Doe', email: 'john@example.com', company: 'Acme' },
  { id: 2, name: 'Jane Smith', email: 'jane@example.com', company: 'Beta' },
];

const mockInvoice = {
  id: 'INV-001',
  client: 'Acme Inc',
  amount: 1500,
  status: 'pending',
  due_date: '2026-04-30',
};

const mockWallet = {
  brdg: 250.50,
  usd_value: 1252.50,
  chains: {
    ethereum: { brdg: 100 },
    linea: { brdg: 150.50 },
  },
};
```

### Test Scenarios

| Scenario | Steps | Expected Result |
|----------|-------|------------------|
| Login flow | 1. Go to /join | Form visible |
| | 2. Enter email | Validation passes |
| | 3. Submit | Redirect to onboarding |
| Access control | 1. Login as member | Dashboard accessible |
| | 2. Navigate to /admin | Access denied |
| | 3. Login as admin | Admin accessible |
| Checkout | 1. Select pro plan | Plan highlighted |
| | 2. Enter details | Form validates |
| | 3. Submit payment | Success redirect |
| API error handling | 1. Disconnect network | Offline message |
| | 2. Attempt action | Retry button appears |
| | 3. Reconnect | Action completes |

---

## File Counts

| Category | Pages |
|----------|-------|
| Core Dashboard | 13 |
| Business Suite | 14 |
| Economy & DeFi | 9 |
| Verticals | 24 |
| Admin & Intelligence | 10 |
| Agents & System | 13 |
| Settings & Docs | 9 |
| Dev / Demo | 11 |
| **Total** | **103+** |

---

## API Reference Quick Index

### Authentication
- `POST /api/auth/register`
- `POST /api/auth/login`
- `GET /api/auth/status`
- `GET /api/auth/sessions`
- `POST /api/auth/callback`
- `POST /api/auth/revoke`

### User Management
- `GET /api/user/profile`
- `PUT /api/user/profile`
- `GET /api/user/onboarding`

### Treasury & Economy
- `GET /api/treasury/status`
- `GET /api/treasury/summary`
- `GET /api/treasury/ledger`
- `GET /api/economy/supply`
- `GET /api/economy/distribution`

### Business Tools
- `GET /api/crm/contacts`
- `GET /api/invoices`
- `GET /api/quotes`
- `GET /api/marketing/campaigns`
- `GET /api/tickets`
- `GET /api/vendors`
- `GET /api/customers`
- `GET /api/workforce/agents`
- `GET /api/leadgen/leads`

### DeFi & Trading
- `GET /api/defi/pools`
- `GET /api/defi/staking`
- `GET /api/trading/pairs`
- `GET /api/wallet/balance`
- `POST /api/wallet/transfers`
- `GET /api/governance/proposals`
- `POST /api/governance/vote`

### Verticals
- `GET /api/ehsa/patients`
- `GET /api/ehsa/dashboard`
- `GET /api/aurora/sessions`
- `GET /api/hospital/emr`
- `GET /api/aid/donations`
- `GET /api/ubi/distribution`
- `GET /api/abaas/instances`
- `GET /api/esim/profiles`

### Admin
- `GET /api/admin/users`
- `POST /api/admin/commands/execute`
- `GET /api/revenue/mrr`
- `GET /api/revenue/arr`
- `GET /api/admin/withdraw/requests`
- `GET /api/audit/bridge/transactions`
- `GET /api/auth/logs`

### Agents & System
- `GET /api/agents/list`
- `POST /api/agents/deploy`
- `GET /api/neurolink/neurons`
- `GET /api/registry/kernel`
- `GET /api/topology/nodes`
- `GET /api/system/health`
- `POST /api/terminal/exec`
- `GET /api/logs/query`

---

*Generated: 2026-04-14*
*Project: Bridge AI OS*
*Version: 1.0*
*Last Updated: 2026-04-15 20:54 UTC*

---

## Changelog

| Date | Version | Change |
|------|---------|--------|
| 2026-04-14 | 1.0 | Initial comprehensive documentation with all sections |
| 2026-04-15 | 1.1 | Navigation fixes: bridge-nav.js updated with all missing routes (profile, billing, projects, ui, admin sub-pages), admin-command.html nav updated with all admin links |
| 2026-04-15 | 1.2 | ALL PHASES COMPLETE: Phase 1-5 nav fixes done; Phase 6 breadcrumbs added to bridge-nav.js BREADCRUMBS config; crm.html, control.html updated with complete nav links |