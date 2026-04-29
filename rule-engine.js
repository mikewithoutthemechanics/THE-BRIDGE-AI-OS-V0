module.exports = function applyRules(entry) {
  const rules = [];

  const url = entry.request?.url || "";
  const t = entry.time || 0;

  if (t > 500) {
    rules.push({ type: "latency-critical", value: t });
  }

  if (url.includes("/auth") && entry.time < 50) {
    rules.push({ type: "auth-burst", value: 1 });
  }

  if (url.includes("/llm") || url.includes("/infer")) {
    rules.push({ type: "cost-trigger", value: 1 });
  }

  return rules;
};
