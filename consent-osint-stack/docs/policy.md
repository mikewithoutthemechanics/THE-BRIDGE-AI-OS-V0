# ConsentVault OSINT Stack - Policy Documents

## Table of Contents
1. Consent Policy
2. Data Retention Policy
3. Revocation Procedures
4. Data Subject Rights
5. Buyer Data Use Agreement
6. Privacy Impact Assessment Template

---

## 1. Consent Policy

### 1.1 Core Consent Principles

| Principle | Description | Implementation |
|-----------|-------------|----------------|
| **Explicit Consent** | Data subjects must give explicit, informed permission | Signed consent receipts with cryptographic proof |
| **Purpose Limitation** | Data used only for stated purposes | Consent scope enforced in policy engine |
| **Data Minimization** | Collect only what's necessary | Pre-defined data categories per consent |
| **Withdrawal Rights** | Subjects can withdraw anytime | Real-time revocation via self-service portal |
| **Transparency** | Clear explanation of data usage | Plain-language consent requests |

### 1.2 Consent Types

```json
{
  "consent_types": {
    "osint_collection": {
      "description": "Collection of publicly available digital footprint data",
      "required_scope": ["identity", "social"],
      "requires_verification": true,
      "demo_equivalent": "synthetic_data_only"
    },
    "analytics": {
      "description": "Analysis of collected data for aggregations",
      "required_scope": ["behavioral", "demographic"],
      "requires_aggregation": true,
      "min_k_anonymity": 5
    },
    "monetization": {
      "description": "Sale of aggregated insights to third parties",
      "required_scope": ["aggregated_only"],
      "requires_dp": true,
      "max_epsilon": 1.0,
      "explicit_consent_required": true
    },
    "research": {
      "description": "Use in academic or product research",
      "required_scope": ["anonymized"],
      "irb_approval_required": true
    }
  }
}
```

### 1.3 Consent Verification Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONSENT VERIFICATION FLOW                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. SUBMIT CONSENT REQUEST                                       │
│     └─► Data subject submits via consent portal                 │
│                                                                  │
│  2. VERIFY IDENTITY                                              │
│     └─► Multi-factor authentication required                    │
│     └─► Government ID verification (production)                 │
│                                                                  │
│  3. DISPLAY CONSENT DETAILS                                      │
│     └─► Plain-language explanation                              │
│     └─► Data categories to be processed                         │
│     └─► Purpose and retention period                            │
│                                                                  │
│  4. EXPLICIT ACKNOWLEDGMENT                                       │
│     └─► Checkbox: "I explicitly consent..."                    │
│     └─► Signature or cryptographic confirmation                │
│                                                                  │
│  5. GENERATE CONSENT RECEIPT                                     │
│     └─► Unique consent_id                                        │
│     └─► Timestamp and cryptographic signature                   │
│     └─► Stored in consent ledger                                 │
│                                                                  │
│  6. ENABLE DATA COLLECTION                                       │
│     └─► OSINT tools receive consent token                       │
│     └─► Collection limited to scope                              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Data Retention Policy

### 2.1 Retention Schedules

| Data Category | Retention Period | Justification |
|---------------|------------------|---------------|
| **Consent Records** | 7 years post-revocation | Legal compliance (GDPR art. 17) |
| **Raw Personal Data** | 90 days | Purpose limitation principle |
| **Anonymized Analytics** | Indefinite | No PII remaining |
| **Audit Logs** | 7 years | Regulatory requirements |
| **Purchase Records** | 10 years | Financial compliance |

### 2.2 Automatic Deletion Rules

```sql
-- Delete raw data after retention period
CREATE FUNCTION enforce_retention()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.collected_at < NOW() - INTERVAL '90 days' 
       AND NEW.is_anonymized = false
    THEN
        DELETE FROM data_record WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Anonymize instead of delete for audit trail
CREATE FUNCTION anonymize_old_data()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.collected_at < NOW() - INTERVAL '90 days' 
       AND NEW.is_anonymized = false
    THEN
        UPDATE data_record 
        SET data = '{"anonymized": true}',
            is_anonymized = true
        WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

### 2.3 Retention Enforcement

- **Automated**: Cron jobs trigger daily retention checks
- **Manual**: Dashboard shows data age warnings
- **Audit**: All deletions logged with before/after snapshots

---

## 3. Revocation Procedures

### 3.1 Self-Service Revocation

```
┌─────────────────────────────────────────────────────────────────┐
│                    REVOCATION WORKFLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. DATA SUBJECT LOGS INTO PORTAL                                │
│     └─► https://consentvault.example.com/portal                 │
│                                                                  │
│  2. SELECT "MY CONSENTS"                                        │
│     └─► List of all active consent records                      │
│                                                                  │
│  3. CLICK "REVOKE" ON SPECIFIC CONSENT                          │
│     └─► Confirmation dialog appears                             │
│                                                                  │
│  4. CONFIRM REVOCATION                                           │
│     └─► Multi-factor authentication                             │
│                                                                  │
│  5. SYSTEM PROCESSES REVOCATION                                 │
│     └─► consent_record.status = 'revoked'                       │
│     └─► revoked_at = NOW()                                     │
│     └─► All OSINT tools receive revocation event               │
│     └─► Pending collections cancelled                           │
│     └─► Analytics exclusion flagged                             │
│                                                                  │
│  6. DATA SUBJECT CONFIRMATION                                   │
│     └─► Email confirmation sent                                 │
│     └─► Consent receipt updated                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Revocation API Endpoint

```yaml
POST /api/v1/consent/revoke
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "consent_id": "uuid-of-consent-to-revoke",
  "revocation_reason": "optional-free-text",
  "request_ip": "client-ip-address",
  "request_timestamp": "2026-04-15T17:00:00Z"
}

Response:
{
  "status": "revoked",
  "revoked_at": "2026-04-15T17:05:00Z",
  "receipt_id": "uuid-of-revocation-receipt",
  "data_deletion_scheduled": "2026-04-15T17:05:00Z + 30 days"
}
```

### 3.3 Downstream Revocation Propagation

```
┌─────────────────────────────────────────────────────────────────┐
│              REVOCATION PROPAGATION TOOLS                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Revocation Event → Consent Ledger → Message Queue              │
│                                                            │    │
│                          ┌─────────────────────────────────┴─┐  │
│                          │                                      │  │
│                          ▼                                      ▼  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐            │
│  │  Sherlock   │  │  Maigret    │  │ SpiderFoot  │  ...       │
│  │  (blocked)   │  │  (blocked)  │  │  (blocked)  │            │
│  └─────────────┘  └─────────────┘  └─────────────┘            │
│        │               │                │                      │
│        └───────────────┴────────────────┴──────►              │
│                        │                                        │
│                        ▼                                        │
│              Analytics Engine                                  │
│              (excludes revoked subjects)                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Subject Rights

### 4.1 Rights Under GDPR/CCPA

| Right | Description | Implementation Endpoint |
|-------|-------------|--------------------------|
| **Right to Access** | Subject can view all data held about them | GET /api/v1/subject/{id}/data |
| **Right to Rectification** | Correct inaccurate data | PUT /api/v1/subject/{id}/data |
| **Right to Erasure** | Delete personal data | DELETE /api/v1/subject/{id} |
| **Right to Restrict Processing** | Limit how data is used | PUT /api/v1/consent/restrict |
| **Right to Portability** | Export data in machine-readable format | GET /api/v1/subject/{id}/export |
| **Right to Object** | Object to specific processing | POST /api/v1/consent/object |
| **Right to Withdraw Consent** | Revoke consent at any time | POST /api/v1/consent/revoke |

### 4.2 Rights Response SLA

| Request Type | Response Deadline | Required Actions |
|--------------|-------------------|------------------|
| Access Request | 30 days | Compile and export all data |
| Erasure Request | 30 days | Delete from all stores |
| Objection | 72 hours | Cease processing |
| Portability | 30 days | Generate export file |

---

## 5. Buyer Data Use Agreement

### 5.1 Agreement Terms

```markdown
# DATA USE AGREEMENT (DUA)

## PARTIES:
- Data Provider: ConsentVault OSINT Stack
- Data Buyer: [BUYER_NAME]

## EFFECTIVE DATE: [DATE]

## 1. PERMITTED USE
The Buyer agrees to use the Data Product only for:
- [x] Aggregate market research
- [x] Trend analysis
- [ ] Individual profiling
- [ ] Marketing targeting
- [ ] Resale to third parties

## 2. PROHIBITED USE
The Buyer SHALL NOT:
- ❌ Attempt to re-identify any data subjects
- ❌ Combine with other datasets for re-identification
- ❌ Share with unauthorized third parties
- ❌ Use for discriminatory purposes
- ❌ Use in violation of applicable law

## 3. PRIVACY REQUIREMENTS

### 3.1 Differential Privacy
- Epsilon (ε) MUST NOT exceed: 1.0
- Additional noise injection required if combining datasets

### 3.2 k-Anonymity
- Minimum k value: 5
- No subset with fewer than 5 subjects

### 3.3 Re-identification Prohibition
- Any attempt to re-identify is a material breach
- Immediate termination and data destruction required
- Liability for any damages resulting from re-identification

## 4. DATA HANDLING

### 4.1 Storage
- Encrypted at rest required
- Access logging mandatory
- Annual security audit required

### 4.2 Deletion
- Data must be deleted within 90 days of agreement expiration
- Deletion certificate required

## 5. COMPLIANCE

The Buyer agrees to comply with:
- GDPR (if EU data subjects)
- CCPA/CPRA (if CA data subjects)
- Industry-specific regulations

## 6. AUDIT RIGHTS

The Data Provider reserves the right to:
- Audit Buyer's data handling practices
- Request deletion verification
- Terminate agreement for non-compliance
```

### 5.2 Agreement Enforcement

```sql
-- Automatic enforcement in monetization API
CREATE FUNCTION verify_agreement_compliance(purchase_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    agreement data_use_agreement;
    violation_count INTEGER;
BEGIN
    -- Check agreement exists
    SELECT * INTO agreement 
    FROM data_use_agreement 
    WHERE consent_id IN (
        SELECT consent_id FROM purchase_event WHERE id = purchase_id
    );
    
    IF agreement IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Check re-identification attempts
    SELECT COUNT(*) INTO violation_count
    FROM consent_audit_log
    WHERE event_type = 'REIDENTIFICATION_ATTEMPT'
      AND created_at > agreement.agreed_at;
    
    IF violation_count > 0 THEN
        -- Trigger breach notification
        PERFORM notify_breach(agreement.buyer_id, purchase_id);
        RETURN FALSE;
    END IF;
    
    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

---

## 6. Privacy Impact Assessment (DPIA) Template

### 6.1 Assessment Sections

```markdown
# DATA PROTECTION IMPACT ASSESSMENT

## Section A: Project Overview

| Field | Response |
|-------|----------|
| Assessment Date | [DATE] |
| Assessor | [NAME] |
| Project Name | ConsentVault OSINT Stack |
| Review Date | [DATE + 1 YEAR] |

## Section B: Data Processing Description

### B.1 Purpose
What is the purpose of the data processing?
> [Describe purpose - e.g., digital footprint mapping with consent]

### B.2 Data Categories
What categories of data will be processed?
- [ ] Identity data
- [ ] Contact data
- [ ] Social media profiles
- [ ] Employment data
- [ ] Location data

### B.3 Data Subjects
Who are the data subjects?
> [e.g., Individuals who have provided explicit consent]

### B.4 Scale
What is the expected scale?
- [ ] < 1,000 subjects
- [ ] 1,000 - 10,000 subjects
- [ ] 10,000 - 100,000 subjects
- [ ] > 100,000 subjects

## Section C: Necessity and Proportionality

### C.1 Necessity
Why is this processing necessary?
> [Explain business need]

### C.2 Less Intrusive Alternatives
What alternatives were considered?
> [e.g., using only aggregated data]

### C.3 Data Minimization
How is data minimization implemented?
- [ ] Purpose limitation in consent scope
- [ ] Automated deletion after retention period
- [ ] Aggregation before monetization

## Section D: Risks to Data Subjects

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Unauthorized access | Low | High | Encryption, RBAC |
| Data breach | Low | High | Tokenization, backup |
| Re-identification | Medium | High | DP, k-anonymity |
| Consent revocation | Medium | Medium | Automated propagation |
| Purpose creep | Medium | High | Policy enforcement |

## Section E: Safeguards

### E.1 Technical Safeguards
- [ ] Encryption at rest (AES-256)
- [ ] Encryption in transit (TLS 1.3)
- [ ] Access control (RBAC)
- [ ] Audit logging
- [ ] Automated deletion

### E.2 Organizational Safeguards
- [ ] Data protection training
- [ ] Privacy by design process
- [ ] Regular DPIA reviews
- [ ] Incident response plan

### E.3 Consent Safeguards
- [ ] Explicit consent required
- [ ] Consent verification
- [ ] Revocation mechanism
- [ ] Consent receipts

## Section F: Consultation

### F.1 Stakeholders Consulted
- [ ] Legal counsel
- [ ] Data protection officer
- [ ] Security team
- [ ] Privacy advocate

### F.2 Outcome
> [Summary of consultation and recommendations]

## Section G: Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| DPO | | | |
| Legal | | | |
| Security | | | |
| Project Lead | | | |

## Section H: Review Schedule

- Next Review Date: [DATE + 1 YEAR]
- Trigger for Earlier Review:
  - New data sources added
  - Security incident
  - Regulatory change
  - >10x scale increase
```

---

## 7. Compliance Checklist

### 7.1 GDPR Requirements

| Requirement | Article | Implemented | Evidence |
|-------------|---------|--------------|----------|
| Lawful basis (consent) | Art. 6(1)(a) | ✅ | Consent API |
| Consent must be explicit | Art. 4(11) | ✅ | Consent UI |
| Right to withdraw | Art. 7(3) | ✅ | Revocation API |
| Consent records | Art. 7(1) | ✅ | Consent Ledger |
| Data minimization | Art. 5(1)(c) | ✅ | Policy Engine |
| Purpose limitation | Art. 5(1)(b) | ✅ | Consent Scope |
| Storage limitation | Art. 5(1)(e) | ✅ | Retention Policy |
| Security | Art. 32 | ✅ | Encryption, RBAC |
| Accountability | Art. 5(2) | ✅ | Audit Logging |

### 7.2 CCPA/CPRA Requirements

| Requirement | CCPA Section | Implemented |
|-------------|--------------|-------------|
| Right to know | §1798.110 | ✅ |
| Right to delete | §1798.105 | ✅ |
| Right to opt-out | §1798.120 | ✅ |
| Right to non-discrimination | §1798.125 | ✅ |
| Sensitive data opt-in | CPRA §1798.121 | ✅ |
| Consent receipts | CPRA §1798.130 | ✅ |
