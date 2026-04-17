require("dotenv").config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

const buckets = {};
const banned = new Set();

// load bans on boot
(async () => {
  const { data } = await supabase.from("bans").select("ip");
  if (data) data.forEach(r => banned.add(r.ip));
})();

setInterval(() => {
  const now = Date.now();
  for (const ip in buckets) {
    if (now - buckets[ip].ts > 10000) delete buckets[ip];
  }
}, 5000);

module.exports = async function autoKill(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;

  if (banned.has(ip)) {
    return res.status(403).send("banned");
  }

  const now = Date.now();

  if (!buckets[ip]) {
    buckets[ip] = { count: 1, ts: now };
  } else {
    buckets[ip].count++;
  }

  if (buckets[ip].count > 20) {
    banned.add(ip);

    await supabase.from("bans").insert({
      ip,
      reason: "rate-limit",
      ts: new Date().toISOString()
    });

    console.log("BANNED:", ip);

    return res.status(429).send("blocked");
  }

  next();
};
