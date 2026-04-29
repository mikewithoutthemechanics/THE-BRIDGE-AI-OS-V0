<<<<<<< HEAD
# Backend Service - Stabilized FastAPI + WebSocket
=======
>>>>>>> a65a24150727639fde77daadeba4361af473827a
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
<<<<<<< HEAD
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy Python dependencies first (caching layer)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY backend/main.py .
COPY backend/__init__.py ./backend/ 2>/dev/null || true

# Security: run as non-root user
RUN useradd -m -u 1000 appuser && chown -R appuser:appuser /app
USER appuser

# Production: single worker for determinism
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080", "--workers", "1"]
=======
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
>>>>>>> a65a24150727639fde77daadeba4361af473827a
