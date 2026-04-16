# ConsentVault OSINT Stack

## Ethical Digital Footprint Mapping with Consent-Based Monetization

**Version:** 1.0.0  
**Last Updated:** 2026-04-15

---

## ⚠️ ETHICAL DISCLAIMER

This stack is designed for **lawful, consent-based digital footprint mapping** only. By using this software, you agree to the following:

### 🚫 PROHIBITED USES

- **Non-consensual data collection** - Collection of personal data without explicit, verified consent
- **Doxxing or harassment** - Using OSINT tools to identify and target individuals without consent
- **Unauthorized surveillance** - Monitoring individuals who have not consented
- **Stalking or targeting** - Using collected data for harmful purposes
- **Selling raw PII** - Monetizing unprocessed personally identifiable information

### ✅ REQUIRED COMPLIANCE

- **Explicit informed consent** must be obtained before any data collection
- **GDPR/CCPA/CPRA** data subject rights must be honored
- **Data minimization** - Collect only what's necessary for stated purpose
- **Purpose limitation** - Use data only for consented purposes
- **Transparent operation** - Data subjects must know their data is being collected

---

## 📋 COMPLIANCE CHECKLIST

Before deploying in production:

- [ ] Legal review completed for your jurisdiction
- [ ] Data Processing Agreement (DPA) in place
- [ ] DPO (Data Protection Officer) designated
- [ ] Consent infrastructure deployed and tested
- [ ] Privacy Impact Assessment (DPIA) completed
- [ ] Technical safeguards verified
- [ ] Audit logging enabled and tested
- [ ] Incident response plan documented
- [ ] Data subject rights procedures implemented
- [ ] Retention policy configured

---

## 🏗️ ARCHITECTURE

### Core Components

| Component | Purpose | Port |
|-----------|---------|------|
| **Consent API** | Consent management & verification | 8080 |
| **Consent Ledger** | PostgreSQL consent records | 5432 |
| **Databunker** | Tokenized data vault | 3000 |
| **OSINT Orchestrator** | Pipeline controller | 8081 |
| **Analytics Engine** | Aggregation & anonymization | 8082 |
| **Monetization API** | Data product sales | 8083 |
| **Dashboard** | Web UI | 8443 |
| **SpiderFoot** | OSINT automation | 5001 |

### Data Flow

```
Data Subject → Consent Request → Consent API → Consent Ledger
                                        ↓
                              Consent Verified?
                                        ↓
                              Yes: OSINT Orchestrator
                                        ↓
                              Run OSINT Tools (Demo/Synthetic)
                                        ↓
                              Results → Databunker (Tokenized)
                                        ↓
                              Analytics Engine (Aggregated)
                                        ↓
                              Monetization API (Anonymized Products)
                                        ↓
                              Data Buyer (Purchased Access)
```

---

## 🚀 QUICK START

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+
- 4GB RAM minimum
- Linux/macOS (Windows with WSL2)

### Demo Mode (Default - No External Data Collection)

```bash
# 1. Clone and navigate
cd consent-osint-stack

# 2. Build the stack (synthetic data only)
./build.sh

# 3. Start the stack
./run.sh start

# 4. Access dashboard
# Open: https://localhost:8443
# Default credentials: admin / changeme
```

### Production Mode (Requires Legal Review)

⚠️ **WARNING:** Production mode requires:

1. Verified consent infrastructure
2. Legal compliance review
3. DPO approval
4. DPIA completion

To enable production mode:

```bash
# Edit .env file
DEMO_MODE=false
NETWORK_MODE=online

# Re-build and start (after legal review)
./build.sh
./run.sh start
```

---

## 🔧 CONFIGURATION

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DEMO_MODE` | `true` | Use synthetic data only |
| `NETWORK_MODE` | `offline` | Block external network calls |
| `CONSENT_DB_PASSWORD` | - | PostgreSQL password |
| `JWT_SECRET` | - | API authentication secret |
| `DATABUNKER_TOKEN` | - | Vault API token |
| `DATABUNKER_ENCRYPTION_KEY` | - | Encryption key for vault |

### Network Modes

| Mode | Description | Use Case |
|------|-------------|----------|
| `offline` | No external network calls | Demonstration |
| `restricted` | Whitelisted domains only | Testing |
| `online` | Full access (requires consent) | Production |

---

## 🔒 SECURITY

### Implemented Safeguards

- ✅ TLS 1.3 for all external connections
- ✅ Role-Based Access Control (RBAC)
- ✅ Encryption at rest (AES-256)
- ✅ Tokenization of PII
- ✅ Comprehensive audit logging
- ✅ Rate limiting
- ✅ Read-only containers where possible
- ✅ Network segmentation

### Required Security Hardening

1. Change all default passwords
2. Configure firewall rules
3. Enable automated vulnerability scanning
4. Set up SIEM integration
5. Configure log retention (7 years minimum)
6. Implement intrusion detection

---

## 📊 TESTING

### Unit Tests

```bash
# Test consent ledger operations
docker-compose exec consent-api npm test

# Test consent verification
curl -X POST http://localhost:8080/api/v1/consent/verify \
  -H "Content-Type: application/json" \
  -d '{"subject_id": "demo-subject", "purpose": "test"}'
```

### Integration Tests

```bash
# Run demo mode integration tests
docker-compose exec osint-orchestrator python -m pytest tests/

# Test consent-to-collection flow
./scripts/test-consent-flow.sh
```

### End-to-End Tests

```bash
# Test monetization workflow
docker-compose exec monetization-api python -m pytest e2e/
```

---

## 🐛 TROUBLESHOOTING

### Common Issues

| Issue | Solution |
|-------|----------|
| Container won't start | Check `.env` file exists |
| Database connection failed | Wait for `consent-ledger` health check |
| No data in dashboard | Demo mode uses synthetic data |
| External network blocked | Set `NETWORK_MODE=restricted` |

### Health Check

```bash
./run.sh health
```

### Logs

```bash
# View all logs
./run.sh logs

# View specific service
docker-compose logs -f consent-api
```

---

## 📚 DOCUMENTATION

- [Architecture Diagram](docs/architecture.md)
- [Data Models](docs/data-models.md)
- [Policy Documents](docs/policy.md)
- [DPIA Template](docs/policy.md#6-privacy-impact-assessment-dpia-template)

---

## 🔄 UPDATES & MAINTENANCE

### Updating the Stack

```bash
# Stop current stack
./run.sh stop

# Pull latest images
docker-compose pull

# Rebuild custom images
./build.sh

# Start updated stack
./run.sh start
```

### Backup

```bash
# Backup consent ledger
docker-compose exec consent-ledger pg_dump -U consent_user consent_ledger > backup.sql

# Backup databunker
docker-compose exec databunker cp /opt/databunker/databunker.db /backup/
```

---

## 📞 SUPPORT

For issues and questions:
1. Check documentation
2. Review logs
3. Contact your administrator

---

## ⚖️ LICENSE

This software is provided for **demonstration and educational purposes**. 
Users are solely responsible for ensuring compliance with applicable laws.

---

**Remember:** Privacy is a fundamental right. This tool must never be used to violate that right.
