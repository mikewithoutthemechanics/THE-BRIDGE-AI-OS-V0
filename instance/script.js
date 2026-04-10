// AUTONOMOUS SOLUTION ARCHITECTURE ENGINE v5
// Full Cognitive + Orchestration Architecture

const terminal = document.getElementById("terminal");

// ═══════════════════════════════════════════════
// STATE CORE
// ═══════════════════════════════════════════════

const STATE = {
  iterations: 0,
  memory: [],
  beliefs: {},
  goals: [],
  activeAgents: [],
  cognitiveLoad: 0,
  emotionalValence: 0, // -1 to 1 (urgency spectrum)
  worldModel: {},
  metacog: { confidence: 1.0, strategy: "default", corrections: 0 }
};

// ═══════════════════════════════════════════════
// OUTPUT SYSTEM
// ═══════════════════════════════════════════════

function print(text, cls = "output") {
  const line = document.createElement("div");
  line.className = cls;
  line.textContent = text;
  terminal.appendChild(line);
  terminal.scrollTop = terminal.scrollHeight;
}

function printHeader(text) {
  print("\n" + text, "highlight");
}

function printSection(title, items, cls = "output") {
  print(`\n[${title}]`, "insight");
  if (Array.isArray(items)) {
    items.forEach(i => print(typeof i === "string" ? "  " + i : "  " + JSON.stringify(i), cls));
  } else {
    print("  " + JSON.stringify(items), cls);
  }
}

// ═══════════════════════════════════════════════
// INPUT SYSTEM
// ═══════════════════════════════════════════════

function createInput() {
  const line = document.createElement("div");
  line.className = "input-line";
  line.contentEditable = true;
  terminal.appendChild(line);
  line.focus();

  line.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const input = line.textContent.trim();
      line.contentEditable = false;
      if (input.length > 0) orchestrate(input);
      createInput();
    }
  });
}

// ═══════════════════════════════════════════════
// LAYER 1: PERCEPTION — Raw Input Processing
// ═══════════════════════════════════════════════

function perceive(input) {
  const tokens = tokenize(input);
  const entities = extractEntities(tokens);
  const sentiment = analyzeSentiment(tokens);
  const complexity = measureComplexity(tokens, entities);

  return { raw: input, tokens, entities, sentiment, complexity };
}

function tokenize(text) {
  return text.toLowerCase().replace(/[^\w\s]/g, "").split(/\s+/).filter(Boolean);
}

function extractEntities(tokens) {
  const categories = {
    survival: ["hunger", "food", "water", "shelter", "health", "disease", "famine", "poverty", "death"],
    economic: ["unemployment", "jobs", "money", "economy", "inflation", "debt", "wages", "trade", "market", "business"],
    social: ["communication", "trust", "community", "isolation", "loneliness", "culture", "education", "equality"],
    technical: ["error", "bug", "server", "code", "system", "deploy", "crash", "latency", "database", "api"],
    environmental: ["climate", "pollution", "energy", "water", "waste", "carbon", "biodiversity", "deforestation"],
    governance: ["corruption", "policy", "law", "regulation", "democracy", "rights", "justice", "conflict", "war"],
    cognitive: ["learning", "intelligence", "knowledge", "creativity", "decision", "bias", "misinformation"]
  };

  const found = {};
  for (const [category, keywords] of Object.entries(categories)) {
    const matches = tokens.filter(t => keywords.some(k => t.includes(k)));
    if (matches.length > 0) found[category] = matches;
  }
  return found;
}

function analyzeSentiment(tokens) {
  const negative = ["crisis", "fail", "broken", "dying", "collapse", "destroy", "problem", "lack", "loss", "threat"];
  const positive = ["solve", "build", "create", "improve", "grow", "help", "fix", "optimize", "heal", "restore"];
  const urgent = ["emergency", "critical", "immediate", "now", "urgent", "dying", "crisis", "collapse"];

  let score = 0;
  let urgency = 0;
  tokens.forEach(t => {
    if (negative.some(n => t.includes(n))) score -= 1;
    if (positive.some(p => t.includes(p))) score += 1;
    if (urgent.some(u => t.includes(u))) urgency += 1;
  });

  return {
    valence: Math.max(-1, Math.min(1, score / Math.max(tokens.length, 1))),
    urgency: Math.min(1, urgency / 3),
    label: score < 0 ? "negative" : score > 0 ? "positive" : "neutral"
  };
}

function measureComplexity(tokens, entities) {
  const domainCount = Object.keys(entities).length;
  const tokenCount = tokens.length;
  const uniqueRatio = new Set(tokens).size / Math.max(tokenCount, 1);

  return {
    domains: domainCount,
    breadth: tokenCount,
    density: uniqueRatio,
    level: domainCount > 2 ? "systemic" : domainCount > 1 ? "compound" : tokenCount > 8 ? "detailed" : "focused",
    score: (domainCount * 0.4 + tokenCount * 0.02 + uniqueRatio * 0.3).toFixed(2)
  };
}

// ═══════════════════════════════════════════════
// LAYER 2: COGNITION — Reasoning Engine
// ═══════════════════════════════════════════════

function reason(perception) {
  const intent = classifyIntent(perception);
  const domain = classifyDomain(perception);
  const causalChain = buildCausalChain(perception, domain);
  const analogies = findAnalogies(perception, domain);
  const constraints = inferConstraints(perception);
  const assumptions = surfaceAssumptions(perception, domain);

  return { intent, domain, causalChain, analogies, constraints, assumptions };
}

function classifyIntent(p) {
  const domains = Object.keys(p.entities);
  if (domains.includes("survival")) return { type: "survive", priority: 10 };
  if (domains.includes("governance")) return { type: "reform", priority: 8 };
  if (domains.includes("environmental")) return { type: "sustain", priority: 9 };
  if (domains.includes("economic")) return { type: "optimize", priority: 7 };
  if (domains.includes("social")) return { type: "connect", priority: 6 };
  if (domains.includes("technical")) return { type: "engineer", priority: 5 };
  if (domains.includes("cognitive")) return { type: "enhance", priority: 6 };
  return { type: "general", priority: 3 };
}

function classifyDomain(p) {
  const domains = Object.keys(p.entities);
  if (domains.length === 0) return { primary: "abstract", secondary: null, cross: false };
  return {
    primary: domains[0],
    secondary: domains[1] || null,
    cross: domains.length > 1,
    all: domains
  };
}

function buildCausalChain(p, domain) {
  const chains = {
    survival: ["resource scarcity", "distribution failure", "systemic inequality", "policy gaps", "human suffering"],
    economic: ["market distortion", "skill mismatch", "structural barriers", "reduced output", "social instability"],
    social: ["trust erosion", "communication breakdown", "isolation loops", "polarization", "collective dysfunction"],
    technical: ["root cause", "cascading failure", "system degradation", "user impact", "recovery cost"],
    environmental: ["emission sources", "ecosystem stress", "tipping points", "feedback loops", "irreversible damage"],
    governance: ["power concentration", "accountability gaps", "institutional decay", "public distrust", "systemic failure"],
    cognitive: ["information overload", "bias amplification", "decision fatigue", "knowledge fragmentation", "reasoning failure"]
  };
  return chains[domain.primary] || ["undefined cause", "unknown effect", "unmapped outcome"];
}

function findAnalogies(p, domain) {
  const analogyMap = {
    survival: "Like a body in shock — stabilize first, then heal",
    economic: "Like a congested network — clear bottlenecks, reroute flow",
    social: "Like a broken bridge — rebuild trust infrastructure piece by piece",
    technical: "Like debugging — isolate, reproduce, fix, verify",
    environmental: "Like compound interest in reverse — small damage accelerates",
    governance: "Like an immune system — must detect and correct internal threats",
    cognitive: "Like signal processing — filter noise, amplify clarity"
  };
  return analogyMap[domain.primary] || "Like an unknown system — map first, then act";
}

function inferConstraints(p) {
  const constraints = [];
  if (p.sentiment.urgency > 0.5) constraints.push("TIME: urgent response required");
  if (p.complexity.level === "systemic") constraints.push("SCOPE: multi-domain coordination needed");
  if (p.complexity.domains > 2) constraints.push("RESOURCES: cross-domain expertise required");
  if (p.sentiment.valence < -0.3) constraints.push("RISK: negative trajectory — intervention needed");
  if (constraints.length === 0) constraints.push("STANDARD: no critical constraints detected");
  return constraints;
}

function surfaceAssumptions(p, domain) {
  const assumptions = [
    `Problem is addressable within ${domain.primary} domain`,
    "Sufficient information exists to model a solution",
    "Resources can be allocated or redirected"
  ];
  if (domain.cross) assumptions.push(`Cross-domain interaction between ${domain.all.join(" + ")} is manageable`);
  if (p.sentiment.urgency > 0.5) assumptions.push("Immediate partial action is better than delayed perfect action");
  return assumptions;
}

// ═══════════════════════════════════════════════
// LAYER 3: STRATEGY — Planning & Decomposition
// ═══════════════════════════════════════════════

function strategize(perception, reasoning) {
  const goal = defineGoal(reasoning);
  const subgoals = decomposeGoal(goal, reasoning);
  const plan = buildExecutionPlan(subgoals, reasoning);
  const risks = assessRisks(plan, perception);
  const fallbacks = generateFallbacks(plan, risks);

  return { goal, subgoals, plan, risks, fallbacks };
}

function defineGoal(r) {
  return {
    statement: `Achieve ${r.intent.type} outcome in ${r.domain.primary} domain`,
    priority: r.intent.priority,
    measurable: `Reduction in ${r.causalChain[r.causalChain.length - 1]}`
  };
}

function decomposeGoal(goal, r) {
  const base = [
    { id: 1, task: "Validate problem definition", status: "pending", depends: [] },
    { id: 2, task: "Map root causes via causal chain", status: "pending", depends: [1] },
    { id: 3, task: "Identify intervention leverage points", status: "pending", depends: [2] },
    { id: 4, task: "Design solution architecture", status: "pending", depends: [3] },
    { id: 5, task: "Simulate outcomes", status: "pending", depends: [4] },
    { id: 6, task: "Execute primary pathway", status: "pending", depends: [5] },
    { id: 7, task: "Monitor and adapt", status: "pending", depends: [6] }
  ];

  if (r.domain.cross) {
    base.splice(3, 0, {
      id: 3.5, task: `Cross-domain sync: ${r.domain.all.join(" <-> ")}`, status: "pending", depends: [3]
    });
  }

  return base;
}

function buildExecutionPlan(subgoals, r) {
  return subgoals.map(sg => ({
    ...sg,
    agent: assignAgent(sg, r),
    estimatedConfidence: computeConfidence(sg)
  }));
}

function assignAgent(subgoal, r) {
  if (subgoal.task.includes("Validate")) return "Perception Agent";
  if (subgoal.task.includes("root cause")) return "Causal Reasoning Agent";
  if (subgoal.task.includes("leverage")) return "Strategy Agent";
  if (subgoal.task.includes("architecture")) return "Architect Agent";
  if (subgoal.task.includes("Simulate")) return "Quant Simulation Agent";
  if (subgoal.task.includes("Execute")) return "Execution Agent";
  if (subgoal.task.includes("Monitor")) return "Metacognition Agent";
  if (subgoal.task.includes("Cross-domain")) return "Orchestrator Agent";
  return "General Agent";
}

function computeConfidence(sg) {
  return (0.6 + hashScore(sg.task) / 250).toFixed(2);
}

function assessRisks(plan, p) {
  const risks = [];
  if (p.complexity.level === "systemic") risks.push({ risk: "Emergent behavior from system interactions", severity: "high" });
  if (p.sentiment.urgency > 0.7) risks.push({ risk: "Rushed execution may miss root cause", severity: "medium" });
  if (plan.some(s => s.estimatedConfidence < 0.7)) risks.push({ risk: "Low-confidence steps in pipeline", severity: "medium" });
  if (risks.length === 0) risks.push({ risk: "No critical risks identified", severity: "low" });
  return risks;
}

function generateFallbacks(plan, risks) {
  return risks.map(r => ({
    trigger: r.risk,
    action: r.severity === "high"
      ? "Isolate affected subsystem, re-route through safe pathway"
      : "Adjust parameters and retry with modified constraints"
  }));
}

// ═══════════════════════════════════════════════
// LAYER 4: SYNTHESIS — Solution Generation
// ═══════════════════════════════════════════════

function synthesize(perception, reasoning, strategy) {
  const solutions = generateSolutions(reasoning);
  const ranked = rankSolutions(solutions, perception, strategy);
  const actionPlan = buildActionPlan(ranked[0], strategy);

  return { solutions: ranked, primary: ranked[0], actionPlan };
}

function generateSolutions(r) {
  const solutionDB = {
    survival: [
      { name: "Emergency Resource Deployment", approach: "Immediate distribution of critical resources", impact: 9, feasibility: 7 },
      { name: "Local Production Scaling", approach: "Build distributed local production capacity", impact: 8, feasibility: 6 },
      { name: "Supply Chain Restructure", approach: "Optimize logistics and eliminate waste points", impact: 7, feasibility: 8 },
      { name: "Prevention Infrastructure", approach: "Build early-warning systems and reserves", impact: 9, feasibility: 5 }
    ],
    economic: [
      { name: "Micro-Economy Bootstrap", approach: "Create localized job ecosystems with low barriers", impact: 7, feasibility: 8 },
      { name: "Skill Bridge Program", approach: "Rapid reskilling aligned to market demand", impact: 8, feasibility: 7 },
      { name: "Digital Labor Marketplace", approach: "AI-matched job platform eliminating friction", impact: 8, feasibility: 8 },
      { name: "Public-Private Pipeline", approach: "Government-backed employment guarantees with private execution", impact: 9, feasibility: 5 }
    ],
    social: [
      { name: "Trust Infrastructure", approach: "Build transparency systems that reward honest interaction", impact: 8, feasibility: 6 },
      { name: "Communication Reformation", approach: "Replace algorithmic feeds with intentional channels", impact: 7, feasibility: 5 },
      { name: "Community Nuclei", approach: "Seed small, high-trust groups that expand organically", impact: 8, feasibility: 8 },
      { name: "Education Overhaul", approach: "Teach critical thinking and empathic communication", impact: 9, feasibility: 4 }
    ],
    technical: [
      { name: "Root Cause Elimination", approach: "Trace to source, fix at origin", impact: 9, feasibility: 9 },
      { name: "System Hardening", approach: "Add resilience layers and monitoring", impact: 7, feasibility: 8 },
      { name: "Architecture Redesign", approach: "Restructure for scalability and reliability", impact: 9, feasibility: 5 }
    ],
    environmental: [
      { name: "Carbon Neutralization", approach: "Offset and reduce emissions systematically", impact: 9, feasibility: 5 },
      { name: "Circular Economy", approach: "Eliminate waste through closed-loop systems", impact: 8, feasibility: 6 },
      { name: "Ecosystem Restoration", approach: "Active rewilding and biodiversity recovery", impact: 9, feasibility: 4 }
    ],
    governance: [
      { name: "Transparency Engine", approach: "Open data, auditable processes, public accountability", impact: 8, feasibility: 6 },
      { name: "Distributed Governance", approach: "Decentralize decision-making with checks", impact: 9, feasibility: 4 },
      { name: "Institutional Redesign", approach: "Rebuild institutions with modern incentive structures", impact: 9, feasibility: 3 }
    ],
    cognitive: [
      { name: "Information Architecture", approach: "Structure knowledge for clarity and accessibility", impact: 7, feasibility: 8 },
      { name: "Bias Correction Systems", approach: "Automated debiasing in decision pipelines", impact: 8, feasibility: 6 },
      { name: "Augmented Reasoning", approach: "AI-assisted decision support tools", impact: 9, feasibility: 7 }
    ]
  };

  const domain = r.domain.primary;
  let solutions = solutionDB[domain] || [
    { name: "Adaptive Analysis", approach: "Decompose, model, iterate", impact: 6, feasibility: 8 }
  ];

  // Cross-domain merge
  if (r.domain.cross && r.domain.secondary && solutionDB[r.domain.secondary]) {
    solutions = solutions.concat(solutionDB[r.domain.secondary].slice(0, 2));
  }

  return solutions;
}

function rankSolutions(solutions, p, s) {
  return solutions.map(sol => ({
    ...sol,
    score: (
      sol.impact * 0.5 +
      sol.feasibility * 0.3 +
      (1 - p.sentiment.urgency) * sol.feasibility * 0.1 +
      p.sentiment.urgency * sol.impact * 0.1
    ).toFixed(2)
  })).sort((a, b) => b.score - a.score);
}

function buildActionPlan(primary, strategy) {
  return {
    solution: primary.name,
    approach: primary.approach,
    steps: strategy.plan.map(s => `${s.agent}: ${s.task}`),
    contingency: strategy.fallbacks.map(f => f.action)
  };
}

// ═══════════════════════════════════════════════
// LAYER 5: METACOGNITION — Self-Monitoring
// ═══════════════════════════════════════════════

function metacognize(perception, reasoning, strategy, synthesis) {
  const selfAssessment = assessOwnReasoning(reasoning, synthesis);
  const biasCheck = detectBias(reasoning, synthesis);
  const confidenceCalibration = calibrateConfidence(strategy, synthesis);
  const learningSignal = extractLearning(perception, synthesis);

  STATE.metacog = {
    confidence: confidenceCalibration.overall,
    strategy: selfAssessment.recommendedStrategy,
    corrections: STATE.metacog.corrections + biasCheck.corrections
  };

  return { selfAssessment, biasCheck, confidenceCalibration, learningSignal };
}

function assessOwnReasoning(r, s) {
  const domainCoverage = r.domain.all ? r.domain.all.length : 1;
  const solutionDepth = s.solutions.length;
  const topScore = parseFloat(s.primary.score);

  let quality = "adequate";
  let recommendedStrategy = "default";

  if (topScore > 7 && solutionDepth > 3) {
    quality = "strong";
    recommendedStrategy = "execute";
  } else if (topScore < 5) {
    quality = "weak";
    recommendedStrategy = "research-more";
  } else if (domainCoverage > 2) {
    quality = "broad-but-shallow";
    recommendedStrategy = "focus-then-execute";
  }

  return { quality, recommendedStrategy, domainCoverage, solutionDepth };
}

function detectBias(r, s) {
  const biases = [];
  let corrections = 0;

  // Availability bias: over-relying on first-matched domain
  if (r.domain.cross && s.solutions.filter(sol => sol.score > 6).length < 2) {
    biases.push("Availability bias: primary domain may be overshadowing secondary factors");
    corrections++;
  }

  // Optimism bias: all high scores
  if (s.solutions.every(sol => parseFloat(sol.score) > 6)) {
    biases.push("Optimism bias: all solutions rated favorably — apply more scrutiny");
    corrections++;
  }

  // Anchoring: first solution dominates
  if (s.solutions.length > 1 && parseFloat(s.solutions[0].score) - parseFloat(s.solutions[1].score) > 2) {
    biases.push("Anchoring bias: top solution significantly outscores alternatives — verify independently");
    corrections++;
  }

  if (biases.length === 0) biases.push("No significant cognitive biases detected");

  return { biases, corrections };
}

function calibrateConfidence(strategy, synthesis) {
  const planConfidences = strategy.plan.map(s => parseFloat(s.estimatedConfidence));
  const avg = planConfidences.reduce((a, b) => a + b, 0) / planConfidences.length;
  const min = Math.min(...planConfidences);
  const riskCount = strategy.risks.filter(r => r.severity === "high").length;

  const overall = Math.max(0.1, Math.min(1.0, avg - (riskCount * 0.15) - (min < 0.5 ? 0.1 : 0)));

  return {
    overall: parseFloat(overall.toFixed(2)),
    average: parseFloat(avg.toFixed(2)),
    weakestLink: min,
    riskPenalty: riskCount * 0.15
  };
}

function extractLearning(p, s) {
  return {
    pattern: `${Object.keys(p.entities).join("+")} -> ${s.primary.name}`,
    effectiveness: s.primary.score,
    reusable: parseFloat(s.primary.score) > 6
  };
}

// ═══════════════════════════════════════════════
// LAYER 6: MEMORY — Learning & Recall
// ═══════════════════════════════════════════════

function memorize(perception, reasoning, synthesis, metacog) {
  const entry = {
    id: STATE.memory.length + 1,
    timestamp: Date.now(),
    problem: perception.raw,
    domain: reasoning.domain.primary,
    solution: synthesis.primary.name,
    score: synthesis.primary.score,
    confidence: metacog.confidenceCalibration.overall,
    learning: metacog.learningSignal
  };

  STATE.memory.push(entry);
  if (STATE.memory.length > 200) STATE.memory.shift();

  // Update beliefs
  STATE.beliefs[reasoning.domain.primary] = (STATE.beliefs[reasoning.domain.primary] || 0) + 1;

  // Update world model
  STATE.worldModel[reasoning.domain.primary] = {
    lastSeen: Date.now(),
    bestSolution: synthesis.primary.name,
    confidence: metacog.confidenceCalibration.overall
  };

  return entry;
}

function recall(domain) {
  return STATE.memory.filter(m => m.domain === domain).slice(-5);
}

// ═══════════════════════════════════════════════
// LAYER 7: ORCHESTRATOR — Agent Coordination
// ═══════════════════════════════════════════════

function orchestrate(input) {
  STATE.iterations++;
  const startTime = performance.now();

  print("\n" + "=".repeat(60), "highlight");
  print(`COGNITIVE CYCLE #${STATE.iterations}`, "highlight");
  print("=".repeat(60), "highlight");

  // Phase 1: Perception
  printHeader("PHASE 1: PERCEPTION");
  const perception = perceive(input);
  print(`  Tokens: ${perception.tokens.length} | Entities: ${JSON.stringify(Object.keys(perception.entities))}`);
  print(`  Sentiment: ${perception.sentiment.label} (valence: ${perception.sentiment.valence.toFixed(2)}, urgency: ${perception.sentiment.urgency.toFixed(2)})`);
  print(`  Complexity: ${perception.complexity.level} (score: ${perception.complexity.score})`);

  // Phase 2: Cognition
  printHeader("PHASE 2: COGNITION");
  const reasoning = reason(perception);
  print(`  Intent: ${reasoning.intent.type} (priority: ${reasoning.intent.priority}/10)`);
  print(`  Domain: ${reasoning.domain.primary}${reasoning.domain.cross ? " + " + reasoning.domain.secondary : ""}`);
  print(`  Analogy: ${reasoning.analogies}`);

  printSection("CAUSAL CHAIN", reasoning.causalChain.map((c, i) => `${i + 1}. ${c}`));
  printSection("CONSTRAINTS", reasoning.constraints, "warn");
  printSection("ASSUMPTIONS", reasoning.assumptions);

  // Phase 3: Strategy
  printHeader("PHASE 3: STRATEGY");
  const strategy = strategize(perception, reasoning);
  print(`  Goal: ${strategy.goal.statement}`);
  print(`  Measurable: ${strategy.goal.measurable}`);

  printSection("EXECUTION PLAN", strategy.plan.map(s =>
    `[${s.agent}] ${s.task} (conf: ${s.estimatedConfidence})`
  ));

  printSection("RISKS", strategy.risks.map(r =>
    `[${r.severity.toUpperCase()}] ${r.risk}`
  ), "warn");

  // Phase 4: Synthesis
  printHeader("PHASE 4: SYNTHESIS");
  const synthesis = synthesize(perception, reasoning, strategy);

  printSection("RANKED SOLUTIONS", synthesis.solutions.slice(0, 5).map((s, i) =>
    `#${i + 1} ${s.name} (score: ${s.score}) — ${s.approach}`
  ), "insight");

  print("\n[PRIMARY ACTION PLAN]", "highlight");
  print(`  Solution: ${synthesis.actionPlan.solution}`);
  print(`  Approach: ${synthesis.actionPlan.approach}`);

  // Phase 5: Metacognition
  printHeader("PHASE 5: METACOGNITION");
  const metacog = metacognize(perception, reasoning, strategy, synthesis);
  print(`  Reasoning Quality: ${metacog.selfAssessment.quality}`);
  print(`  Recommended Strategy: ${metacog.selfAssessment.recommendedStrategy}`);
  print(`  Overall Confidence: ${(metacog.confidenceCalibration.overall * 100).toFixed(0)}%`);

  printSection("BIAS CHECK", metacog.biasCheck.biases,
    metacog.biasCheck.corrections > 0 ? "warn" : "output");

  // Phase 6: Memory
  printHeader("PHASE 6: MEMORY & LEARNING");
  const memEntry = memorize(perception, reasoning, synthesis, metacog);
  print(`  Pattern Stored: ${metacog.learningSignal.pattern}`);
  print(`  Total Patterns: ${STATE.memory.length}`);
  print(`  Domain Expertise: ${JSON.stringify(STATE.beliefs)}`);

  // Check for prior knowledge
  const priorKnowledge = recall(reasoning.domain.primary);
  if (priorKnowledge.length > 1) {
    print(`  Prior Solutions in ${reasoning.domain.primary}: ${priorKnowledge.map(p => p.solution).join(", ")}`, "insight");
  }

  // Phase 7: Orchestration Summary
  const elapsed = (performance.now() - startTime).toFixed(1);
  printHeader("ORCHESTRATION COMPLETE");
  print(`  Cognitive Cycle: ${STATE.iterations}`);
  print(`  Agents Activated: ${[...new Set(strategy.plan.map(s => s.agent))].length}`);
  print(`  Processing Time: ${elapsed}ms`);
  print(`  System Confidence: ${(metacog.confidenceCalibration.overall * 100).toFixed(0)}%`);
  print(`  Metacog Corrections (cumulative): ${STATE.metacog.corrections}`);

  // Verdict
  print("\n" + "-".repeat(60));
  if (metacog.confidenceCalibration.overall > 0.7) {
    print(`VERDICT: EXECUTE "${synthesis.primary.name}"`, "highlight");
  } else if (metacog.confidenceCalibration.overall > 0.4) {
    print(`VERDICT: PROCEED WITH CAUTION — "${synthesis.primary.name}"`, "warn");
  } else {
    print(`VERDICT: INSUFFICIENT CONFIDENCE — GATHER MORE DATA`, "critical");
  }
  print("-".repeat(60) + "\n");
}

// ═══════════════════════════════════════════════
// UTILITY
// ═══════════════════════════════════════════════

function hashScore(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h % 100);
}

// ═══════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════

print("AUTONOMOUS SOLUTION ARCHITECTURE ENGINE v5", "highlight");
print("Full Cognitive Architecture + Orchestration Layer", "highlight");
print("");
print("7-Layer Pipeline Active:");
print("  1. Perception    — tokenization, entity extraction, sentiment, complexity");
print("  2. Cognition     — intent, domain, causal chains, analogies, assumptions");
print("  3. Strategy      — goal decomposition, execution planning, risk assessment");
print("  4. Synthesis     — solution generation, ranking, action plans");
print("  5. Metacognition — self-assessment, bias detection, confidence calibration");
print("  6. Memory        — pattern learning, belief updating, world modeling");
print("  7. Orchestration — agent coordination, pipeline management");
print("");
print("Enter any problem to activate full cognitive pipeline.\n");

createInput();
