from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any, Optional, List
import asyncio
import logging
import os
import json
from datetime import datetime

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="OSINT Orchestrator",
    description="OSINT Pipeline Orchestrator with Consent Gating",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"

@app.get("/")
async def root():
    return {"message": "OSINT Orchestrator API", "status": "healthy"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/api/v1/orchestrate")
async def orchestrate_osint(data: Dict[str, Any]):
    """
    Orchestrate OSINT data collection with consent verification.

    Args:
        data: Orchestration parameters including subject_id, consent_id, tools

    Returns:
        Orchestration job details
    """
    try:
        subject_id = data.get("subject_id")
        consent_id = data.get("consent_id")
        tools = data.get("tools", ["sherlock", "maigret"])
        scan_type = data.get("scan_type", "basic")

        if not subject_id:
            raise HTTPException(status_code=400, detail="subject_id is required")

        # In demo mode, skip consent verification
        if not DEMO_MODE and not consent_id:
            raise HTTPException(status_code=403, detail="consent_id required in production mode")

        # Simulate orchestration process
        job_id = f"osint-job-{subject_id}-{int(datetime.utcnow().timestamp())}"

        # Start background orchestration
        asyncio.create_task(run_osint_orchestration(job_id, subject_id, consent_id or "", tools, scan_type))

        logger.info(f"OSINT orchestration started: {job_id} for subject {subject_id}")

        return {
            "job_id": job_id,
            "status": "running",
            "message": "OSINT orchestration initiated",
            "tools": tools,
            "scan_type": scan_type,
            "demo_mode": DEMO_MODE
        }

    except Exception as e:
        logger.error(f"OSINT orchestration failed: {e}")
        raise HTTPException(status_code=500, detail=f"OSINT orchestration failed: {str(e)}")

async def run_osint_orchestration(job_id: str, subject_id: str, consent_id: str, tools: List[str], scan_type: str):
    """
    Run the OSINT orchestration process.

    Args:
        job_id: Unique job identifier
        subject_id: Subject being analyzed
        consent_id: Consent identifier
        tools: List of OSINT tools to use
        scan_type: Type of scan to perform
    """
    try:
        logger.info(f"Running OSINT orchestration: {job_id}")

        # Simulate tool execution
        results = []

        for tool in tools:
            if tool == "sherlock":
                result = await run_sherlock_tool(subject_id, scan_type)
                results.append(result)
            elif tool == "maigret":
                result = await run_maigret_tool(subject_id, scan_type)
                results.append(result)
            else:
                logger.warning(f"Unknown tool: {tool}")

        # Store results (in production, would save to database)
        logger.info(f"OSINT orchestration completed: {job_id}, results: {len(results)}")

    except Exception as e:
        logger.error(f"OSINT orchestration error: {e}")

async def run_sherlock_tool(subject_id: str, scan_type: str) -> Dict[str, Any]:
    """Simulate Sherlock OSINT tool execution."""
    await asyncio.sleep(1)  # Simulate processing time

    return {
        "tool": "sherlock",
        "subject_id": subject_id,
        "scan_type": scan_type,
        "status": "completed",
        "findings": [
            {
                "platform": "GitHub",
                "url": f"https://github.com/{subject_id}",
                "exists": True
            },
            {
                "platform": "Twitter",
                "url": f"https://twitter.com/{subject_id}",
                "exists": True
            }
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

async def run_maigret_tool(subject_id: str, scan_type: str) -> Dict[str, Any]:
    """Simulate Maigret OSINT tool execution."""
    await asyncio.sleep(1)  # Simulate processing time

    return {
        "tool": "maigret",
        "subject_id": subject_id,
        "scan_type": scan_type,
        "status": "completed",
        "findings": [
            {
                "platform": "LinkedIn",
                "url": f"https://linkedin.com/in/{subject_id}",
                "exists": True
            },
            {
                "platform": "Instagram",
                "url": f"https://instagram.com/{subject_id}",
                "exists": False
            }
        ],
        "timestamp": datetime.utcnow().isoformat() + "Z"
    }

@app.get("/api/v1/status/{job_id}")
async def get_orchestration_status(job_id: str):
    """
    Get orchestration job status.

    Args:
        job_id: Unique job identifier

    Returns:
        Job status and results
    """
    # In a real implementation, this would query a database
    return {
        "job_id": job_id,
        "status": "completed",  # Mock status
        "message": "Job completed successfully",
        "demo_mode": DEMO_MODE
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8080, reload=True)