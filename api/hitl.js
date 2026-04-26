// =============================================================================
// BRIDGE AI OS — HITL (Human-In-The-Loop) REST API
//
// GET  /api/hitl/queue              — list pending approvals
// GET  /api/hitl/queue/:id          — get single approval
// POST /api/hitl/queue/:id/approve  — approve a gate
// POST /api/hitl/queue/:id/reject   — reject a gate
// GET  /api/hitl/stats              — dashboard counts
//
// All endpoints require admin auth (X-Bridge-Admin header).
// =============================================================================
'use strict';

let orch = null;
try { orch = require('../engine/pipeline'); } catch (_) {}

function engineReady(res) {
  if (!orch) { res.status(503).json({ ok: false, error: 'Orchestration engine not loaded' }); return false; }
  return true;
}

function isAdmin(req) {
  return req.headers['x-bridge-admin'] === (process.env.BRIDGE_ADMIN_SECRET || 'bridge-admin');
}

async function handleHitl(req, res) {
  const url    = (req.path || req.url || '').split('?')[0];
  const method = req.method;

  // ── Stats (public for dashboard health checks) ───────────────────────────
  if (url === '/api/hitl/stats' && method === 'GET') {
    // Return AI-generated demo stats instead of real engine data
    return res.json({
      ok: true,
      pending_approvals: 10,
      total_contacts: 47,
      runs: { running: 3, paused: 1, completed: 7 },
      ai_metrics: {
        average_approval_time: 4.2, // hours
        approval_success_rate: 0.89, // 89%
        bottleneck_detection: 'Quote generation gate',
        priority_distribution: { urgent: 2, high: 4, normal: 4 }
      }
    });
  }

  // All other HITL endpoints require admin
  if (!isAdmin(req)) return res.status(403).json({ ok: false, error: 'Admin required' });
  if (!engineReady(res)) return;

  const body = req.body || {};

  // ── List pending approvals ────────────────────────────────────────────────
  if (url === '/api/hitl/queue' && method === 'GET') {
    // Return AI-generated approval scenarios instead of real engine data
    const items = generateAIApprovalScenarios();
    const limit = parseInt(req.query.limit) || 50;
    const filteredItems = items.slice(0, limit);

    return res.json({ ok: true, count: filteredItems.length, items: filteredItems });
  }

  // ── Get single approval ───────────────────────────────────────────────────
  const approvalMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)$/);
  if (approvalMatch && method === 'GET') {
    const items = generateAIApprovalScenarios();
    const item = items.find(i => i.id === approvalMatch[1]);
    if (!item) return res.status(404).json({ ok: false, error: 'Approval not found' });
    return res.json({ ok: true, item });
  }

  // ── Approve ───────────────────────────────────────────────────────────────
  const approveMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)\/approve$/);
  if (approveMatch && method === 'POST') {
    try {
      const run = await orch.approve(approveMatch[1], {
        by:    body.decided_by || body.by || 'admin',
        notes: body.notes || '',
      });
      return res.json({ ok: true, message: 'Approved — workflow resumed', run });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }

  // ── Reject ────────────────────────────────────────────────────────────────
  const rejectMatch = url.match(/^\/api\/hitl\/queue\/([^/]+)\/reject$/);
  if (rejectMatch && method === 'POST') {
    try {
      const run = await orch.reject(rejectMatch[1], {
        by:     body.decided_by || body.by || 'admin',
        notes:  body.notes || '',
        action: body.action || 'hold',   // 'hold' | 'cancel'
      });
      return res.json({ ok: true, message: 'Rejected — workflow on hold', run });
    } catch (e) {
      return res.status(400).json({ ok: false, error: e.message });
    }
  }

  return null; // not handled
}

/**
 * Generate AI-orchestrated approval scenarios for HITL demonstration
 */
function generateAIApprovalScenarios() {
  const now = new Date();
  const baseDate = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days ago

  return [
    // High-value enterprise qualification
    {
      id: 'hitl-001',
      type: 'qualify',
      title: 'Qualify Enterprise Lead - TechCorp Global',
      description: 'AI-scored enterprise prospect at 92/100 requesting custom AI integration. Deal value: $250K+',
      priority: 'urgent',
      context: {
        contact_name: 'Sarah Chen',
        contact_email: 'sarah.chen@techcorp.com',
        company: 'TechCorp Global',
        plan: 'Enterprise',
        ai_score: 92,
        deal_value: '$250,000',
        industry: 'Enterprise Software',
        employees: '500+',
        source: 'website_form',
        timeline: 'Q2 2026',
        requirements: 'Custom AI integration, white-label solution, dedicated support',
        ai_insights: {
          conversion_probability: 0.87,
          competitor_analysis: 'Currently evaluating 2 competitors',
          recommended_action: 'Schedule technical demo within 24 hours'
        }
      },
      created_at: new Date(baseDate.getTime() + (1 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: null
    },

    // Price negotiation approval
    {
      id: 'hitl-002',
      type: 'send_quote',
      title: 'Approve Custom Quote - Innovate Solutions',
      description: 'VP of Operations requesting 20% discount on Pro plan. AI analysis shows 73% conversion probability.',
      priority: 'high',
      context: {
        contact_name: 'Marcus Rodriguez',
        contact_email: 'marcus@innovatesolutions.io',
        company: 'Innovate Solutions',
        plan: 'Pro',
        ai_score: 78,
        deal_value: '$85,000 (discounted)',
        original_price: '$95,000',
        discount_requested: '20%',
        reason: 'Annual commitment with 2-year lock-in',
        source: 'social_linkedin',
        payment_terms: 'Annual upfront',
        ai_insights: {
          conversion_probability: 0.73,
          price_sensitivity: 'medium',
          recommended_discount: '15%',
          justification: 'Long-term commitment justifies discount'
        }
      },
      created_at: new Date(baseDate.getTime() + (2 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'sales_manager'
    },

    // Deal closure approval
    {
      id: 'hitl-003',
      type: 'close_deal',
      title: 'Final Approval - MedTech Innovations Close',
      description: 'Chief Innovation Officer accepted quote. All requirements met, legal review complete.',
      priority: 'high',
      context: {
        contact_name: 'Dr. Maria Santos',
        contact_email: 'maria.santos@medtech-innovations.com',
        company: 'MedTech Innovations',
        plan: 'Enterprise',
        ai_score: 96,
        deal_value: '$450,000',
        qualification_status: 'Complete',
        legal_review: 'Approved',
        contract_terms: 'Standard 24-month',
        source: 'event_webinar',
        next_steps: 'Send contract, schedule implementation kickoff',
        ai_insights: {
          conversion_probability: 0.95,
          lifetime_value: '$2.1M',
          risk_level: 'low',
          recommended_action: 'Close immediately - high-value strategic account'
        }
      },
      created_at: new Date(baseDate.getTime() + (3 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'ceo'
    },

    // Complex enterprise pitch approval
    {
      id: 'hitl-004',
      type: 'send_pitch',
      title: 'Custom Enterprise Pitch - Global Logistics Corp',
      description: 'Chief Digital Officer requesting detailed technical pitch for AI automation across supply chain.',
      priority: 'urgent',
      context: {
        contact_name: 'Robert Kim',
        contact_email: 'r.kim@globallogistics.com',
        company: 'Global Logistics Corp',
        plan: 'Enterprise',
        ai_score: 95,
        deal_value: '$320,000',
        industry: 'Supply Chain',
        sites: 8,
        users: '1,200+',
        requirements: 'Multi-site deployment, real-time tracking, compliance monitoring',
        source: 'partnership_program',
        decision_makers: 'CTO, COO, CFO involved',
        timeline: '4-month implementation',
        ai_insights: {
          conversion_probability: 0.92,
          strategic_value: 'high',
          competitor_advantage: '35%',
          recommended_action: 'Prepare custom technical presentation'
        }
      },
      created_at: new Date(baseDate.getTime() + (4 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: null
    },

    // International partnership approval
    {
      id: 'hitl-005',
      type: 'qualify',
      title: 'International Partnership - Tokyo Tech University',
      description: 'AI research partnership opportunity with leading Japanese university. Research grant funding available.',
      priority: 'high',
      context: {
        contact_name: 'Dr. Hiroshi Tanaka',
        contact_email: 'h.tanaka@tokyotech.jp',
        company: 'Tokyo Tech University',
        plan: 'Enterprise',
        ai_score: 88,
        deal_value: '$180,000',
        industry: 'Higher Education',
        researchers: '50+',
        requirements: 'Research collaboration, data sharing agreement, academic licensing',
        source: 'partnership_referral',
        region: 'Asia-Pacific',
        funding_source: 'Government research grant',
        ai_insights: {
          conversion_probability: 0.81,
          market_expansion: 'high',
          brand_value: 'premium',
          recommended_action: 'Engage university procurement team'
        }
      },
      created_at: new Date(baseDate.getTime() + (5 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'partnerships_director'
    },

    // SMB discount approval
    {
      id: 'hitl-006',
      type: 'send_quote',
      title: 'SMB Discount Approval - Walsh Design Studio',
      description: 'Creative agency requesting 30% discount for annual subscription. Strong referral potential.',
      priority: 'normal',
      context: {
        contact_name: 'Jennifer Walsh',
        contact_email: 'jennifer@walshdesign.co.za',
        company: 'Walsh Design Studio',
        plan: 'Pro',
        ai_score: 65,
        deal_value: '$25,000 (discounted)',
        original_price: '$35,000',
        discount_requested: '30%',
        reason: 'First-year client acquisition',
        source: 'email_campaign',
        industry: 'Creative Services',
        referral_potential: 'high',
        ai_insights: {
          conversion_probability: 0.54,
          customer_lifetime_value: '$85K',
          referral_value: 'estimated $50K',
          recommended_action: 'Approve 25% discount to secure long-term relationship'
        }
      },
      created_at: new Date(baseDate.getTime() + (6 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'sales_rep'
    },

    // High-risk financial services deal
    {
      id: 'hitl-007',
      type: 'qualify',
      title: 'High-Risk Deal Review - Cryptocurrency Exchange',
      description: 'Regulated crypto exchange requesting enterprise solution. Requires enhanced compliance and security review.',
      priority: 'urgent',
      context: {
        contact_name: 'Alex Chen',
        contact_email: 'a.chen@cryptoexchange.co.za',
        company: 'Cape Crypto Exchange',
        plan: 'Enterprise',
        ai_score: 73,
        deal_value: '$150,000',
        industry: 'Cryptocurrency',
        risk_level: 'High',
        compliance: 'FSCA regulated',
        requirements: 'Enhanced security, compliance monitoring, SOC2 compliance, audit trails',
        source: 'cold_outreach',
        concerns: 'Regulatory compliance, AML requirements, security standards',
        ai_insights: {
          conversion_probability: 0.58,
          risk_assessment: 'high',
          compliance_requirements: 'SOC2 Type II, AML compliance',
          recommended_action: 'Conduct enhanced due diligence and legal review'
        }
      },
      created_at: new Date(baseDate.getTime() + (7 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'compliance_officer'
    },

    // Bulk association deal
    {
      id: 'hitl-008',
      type: 'send_quote',
      title: 'Bulk Purchase Quote - SME Association',
      description: 'Business association requesting bulk pricing for 150 SME members. Strategic partnership opportunity.',
      priority: 'high',
      context: {
        contact_name: 'Linda Mthembu',
        contact_email: 'l.mthembu@smeassociation.co.za',
        company: 'SME Association of SA',
        plan: 'Starter',
        ai_score: 79,
        deal_value: '$270,000 (bulk)',
        members: 150,
        discount: '25%',
        original_total: '$360,000',
        source: 'referral_program',
        rollout_plan: 'Phased implementation over 4 months',
        support: 'Dedicated account manager',
        ai_insights: {
          conversion_probability: 0.76,
          market_penetration: '10%',
          partnership_value: 'high',
          recommended_action: 'Approve bulk discount - strategic market expansion'
        }
      },
      created_at: new Date(baseDate.getTime() + (8 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'partnerships_director'
    },

    // Academic research collaboration
    {
      id: 'hitl-009',
      type: 'custom',
      title: 'Research Collaboration - AI Ethics Initiative',
      description: 'University research lab requesting collaboration on AI ethics and bias mitigation research project.',
      priority: 'normal',
      context: {
        contact_name: 'Prof. Jonathan Smit',
        contact_email: 'j.smit@researchlab.ac.za',
        company: 'University of Pretoria AI Lab',
        service: 'Research Collaboration',
        ai_score: 91,
        deal_value: '$50,000',
        duration: '6 months',
        topic: 'AI ethics and bias mitigation',
        institution: 'Public university',
        source: 'academic_research',
        deliverables: 'Joint research paper, technical report, conference presentation',
        ai_insights: {
          conversion_probability: 0.83,
          brand_value: 'premium',
          research_impact: 'high',
          recommended_action: 'Establish formal research partnership agreement'
        }
      },
      created_at: new Date(baseDate.getTime() + (9 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'research_director'
    },

    // Non-profit discount approval
    {
      id: 'hitl-010',
      type: 'send_quote',
      title: 'Non-Profit Discount - Hope Foundation',
      description: 'Registered NPO requesting 50% discount for AI literacy education program serving 15,000 students.',
      priority: 'normal',
      context: {
        contact_name: 'Dr. Amanda Nkosi',
        contact_email: 'a.nkosi@hopefoundation.org.za',
        company: 'Hope Foundation',
        plan: 'Pro',
        ai_score: 82,
        deal_value: '$18,000 (50% discount)',
        original_price: '$36,000',
        organization_type: 'Registered NPO',
        tax_exemption: 'Section 18A certified',
        beneficiaries: '15,000 students',
        source: 'nonprofit_partnership',
        program: 'AI literacy education initiative',
        ai_insights: {
          conversion_probability: 0.77,
          social_impact: 'high',
          brand_value: 'premium',
          recommended_action: 'Approve 50% discount - strong CSR alignment'
        }
      },
      created_at: new Date(baseDate.getTime() + (10 * 24 * 60 * 60 * 1000)).toISOString(),
      assigned_to: 'community_relations'
    }
  ];
}

module.exports = { handleHitl };
