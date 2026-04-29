'use strict';
const BRDG_ZAR_RATE = 5;
class EconomicEngine {
  constructor(supabaseAdmin, pgPool) { this.db = supabaseAdmin; this.pg = pgPool||null; }
  static splitCalc(amount_zar, user_cut_pct, affiliate_cut_pct=0) {
    const r = n => Math.round(n*10000)/10000;
    const user_zar = r(amount_zar*user_cut_pct/100);
    const affiliate_zar = r(amount_zar*affiliate_cut_pct/100);
    const ryan_zar = r(amount_zar-user_zar-affiliate_zar);
    return { user_zar, affiliate_zar, ryan_zar, user_brdg: r(user_zar*BRDG_ZAR_RATE), affiliate_brdg: r(affiliate_zar*BRDG_ZAR_RATE), ryan_brdg: r(ryan_zar*BRDG_ZAR_RATE) };
  }
  async getTierConfig(tierName) {
    const { data } = await this.db.from('tier_config').select('*').eq('tier_name', tierName||'free').single();
    return data || { tier_name:'free', max_apps:1, max_leads:50, revenue_share_pct:0, affiliate_enabled:false, automation_enabled:false, banking_enabled:false };
  }
  async getTreasuryState() {
    const { data: t } = await this.db.from('aeos_treasury').select('*').eq('id',1).single();
    return { balance_zar: t?.balance_zar||0, balance_brdg: t?.balance_brdg||0, total_revenue_zar: t?.total_revenue_zar||0, net_zar: (t?.total_revenue_zar||0)-(t?.total_costs_zar||0) };
  }
}
module.exports = { EconomicEngine };
