'use strict';
// =============================================================================
// BRIDGE AI CORPORATE OS — Temporal State Engine
// Generates deterministic, always-evolving business data from current time.
// No database required for base state — deterministic from epoch slots.
// Real user actions write through to Supabase and override base state.
// =============================================================================

// ── Seeded PRNG (LCG) ─────────────────────────────────────────────────────
function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function pick(rng, arr) { return arr[Math.floor(rng() * arr.length)]; }
function between(rng, lo, hi) { return lo + Math.floor(rng() * (hi - lo + 1)); }
function fmt2(n) { return n.toFixed(2); }

const SLOT_QUOTE    = 10 * 60 * 1000;   // new quote  every 10m
const SLOT_INVOICE  = 20 * 60 * 1000;   // pay invoice every 20m
const SLOT_TICKET   = 8  * 60 * 1000;   // new ticket every 8m
const SLOT_LEAD     = 5  * 60 * 1000;   // new lead   every 5m
const SLOT_INVENTORY= 15 * 60 * 1000;   // stock move every 15m
const SLOT_CAMPAIGN = 30 * 60 * 1000;   // campaign update every 30m

// ── Static reference data ─────────────────────────────────────────────────
const CLIENTS = [
  'Asante Africa Holdings','Khumalo Corp','Mokoena Consulting','Dlamini Digital',
  'Ubuntu Tech SA','Ndlovu Enterprises','Sithole Solutions','Nkosi Investments',
  'Baloyi Logistics','Mahlangu Media','TechCorp Global','Innovate Solutions',
  'Walsh Design Studio','Tokyo Tech University','Startup Hub London',
  'Global Logistics Corp','Thompson Marketing','MedTech Innovations',
  'Café Mendoza','Nkosi Holdings',
];
const SERVICES = [
  { name: 'AI Agent Setup',        price: 2500 },
  { name: 'Monthly AI License',    price: 499  },
  { name: 'Enterprise Plan',       price: 4999 },
  { name: 'Pro Plan',              price: 1499 },
  { name: 'Starter Plan',          price: 499  },
  { name: 'Custom Integration',    price: 7500 },
  { name: 'NeuroLink Module',      price: 3200 },
  { name: 'Corporate OS Suite',    price: 9999 },
  { name: 'Bridge AI Onboarding',  price: 1200 },
  { name: 'Analytics Dashboard',   price: 850  },
  { name: 'Support SLA (Annual)',  price: 2400 },
  { name: 'Automation Workflow',   price: 1800 },
];
const CURRENCIES = ['ZAR','ZAR','ZAR','ZAR','USD','EUR'];
const Q_STATUSES  = ['draft','sent','sent','accepted','accepted','accepted','expired'];
const INV_STATUSES= ['sent','sent','sent','paid','paid','paid','paid','overdue'];
const TICKET_SUBJECTS = [
  'Cannot access dashboard after login',
  'AI agent not responding to requests',
  'Invoice PDF not generating correctly',
  'Need help setting up custom workflow',
  'Treasury balance not updating',
  'CRM import failing with CSV error',
  'Billing question about enterprise plan',
  'API rate limit exceeded',
  'Custom domain setup assistance',
  'Agent task queue not draining',
  'Report export showing wrong date range',
  'Performance degradation in analytics',
];
const TICKET_PRIORITIES = ['low','low','medium','medium','medium','high','high','critical'];
const TICKET_STATUSES  = ['open','open','open','pending','pending','resolved','resolved','closed'];
const ASSIGNEES = ['ai-support-01','ai-support-02','ai-support-03','senior-tech','billing-team'];
const INVENTORY_ITEMS = [
  { sku:'LIC-ENT', name:'Enterprise Licences',  unit_cost:4999, location:'Digital Vault' },
  { sku:'LIC-PRO', name:'Pro Licences',          unit_cost:1499, location:'Digital Vault' },
  { sku:'LIC-STR', name:'Starter Licences',      unit_cost:499,  location:'Digital Vault' },
  { sku:'HW-SRV1', name:'Edge Server Node',      unit_cost:8500, location:'Cape Town DC'  },
  { sku:'HW-SRV2', name:'Compute Cluster Node',  unit_cost:12000,location:'JHB DC'        },
  { sku:'HW-GPU1', name:'AI GPU Module',         unit_cost:22000,location:'JHB DC'        },
  { sku:'API-TOK', name:'API Token Bundle 1M',   unit_cost:199,  location:'Digital Vault' },
  { sku:'SVC-SUP', name:'Support Contract Units',unit_cost:2400, location:'Digital Vault' },
];
const HR_TEAM = [
  { id:'hr-001', name:'Bridge AI Orchestrator',   role:'Chief AI Executive',    type:'ai_agent',  dept:'Executive',   performance:98 },
  { id:'hr-002', name:'Sales Agent Alpha',         role:'Lead Generation AI',    type:'ai_agent',  dept:'Sales',       performance:92 },
  { id:'hr-003', name:'Support Agent Nexus',       role:'Customer Support AI',   type:'ai_agent',  dept:'Support',     performance:95 },
  { id:'hr-004', name:'Finance Agent Ledger',      role:'Financial Controller',  type:'ai_agent',  dept:'Finance',     performance:97 },
  { id:'hr-005', name:'Marketing Agent Nova',      role:'Campaign Strategist',   type:'ai_agent',  dept:'Marketing',   performance:89 },
  { id:'hr-006', name:'Ryan Cowan',                role:'Founder & CEO',         type:'human',     dept:'Executive',   performance:100 },
  { id:'hr-007', name:'Operations Agent Flux',     role:'Workflow Orchestrator', type:'ai_agent',  dept:'Operations',  performance:94 },
  { id:'hr-008', name:'Analytics Agent Prism',     role:'Data Intelligence',     type:'ai_agent',  dept:'Analytics',   performance:91 },
  { id:'hr-009', name:'Security Agent Sentinel',   role:'Threat Monitor',        type:'ai_agent',  dept:'Security',    performance:99 },
  { id:'hr-010', name:'Content Agent Quill',       role:'Content Creator',       type:'ai_agent',  dept:'Marketing',   performance:87 },
];
const VENDORS = [
  { id:'v001', name:'Anthropic AI',        type:'AI Provider',    contact:'api@anthropic.com',     status:'active', currency:'USD', spend_mtd:2400 },
  { id:'v002', name:'Supabase',            type:'Database',       contact:'billing@supabase.io',   status:'active', currency:'USD', spend_mtd:180  },
  { id:'v003', name:'Vercel',              type:'Infrastructure', contact:'billing@vercel.com',    status:'active', currency:'USD', spend_mtd:320  },
  { id:'v004', name:'Cloudflare',          type:'CDN/Security',   contact:'billing@cloudflare.com',status:'active', currency:'USD', spend_mtd:45   },
  { id:'v005', name:'Sendgrid',            type:'Email',          contact:'billing@sendgrid.com',  status:'active', currency:'USD', spend_mtd:89   },
  { id:'v006', name:'Linea Network',       type:'Blockchain',     contact:'ops@linea.build',       status:'active', currency:'ETH', spend_mtd:0.02 },
  { id:'v007', name:'Steele & Partners',   type:'Legal Services', contact:'legal@steele.co.za',    status:'active', currency:'ZAR', spend_mtd:8500 },
  { id:'v008', name:'Bytes Technology',    type:'IT Hardware',    contact:'sales@bytes.co.za',     status:'active', currency:'ZAR', spend_mtd:0    },
];

// ── Temporal generators ───────────────────────────────────────────────────
function genQuote(slotIdx) {
  const r = prng(slotIdx * 7919 + 31337);
  const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
  const svc    = SERVICES[Math.floor(r() * SERVICES.length)];
  const qty    = between(r, 1, 5);
  const total  = svc.price * qty;
  const tax    = +(total * 0.15).toFixed(2);
  const status = Q_STATUSES[Math.floor(r() * Q_STATUSES.length)];
  const offsetDays = between(r, 1, 60);
  const created = new Date(Date.now() - offsetDays * 86400000 + slotIdx % 10000);
  const validUntil = new Date(created.getTime() + between(r, 7, 21) * 86400000);
  return {
    id: `quo_${slotIdx.toString(36).padStart(5,'0')}`,
    number: `BRG-Q-${String(slotIdx % 9000 + 1000).padStart(4,'0')}`,
    client, total: total + tax, subtotal: total, tax,
    status,
    items: [{ description: svc.name, qty, rate: svc.price, amount: svc.price * qty }],
    valid_until: validUntil.toISOString().split('T')[0],
    created_at: created.toISOString(),
  };
}

function genInvoice(slotIdx) {
  const r = prng(slotIdx * 6271 + 99991);
  const client = CLIENTS[Math.floor(r() * CLIENTS.length)];
  const svc    = SERVICES[Math.floor(r() * SERVICES.length)];
  const qty    = between(r, 1, 3);
  const subtotal = svc.price * qty;
  const tax    = +(subtotal * 0.15).toFixed(2);
  const total  = +(subtotal + tax).toFixed(2);
  const status = INV_STATUSES[Math.floor(r() * INV_STATUSES.length)];
  const offsetDays = between(r, 1, 45);
  const issued = new Date(Date.now() - offsetDays * 86400000);
  const due    = new Date(issued.getTime() + 30 * 86400000);
  return {
    id: `inv_${slotIdx.toString(36).padStart(5,'0')}`,
    number: `BRG-INV-${String(slotIdx % 9000 + 2000).padStart(4,'0')}`,
    client, subtotal, tax, total, status,
    items: [{ description: svc.name, qty, rate: svc.price, amount: svc.price * qty }],
    issued_date: issued.toISOString().split('T')[0],
    due_date: due.toISOString().split('T')[0],
    notes: 'Bridge AI OS — Thank you for your business',
    currency: pick(r, CURRENCIES),
    created_at: issued.toISOString(),
  };
}

function genTicket(slotIdx) {
  const r = prng(slotIdx * 5381 + 12345);
  const created = new Date(Date.now() - between(r, 0, 72) * 3600000);
  return {
    id: `tkt_${slotIdx.toString(36).padStart(5,'0')}`,
    number: `TKT-${String(slotIdx % 9000 + 3000).padStart(5,'0')}`,
    subject: pick(r, TICKET_SUBJECTS),
    priority: pick(r, TICKET_PRIORITIES),
    status: pick(r, TICKET_STATUSES),
    assignee: pick(r, ASSIGNEES),
    customer: pick(r, CLIENTS),
    created_at: created.toISOString(),
    updated_at: new Date(created.getTime() + between(r, 5, 180) * 60000).toISOString(),
  };
}

function genDebt(slotIdx) {
  const r = prng(slotIdx * 4093 + 55555);
  const amt = between(r, 500, 50000);
  const daysAgo = between(r, 5, 90);
  const created = new Date(Date.now() - daysAgo * 86400000);
  const due = new Date(created.getTime() + 30 * 86400000);
  const overdue = due < new Date();
  const paid = r() > 0.7;
  return {
    id: `dbt_${slotIdx.toString(36).padStart(5,'0')}`,
    debtor: pick(r, CLIENTS),
    amount: amt,
    currency: pick(r, CURRENCIES),
    status: paid ? 'paid' : (overdue ? 'overdue' : 'pending'),
    due_date: due.toISOString().split('T')[0],
    reminders_sent: between(r, 0, 3),
    invoice_ref: `BRG-INV-${String(slotIdx % 9000 + 2000).padStart(4,'0')}`,
    created_at: created.toISOString(),
  };
}

// ── Main state builder ─────────────────────────────────────────────────────
function buildState(overrides = {}) {
  const now = Date.now();

  // Generate N slots per entity type covering past 7 days
  const HISTORY_MS = 7 * 24 * 60 * 60 * 1000;

  const qSlots  = Math.floor(HISTORY_MS / SLOT_QUOTE);
  const iSlots  = Math.floor(HISTORY_MS / SLOT_INVOICE);
  const tSlots  = Math.floor(HISTORY_MS / SLOT_TICKET);
  const dSlots  = Math.ceil(HISTORY_MS / (2 * SLOT_INVOICE));

  const baseQuoteSlot   = Math.floor((now - HISTORY_MS) / SLOT_QUOTE);
  const baseInvSlot     = Math.floor((now - HISTORY_MS) / SLOT_INVOICE);
  const baseTktSlot     = Math.floor((now - HISTORY_MS) / SLOT_TICKET);
  const baseDebtSlot    = Math.floor((now - HISTORY_MS) / SLOT_INVOICE);

  const quotes   = Array.from({ length: qSlots  }, (_, i) => genQuote(baseQuoteSlot + i));
  const invoices = Array.from({ length: iSlots  }, (_, i) => genInvoice(baseInvSlot + i));
  const tickets  = Array.from({ length: tSlots  }, (_, i) => genTicket(baseTktSlot + i));
  const debts    = Array.from({ length: dSlots  }, (_, i) => genDebt(baseDebtSlot + i));

  // Inventory — static with temporal qty fluctuations
  const invR = prng(Math.floor(now / SLOT_INVENTORY));
  const inventory = INVENTORY_ITEMS.map((item, idx) => {
    const qtyR = prng(Math.floor(now / SLOT_INVENTORY) * 100 + idx);
    return {
      ...item,
      id: `inv_${String(idx + 1).padStart(3,'0')}`,
      qty: between(qtyR, 3, 250),
      last_updated: new Date(now - between(invR, 0, 4) * 3600000).toISOString(),
    };
  });

  // Apply overrides (mutations from user actions or cron)
  const applyOverrides = (arr, ovr) => {
    if (!ovr || !ovr.length) return arr;
    const map = new Map(arr.map(x => [x.id, x]));
    for (const o of ovr) map.set(o.id, { ...map.get(o.id), ...o });
    return [...map.values()];
  };

  const finalQuotes   = applyOverrides(quotes,   overrides.quotes);
  const finalInvoices = applyOverrides(invoices, overrides.invoices);
  const finalTickets  = applyOverrides(tickets,  overrides.tickets);
  const finalDebts    = applyOverrides(debts,    overrides.debts);

  // Treasury derived from paid invoices
  const paid = finalInvoices.filter(i => i.status === 'paid');
  const revenue = paid.reduce((s, i) => s + (i.total || 0), 0);
  const baseBalance = 157500; // anchor from system
  const dynamicBalance = +(baseBalance + revenue * 0.18).toFixed(2);

  // Analytics
  const openTickets = finalTickets.filter(t => t.status === 'open' || t.status === 'pending').length;
  const outstandingDebts = finalDebts.filter(d => d.status !== 'paid').reduce((s, d) => s + d.amount, 0);

  return {
    quotes: finalQuotes,
    invoices: finalInvoices,
    tickets: finalTickets,
    debts: finalDebts,
    inventory,
    vendors: VENDORS,
    hr: HR_TEAM,
    treasury: {
      balance: dynamicBalance,
      ubi: +(dynamicBalance * 0.20).toFixed(2),
      ops: +(dynamicBalance * 0.20).toFixed(2),
      treasury_reserve: +(dynamicBalance * 0.30).toFixed(2),
      founder: +(dynamicBalance * 0.10).toFixed(2),
    },
    analytics: {
      revenue_mtd: +(revenue * 0.3).toFixed(2),
      total_invoiced: +(finalInvoices.reduce((s,i) => s + i.total, 0)).toFixed(2),
      quotes_count: finalQuotes.length,
      invoices_count: finalInvoices.length,
      paid_invoices: paid.length,
      open_tickets: openTickets,
      outstanding_debt: +outstandingDebts.toFixed(2),
      debts_count: finalDebts.filter(d => d.status !== 'paid').length,
      agents_total: HR_TEAM.filter(h => h.type === 'ai_agent').length,
      human_total: HR_TEAM.filter(h => h.type === 'human').length,
      efficiency: 94.2,
      conversion: 23.4,
    },
    ts: new Date().toISOString(),
  };
}

// ── Marketing data (time-evolving) ────────────────────────────────────────
function buildMarketing() {
  const slot = Math.floor(Date.now() / SLOT_CAMPAIGN);
  const r = prng(slot * 8191 + 41411);
  return {
    funnel: {
      stages: [
        { stage: 'Visitors',   count: between(r, 1800, 2400) },
        { stage: 'Leads',      count: between(r, 280, 420)   },
        { stage: 'Qualified',  count: between(r, 80, 140)    },
        { stage: 'Proposals',  count: between(r, 30, 60)     },
        { stage: 'Customers',  count: between(r, 8, 18)      },
      ],
    },
    seo: {
      da: between(r, 42, 58),
      pages_indexed: between(r, 180, 220),
      keywords_ranking: between(r, 340, 480),
      organic_traffic_mtd: between(r, 8400, 12000),
    },
    social: {
      channels: [
        { platform: 'LinkedIn', followers: between(r, 3200, 3800), engagement: +(r() * 0.04 + 0.03).toFixed(3) },
        { platform: 'Twitter',  followers: between(r, 1800, 2400), engagement: +(r() * 0.03 + 0.02).toFixed(3) },
        { platform: 'YouTube',  followers: between(r, 620,  890),  engagement: +(r() * 0.06 + 0.04).toFixed(3) },
      ],
    },
    campaigns: [
      { id:'cmp_001', name:'Q2 AI Automation Outreach', type:'email',        status:'active',    sent: between(r,120,200), opened: between(r,70,110), replied: between(r,15,35), started_at:'2026-04-01' },
      { id:'cmp_002', name:'Corporate OS Launch',        type:'multi-channel',status:'active',    sent: between(r,80,140),  opened: between(r,40,90),  replied: between(r,8,22),  started_at:'2026-04-05' },
      { id:'cmp_003', name:'Re-engagement Series',       type:'email',        status:'completed', sent: 310,                opened: 198,               replied: 45,               started_at:'2026-03-15' },
      { id:'cmp_004', name:'Enterprise Webinar Invite',  type:'webinar',      status:'scheduled', sent: 0,                  opened: 0,                 replied: 0,                started_at:'2026-04-20' },
    ],
  };
}

// ── Legal/Compliance data ─────────────────────────────────────────────────
function buildLegal() {
  return {
    frameworks: [
      { name:'POPIA (SA Data Protection)',        status:'compliant',    last_reviewed:'2026-03-01' },
      { name:'GDPR (EU Data Protection)',          status:'compliant',    last_reviewed:'2026-02-15' },
      { name:'ISO 27001 (Information Security)',   status:'in_progress',  last_reviewed:'2026-04-01' },
      { name:'SOC 2 Type II',                      status:'in_progress',  last_reviewed:'2026-03-20' },
      { name:'PASA (Payment Systems)',             status:'compliant',    last_reviewed:'2026-01-10' },
    ],
    documents: [
      { name:'Master Service Agreement',    type:'contract',    jurisdiction:'South Africa', status:'active', expires:'2027-01-01' },
      { name:'Privacy Policy',              type:'policy',      jurisdiction:'Global',       status:'active', expires:null         },
      { name:'Terms of Service',            type:'policy',      jurisdiction:'Global',       status:'active', expires:null         },
      { name:'NDA Template',                type:'template',    jurisdiction:'South Africa', status:'active', expires:null         },
      { name:'SLA Agreement Template',      type:'template',    jurisdiction:'Global',       status:'active', expires:null         },
      { name:'Enterprise Licence Agreement',type:'contract',    jurisdiction:'South Africa', status:'active', expires:'2027-04-01' },
    ],
  };
}

// ── Activity log (last 20 synthetic events) ───────────────────────────────
function buildActivityLog() {
  const events = [];
  const now = Date.now();
  const types = [
    (r, i) => `Quote ${genQuote(i).number} sent to ${pick(r, CLIENTS)}`,
    (r, i) => `Invoice ${genInvoice(i).number} marked as paid — ZAR ${between(r,499,9999).toLocaleString()}`,
    (r)    => `New lead captured: ${pick(r, CLIENTS)} (score: ${between(r,60,96)})`,
    (r)    => `Support ticket resolved: ${pick(r, TICKET_SUBJECTS).substring(0,40)}...`,
    (r)    => `Treasury updated — balance: ZAR ${between(r,155,165)}K`,
    (r)    => `Marketing campaign opened by ${pick(r, CLIENTS)}`,
    (r)    => `HR: AI Agent task completed — ${between(r,3,15)} items processed`,
    (r)    => `Inventory: ${pick(r,INVENTORY_ITEMS).name} stock adjusted`,
    (r, i) => `Quote ${genQuote(i).number} accepted — converting to invoice`,
    (r)    => `Workflow auto-healed: pipeline gap detected and filled`,
    (r)    => `New vendor payment processed — ${pick(r, VENDORS).name}`,
    (r)    => `Analytics: conversion rate updated to ${between(r,18,32)}%`,
  ];

  for (let i = 0; i < 20; i++) {
    const offsetMs = i * 3 * 60 * 1000 + Math.floor(Math.random() * 60000);
    const slot = Math.floor((now - offsetMs) / SLOT_TICKET) + i;
    const r = prng(slot * 2311 + i * 137);
    const typeFn = types[Math.floor(r() * types.length)];
    events.push({
      id: `act_${slot}`,
      message: typeFn(r, slot),
      ts: new Date(now - offsetMs).toISOString(),
      module: pick(r, ['CRM','Sales','Finance','Support','HR','Marketing','Inventory','Treasury']),
    });
  }
  return events;
}

module.exports = { buildState, buildMarketing, buildLegal, buildActivityLog, prng, between, pick, CLIENTS, SERVICES, SLOT_TICKET, SLOT_QUOTE };
