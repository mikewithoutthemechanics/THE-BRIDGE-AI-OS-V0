# OSINT Stack Integration

This document describes the integration of the ConsentVault OSINT Stack into the Bridge Task Runner application.

## Overview

The OSINT (Open Source Intelligence) Stack has been integrated into the main Bridge Task Runner application, providing ethical digital footprint mapping capabilities with consent-based data collection.

## Features Implemented

### 1. Backend OSINT Endpoints

The main FastAPI backend now includes comprehensive OSINT endpoints:

#### Consent Management
- `POST /api/v1/consent/request` - Request consent for data collection
- `GET /api/v1/consent/{consent_id}` - Retrieve consent details
- `POST /api/v1/consent/{consent_id}/approve` - Approve pending consent
- `POST /api/v1/consent/{consent_id}/revoke` - Revoke active consent

#### OSINT Orchestration
- `POST /api/v1/osint/scan` - Start OSINT scan with consent verification
- `GET /api/v1/osint/scan/{scan_id}` - Check scan status and results
- `GET /api/v1/osint/findings` - Retrieve OSINT findings across scans
- `GET /api/v1/osint/config` - Get system configuration

### 2. Database Integration

- PostgreSQL database schema for consent records, OSINT scans, findings, and audit logs
- In-memory storage for demo mode (production would use persistent database)
- Proper indexing and relationships for efficient queries

### 3. Docker Services

Updated docker-compose.yml includes:
- `consent-ledger` - PostgreSQL database for consent data
- `consent-api` - Consent management service
- `databunker` - Tokenized data vault (secure data storage)
- `osint-orchestrator` - Pipeline controller for OSINT operations
- `sherlock-osint` & `maigret-osint` - Demo OSINT tools

### 4. Frontend Integration

Enhanced frontend with tabbed interface:
- **Task Runner Tab** - Original task execution functionality
- **OSINT Stack Tab** - New OSINT operations interface

#### OSINT Features:
- Consent request form
- OSINT scan initiation
- Real-time status updates
- Results display
- Findings browser

### 5. Demo Mode

All OSINT operations run in demo mode by default:
- Synthetic data generation instead of real external collection
- No actual network calls to external services
- Full functionality demonstration without privacy risks

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend UI   │────│  Main FastAPI    │────│  OSINT Services │
│   (HTML/JS)     │    │  Backend         │    │  (Docker)       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌──────────────────┐
                       │ PostgreSQL DB    │
                       │ (Consent Ledger) │
                       └──────────────────┘
```

## API Usage Examples

### Request Consent
```bash
curl -X POST http://localhost:8080/api/v1/consent/request \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "john.doe",
    "purpose": "osint_collection",
    "consent_scope": {
      "scope": ["social_media", "public_records"],
      "retention_days": 90
    }
  }'
```

### Start OSINT Scan
```bash
curl -X POST http://localhost:8080/api/v1/osint/scan \
  -H "Content-Type: application/json" \
  -d '{
    "subject_id": "john.doe",
    "scan_type": "basic",
    "consent_id": "consent-uuid-here"
  }'
```

### Get Scan Results
```bash
curl http://localhost:8080/api/v1/osint/scan/scan-uuid-here
```

## Security & Compliance

### Ethical Considerations
- **Consent Required**: All data collection requires explicit consent
- **Demo Mode**: Default operation uses synthetic data only
- **Data Minimization**: Collect only necessary data for stated purpose
- **Audit Logging**: All operations are logged for compliance

### Production Deployment
For production use, ensure:
1. Legal review of data collection practices
2. GDPR/CCPA compliance implementation
3. DPO (Data Protection Officer) designation
4. Privacy Impact Assessment completion
5. Secure infrastructure deployment

## Testing

Run the integration test script:
```bash
python test-osint-integration.py
```

This will test all OSINT endpoints and verify functionality.

## Getting Started

1. **Build and start the stack:**
   ```bash
   docker-compose up --build
   ```

2. **Access the application:**
   - Frontend: http://localhost:8082
   - Backend API: http://localhost:8080
   - OSINT API: http://localhost:8080/api/v1/osint/

3. **Test OSINT functionality:**
   - Navigate to "OSINT Stack" tab
   - Request consent for a subject
   - Start an OSINT scan
   - View results and findings

## Configuration

Environment variables:
- `DEMO_MODE=true` - Use synthetic data (recommended for testing)
- `NETWORK_MODE=offline` - Block external network calls
- `CONSENT_DB_PASSWORD` - PostgreSQL password
- `JWT_SECRET` - API authentication secret

## Future Enhancements

- Real OSINT tool integration (Sherlock, Maigret, etc.)
- Advanced consent management workflows
- Data analytics and reporting
- Multi-tenant support
- Production database integration
- API rate limiting and security hardening