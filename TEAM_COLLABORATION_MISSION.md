# Team Collaboration and Mission Alignment

## Unified DevOps Mission Statement
**For Debugging, Testing, Applying Fixes, Pushing, and VPS Deployment**

### Mission
All teammates and agents operating across Kilo, Windsurf, and Devin follow the same workflow, the same standards, and the same deployment discipline when debugging, testing, pushing, and deploying to VPS.

Our objective is repeatable, traceable, and safe deployments with zero ambiguity about responsibility or process.

### Shared Modus Operandi (Non-Negotiable)

#### 1. Debugging
- Issues are reproduced locally first
- Logs, error output, and environment context are captured
- No "quick fixes" pushed without understood root cause
- Fixes are scoped tightly to the problem
- **Rule**: If you can't reproduce it, you don't deploy it.

#### 2. Testing
- Unit/integration tests must pass before any push
- Manual smoke tests required for VPS-critical paths
- Environment parity is respected (local ≠ staging ≠ VPS)
- **Rule**: Green tests are the minimum entry requirement, not a guarantee.

#### 3. Apply & Prepare
- Config changes are reviewed for environment-specific values
- Secrets, env files, and ports are validated before deploy
- Build artefacts are created cleanly (no local residue)
- **Rule**: Preparation failures are deployment failures.

#### 4. Push
- Commits are atomic and descriptive following conventional commit standards
- No mixed concerns in a single push
- Rollback path is known before pushing
- **Rule**: Every push must be safely revertible.

#### 5. Deploy to VPS
- Deployments follow a predictable, documented sequence
- Services are restarted deliberately, not impulsively
- Health checks are verified post-deploy
- Logs monitored immediately after release
- **Rule**: A deployment is not finished until the VPS confirms it.

### Team Alignment Statement
Across Kilo, Windsurf, Devin agents and development teams, we debug the same way, test the same way, and deploy the same way.

Different tools, one discipline.  
One workflow. One mission. No shortcuts.

### One-Line Rally (for chat/commit footer)
One mission. One pipeline. One VPS.  
Debug clean. Test hard. Deploy deliberately.  
If it's not ready, it doesn't ship.