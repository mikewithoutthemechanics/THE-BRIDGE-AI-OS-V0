// ================= AFFILIATE SYSTEM =================
// Affiliate API — returns affiliate dashboard data
app.get('/api/affiliate/me', async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const economyDb = new Pool({
      connectionString: process.env.ECONOMY_DB_URL || 'postgresql://bridge_user:secure_password_123@localhost:5432/bridgeai_economy'
    });

    try {
      // Get user's referral code
      const referralResult = await economyDb.query('SELECT referral_code FROM affiliate_referrals WHERE referrer_id = $1 LIMIT 1', [userId]);
      if (referralResult.rows.length === 0) {
        economyDb.end();
        return res.json({
          availableBalance: 0,
          pendingAmount: 0,
          totalWithdrawn: 0,
          commissionRate: 25,
          totalClicks: 0,
          totalSignups: 0,
          conversionRate: 0,
          referrals: []
        });
      }

      const referralCode = referralResult.rows[0].referral_code;

      // Get metrics using the database function
      const metricsResult = await economyDb.query('SELECT * FROM get_affiliate_metrics($1)', [referralCode]);
      const metrics = metricsResult.rows[0];

      // Get recent referrals
      const referralsResult = await economyDb.query(\`
        SELECT
          ar.referred_id as user_id,
          ar.referred_id as email,
          'Direct' as source,
          ar.created_at as joined,
          ar.status,
          COALESCE(ar.total_earned, 0) as earnings
        FROM affiliate_referrals ar
        WHERE ar.referrer_id = $1
        ORDER BY ar.created_at DESC
        LIMIT 10
      \`, [userId]);

      const affiliateData = {
        availableBalance: parseFloat(metrics.available_balance || 0),
        pendingAmount: parseFloat(metrics.pending_balance || 0),
        totalWithdrawn: parseFloat(metrics.total_commission || 0) - parseFloat(metrics.available_balance || 0) - parseFloat(metrics.pending_balance || 0),
        commissionRate: 25,
        totalClicks: parseInt(metrics.total_clicks || 0),
        totalSignups: parseInt(metrics.total_signups || 0),
        conversionRate: metrics.total_clicks > 0 ? ((metrics.total_conversions / metrics.total_clicks) * 100) : 0,
        referrals: referralsResult.rows.map(r => ({
          name: r.email ? r.email.split('@')[0] : 'Anonymous',
          email: r.email || 'N/A',
          source: r.source,
          joined: new Date(r.joined).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          status: r.status,
          earnings: parseFloat(r.earnings || 0)
        }))
      };

      economyDb.end();
      res.json(affiliateData);
    } catch (dbError) {
      economyDb.end();
      throw dbError;
    }
  } catch (error) {
    console.error('Affiliate API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Affiliate Dashboard — serves static HTML portal
app.get('/affiliate/dashboard', (req, res) => {
  const affiliatePath = path.join(__dirname, 'affiliate-portal/dashboard.html');
  fs.readFile(affiliatePath, (err, buf) => {
    if (err) {
      res.status(500).send('Affiliate dashboard not found');
      return;
    }
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.setHeader('cache-control', 'no-store');
    res.send(buf);
  });
});