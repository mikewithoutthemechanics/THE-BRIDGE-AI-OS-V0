const { Pool } = require('pg');

const pool = new Pool({
  host: '172.21.0.8',
  user: 'bridge',
  password: 'bridge_dev_password',
  database: 'bridge_ai',
  port: 5432,
  max: 5,
});

module.exports = {
  async addTransaction(amount, currency, type, source, destination, reference) {
    const result = await pool.query(
      "INSERT INTO treasury_transactions (amount, currency, type, source, destination, reference) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *",
      [amount, currency, type, source, destination, reference]
    );
    return result.rows[0];
  },
  
  async getTreasuryBalance() {
    const result = await pool.query("SELECT COALESCE(SUM(amount), 0) as balance FROM treasury_transactions WHERE status = 'completed'");
    return parseFloat(result.rows[0].balance);
  },
  
  async getRecentTransactions(limit) {
    const result = await pool.query("SELECT * FROM treasury_transactions ORDER BY created_at DESC LIMIT $1", [limit]);
    return result.rows;
  },

  async getSubscriptions() {
    const result = await pool.query("SELECT * FROM subscriptions ORDER BY started_at DESC");
    return result.rows;
  },
  
  async getSubscriptionStats() {
    const result = await pool.query("SELECT COUNT(*) as total, SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active, COALESCE(SUM(amount), 0) as mrr FROM subscriptions");
    return result.rows[0];
  },

  async addPayment(email, amount, currency, method, description) {
    const result = await pool.query(
      "INSERT INTO payments (user_email, amount, currency, method, description) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [email, amount, currency, method, description]
    );
    return result.rows[0];
  },

  pool
};
