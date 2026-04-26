# SUPADASH Consolidation - 6-Agent Parallel Scan

## Agent 1: Database Mapper
**Focus:** All databases, schemas, tables, data models
**Search Paths:** /c/aoe-unified-final, /c/bridge, /c/BRIDGE_AI_OS, /c/bridge-ubi, /c/BridgeAI, /c/bridgeos

Find ALL databases by searching:
- package.json for db dependencies (postgres, mongodb, sqlite, redis, etc.)
- .env/.env.example files for DB_URL, DATABASE_URL, MONGO_URI patterns
- server.js/index.js files for database connections
- SQL migration files (.sql)
- Mongoose/Sequelize/Prisma schema files

Return CSV format:
```
DATABASE_NAME | DB_TYPE | CONNECTION_FILE | LOCATION | TABLES/COLLECTIONS | USED_BY_SERVERS
```

---

## Agent 2: Server/Port Mapper
**Focus:** All running servers, ports, API endpoints
**Search Paths:** Same as Agent 1

Find ALL servers by searching for:
- Listening ports (app.listen, server.listen, Flask port assignments)
- API route definitions (app.get, app.post, @app.route)
- WebSocket endpoints (ws://, /ws/, socket.on)
- Express/FastAPI/Django route handlers

Return CSV format:
```
SERVER_NAME | PORT | FILE_PATH | ENDPOINT | METHOD | RESPONSE_TYPE | WEBSOCKET
```

---

## Agent 3: Data Flow Mapper
**Focus:** How data flows from sources → APIs → UIs (consumption chains)
**Input:** Results from Agents 1 & 2 (work after they complete)

Trace each dashboard to:
- What APIs it calls (fetch, WebSocket)
- What data those APIs return
- What database those APIs query
- Polling intervals/event types

Return flow diagram format:
```
DASHBOARD | CALLS_ENDPOINT | ENDPOINT_RETURNS | FROM_DATABASE | REFRESH_INTERVAL
```

---

## Agent 4: Frontend/Visualization Auditor
**Focus:** ALL UI/dashboard features, libraries, visualizations
**Search Paths:** Same as Agent 1

Find ALL .html files and scan for:
- Library imports (p5.js, three.js, babylon.js, vis.js, xterm.js, echarts, recharts)
- Div IDs / canvas elements (to identify components)
- Features/capabilities (chart type, terminal features, graph types)
- Data binding patterns (SSE, WebSocket, fetch calls)

Return CSV format:
```
DASHBOARD_FILE | LIBRARY | COMPONENT_ID | FEATURE | DATA_SOURCE_API | LINES_OF_CODE
```

---

## Agent 5: Bridge System Relationships
**Focus:** How /c/bridge*, /c/BRIDGE_AI_OS*, /c/bridgeos relate to each other
**Search Paths:** /c/bridge/, /c/bridge-ubi/, /c/BRIDGE_AI_OS/, /c/bridge_local/, /c/BridgeAI/, /c/bridgeos/

For EACH system, find:
- Purpose (from README, comments, package.json description)
- Dependencies on OTHER Bridge systems (imports, API calls)
- Overlapping APIs or dashboards
- Separate data stores or shared ones

Return relationship matrix format:
```
SYSTEM_A | SYSTEM_B | RELATIONSHIP_TYPE | SHARED_DATA | CONFLICT_RISK
```
(Relationship types: imports, calls-api, shares-db, duplicates-feature, unknown)

---

## Agent 6: Consolidation Risk Scanner
**Focus:** Dependencies, conflicts, critical paths that could break consolidation
**Input:** Results from all other agents (work after they complete)

Analyze for:
- Which dashboards have hard dependencies on specific APIs
- Shared database tables (risk of schema conflicts)
- Port collisions (multiple servers on same port)
- Duplicate features across systems (need to choose which to keep)
- Critical paths (if X breaks, what else breaks)

Return risk report format:
```
RISK_LEVEL | COMPONENT_A | COMPONENT_B | ISSUE | MITIGATION
```

---

## Output Aggregation

All agents write results to:
- `/c/aoe-unified-final/SUPADASH_AGENT_RESULTS/` directory
- Each creates a JSON or CSV file: `{agent_name}_results.json`

Final coordinator (you) will:
1. Wait for all 6 agents to complete (check task IDs)
2. Aggregate results into single SUPADASH_COMPLETE_INVENTORY.md
3. Build consolidation plan from unified view
