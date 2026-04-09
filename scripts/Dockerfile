FROM python:3.12-slim

# Install uv from the official distroless image
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /usr/local/bin/

WORKDIR /app

# Copy dependency manifest first so this layer is cached separately
COPY pyproject.toml .

# Copy package source
COPY src/ src/

# Install the package and all dependencies into the system Python
RUN uv pip install --system -e .
