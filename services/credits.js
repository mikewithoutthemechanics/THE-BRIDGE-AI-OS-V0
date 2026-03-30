// Credits service — uses existing economyDb Pool from server.js
let db;

function init(pool) { db = pool; }

async function getCredits(userId) {
  const row = await db.query('SELECT balance FROM user_credits WHERE user_id=$1', [userId]);
  return parseFloat(row.rows[0]?.balance) || 0;
}

async function addCredits(userId, amount) {
  await db.query(`
    INSERT INTO user_credits (user_id, balance, updated_at) VALUES ($1, $2, NOW())
    ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + $2, updated_at = NOW()
  `, [userId, parseFloat(amount)]);
  await db.query('INSERT INTO credit_transactions (user_id, amount, type, reference) VALUES ($1, $2, $3, $4)',
    [userId, amount, 'topup', 'checkout']);
}

async function deductCredits(userId, amount) {
  const balance = await getCredits(userId);
  if (balance < parseFloat(amount)) throw new Error('INSUFFICIENT_CREDITS');
  await db.query('UPDATE user_credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2',
    [parseFloat(amount), userId]);
  await db.query('INSERT INTO credit_transactions (user_id, amount, type, reference) VALUES ($1, $2, $3, $4)',
    [userId, -amount, 'deduction', 'execution']);
}

module.exports = { init, getCredits, addCredits, deductCredits };
