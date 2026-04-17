const applyRules = require("./rule-engine");
const { createClient } = require("@supabase/supabase-js");

module.exports = async function ingest(entry, supabase) {
  const rules = applyRules(entry);

  for (const r of rules) {
    await supabase.from("events").insert({
      ts: new Date().toISOString(),
      type: r.type,
      value: r.value,
      meta: entry.request?.url || ""
    });
  }
};
