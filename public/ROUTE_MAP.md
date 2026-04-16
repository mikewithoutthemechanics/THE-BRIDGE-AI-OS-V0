# Route Map Summary

## Overview

**Total Routes Documented:** 98 routes  
**Admin Routes:** 11 routes (11.2%)  
**User Routes:** 87 routes (88.8%)

---

## Admin Routes

Routes requiring `admin` role authentication. These routes are located under the "Admin & Intelligence" category in the sitemap.

| Path | Page | Title | Auth Required |
|------|------|-------|---------------|
| `/admin-command.html` | AdminCommandCenter | Admin Command Center | admin |
| `/admin-revenue.html` | AdminRevenue | Admin Revenue | admin |
| `/admin.html` | AdminPanel | Admin Panel | admin |
| `/admin-withdraw.html` | AdminWithdraw | Admin Withdraw | admin |
| `/admin-sitemap.html` | AdminSitemap | Admin Sitemap | admin |
| `/intelligence.html` | Intelligence | Intelligence | admin |
| `/executive-dashboard.html` | ExecutiveDashboard | Executive Dashboard | admin/executive |
| `/aoe-dashboard.html` | AOEDashboard | AOE Dashboard | admin |
| `/bridge-audit-dashboard.html` | BridgeAuditDashboard | Bridge Audit | admin |
| `/auth-dashboard.html` | AuthDashboard | Auth Dashboard | admin |
| `/settings.html` | Settings | Settings | user (dual role) |

### Admin Routes - Nested Structures
- All admin routes are flat (no nested child routes)
- No dynamic path parameters detected in admin routes

---

## User Routes

User routes span multiple categories: Core, Verticals, Business Suite, Economy & DeFi, Agents & System, and Settings & Docs.

### Category Breakdown

| Category | Count |
|----------|-------|
| Core (non-admin) | 18 |
| Verticals | 14 |
| Business Suite | 15 |
| Economy & DeFi | 9 |
| Agents & System | 14 |
| Settings & Docs (user-facing) | 17 |

### Public Routes (no auth required)
- `/` - Landing Page
- `/checkout.html` - Checkout
- `/welcome.html` - Welcome
- `/pricing.html` - Pricing
- `/join.html` - Join
- `/payment-success.html` - Payment Success
- `/payment-cancel.html` - Payment Cancel
- `/docs.html` - API Docs
- `/sitemap.html` - Public Sitemap
- `/landing.html` - Landing (alt)
- `/404.html` - 404 Page
- `/offline.html` - Offline

---

## Notable Findings

### Deprecated Routes
- `/terminal.html` - Marked as legacy; use `/terminal-v3.html` instead

### Catch-All Routes
- No catch-all routes detected in the sitemap

### Path Conflicts
- No path conflicts detected (all routes have unique paths)

### Gaps & Inconsistencies

1. **Dynamic Parameters:** No routes in the sitemap contain dynamic path parameters (e.g., `/users/:id`). This is likely because the sitemap represents a flat page list rather than an API specification.

2. **Methods:** All routes default to `["GET"]` since the sitemap only lists page URLs, not API endpoints.

3. **Child Routes:** No nested routes found. Each page appears to be a standalone route.

4. **Middleware:** Inferred middleware based on auth requirements (authGuard for user routes, none for public routes).

---

## Route Statistics

```
Total Pages in Sitemap: 98
Admin Routes: 11 (11.2%)
User Routes: 87 (88.8%)

Auth Distribution:
- Public (none): 11 routes
- User (auth required): 75 routes
- Admin (auth required): 10 routes
- Dual role (admin/user): 1 route (settings.html)
- Executive: 1 route (executive-dashboard.html)
```

---

## Next Steps

1. **Validate against actual routing implementation** - Cross-reference with actual router configuration to verify path mappings
2. **Add dynamic parameters** - If the application has routes with dynamic IDs, document them separately
3. **Document API routes** - The sitemap only covers frontend pages; API endpoints need separate documentation
4. **Verify auth requirements** - Confirm actual auth requirements match these assumptions
5. **Update deprecated routes** - Ensure `/terminal.html` redirects to `/terminal-v3.html`

---

## Files Generated

- `routes.json` - Machine-readable route map with full metadata
- `ROUTE_MAP.md` - This summary document