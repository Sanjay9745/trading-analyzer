# Use an official Python slim image for a smaller footprint and pre-built wheels
FROM python:3.11-slim

# Prevent Python from writing .pyc files to disc
ENV PYTHONDONTWRITEBYTECODE=1

# Prevent Python from buffering stdout and stderr
ENV PYTHONUNBUFFERED=1

# Set default environment variable for MongoDB connection
# This can be overridden at runtime using docker run -e MONGODB_URL=...
ENV MONGODB_URL=mongodb://localhost:27017

# Set the working directory inside the container
WORKDIR /app

# Install curl for health check utility
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements file first to leverage Docker's build cache
COPY requirements.txt .

# Install python dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the application source code
COPY . .

# Expose port 8000 (which FastAPI uvicorn server runs on)
EXPOSE 8000

# Command to run the application using uvicorn
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
