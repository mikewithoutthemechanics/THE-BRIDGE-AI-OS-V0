// config-diff.js — deterministic shallow-per-bucket diff.
//
// Only diffs the three mutable buckets (features/limits/ui). Produces
// three lists suitable for direct rendering in Panel G: added, modified,
// removed. Anything outside the mutable buckets is ignored — the caller
// should already have filtered baseline + proposal through the schema.

const MUTABLE_BUCKETS = ['features', 'limits', 'ui', 'workflow'];

function diff(baseline, proposal){
  const added    = [];
  const modified = [];
  const removed  = [];
  baseline = baseline || {};
  proposal = proposal || {};

  for (const bucket of MUTABLE_BUCKETS){
    const b = baseline[bucket] || {};
    const p = proposal[bucket] || {};
    // Keys appearing in proposal
    for (const k of Object.keys(p)){
      const bv = b[k];
      const pv = p[k];
      if (pv === null){
        // Handled as a removal below — skip add/modify classification.
        continue;
      }
      if (bv === undefined){
        added.push({ path: `${bucket}.${k}`, to: pv });
      } else if (!equal(bv, pv)){
        modified.push({ path: `${bucket}.${k}`, from: bv, to: pv });
      }
    }
    // Proposals are partial patches: a missing key is NOT a removal, it's
    // "leave unchanged". Removals must be explicit: the proposal must set
    // the key to null. This matches the commit semantic in routes/settings.js
    // which Object.assigns existing overrides with the proposed bucket.
    for (const k of Object.keys(p)){
      if (p[k] === null && b[k] !== undefined){
        removed.push({ path: `${bucket}.${k}`, from: b[k] });
      }
    }
  }

  return { added, modified, removed, empty: !added.length && !modified.length && !removed.length };
}

function equal(a, b){
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a && b && typeof a === 'object') return JSON.stringify(a) === JSON.stringify(b);
  return false;
}

module.exports = { diff };
