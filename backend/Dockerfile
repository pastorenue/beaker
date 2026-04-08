# Build stage
FROM rust:1.88-slim-bookworm as builder

WORKDIR /usr/src/app

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev g++ && rm -rf /var/lib/apt/lists/*

# Create placeholder workspace structure to cache dependencies
RUN mkdir -p src beaker-macros/src
RUN echo "fn main() {}" > src/main.rs
RUN echo "" > beaker-macros/src/lib.rs
COPY Cargo.toml Cargo.lock ./
COPY beaker-macros/Cargo.toml ./beaker-macros/
# Build to download and compile dependencies
RUN cargo build --release

# Copy the actual source code
COPY src ./src
COPY beaker-macros/src ./beaker-macros/src
COPY migrations ./migrations
# Touch the main file to force rebuild
RUN touch src/main.rs beaker-macros/src/lib.rs
RUN cargo build --release

# Runtime stage
FROM debian:bookworm-slim

WORKDIR /usr/local/bin

# Install runtime dependencies
RUN apt-get update && apt-get install -y libssl-dev ca-certificates && rm -rf /var/lib/apt/lists/*

COPY --from=builder /usr/src/app/target/release/beaker-backend .

# Set environment variables
ENV RUST_LOG=info
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8080

EXPOSE 8080

CMD ["./beaker-backend"]
