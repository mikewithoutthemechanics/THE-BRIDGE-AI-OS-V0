// ================= AFFILIATE SYSTEM =================
// Affiliate API — returns affiliate dashboard data
app.get('/api/affiliate/me', (req, res) => {
  // Mock affiliate data - in production this would come from database
  const affiliateData = {
    availableBalance: 2847.50,
    pendingAmount: 1234.00,
    totalWithdrawn: 18450.00,
    commissionRate: 25,
    totalClicks: 12847,
    totalSignups: 1456,
    conversionRate: 11.34,
    referrals: [
      {name: "Sarah Mitchell", email: "sarah.m@email.com", source: "Social Media", joined: "Mar 15, 2026", status: "active", earnings: 345.00},
      {name: "James Wilson", email: "j.wilson@email.com", source: "Email Campaign", joined: "Mar 12, 2026", status: "active", earnings: 892.50},
      {name: "Emma Davis", email: "emma.d@email.com", source: "Blog Post", joined: "Mar 08, 2026", status: "pending", earnings: 0},
      {name: "Michael Brown", email: "m.brown@email.com", source: "Direct", joined: "Feb 28, 2026", status: "active", earnings: 1234.00},
      {name: "Lisa Anderson", email: "lisa.a@email.com", source: "YouTube", joined: "Feb 15, 2026", status: "inactive", earnings: 567.00}
    ]
  };
  res.json(affiliateData);
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