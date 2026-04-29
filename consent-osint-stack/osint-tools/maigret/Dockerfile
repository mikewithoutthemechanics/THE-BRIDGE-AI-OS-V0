FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Clone Maigret repository (in production, this would be a proper Docker image)
RUN git clone https://github.com/soxoj/maigret.git .

# Install Python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Create data directory
RUN mkdir -p /app/data

# Set environment variables
ENV DEMO_MODE=true

# Run in demo mode (no external network calls)
CMD ["python", "-m", "maigret", "--help"]