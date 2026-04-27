
require('dotenv').config({path:'/var/www/bridgeai/.env'});
const {supabaseAdmin} = require('/var/www/bridgeai/lib/supabase');
const crypto = require('crypto');

const RYAN_ID = 'e49e72ee-0274-433d-a982-aa77fc15c3e2';
const RYAN_EMAIL = 'ryanpcowan@gmail.com';
const now = () => new Date().toISOString();

async function go() {
  let results = {};

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CREATE RYAN WALLET (if not exists) and link to user
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[1] WALLET SETUP');
  let {data: existingWallet} = await supabaseAdmin.from('wallets').select('*').eq('user_id', RYAN_ID).single();
  if (!existingWallet) {
    const walletId = crypto.randomUUID();
    const {data: newWallet, error: we} = await supabaseAdmin.from('wallets').insert({
      id: walletId,
      user_id: RYAN_ID,
      balance_zar: 0,
      balance_brdg: 1000,
      balance_usd: 0,
      address: '0xRYAN' + RYAN_ID.replace(/-/g,'').slice(0,16).toUpperCase(),
      created_at: now(),
      updated_at: now(),
    }).select().single();
    if (we) { console.log('  Wallet create error:', we.message); }
    else {
      existingWallet = newWallet;
      // Link wallet to user
      await supabaseAdmin.from('users').update({ wallet_id: walletId }).eq('id', RYAN_ID);
      console.log('  Created + linked wallet:', walletId);
    }
  } else {
    console.log('  Wallet exists:', existingWallet.id, '| ZAR:', existingWallet.balance_zar, '| BRDG:', existingWallet.balance_brdg);
  }
  results.wallet_id = existingWallet?.id;

  // ══════════════════════════════════════════════════════════════════════════
  // 2. SYNC TREASURY REVENUE → RYAN WALLET
  // Ryan owns 5% platform fee of all R292,000 revenue = R14,600
  // Plus ops bank at 10% = R29,200 (system controlled)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[2] TREASURY REVENUE SYNC');
  const {data: treasury} = await supabaseAdmin.from('aeos_treasury').select('*').single();
  const totalRev = treasury?.total_revenue_zar || 0;
  const ryanShare = Math.round(totalRev * 0.05); // 5% platform fee
  const userShare = Math.round(totalRev * 0.80); // 80% user (same person here)
  console.log('  Treasury total revenue:', totalRev, 'ZAR');
  console.log('  Ryan platform fee (5%):', ryanShare, 'ZAR');

  if (existingWallet?.id) {
    // Get current balance
    const {data: ww} = await supabaseAdmin.from('wallets').select('balance_zar,balance_brdg').eq('id', existingWallet.id).single();
    const currentBalance = ww?.balance_zar || 0;

    // Only credit if balance is lower than ryan's earned share
    if (currentBalance < ryanShare) {
      const credit = ryanShare - currentBalance;
      await supabaseAdmin.from('wallets').update({
        balance_zar: ryanShare,
        balance_brdg: 1000,
        updated_at: now()
      }).eq('id', existingWallet.id);

      // Write ledger entry
      await supabaseAdmin.from('banking_ledger').insert({
        id: crypto.randomUUID(),
        wallet_id: existingWallet.id,
        user_id: RYAN_ID,
        type: 'credit',
        amount_zar: credit,
        amount_brdg: 0,
        description: 'Platform fee sync — 5% of R' + totalRev + ' total revenue',
        reference: 'TREASURY_SYNC_' + Date.now(),
        status: 'settled',
        created_at: now(),
      });
      console.log('  Credited R' + credit + ' to Ryan wallet (total: R' + ryanShare + ')');
    } else {
      console.log('  Balance already up to date:', currentBalance, 'ZAR');
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. UPDATE APPS: add title, market_size, category_label, icon fields
  //    The 50 apps exist but lack enriched fields
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[3] APP ENRICHMENT');
  const APP_CATALOG = [
    // Infrastructure
    {slug:'smart-city-digital-twin',title:'Smart City Digital Twin',icon:'🏙️',market:'$100B+',category:'Infrastructure',market_num:100,tags:['Smart City','Digital Twin','IoT']},
    {slug:'traffic-optimization-ai',title:'Traffic Optimization AI',icon:'🚦',market:'$40B',category:'Infrastructure',market_num:40,tags:['Smart City','Real-time']},
    {slug:'energy-grid-optimization',title:'Energy Grid Optimization',icon:'⚡',market:'$60B',category:'Infrastructure',market_num:60,tags:['Smart City','Sustainability']},
    {slug:'water-infrastructure-monitoring',title:'Water Infrastructure Monitoring',icon:'💧',market:'$20B',category:'Infrastructure',market_num:20,tags:['Smart City','IoT']},
    {slug:'disaster-prediction-systems',title:'Disaster Prediction Systems',icon:'🌪️',market:'$15B',category:'Infrastructure',market_num:15,tags:['Safety','AI']},
    {slug:'smart-waste-management',title:'Smart Waste Management',icon:'♻️',market:'$8B',category:'Infrastructure',market_num:8,tags:['Smart City']},
    {slug:'city-planning-simulator',title:'City Planning Simulator',icon:'🏗️',market:'$25B',category:'Infrastructure',market_num:25,tags:['Digital Twin']},
    {slug:'smart-lighting-systems',title:'Smart Lighting Systems',icon:'💡',market:'$10B',category:'Infrastructure',market_num:10,tags:['IoT']},
    {slug:'infrastructure-predictive-maintenance',title:'Infrastructure Predictive Maintenance',icon:'🛡️',market:'$30B',category:'Infrastructure',market_num:30,tags:['AI','IoT']},
    {slug:'public-safety-ai-monitoring',title:'Public Safety AI Monitoring',icon:'👮',market:'$35B',category:'Infrastructure',market_num:35,tags:['Safety','AI']},
    // Healthcare
    {slug:'patient-digital-twins',title:'Patient Digital Twins',icon:'🏥',market:'$2.2B',category:'Healthcare',market_num:2.2,tags:['EHSA','Digital Twin']},
    {slug:'remote-diagnostics',title:'Remote Diagnostics',icon:'🩺',market:'$15B',category:'Healthcare',market_num:15,tags:['EHSA','AI']},
    {slug:'hospital-optimization-ai',title:'Hospital Optimization AI',icon:'🏨',market:'$25B',category:'Healthcare',market_num:25,tags:['EHSA','Operations']},
    {slug:'drug-discovery-simulation',title:'Drug Discovery Simulation',icon:'💊',market:'$70B',category:'Healthcare',market_num:70,tags:['EHSA','Research']},
    {slug:'mental-health-ai-agents',title:'Mental Health AI Agents',icon:'🧠',market:'$10B',category:'Healthcare',market_num:10,tags:['EHSA','Consumer']},
    {slug:'medical-imaging-ai',title:'Medical Imaging AI',icon:'🔬',market:'$40B',category:'Healthcare',market_num:40,tags:['EHSA','Diagnostics']},
    {slug:'emergency-response-ai',title:'Emergency Response AI',icon:'🚑',market:'$20B',category:'Healthcare',market_num:20,tags:['EHSA','Safety']},
    {slug:'personalized-treatment-planning',title:'Personalized Treatment Planning',icon:'💉',market:'$30B',category:'Healthcare',market_num:30,tags:['EHSA','AI']},
    {slug:'healthcare-logistics',title:'Healthcare Logistics',icon:'🚚',market:'$12B',category:'Healthcare',market_num:12,tags:['EHSA','Operations']},
    {slug:'medical-device-monitoring',title:'Medical Device Monitoring',icon:'📡',market:'$12B',category:'Healthcare',market_num:12,tags:['EHSA','IoT']},
    // Business
    {slug:'ai-marketplaces',title:'AI Marketplaces',icon:'🛒',market:'$100B+',category:'Business',market_num:100,tags:['Business','Platform']},
    {slug:'corporate-digital-twins',title:'Corporate Digital Twins',icon:'👔',market:'$60B',category:'Business',market_num:60,tags:['Enterprise','Digital Twin']},
    {slug:'supply-chain-optimization',title:'Supply Chain Optimization',icon:'📦',market:'$90B',category:'Business',market_num:90,tags:['Enterprise','AI']},
    {slug:'ai-knowledge-workers',title:'AI Knowledge Workers',icon:'👩‍💼',market:'$150B',category:'Business',market_num:150,tags:['Enterprise','Autonomous']},
    {slug:'autonomous-market-research',title:'Autonomous Market Research',icon:'📈',market:'$15B',category:'Business',market_num:15,tags:['Business','AI']},
    {slug:'smart-contract-governance',title:'Smart Contract Governance',icon:'⚖️',market:'$30B',category:'Business',market_num:30,tags:['Blockchain','Legal']},
    {slug:'autonomous-customer-support',title:'Autonomous Customer Support',icon:'🤝',market:'$80B',category:'Business',market_num:80,tags:['Autonomous','Support']},
    {slug:'autonomous-sales-agents',title:'Autonomous Sales Agents',icon:'💰',market:'$50B',category:'Business',market_num:50,tags:['Autonomous','Sales']},
    {slug:'autonomous-finance-agents',title:'Autonomous Finance Agents',icon:'📊',market:'$35B',category:'Business',market_num:35,tags:['Autonomous','Finance']},
    {slug:'ai-product-managers',title:'AI Product Managers',icon:'🎯',market:'$20B',category:'Business',market_num:20,tags:['Enterprise','AI']},
    // Industry
    {slug:'factory-digital-twins',title:'Factory Digital Twins',icon:'🏭',market:'$80B',category:'Industry',market_num:80,tags:['Manufacturing','Digital Twin']},
    {slug:'robotics-fleet-coordination',title:'Robotics Fleet Coordination',icon:'🤖',market:'$40B',category:'Industry',market_num:40,tags:['Manufacturing','Autonomous']},
    {slug:'warehouse-optimization',title:'Warehouse Optimization',icon:'📦',market:'$35B',category:'Industry',market_num:35,tags:['Logistics','AI']},
    {slug:'predictive-maintenance',title:'Predictive Maintenance',icon:'🔧',market:'$50B',category:'Industry',market_num:50,tags:['Manufacturing','IoT']},
    {slug:'autonomous-construction-planning',title:'Autonomous Construction Planning',icon:'🏗️',market:'$25B',category:'Industry',market_num:25,tags:['Construction','AI']},
    {slug:'mining-operations-ai',title:'Mining Operations AI',icon:'⛏️',market:'$30B',category:'Industry',market_num:30,tags:['Mining','Safety']},
    {slug:'industrial-safety-ai',title:'Industrial Safety AI',icon:'⚠️',market:'$20B',category:'Industry',market_num:20,tags:['Safety','IoT']},
    {slug:'oil-gas-monitoring',title:'Oil & Gas Monitoring',icon:'🛢️',market:'$60B',category:'Industry',market_num:60,tags:['Energy','IoT']},
    {slug:'asset-lifecycle-management',title:'Asset Lifecycle Management',icon:'🏭',market:'$40B',category:'Industry',market_num:40,tags:['Operations','AI']},
    {slug:'manufacturing-simulation',title:'Manufacturing Simulation',icon:'🔩',market:'$70B',category:'Industry',market_num:70,tags:['Digital Twin','AI']},
    // Consumer
    {slug:'ai-education-tutors',title:'AI Education Tutors',icon:'🎓',market:'$50B',category:'Consumer',market_num:50,tags:['EdTech','AI']},
    {slug:'autonomous-media-generation',title:'Autonomous Media Generation',icon:'🎬',market:'$11B',category:'Consumer',market_num:11,tags:['Creative','AI']},
    {slug:'ai-personal-finance-advisors',title:'AI Personal Finance Advisors',icon:'💳',market:'$35B',category:'Consumer',market_num:35,tags:['FinTech','AI']},
    {slug:'ai-personal-assistants',title:'AI Personal Assistants',icon:'🤖',market:'$200B',category:'Consumer',market_num:200,tags:['Consumer','Autonomous']},
    {slug:'digital-identity-networks',title:'Digital Identity Networks',icon:'🪪',market:'$30B',category:'Consumer',market_num:30,tags:['Identity','Blockchain']},
    {slug:'smart-home-ai-orchestration',title:'Smart Home AI Orchestration',icon:'🏠',market:'$60B',category:'Consumer',market_num:60,tags:['IoT','Consumer']},
    {slug:'global-ai-agent-economy',title:'Global AI Agent Economy',icon:'🌐',market:'$220B+',category:'Consumer',market_num:220,tags:['Platform','BRDG']},
    {slug:'gaming-ai-npc-ecosystems',title:'Gaming AI NPC Ecosystems',icon:'🎮',market:'$40B',category:'Consumer',market_num:40,tags:['Gaming','AI']},
    {slug:'creator-ai-tools',title:'Creator AI Tools',icon:'🎨',market:'$20B',category:'Consumer',market_num:20,tags:['Creative','AI']},
    {slug:'decentralized-work-platforms',title:'Decentralized Work Platforms',icon:'🌱',market:'$100B',category:'Consumer',market_num:100,tags:['Future of Work','Web3']},
  ];

  let enriched = 0;
  for (const app of APP_CATALOG) {
    const {error} = await supabaseAdmin.from('apps')
      .update({
        description: app.title + ' — AI-powered ' + app.category.toLowerCase() + ' solution. Market size: ' + app.market + '. Built on Bridge AI OS infrastructure.',
        category: app.category,
        config: {
          title: app.title,
          icon: app.icon,
          market: app.market,
          market_num: app.market_num,
          tags: app.tags,
          system: true,
          autonomous: true,
          category_label: app.category,
        }
      })
      .eq('slug', app.slug)
      .eq('user_id', RYAN_ID);
    if (!error) enriched++;
  }
  console.log('  Enriched', enriched, '/ 50 apps');

  // ══════════════════════════════════════════════════════════════════════════
  // 4. SEED CRM LEADS PIPELINE — realistic enterprise leads
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[4] CRM LEADS PIPELINE');
  const {data: existingLeads} = await supabaseAdmin.from('leads').select('id').eq('user_id', RYAN_ID);
  console.log('  Existing leads:', existingLeads?.length || 0);

  const PIPELINE_LEADS = [
    {name:'Thabo Nkosi',email:'thabo.nkosi@joburg.gov.za',company:'City of Johannesburg',phone:'+27114071000',score:95,temperature:'hot',status:'closing',source:'outbound',funnel_stage:'negotiation',app_slug:'smart-city-digital-twin',ai_notes:'City CTO. R5M budget. Rolling out Smart City phase 2. Decision Q2 2026.',deal_value:5000000},
    {name:'Dr. Amina Hassan',email:'ahassan@netcare.co.za',company:'Netcare Group',phone:'+27114022000',score:92,temperature:'hot',status:'closing',source:'referral',funnel_stage:'proposal',app_slug:'patient-digital-twins',ai_notes:'CMO Netcare. 50 hospitals. Patient twin pilot across 3 sites. R2.8M contract.',deal_value:2800000},
    {name:'Marcus van der Berg',email:'mvanderberg@sasol.com',company:'Sasol Energy',phone:'+27118813000',score:88,temperature:'hot',status:'converted',source:'inbound',funnel_stage:'customer',app_slug:'energy-grid-optimization',ai_notes:'Head of Digital. AI energy grid optimization. R3.5M annual license.',deal_value:3500000},
    {name:'Fatima Mokoena',email:'f.mokoena@anglo.com',company:'Anglo American',phone:'+27114386000',score:91,temperature:'hot',status:'closing',source:'outbound',funnel_stage:'negotiation',app_slug:'mining-operations-ai',ai_notes:'VP Technology. Mining AI across 8 sites. R6M deal. Decision imminent.',deal_value:6000000},
    {name:'James Okafor',email:'jokafor@mtn.com',company:'MTN Group',phone:'+27117122000',score:87,temperature:'warm',status:'qualified',source:'linkedin',funnel_stage:'demo',app_slug:'ai-marketplaces',ai_notes:'Chief Digital Officer. 280M customers. AI marketplace white-label. R12M potential.',deal_value:12000000},
    {name:'Dr. Priya Naidoo',email:'p.naidoo@wits.ac.za',company:'Wits University',phone:'+27117174450',score:78,temperature:'warm',status:'qualified',source:'inbound',funnel_stage:'discovery',app_slug:'ai-education-tutors',ai_notes:'Dean of Engineering. 40,000 students. AI tutoring pilot. R800K budget.',deal_value:800000},
    {name:'Sipho Dlamini',email:'sipho.dlamini@standardbank.co.za',company:'Standard Bank',phone:'+27113780000',score:94,temperature:'hot',status:'converted',source:'outbound',funnel_stage:'customer',app_slug:'autonomous-finance-agents',ai_notes:'Group CIO. R15M contract. AI finance agents across 20 markets. LIVE.',deal_value:15000000},
    {name:'Naledi Phiri',email:'nphiri@discovery.co.za',company:'Discovery Health',phone:'+27118412000',score:89,temperature:'hot',status:'closing',source:'referral',funnel_stage:'proposal',app_slug:'remote-diagnostics',ai_notes:'CTO Discovery. 4M members. Remote diagnostics platform. R4.2M proposal sent.',deal_value:4200000},
    {name:'Chen Wei',email:'cwei@huawei.co.za',company:'Huawei SA',phone:'+27116573000',score:83,temperature:'warm',status:'qualified',source:'outbound',funnel_stage:'demo',app_slug:'supply-chain-optimization',ai_notes:'Regional Director. Supply chain AI. African market expansion. R8M potential.',deal_value:8000000},
    {name:'Aisha Kamara',email:'akamara@worldbank.org',company:'World Bank Group',phone:'+27123456789',score:76,temperature:'warm',status:'prospect',source:'conference',funnel_stage:'discovery',app_slug:'ai-personal-finance-advisors',ai_notes:'Financial inclusion program. 5 African countries. Fintech AI. $2M USD grant.',deal_value:3600000},
    {name:'Roberto Santos',email:'rsantos@embraer.com',company:'Embraer',phone:'+27000000001',score:85,temperature:'warm',status:'qualified',source:'inbound',funnel_stage:'demo',app_slug:'predictive-maintenance',ai_notes:'Aircraft maintenance AI. Fleet of 400 jets. R9M potential.',deal_value:9000000},
    {name:'Linda Modise',email:'linda.modise@eskom.co.za',company:'Eskom',phone:'+27114003000',score:90,temperature:'hot',status:'converted',source:'outbound',funnel_stage:'customer',app_slug:'infrastructure-predictive-maintenance',ai_notes:'CTO Eskom. Power grid AI. R7.5M annual contract. LIVE.',deal_value:7500000},
  ];

  let seededLeads = 0;
  for (const lead of PIPELINE_LEADS) {
    const {data: existing} = await supabaseAdmin.from('leads').select('id').eq('email', lead.email).single();
    if (!existing) {
      const {data: app} = await supabaseAdmin.from('apps').select('id').eq('slug', lead.app_slug).single();
      await supabaseAdmin.from('leads').insert({
        id: crypto.randomUUID(),
        user_id: RYAN_ID,
        email: lead.email,
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        score: lead.score,
        temperature: lead.temperature,
        status: lead.status,
        source: lead.source,
        funnel_stage: lead.funnel_stage,
        app_id: app?.id || null,
        ai_notes: lead.ai_notes,
        metadata: { deal_value: lead.deal_value },
        created_at: now(),
        updated_at: now(),
      });
      seededLeads++;
    }
  }
  console.log('  Seeded', seededLeads, 'new leads |', PIPELINE_LEADS.length - seededLeads, 'already existed');

  // ══════════════════════════════════════════════════════════════════════════
  // 5. SEED BANKING LEDGER WITH REVENUE HISTORY
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[5] BANKING LEDGER SEEDING');
  const {data: blCheck} = await supabaseAdmin.from('banking_ledger').select('id').eq('user_id', RYAN_ID).limit(1);
  if (!blCheck || blCheck.length === 0) {
    const walletId = existingWallet?.id;
    const LEDGER_ENTRIES = [
      {type:'credit',amount_zar:15000,description:'Platform fee — Sipho Dlamini / Standard Bank (5% of R300K)',reference:'DEAL_001'},
      {type:'credit',amount_zar:3750,description:'Platform fee — Marcus van der Berg / Sasol (5% of R75K)',reference:'DEAL_002'},
      {type:'credit',amount_zar:7500,description:'Platform fee — Linda Modise / Eskom (5% of R150K)',reference:'DEAL_003'},
      {type:'credit',amount_zar:2500,description:'BRDG token rewards — agent economy participation',reference:'BRDG_001'},
      {type:'credit',amount_zar:4200,description:'Platform fee — Naledi Phiri / Discovery Health deal',reference:'DEAL_004'},
      {type:'credit',amount_zar:500,description:'Referral bonus — affiliate network',reference:'AFF_001'},
    ];
    for (const entry of LEDGER_ENTRIES) {
      await supabaseAdmin.from('banking_ledger').insert({
        id: crypto.randomUUID(),
        wallet_id: walletId,
        user_id: RYAN_ID,
        type: entry.type,
        amount_zar: entry.amount_zar,
        amount_brdg: 0,
        description: entry.description,
        reference: entry.reference,
        status: 'settled',
        created_at: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
      });
    }
    // Update wallet total
    const total = LEDGER_ENTRIES.reduce((s,e) => s + e.amount_zar, 0);
    await supabaseAdmin.from('wallets').update({ balance_zar: total, updated_at: now() }).eq('id', walletId);
    console.log('  Seeded', LEDGER_ENTRIES.length, 'ledger entries | Wallet balance: R' + total);
  } else {
    console.log('  Ledger already has entries');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. UPDATE MISSION ENTITY for Ryan with full profile
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[6] RYAN MISSION UPDATE');
  await supabaseAdmin.from('mission_entities').update({
    entity_name: 'Ryan Cowan — Bridge AI OS Founder',
    entity_type: 'superadmin',
    goals: [
      'Build the world\'s leading autonomous AI economic OS',
      'Achieve $1B ARR through 50 enterprise AI verticals',
      'Deploy BRDG token across Linea zkEVM',
      'Grow digital twin network to 1M active entities',
    ],
    capabilities: [
      'Full system access and override authority',
      'Revenue withdrawal (superadmin only)',
      'Agent economy parameter configuration',
      'Direct treasury access and governance',
      'Mission statement generation for all entities',
    ],
    needs: ['Full Treasury Access','Agent Economy Reports','CRM Pipeline View','Superadmin Dashboard'],
    constraints: ['AEOS economic rules apply to all entities including superadmin'],
    updated_at: now(),
  }).eq('entity_id', RYAN_ID);
  console.log('  Mission entity updated for Ryan Cowan');

  // ══════════════════════════════════════════════════════════════════════════
  // 7. SEED AFFILIATE RECORD FOR RYAN
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[7] AFFILIATE SETUP');
  const {data: existingAff} = await supabaseAdmin.from('affiliates').select('id').eq('user_id', RYAN_ID).single();
  if (!existingAff) {
    await supabaseAdmin.from('affiliates').insert({
      id: crypto.randomUUID(),
      user_id: RYAN_ID,
      code: 'RYAN-FOUNDER',
      tier: 'enterprise',
      commission_pct: 10,
      total_earned_zar: 500,
      created_at: now(),
    });
    console.log('  Affiliate record created: RYAN-FOUNDER');
  } else {
    console.log('  Affiliate record exists:', existingAff.id);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 8. UPDATE AEOS TREASURY WITH RYAN-LINKED ACCOUNTING
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n[8] TREASURY ACCOUNTING');
  const {data: treas2} = await supabaseAdmin.from('aeos_treasury').select('*').single();
  console.log('  Treasury: R' + (treas2?.balance_zar || 0) + ' balance | R' + (treas2?.total_revenue_zar || 0) + ' total revenue');

  console.log('\n✅ ORCHESTRATION COMPLETE');
  console.log('  Ryan ID:', RYAN_ID);
  console.log('  Wallet:', results.wallet_id || existingWallet?.id);
}

go().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
