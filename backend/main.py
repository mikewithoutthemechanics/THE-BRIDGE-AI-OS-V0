from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import asyncio
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Bridge Task Runner",
    description="A simple task runner API",
    version="1.0.0"
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify allowed origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "Bridge Task Runner API", "status": "healthy"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.post("/run-task")
async def run_task(data: Dict[str, Any]):
    """
    Run a task with the provided data.

    Args:
        data: JSON data containing task parameters

    Returns:
        Dict containing task execution result
    """
    try:
        logger.info(f"Received task request: {data}")

        # Simulate task processing
        task_id = data.get("task_id", "unknown")
        task_type = data.get("task_type", "general")

        # Simulate async processing
        await asyncio.sleep(0.1)

        # Process the task based on type
        if task_type == "echo":
            result = {
                "task_id": task_id,
                "status": "completed",
                "result": data.get("message", "Hello World"),
                "timestamp": "2026-04-15T02:57:05+02:00"
            }
        elif task_type == "math":
            # Simple math operation
            operation = data.get("operation", "add")
            a = data.get("a", 0)
            b = data.get("b", 0)

            if operation == "add":
                result_val = a + b
            elif operation == "multiply":
                result_val = a * b
            else:
                result_val = 0

            result = {
                "task_id": task_id,
                "status": "completed",
                "result": result_val,
                "timestamp": "2026-04-15T02:57:05+02:00"
            }
        else:
            # Default task processing
            result = {
                "task_id": task_id,
                "status": "completed",
                "result": f"Task {task_id} completed successfully",
                "input_data": data,
                "timestamp": "2026-04-15T02:57:05+02:00"
            }

        logger.info(f"Task completed: {result}")
        return result

    except Exception as e:
        logger.error(f"Task execution failed: {e}")
        raise HTTPException(status_code=500, detail=f"Task execution failed: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)