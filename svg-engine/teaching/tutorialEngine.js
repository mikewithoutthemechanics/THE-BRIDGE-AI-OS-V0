/**
 * Tutorial Engine — builds structured step-by-step tutorials from skills.
 * Output: { title, description, svg, steps[], tags[], meta }
 */

export function buildTutorial(skill, input = {}) {
  if (!skill?.id) throw new Error("skill.id required");

  const svg = skill.visualize ? skill.visualize(input) : _fallback(skill);

  return {
    id:          skill.id,
    title:       skill.name || skill.id,
    description: skill.description || "",
    tags:        skill.tags || [],
    version:     skill.version || "1.0.0",
    svg,
    steps:       (skill.steps || []).map((s, i) => ({
      index:  i + 1,
      title:  s.title  || `Step ${i + 1}`,
      detail: s.detail || "",
    })),
    meta: {
      generated:    new Date().toISOString(),
      source:       skill._source || "local",
      has_steps:    (skill.steps || []).length > 0,
      has_visuals:  !!skill.visualize,
    },
  };
}

export function buildPlaylist(skills, input = {}) {
  return skills.map(s => buildTutorial(s, input));
}

function _fallback(skill) {
  return `<svg width="400" height="60" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="60" fill="#0a0e17" rx="8"/>
    <text x="16" y="26" fill="#63ffda" font-family="JetBrains Mono,monospace" font-size="12">${skill.id}</text>
    <text x="16" y="44" fill="#64748b" font-family="JetBrains Mono,monospace" font-size="10">No visualization defined — implement skill.visualize()</text>
  </svg>`;
}
