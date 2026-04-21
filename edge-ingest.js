require('dotenv').config();
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// attach to your existing gateway/server
module.exports = function edgeIngest(req, res, next) {
  const start = Date.now();

  res.on("finish", async () => {
    const latency = Date.now() - start;
    const url = req.originalUrl || req.url;

    let events = [];

    if (latency > 300) events.push({ type: "latency", value: latency });
    if (url.includes("/auth")) events.push({ type: "auth", value: 1 });
    if (url.includes("/llm") || url.includes("/infer")) events.push({ type: "cost", value: 1 });

    for (const e of events) {
      await supabase.from("events").insert({
        ts: new Date().toISOString(),
        type: e.type,
        value: e.value,
        meta: url
      });
    }
  });

  next();
};
