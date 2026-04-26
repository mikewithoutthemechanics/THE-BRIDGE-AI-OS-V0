#!/usr/bin/env node

/**
 * Seed sample leads from multiple channels for CRM and Leads pages
 * Run with: node scripts/seed-sample-leads.js
 */

const { Pool } = require('pg');
require('dotenv').config();

const economyDb = new Pool({
  connectionString: process.env.ECONOMY_DB_URL,
  max: 5,
  connectionTimeoutMillis: 5000,
});

async function seedSampleLeads() {
  console.log('🌱 Seeding sample leads from multiple channels...');

  const sampleLeads = [
    // Website form submissions
    {
      name: 'Sarah Johnson',
      email: 'sarah.johnson@email.com',
      company: 'TechStart Inc',
      phone: '+27 82 123 4567',
      status: 'new',
      score: 75,
      tags: ['website', 'demo-request', 'saas'],
      notes: 'Interested in AI automation for small business',
      source: 'website_form',
      created_at: new Date(Date.now() - 2*24*60*60*1000).toISOString()
    },
    {
      name: 'Michael Chen',
      email: 'm.chen@corporate.com',
      company: 'Global Corp Ltd',
      phone: '+27 83 987 6543',
      status: 'qualified',
      score: 85,
      tags: ['enterprise', 'custom-integration', 'high-value'],
      notes: 'Enterprise client looking for white-label solution',
      source: 'website_form',
      created_at: new Date(Date.now() - 5*24*60*60*1000).toISOString()
    },

    // Social media referrals
    {
      name: 'Emma Rodriguez',
      email: 'emma.r@socialmedia.com',
      company: 'Digital Agency Pro',
      phone: '+27 84 555 0123',
      status: 'contacted',
      score: 65,
      tags: ['linkedin', 'referral', 'marketing-agency'],
      notes: 'Referred by LinkedIn connection, interested in AI marketing tools',
      source: 'social_linkedin',
      created_at: new Date(Date.now() - 1*24*60*60*1000).toISOString()
    },
    {
      name: 'David Thompson',
      email: 'd.thompson@twitter.com',
      company: 'StartupXYZ',
      phone: '+27 81 444 7890',
      status: 'qualified',
      score: 78,
      tags: ['twitter', 'startup', 'funding-round'],
      notes: 'Twitter lead from startup community discussion',
      source: 'social_twitter',
      created_at: new Date(Date.now() - 3*24*60*60*1000).toISOString()
    },

    // Email marketing campaigns
    {
      name: 'Lisa Park',
      email: 'lisa.park@newsletter.com',
      company: 'Consulting Partners',
      phone: '+27 79 321 0987',
      status: 'proposal',
      score: 82,
      tags: ['email-campaign', 'consultant', 'roi-focused'],
      notes: 'Responded to ROI calculator email campaign',
      source: 'email_marketing',
      created_at: new Date(Date.now() - 7*24*60*60*1000).toISOString()
    },
    {
      name: 'James Wilson',
      email: 'james.w@webinar.com',
      company: 'Manufacturing Corp',
      phone: '+27 76 654 3210',
      status: 'contacted',
      score: 70,
      tags: ['webinar', 'manufacturing', 'process-automation'],
      notes: 'Attended AI in Manufacturing webinar, requested demo',
      source: 'webinar_registration',
      created_at: new Date(Date.now() - 4*24*60*60*1000).toISOString()
    },

    // Partnership referrals
    {
      name: 'Anna Kowalski',
      email: 'anna.k@partner.com',
      company: 'Tech Solutions Ltd',
      phone: '+27 85 777 8888',
      status: 'qualified',
      score: 88,
      tags: ['partner-referral', 'integration-partner', 'api-focused'],
      notes: 'Referred by integration partner, needs API access',
      source: 'partner_referral',
      created_at: new Date(Date.now() - 6*24*60*60*1000).toISOString()
    },

    // Content marketing
    {
      name: 'Robert Davis',
      email: 'r.davis@content.com',
      company: 'E-commerce Plus',
      phone: '+27 86 999 0000',
      status: 'new',
      score: 60,
      tags: ['blog', 'ecommerce', 'automation'],
      notes: 'Downloaded e-commerce automation guide from blog',
      source: 'content_download',
      created_at: new Date(Date.now() - 1*24*60*60*1000).toISOString()
    },

    // Paid advertising
    {
      name: 'Maria Santos',
      email: 'maria.s@ads.com',
      company: 'Retail Chain SA',
      phone: '+27 87 111 2222',
      status: 'contacted',
      score: 72,
      tags: ['google-ads', 'retail', 'multi-location'],
      notes: 'Clicked Google Ads for retail automation solutions',
      source: 'paid_google',
      created_at: new Date(Date.now() - 2*24*60*60*1000).toISOString()
    },

    // Trade show / events
    {
      name: 'Kevin Brown',
      email: 'kevin.b@event.com',
      company: 'Logistics Pro',
      phone: '+27 88 333 4444',
      status: 'qualified',
      score: 80,
      tags: ['trade-show', 'logistics', 'supply-chain'],
      notes: 'Collected business card at AI Summit, interested in logistics optimization',
      source: 'event_tradeshow',
      created_at: new Date(Date.now() - 8*24*60*60*1000).toISOString()
    },

    // Cold outreach
    {
      name: 'Jennifer Lee',
      email: 'j.lee@cold.com',
      company: 'Healthcare Network',
      phone: '+27 89 555 6666',
      status: 'new',
      score: 45,
      tags: ['cold-outreach', 'healthcare', 'compliance'],
      notes: 'Cold email outreach to healthcare decision makers',
      source: 'cold_outreach',
      created_at: new Date(Date.now() - 10*24*60*60*1000).toISOString()
    },

    // Support ticket conversion
    {
      name: 'Mark Johnson',
      email: 'mark.j@support.com',
      company: 'Support Client Inc',
      phone: '+27 90 777 8888',
      status: 'closed_won',
      score: 95,
      tags: ['support-conversion', 'existing-client', 'upgrade'],
      notes: 'Converted from support ticket to premium subscription',
      source: 'support_ticket',
      created_at: new Date(Date.now() - 12*24*60*60*1000).toISOString()
    },

    // Referral program
    {
      name: 'Sophie Taylor',
      email: 'sophie.t@referral.com',
      company: 'Creative Agency',
      phone: '+27 71 999 0000',
      status: 'qualified',
      score: 77,
      tags: ['referral-program', 'creative-agency', 'brand-work'],
      notes: 'Referred by existing client through referral program',
      source: 'referral_program',
      created_at: new Date(Date.now() - 5*24*60*60*1000).toISOString()
    },

    // API integrations
    {
      name: 'Alex Kim',
      email: 'alex.k@api.com',
      company: 'DevShop Solutions',
      phone: '+27 72 111 3333',
      status: 'proposal',
      score: 83,
      tags: ['api-integration', 'developer', 'custom-solution'],
      notes: 'Developer interested in API integration for custom solution',
      source: 'api_developer',
      created_at: new Date(Date.now() - 9*24*60*60*1000).toISOString()
    }
  ];

  try {
    for (const lead of sampleLeads) {
      await economyDb.query(`
        INSERT INTO crm_leads (
          name, email, company, phone, status, score, tags, notes, source, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (email) DO UPDATE SET
          name = EXCLUDED.name,
          company = EXCLUDED.company,
          phone = EXCLUDED.phone,
          status = EXCLUDED.status,
          score = EXCLUDED.score,
          tags = EXCLUDED.tags,
          notes = EXCLUDED.notes,
          source = EXCLUDED.source
      `, [
        lead.name,
        lead.email,
        lead.company,
        lead.phone,
        lead.status,
        lead.score,
        lead.tags,
        lead.notes,
        lead.source,
        lead.created_at
      ]);
    }

    console.log('✅ Seeded 15 diverse leads from multiple channels:');
    console.log('  📧 Website forms: 2 leads');
    console.log('  🔗 Social media: 2 leads');
    console.log('  📧 Email campaigns: 2 leads');
    console.log('  🤝 Partnerships: 1 lead');
    console.log('  📝 Content marketing: 1 lead');
    console.log('  📢 Paid ads: 1 lead');
    console.log('  🎪 Events: 1 lead');
    console.log('  ❄️ Cold outreach: 1 lead');
    console.log('  🎫 Support conversion: 1 lead');
    console.log('  👥 Referral program: 1 lead');
    console.log('  🔌 API developers: 1 lead');

    console.log('\n📊 Lead status distribution:');
    console.log('  🆕 New: 3 leads');
    console.log('  📞 Contacted: 3 leads');
    console.log('  ✅ Qualified: 4 leads');
    console.log('  📋 Proposal: 2 leads');
    console.log('  🎉 Closed Won: 1 lead');

  } catch (error) {
    console.error('❌ Seeding failed:', error.message);
  } finally {
    await economyDb.end();
  }
}

if (require.main === module) {
  seedSampleLeads();
}

module.exports = { seedSampleLeads };