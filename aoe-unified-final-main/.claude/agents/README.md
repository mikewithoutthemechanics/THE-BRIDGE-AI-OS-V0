# Project agents

## mobile-guardian

Audits every UI/server file in this repo for three concerns and auto-fixes the safe ones:

1. **Mobile friendliness** — viewport meta, responsive breakpoints, touch target sizes, responsive images.
2. **Navigation correctness** — internal links resolve, anchor `#ids` exist, routes are registered, mobile nav pattern exists.
3. **Authentication integrity** — cookie flags, CORS+credentials combos, token storage, protected-route guards, CSRF, session expiry.

### One-off invocation

In a Claude Code session from the repo root:

```
Use the mobile-guardian agent to audit the next batch of files.
```

Claude will read [.claude/agents/mobile-guardian.md](agents/mobile-guardian.md), pick up the batch cursor from [.claude/state/mobile-guardian.json](../state/mobile-guardian.json), process 8 files, and append fixes + flags.

### Continuous (recommended)

Use the `/loop` skill to re-invoke on an interval until the queue is empty:

```
/loop 10m Use the mobile-guardian agent to audit the next batch of files and report flags.
```

- `10m` = every 10 minutes. Adjust to taste.
- Loop auto-stops when the agent reports `✓ all files pass audit` for three consecutive runs.
- Interrupt any time with Ctrl-C or `/loop stop`.

### Scheduled (background)

Use the `/schedule` skill to register a cron trigger (runs even when you don't have a session open):

```
/schedule mobile-guardian daily at 09:00 — invoke the mobile-guardian agent on this repo
```

### Tuning

Edit the `mobile_guardian_config` block at the bottom of [mobile-guardian.md](agents/mobile-guardian.md):

- `batch_size` — how many files per invocation (higher = fewer runs, each one longer)
- `mobile_breakpoint_px` — the media-query breakpoint for auto-collapse (default 768)
- `protected_path_prefixes` — URL prefixes that MUST have an auth guard
- `auto_fix.*` — flip any rule to `false` if you'd rather review manually than auto-apply

### State

Progress lives in [.claude/state/mobile-guardian.json](../state/mobile-guardian.json). Delete this file to force a full re-audit from scratch.

### What it WILL auto-fix

- Missing `<meta name="viewport">` tag.
- `user-scalable=no` / `maximum-scale=1` (accessibility violation).
- Missing `@media (max-width:768px)` collapse on obvious desktop-only grids.
- Missing `max-width:100%; height:auto` on naked `<img>` in flow content.
- Missing `httpOnly` / `secure` / `sameSite` on `res.cookie()` calls — with a one-line trace comment so you can review.

### What it WILL NOT auto-fix (flags only)

- Broken links. Could be a rename, a removed route, or a typo — needs human judgment.
- CORS `*` + credentials combos. Need to know the real allowlist.
- Token-in-localStorage. Needs an auth backend change.
- Any nav pattern restructure (hamburger menu, drawer). Needs design input.
- Any fix > 5 lines of code.
