# ConsentVault OSINT Stack - Architecture Diagram

```mermaid
graph TB
    subgraph "External Boundaries"
        User[("Data Subject")]
        Buyer[("Data Buyer")]
        Legal["Legal/Compliance"]
    end

    subgraph "Presentation Layer"
        Dashboard["Dashboard<br/>(HTTPS :8443)"]
        ConsentUI["Consent Self-Service<br/>(Portal)"]
    end

    subgraph "API Gateway"
        Nginx["Nginx Gateway<br/>TLS · Auth · Rate Limit"]
    end

    subgraph "Consent & Governance"
        ConsentAPI["Consent API"]
        ConsentDB["Consent Ledger<br/>(PostgreSQL)"]
        PolicyEngine["Policy Engine"]
        AuditLogger["Audit Logger"]
    end

    subgraph "Data Vault"
        Databunker["Databunker<br/>(Tokenized Storage)"]
        VaultAPI["Vault API"]
    end

    subgraph "OSINT Pipeline"
        Orchestrator["OSINT Orchestrator"]
        Sherlock["Sherlock (Demo)"]
        Maigret["Maigret (Demo)"]
        SpiderFoot["SpiderFoot (Demo)"]
        Holehe["Holehe (Demo)"]
        GHunt["GHunt (Demo)"]
    end

    subgraph "Analytics & Monetization"
        Analytics["Analytics Engine<br/>Aggregated · DP · k-Anonymity"]
        Monetization["Monetization API"]
        DataProducts["Data Products"]
    end

    subgraph "Monitoring"
        Prometheus["Prometheus"]
        Loki["Loki (Logs)"]
    end

    %% External Interactions
    User -->|View/Revoke Consent| ConsentUI
    User -->|Access Reports| Dashboard
    Buyer -->|Purchase Aggregated Data| Monetization

    %% Presentation to Gateway
    Dashboard --> Nginx
    ConsentUI --> Nginx

    %% Gateway to Services
    Nginx --> ConsentAPI
    Nginx --> VaultAPI
    Nginx --> Dashboard
    Nginx --> Analytics

    %% Consent Flow
    ConsentAPI <--> ConsentDB
    ConsentAPI --> PolicyEngine
    ConsentAPI --> AuditLogger

    %% Vault Flow
    VaultAPI <--> Databunker
    Databunker --> ConsentDB

    %% OSINT Pipeline Flow
    ConsentAPI -->|Consent Verified| Orchestrator
    Orchestrator -->|Demo Mode| Sherlock
    Orchestrator -->|Demo Mode| Maigret
    Orchestrator -->|Demo Mode| SpiderFoot
    Orchestrator -->|Demo Mode| Holehe
    Orchestrator -->|Demo Mode| GHunt
    
    Sherlock -->|Synthetic Results| Orchestrator
    Maigret -->|Synthetic Results| Orchestrator
    SpiderFoot -->|Synthetic Results| Orchestrator
    Holehe -->|Synthetic Results| Orchestrator
    GHunt -->|Synthetic Results| Orchestrator
    
    Orchestrator -->|Tokenized Storage| Databunker

    %% Analytics Flow
    Databunker -->|Pseudonymized| Analytics
    Analytics -->|Aggregated| Monetization
    Monetization -->|Data Products| DataProducts

    %% Monitoring
    ConsentAPI --> AuditLogger
    VaultAPI --> AuditLogger
    Orchestrator --> AuditLogger
    Analytics --> AuditLogger
    
    AuditLogger --> Prometheus
    AuditLogger --> Loki

    %% Legal/Compliance
    Legal -->|DPIA Review| ConsentAPI
    Legal -->|Audit| AuditLogger
```

## Data Flow Legend

| Flow Type | Description | Color |
|-----------|-------------|-------|
| → | Consent-verified data flow | Blue |
| --► | Aggregated/anonymized output | Green |
| ··► | Synthetic/demo data flow | Gray |
| --- | Audit logging | Orange |

## Component Descriptions

### Core Services
- **Consent API**: REST API for consent management, verification, and revocation
- **Consent Ledger**: PostgreSQL database storing consent records and policies
- **Databunker**: Tokenized storage for personal data with encryption at rest
- **OSINT Orchestrator**: Pipeline controller with consent gating

### OSINT Tools (Demo Configuration)
- **Sherlock**: Username search (demo mode only)
- **Maigret**: Profile enumeration (demo mode only)
- **SpiderFoot**: Automated OSINT (demo mode only)
- **Holehe**: Email enumeration (demo mode only)
- **GHunt**: Google account enumeration (demo mode only)

### Analytics & Monetization
- **Analytics Engine**: Aggregates data with Differential Privacy and k-Anonymity
- **Monetization API**: Manages data product sales with consent verification

## Network Segmentation

```
┌─────────────────────────────────────────────────────────────────┐
│                     CONSENTVAULT NETWORK                         │
│  Subnet: 172.28.0.0/16                                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              INTERNAL SERVICES (No External Access)       │  │
│  │                                                           │  │
│  │   consent-ledger  │  databunker  │  osint-orchestrator  │  │
│  │   consent-api     │  vault-api   │  analytics-engine   │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              GATEWAY SERVICES (External via Nginx)       │  │
│  │                                                           │  │
│  │   dashboard  │  spiderfoot-ui  │  monetization-api      │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              MONITORING (Internal Only)                   │  │
│  │                                                           │  │
│  │   prometheus  │  loki  │  audit-logs                    │  │
│  │                                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Security Layers

```mermaid
graph TB
    subgraph "Layer 1: Network"
        WAF["WAF / Edge Firewall"]
        TLS["TLS 1.3"]
    end

    subgraph "Layer 2: Application"
        RBAC["Role-Based Access Control"]
        RateLimit["Rate Limiting"]
        Auth["JWT Authentication"]
    end

    subgraph "Layer 3: Data"
        EncryptionAtRest["Encryption at Rest"]
        Tokenization["Tokenization"]
        Masking["Data Masking"]
    end

    subgraph "Layer 4: Audit"
        AuditLog["Comprehensive Audit Logging"]
        Alerting["Security Alerting"]
        Retention["Log Retention (7 years)"]
    end
```
