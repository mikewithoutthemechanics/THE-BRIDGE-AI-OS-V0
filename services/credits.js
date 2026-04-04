// Credits service — uses existing economyDb Pool from server.js
// Falls back to in-memory tracking if no DB pool provided
let db;
const memoryStore = new Map(); // userId -> balance

function init(pool) { db = pool; }

async function getCredits(userId) {
  if (!db) {
    return memoryStore.get(userId) || 0;
  }
  try {
    const row = await db.query('SELECT balance FROM user_credits WHERE user_id=$1', [userId]);
    return parseFloat(row.rows[0]?.balance) || 0;
  } catch (err) {
    console.error('[credits] getCredits failed:', err.message);
    return memoryStore.get(userId) || 0;
  }
}

async function addCredits(userId, amount) {
  const amt = parseFloat(amount) || 0;
  if (!db) {
    memoryStore.set(userId, (memoryStore.get(userId) || 0) + amt);
    return;
  }
  try {
    await db.query(`
      INSERT INTO user_credits (user_id, balance, updated_at) VALUES ($1, $2, NOW())
      ON CONFLICT (user_id) DO UPDATE SET balance = user_credits.balance + $2, updated_at = NOW()
    `, [userId, amt]);
    await db.query('INSERT INTO credit_transactions (user_id, amount, type, reference) VALUES ($1, $2, $3, $4)',
      [userId, amt, 'topup', 'checkout']);
  } catch (err) {
    console.error('[credits] addCredits failed:', err.message);
    memoryStore.set(userId, (memoryStore.get(userId) || 0) + amt);
  }
}

async function deductCredits(userId, amount) {
  const amt = parseFloat(amount) || 0;
  const balance = await getCredits(userId);
  if (balance < amt) throw new Error('INSUFFICIENT_CREDITS');

  if (!db) {
    memoryStore.set(userId, balance - amt);
    return;
  }
  try {
    await db.query('UPDATE user_credits SET balance = balance - $1, updated_at = NOW() WHERE user_id = $2',
      [amt, userId]);
    await db.query('INSERT INTO credit_transactions (user_id, amount, type, reference) VALUES ($1, $2, $3, $4)',
      [userId, -amt, 'deduction', 'execution']);
  } catch (err) {
    console.error('[credits] deductCredits failed:', err.message);
    memoryStore.set(userId, balance - amt);
  }
}

module.exports = { init, getCredits, addCredits, deductCredits };