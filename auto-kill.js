const buckets = {};

setInterval(() => {
  const now = Date.now();
  for (const ip in buckets) {
    if (now - buckets[ip].ts > 10000) delete buckets[ip];
  }
}, 5000);

module.exports = function autoKill(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress;
  const now = Date.now();

  if (!buckets[ip]) {
    buckets[ip] = { count: 1, ts: now };
  } else {
    buckets[ip].count++;
  }

  if (buckets[ip].count > 20) {
    return res.status(429).send("blocked");
  }

  next();
};
