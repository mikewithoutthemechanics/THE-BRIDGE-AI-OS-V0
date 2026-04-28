// BridgeNavRoutes — Single source of truth for admin navigation structure.
// This file is read by scripts/gen-admin-groups.mjs at build time to generate
// src/generated/admin-groups.ts. DO NOT edit the generated file directly.
//
// The BridgeNavRoutes object is evaluated in a VM context and must contain:
// - ADMIN_GROUPS: Array of admin group definitions
// - ROLE_ORDER: Array defining role precedence
// - version: (optional) string version identifier

window.BridgeNavRoutes = {
  ADMIN_GROUPS: [
    {
      id: "admin",
      title: "Admin",
      desc: "Core admin panels — keys, commands, revenue, withdrawals, eSIM.",
      role: "admin",
      items: [
        {
          label: "Admin Keys",
          href: "/admin",
          desc: "API keys + environment secrets"
        },
        {
          label: "Command",
          href: "/admin-command",
          desc: "Execute privileged commands"
        },
        {
          label: "Revenue",
          href: "/admin-revenue",
          desc: "Revenue allocation + payouts"
        },
        {
          label: "Withdrawals",
          href: "/admin-withdraw",
          desc: "Authorize + execute withdrawals"
        },
        {
          label: "eSIM Admin",
          href: "/admin-esim",
          desc: "eSIM provisioning + carrier ops"
        },
        {
          label: "Carrier Admin",
          href: "/carrier-admin",
          desc: "Carrier relationship management"
        },
        {
          label: "Brand",
          href: "/brand",
          desc: "Brand assets + guidelines"
        },
        {
          label: "Corporate",
          href: "/corporate",
          desc: "Corporate structure + org chart"
        }
      ]
    },
    {
      id: "intelligence",
      title: "Intelligence",
      desc: "Analytics, executive KPIs, AOE ops, skills engine, Supabase dash.",
      role: "admin",
      items: [
        {
          label: "Intelligence",
          href: "/intelligence",
          desc: "System intelligence + analytics"
        },
        {
          label: "Executive",
          href: "/executive-dashboard",
          desc: "Exec KPIs + financial rollup"
        },
        {
          label: "AOE Dashboard",
          href: "/aoe-dashboard",
          desc: "AOE operational dashboard"
        },
        {
          label: "SVG Engine",
          href: "/svg-engine",
          desc: "Skills / SVG engine admin"
        },
        {
          label: "Supadash",
          href: "/supadash",
          desc: "Supabase operations dash"
        },
        {
          label: "EHSA Brain",
          href: "/ehsa-brain",
          desc: "EHSA analytics brain"
        }
      ]
    },
    {
      id: "audit",
      title: "Audit",
      desc: "Audit trail, auth sessions, admin sitemap.",
      role: "admin",
      items: [
        {
          label: "Bridge Audit",
          href: "/bridge-audit-dashboard",
          desc: "System audit dashboard"
        },
        {
          label: "Auth Dashboard",
          href: "/auth-dashboard",
          desc: "Auth sessions + users"
        },
        {
          label: "Admin Sitemap",
          href: "/admin-sitemap",
          desc: "Full admin page index"
        }
      ]
    },
    {
      id: "continuity",
      title: "Continuity",
      desc: "Digital-twin survivability + affiliate flow; all expenses settled by the Bank.",
      role: "admin",
      items: [
        {
          label: "Twin Orchestration",
          href: "/twin-orchestration",
          desc: "Spawn + supervise concurrent digital twins"
        },
        {
          label: "Bank Ledger",
          href: "/bank-ledger",
          desc: "Idempotent expense ledger (L1/L2/L3 settlement)"
        },
        {
          label: "Affiliate Flow",
          href: "/affiliate-flow",
          desc: "Affiliate propagation across twin lineage"
        }
      ]
    },
    {
      id: "system",
      title: "System",
      desc: "Control plane, registry, infrastructure, logs, god mode.",
      role: "admin",
      items: [
        {
          label: "Control",
          href: "/control",
          desc: "Control plane"
        },
        {
          label: "Registry",
          href: "/registry",
          desc: "Kernel / network / security registry"
        },
        {
          label: "Command Center",
          href: "/command-center",
          desc: "Command orchestration"
        },
        {
          label: "System Status",
          href: "/system-status-dashboard",
          desc: "Live system status"
        },
        {
          label: "Infrastructure",
          href: "/infra",
          desc: "Infra inventory + health"
        },
        {
          label: "Terminal",
          href: "/terminal",
          desc: "Web terminal"
        },
        {
          label: "Terminal V3",
          href: "/terminal-v3",
          desc: "Terminal V3 (new)"
        },
        {
          label: "Logs",
          href: "/logs",
          desc: "Structured logs"
        },
        {
          label: "View Logs",
          href: "/view-logs",
          desc: "Log viewer UI"
        },
        {
          label: "God Mode",
          href: "/godmode-terminal",
          desc: "Superadmin-only terminal",
          role: "superadmin"
        }
      ]
    },
    {
      id: "research",
      title: "Research",
      desc: "Internal reference documents, anatomical models, living maps.",
      role: "admin",
      items: [
        {
          label: "Anatomical Face",
          href: "/anatomical_face.html",
          desc: "Anatomical face model"
        },
        {
          label: "Living System Bible",
          href: "/assets/documents/living-system-bible.html",
          desc: "Internal system doctrine"
        },
        {
          label: "Bridge Living Map",
          href: "/assets/documents/bridge-living-map.html",
          desc: "Live architecture map"
        }
      ]
    }
  ],

  // Role precedence: lower index = lower privilege
  ROLE_ORDER: [null, "user", "admin", "superadmin"],

  version: "1.0.0"
};
