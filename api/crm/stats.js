/**
 * Vercel API: GET /api/crm/stats
 * Real-time CRM statistics from Supabase
 */

const { supabase } = require('../../lib/supabase');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  try {
    // Total leads
    const { count: totalCount } = await supabase
      .from('crm_leads')
      .select('*', { count: 'exact', head: true });

    // By status
    const statuses = {};
    for (const status of ['prospect', 'qualified', 'deal', 'won']) {
      const { count } = await supabase
        .from('crm_leads')
        .select('*', { count: 'exact', head: true })
        .eq('status', status);
      statuses[status] = count || 0;
    }

    // Average score
    const { data: scoreData } = await supabase
      .from('crm_leads')
      .select('score');

    const avgScore = scoreData?.length
      ? Math.round(scoreData.reduce((sum, row) => sum + (row.score || 0), 0) / scoreData.length)
      : 0;

    // Recent leads (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentCount } = await supabase
      .from('crm_leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', sevenDaysAgo);

    res.json({
      total_leads: totalCount || 0,
      by_status: statuses,
      avg_lead_score: avgScore,
      recent_7_days: recentCount || 0,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('[CRM/STATS] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
};
