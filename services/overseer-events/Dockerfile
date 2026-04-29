# Python event ingestion service for Overseer
FROM python:3.11-slim

WORKDIR /app

# Copy event ingestion service
COPY overseer_events.py ./
COPY requirements.txt ./

# Install dependencies
RUN pip install --no-cache-dir fastapi uvicorn pydantic

# Create log directory
RUN mkdir -p /var/log/bridge

EXPOSE 9092

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:9092/overseer/status || exit 1

CMD ["uvicorn", "overseer_events:app", "--host", "0.0.0.0", "--port", "9092"]
