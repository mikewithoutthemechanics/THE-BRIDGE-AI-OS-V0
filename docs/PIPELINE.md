# SELF-HEALING UPGRADE PIPELINE

## 1. System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SELF-HEALING UPGRADE PIPELINE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ┌─────────┐    ┌─────────────┐    ┌──────────┐    ┌────────┐             │
│  │  AUDIT  │───▶│ AUTO-REFACTOR│───▶│   TEST   │───▶│ DEPLOY │             │
│  └─────────┘    └─────────────┘    └──────────┘    └────────┘             │
│       │               │                   │              │                     │
│       │               │                   │              │                     │
│       ▼               ▼                   ▼              ▼                     │
│  ┌─────────────────────────────────────────────────────────────┐          │
│  │                    EVALUATE & REPEAT                        │          │
│  │  Health Score ≥ 95% ? → PRODUCTION : LOOP                  │          │
│  └─────────────────────────────────────────────────────────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2. Step-by-Step Execution Flow

### Phase 1: AUDIT
- Scan auth-service.js existence
- Verify shared directory structure  
- Check users.json for seeded accounts
- Verify superadmin (ryanpcowan@gmail.com) exists with correct role
- Validate referral system initialization
- Check frontend auth integration (onboarding.html → /auth/register, /auth/login)
- Verify session persistence in welcome.html

### Phase 2: AUTO-REFACTOR
- Create shared/ directory if missing
- Seed superadmin: ryanpcowan@gmail.com (role: superadmin, plan: enterprise, credits: 999999)
- Seed default users: demo@bridge.ai, pro@bridge.ai
- Generate referral codes for all users
- Update auth-service.js to return role/credits/plan on login/register
- Add /auth/me endpoint for session refresh

### Phase 3: TEST EXECUTION
- Verify superadmin password hash matches
- Test token generation (JWT-style)
- Validate user session structure (id, email, role, credits, plan)
- Test RBAC page permissions mapping
- Verify referral code linkage

### Phase 4: DEPLOY
- Sync shared/users.json and shared/referrals.json to VPS
- Start/restart auth-service on port 9005
- Verify Nginx routes /auth/* to auth-service
- Test health endpoint

### Phase 5: EVALUATE
Health Score Calculation:
| Component | Max Points | Criteria |
|----------|-----------|----------|
| Auth Service | 25 | auth-service.js exists |
| Users Seeded | 25 | ≥1 user in system |
| Superadmin | 25 | ryanpcowan@gmail.com with role:superadmin |
| Referral System | 25 | ≥1 referral code |
| **TOTAL** | **100** | Threshold: 95% |

### Phase 6: REPEAT LOOP
- If healthScore < 95%: retry from Phase 1
- Max retries: 5
- Log all iterations to shared/pipeline-summary.json

## 3. Validation Gates

### Hard Gates (Must Pass)
- [x] 100% API endpoint availability (auth/register, auth/login, auth/me)
- [x] Zero critical security issues (password hashing with salt)
- [x] ≥ 95% test pass rate
- [x] Session persistence (localStorage bridge_token, bridge_user)
- [x] RBAC enforced per role

### Soft Gates (Target)
- [ ] Mobile responsiveness across breakpoints
- [ ] No unused dependencies

## 4. Self-Healing Rules

| Failure | Auto-Fix Action |
|---------|-----------------|
| Users file missing | Create shared/users.json with seeded superadmin |
| Superadmin not seeded | Generate with role:superadmin, plan:enterprise |
| Role missing in response | Add default role:member, credits:100 |
| Session not persisting | Update frontend to store bridge_user with role |
| Auth endpoints not connected | Ensure onboarding.html calls /auth/register, /auth/login |

## 5. Deployment & Rollback Strategy

### Deploy to VPS
```bash
# From local machine
cd /opt/bridge-ai-os
git pull origin main
pm2 restart auth-service
# Or deploy full stack
./Xscripts/deploy-vps.sh
```

### Rollback
```bash
pm2 delete auth-service
git checkout HEAD~1 -- shared/users.json shared/referrals.json
pm2 start auth-service
```

### Health Check
```bash
curl http://localhost:9005/health
curl http://localhost:9005/auth/me (with Bearer token)
```

## 6. Loop Termination Criteria

**DONE when ALL of:**
1. healthScore ≥ 95%
2. Superadmin can authenticate
3. Registration creates user with role
4. Login returns role/credits/plan
5. Welcome page shows role-appropriate navigation
6. Pipeline summary written to shared/pipeline-summary.json

## Credentials

| Role | Email | Password | Role | Plan |
|------|-------|----------|------|------|
| Superadmin | ryanpcowan@gmail.com | BridgeAdmin2026! | superadmin | enterprise |
| Demo | demo@bridge.ai | demo1234 | demo | free |
| Pro | pro@bridge.ai | demo1234 | member | pro |

## Files Modified

- `pipeline/self-healing.js` - Main pipeline script
- `Xscripts/auth-service.js` - Auth service with RBAC
- `Xpublic/onboarding.html` - Registration/login with session
- `Xpublic/welcome.html` - Role-based navigation
- `shared/users.json` - Seeded users
- `shared/referrals.json` - Referral codes
