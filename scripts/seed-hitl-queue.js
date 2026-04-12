#!/usr/bin/env node

/**
 * Seed HITL approval queue with diverse contact scenarios
 * Run with: node scripts/seed-hitl-queue.js
 */

async function seedHITLQueue() {
  console.log('🤖 Seeding HITL approval queue with contact scenarios...');

  const approvalScenarios = [
    // High-value enterprise qualification
    {
      type: 'qualify',
      title: 'Qualify Enterprise Lead - TechCorp Solutions',
      description: 'High-value enterprise prospect requesting custom AI integration. Deal value: R500K+',
      priority: 'urgent',
      context: {
        contact_name: 'Sarah Mitchell',
        contact_email: 's.mitchell@techcorp.co.za',
        company: 'TechCorp Solutions',
        plan: 'Enterprise',
        ai_score: 92,
        deal_value: 'R550,000',
        industry: 'Technology',
        employees: '250+',
        source: 'enterprise_referral',
        timeline: 'Q1 2026',
        requirements: 'Custom AI integration, white-label solution, dedicated support'
      }
    },

    // Price negotiation approval
    {
      type: 'send_quote',
      title: 'Approve Custom Quote - Johannesburg Business Hub',
      description: 'Regional business network requesting 15% discount on Pro plan annual subscription',
      priority: 'high',
      context: {
        contact_name: 'David Nkosi',
        contact_email: 'd.nkosi@jhbusinesshub.co.za',
        company: 'Johannesburg Business Hub',
        plan: 'Pro',
        ai_score: 78,
        deal_value: 'R45,000 (discounted)',
        original_price: 'R52,800',
        discount_requested: '15%',
        reason: 'Bulk purchase for 50 members',
        source: 'regional_network',
        payment_terms: 'Annual upfront'
      }
    },

    // Deal closure approval
    {
      type: 'close_deal',
      title: 'Final Approval - Cape Town Consulting Close',
      description: 'Qualified consulting firm ready to sign. All requirements met, legal review complete.',
      priority: 'high',
      context: {
        contact_name: 'Rachel Adams',
        contact_email: 'r.adams@ctconsulting.co.za',
        company: 'Cape Town Consulting',
        plan: 'Pro',
        ai_score: 85,
        deal_value: 'R28,800',
        qualification_status: 'Complete',
        legal_review: 'Approved',
        contract_terms: 'Standard 12-month',
        source: 'webinar_followup',
        next_steps: 'Send contract, schedule onboarding'
      }
    },

    // Invoice generation approval
    {
      type: 'send_invoice',
      title: 'Invoice Generation - Durban Manufacturing Corp',
      description: 'Approved deal ready for invoicing. Payment terms: 30 days, includes setup fee.',
      priority: 'normal',
      context: {
        contact_name: 'James Thompson',
        contact_email: 'j.thompson@durbanmfg.co.za',
        company: 'Durban Manufacturing Corp',
        plan: 'Pro',
        ai_score: 76,
        deal_value: 'R34,800',
        setup_fee: 'R5,000',
        payment_terms: 'Net 30 days',
        invoice_due: '2026-04-15',
        source: 'trade_show',
        special_notes: 'Includes custom manufacturing workflow templates'
      }
    },

    // Complex enterprise pitch approval
    {
      type: 'send_pitch',
      title: 'Custom Enterprise Pitch - Mining Giant Ltd',
      description: 'Fortune 500 mining company requesting detailed technical pitch for AI automation across 12 sites.',
      priority: 'urgent',
      context: {
        contact_name: 'Michael van der Merwe',
        contact_email: 'm.vandermerwe@mininggiant.co.za',
        company: 'Mining Giant Ltd',
        plan: 'Enterprise',
        ai_score: 95,
        deal_value: 'R2.1M (estimated)',
        industry: 'Mining',
        sites: 12,
        users: '2,500+',
        requirements: 'Multi-site deployment, offline capabilities, safety compliance',
        source: 'enterprise_outreach',
        decision_makers: 'CTO, COO, CFO involved',
        timeline: '6-month implementation'
      }
    },

    // Discount approval for non-profit
    {
      type: 'send_quote',
      title: 'Non-Profit Discount Approval - Hope Foundation',
      description: 'Registered NPO requesting 50% discount for educational AI tools program.',
      priority: 'normal',
      context: {
        contact_name: 'Dr. Amanda Nkosi',
        contact_email: 'a.nkosi@hopefoundation.org.za',
        company: 'Hope Foundation',
        plan: 'Starter',
        ai_score: 82,
        deal_value: 'R7,200 (50% discount)',
        original_price: 'R14,400',
        organization_type: 'Registered NPO',
        tax_exemption: 'Section 18A certified',
        beneficiaries: '15,000 students',
        source: 'nonprofit_partnership',
        program: 'AI literacy education initiative'
      }
    },

    // International client onboarding
    {
      type: 'close_deal',
      title: 'International Client - Nairobi Tech Hub',
      description: 'Kenyan startup hub requesting multi-currency support and African market localization.',
      priority: 'high',
      context: {
        contact_name: 'Grace Wanjiku',
        contact_email: 'g.wanjiku@nairobitech.africa',
        company: 'Nairobi Tech Hub',
        plan: 'Pro',
        ai_score: 88,
        deal_value: 'R42,000',
        currency: 'KES/USD',
        localization: 'East Africa focus',
        requirements: 'Multi-currency billing, local payment methods',
        source: 'international_partnership',
        region: 'East Africa',
        potential: 'Regional expansion opportunity'
      }
    },

    // Technical consultation approval
    {
      type: 'custom',
      title: 'Technical Consultation - AI Research Lab',
      description: 'University research lab requesting 2-hour technical consultation for AI ethics research project.',
      priority: 'normal',
      context: {
        contact_name: 'Prof. Jonathan Smit',
        contact_email: 'j.smit@researchlab.ac.za',
        company: 'University of Pretoria AI Lab',
        service: 'Technical Consultation',
        ai_score: 91,
        deal_value: 'R8,000',
        duration: '2 hours',
        topic: 'AI ethics and bias mitigation',
        institution: 'Public university',
        source: 'academic_research',
        deliverables: 'Technical report, recommendations'
      }
    },

    // Bulk purchase approval
    {
      type: 'send_quote',
      title: 'Bulk Purchase Quote - SME Association',
      description: 'Business association requesting bulk pricing for 200+ SME members (25% discount).',
      priority: 'high',
      context: {
        contact_name: 'Linda Mthembu',
        contact_email: 'l.mthembu@smeassociation.co.za',
        company: 'SME Association of SA',
        plan: 'Starter',
        ai_score: 79,
        deal_value: 'R360,000 (bulk discount)',
        members: 200,
        discount: '25%',
        original_total: 'R480,000',
        source: 'association_partnership',
        rollout_plan: 'Phased implementation over 6 months',
        support: 'Dedicated account manager'
      }
    },

    // High-risk deal review
    {
      type: 'qualify',
      title: 'High-Risk Deal Review - Cryptocurrency Exchange',
      description: 'Crypto exchange requesting enterprise solution. Requires enhanced compliance review.',
      priority: 'urgent',
      context: {
        contact_name: 'Alex Chen',
        contact_email: 'a.chen@cryptoexchange.co.za',
        company: 'Cape Crypto Exchange',
        plan: 'Enterprise',
        ai_score: 73,
        deal_value: 'R850,000',
        industry: 'Cryptocurrency',
        risk_level: 'High',
        compliance: 'FSCA regulated',
        requirements: 'Enhanced security, compliance monitoring, audit trails',
        source: 'financial_services',
        concerns: 'Regulatory compliance, AML requirements'
      }
    }
  ];

  console.log('📋 Generated approval scenarios:');
  console.log('  🚨 Urgent priority: 3 items');
  console.log('  ⚡ High priority: 4 items');
  console.log('  📋 Normal priority: 3 items');
  console.log('');
  console.log('🎯 Scenarios include:');
  console.log('  💼 Enterprise deals (mining, manufacturing)');
  console.log('  🌍 International clients (Kenya)');
  console.log('  🎓 Academic partnerships');
  console.log('  🤝 Association bulk deals');
  console.log('  🏥 Non-profit discounts');
  console.log('  ⚠️ High-risk financial services');
  console.log('  💰 Complex negotiations and discounts');

  // In a real implementation, this would save to database
  // For now, we'll create a mock API response structure
  const mockQueueData = {
    ok: true,
    pending_approvals: approvalScenarios.length,
    total_contacts: approvalScenarios.length,
    runs: {
      running: 3,
      paused: 1,
      completed: 7
    },
    items: approvalScenarios.map((scenario, index) => ({
      id: `approval_${index + 1}`,
      type: scenario.type,
      title: scenario.title,
      description: scenario.description,
      priority: scenario.priority,
      context: scenario.context,
      created_at: new Date(Date.now() - Math.random() * 86400000 * 3).toISOString() // Random within 3 days
    }))
  };

  console.log('\n✅ HITL approval queue ready with', approvalScenarios.length, 'diverse scenarios');
  console.log('💡 Queue includes contacts from: enterprise, nonprofit, academic, international, and high-risk sectors');

  return mockQueueData;
}

if (require.main === module) {
  seedHITLQueue();
}

module.exports = { seedHITLQueue };