# Beaker - Real-time A/B Testing Platform

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="frontend/public/beaker-logo-white.svg">
    <img src="frontend/public/beaker-logo.svg" alt="Beaker Logo" width="300" />
  </picture>
</p>

<p align="center">
  <a href="https://github.com/pastorenue/beaker/actions/workflows/ci.yml"><img src="https://github.com/pastorenue/beaker/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="https://opensource.org/licenses/MIT"><img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" /></a>
  <a href="https://www.rust-lang.org"><img src="https://img.shields.io/badge/rust-1.75%2B-orange.svg" alt="Rust" /></a>
  <a href="https://github.com/pastorenue/beaker/releases"><img src="https://img.shields.io/github/v/release/pastorenue/beaker" alt="GitHub release" /></a>
</p>

Beaker is a high-performance, real-time experimentation platform designed for scale. Built with **Rust**, **React**, **ClickHouse** and **Postgresql**, it provides sub-second statistical analysis on millions of events.

![Beaker Dashboard](https://via.placeholder.com/1000x500?text=Beaker+Live+Analytics+Dashboard)

## 🚀 Key Features

-   **High-Performance Ingestion**: Leverages ClickHouse's `MergeTree` engine to ingest and aggregate thousands of events per second.
-   **Real-time Statistical Engine**: Live Z-tests (proportions) and Welch's T-tests (continuous) powered by specialized ClickHouse queries.
-   **Advanced Targeting Rules**: Rule-based user group management using a flexible JSON-based editor for complex targeting (regex, hash-based, manual).
-   **Live Dashboard**: Real-time visualization of experiment progress with a 5-second polling interval and "Live" status synchronization.
-   **Experiment Lifecycle**: Full management of experiment states (Draft, Running, Paused, Stopped).
-   **Hypothesis Tracking**: Structured management of null and alternative hypotheses with power analysis and sample size calculators.

## 🏗️ Architecture

-   **Backend**: Rust (Actix-web) - Optimized for safety and speed.
-   **Frontend**: React (Vite, TypeScript, Tailwind) - Rich, responsive UI with live data synchronization.
-   **Database**:
  - ClickHouse - Distributed OLAP database for massive scale analytics.
  - Postgresql - Relational DB for all business logic
-   **Infrastructure**: Fully containerized with Docker Compose.

## 🛠️ Quick Start

### Prerequisites
- Docker & Docker Compose

### Running the Platform
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/yourusername/beaker.git
    cd beaker
    ```
2.  **Start all services**:
    ```bash
    docker-compose up -d --build
    ```
    For AI Assist + LiteLLM:
    ```bash
    docker-compose --profile ai up -d --build
    ```
    Or use the make command:
    ```bash
    make up
    ```
    For AI Assist + LiteLLM:
    ```bash
    make up-ai
    ```
    
3.  **Access the Dashboard**:
    -   Frontend: [http://localhost:3001](http://localhost:3001)
    -   Backend API: [http://localhost:8080](http://localhost:8080)
    -   ClickHouse: [http://localhost:8123](http://localhost:8123)
    -   Postgres: [http://localhost:5432](http://localhost:5432)
    -   Mailpit (OTP email): [http://localhost:8025](http://localhost:8025)
    -   LiteLLM (AI proxy, profile `ai`): [http://localhost:4000](http://localhost:4000)

## 📊 Live Testing & Simulation

We provide a specialized data generator to simulate real-world traffic and verify the statistical engine.

1.  **Create an experiment** via the UI at [http://localhost:3000/create](http://localhost:3000/create).
2.  **Run the generator**:
    ```bash
    # Default: single worker, real-time timestamps
    make generate-live-data

    # Target a specific experiment
    make generate-live-data ARGS="<EXPERIMENT_ID>"

    # 5 concurrent workers for higher throughput
    make generate-live-data ARGS="--concurrency 5"

    # 3 workers with events spread across the last 24 hours (pre-populates dashboards)
    make generate-live-data ARGS="--concurrency 3 --time-spread 24"

    # Use telemetry events already defined on the experiment
    make generate-live-data ARGS="--use-existing-telemetry"
    ```

| Option | Default | Description |
|---|---|---|
| `--concurrency` | `1` | Number of parallel worker threads |
| `--time-spread` | `0` | Hours of historical window to spread events across (0 = real-time) |
| `--min-events` | `60` | Minimum activity events per user session |
| `--interval` | `0.5` | Seconds between users (single-threaded mode only) |
| `--use-existing-telemetry` | off | Use telemetry definitions already on the experiment |

*Note: The script automatically creates a test user group and simulates a 20% conversion lift in the treatment variant.*

## 📖 API Reference

### Experiment Management
-   `POST /api/experiments` - Create new experiment
-   `GET /api/experiments` - List all experiments
-   `POST /api/experiments/:id/start` - Start an experiment
-   `GET /api/experiments/:id/analysis` - Fetch real-time statistical analysis

### Event Ingestion
-   `POST /api/events` - Ingest an event row
    ```json
    {
      "experiment_id": "uuid",
      "user_id": "string",
      "variant": "string",
      "metric_name": "string",
      "metric_value": 1.0
    }
    ```

### User Group Assignment
-   `POST /api/user-groups/assign` - Assign a user to a specific variant and group combination.

## 🔐 Auth & Default Access

Auth is enabled by default with email + password. If a user enables TOTP, login becomes **Authenticator-only**.

- Default admin user is created on first boot:
  - Email: `admin@beaker.local`
  - Password: `admin`
- Email OTP is disabled for login (no SMTP requirement for auth). TOTP is the only second factor.

Environment variables (see `docker-compose.yml`):
```bash
JWT_SECRET=change-me
JWT_TTL_MINUTES=60
ALLOW_DEV_OTP=1
```

## 🧩 SDK Usage

### Tracking SDK
Used to send sessions, events, and replay data to `/api/track/*`.

```ts
import { BeakerTracker } from '@/sdk/beaker';

const tracker = new BeakerTracker({
  endpoint: 'http://localhost:8080/api/track',
  apiKey: '<TRACKING_API_KEY>',
  userId: 'user_123',
  autoTrack: true,
  recordReplay: true
});

await tracker.init();
await tracker.track('cta_click', { variant: 'A' }, 'click');
```

### Feature Flags SDK
Used to evaluate gates/flags via `/api/sdk/feature-flags/evaluate`.

```ts
import { BeakerFeatureFlags } from '@/sdk/featureFlags';

const flags = new BeakerFeatureFlags({
  endpoint: 'http://localhost:8080/api/sdk/feature-flags/evaluate',
  apiKey: '<FEATURE_FLAGS_API_KEY>',
});

const result = await flags.evaluate({
  userId: 'user_123',
  attributes: { plan: 'pro', region: 'us' },
});
```

### SDK Tokens & Regeneration
Tokens are stored in Postgres and can be regenerated from **User Settings → SDK Tokens**.
- Regenerating invalidates existing client keys immediately.

## 🤖 AI Assist (LiteLLM)

AI Assist uses LiteLLM as a model router/proxy.

1. Start the `ai` profile:
   ```bash
   docker-compose --profile ai up --build
   ```
2. Provide model keys:
   ```bash
   export OPENAI_API_KEY=your_key
   export LITELLM_MASTER_KEY=your_litellm_key
   ```
3. (Optional) Configure models in `litellm/config.yaml`.

The frontend calls the backend AI endpoints:
- `POST /api/ai/chat`
- `POST /api/ai/chat/stream`
- `GET /api/ai/models`

## 🧪 Quick API Tests (curl)

```bash
# Health check
curl http://localhost:8080/health

# Login (step 1: email + password)
curl -X POST http://localhost:8080/api/auth/login \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"admin@beaker.local","password":"admin"}'

# Verify (step 2)
curl -X POST http://localhost:8080/api/auth/verify-otp \\
  -H 'Content-Type: application/json' \\
  -d '{"email":"admin@beaker.local","code":"","totp_code":"<TOTP_IF_ENABLED>"}'

# Feature flags SDK evaluation
curl -X POST http://localhost:8080/api/sdk/feature-flags/evaluate \\
  -H 'Content-Type: application/json' \\
  -H 'x-beaker-key: <FEATURE_FLAGS_API_KEY>' \\
  -d '{"user_id":"user_123","attributes":{"plan":"pro"},"flags":["new-nav"]}'
```

## 🔧 Environment Variables

Key variables used by the stack (see `docker-compose.yml`):

```bash
# Core
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
CLICKHOUSE_URL=http://clickhouse:8123
DATABASE_URL=postgres://beaker:beaker@postgres:5432/beaker

# Auth / sessions
JWT_SECRET=change-me
JWT_TTL_MINUTES=60
SESSION_TTL_MINUTES=30
ALLOW_DEV_OTP=1

# SDK keys (seeded into Postgres on first boot)
TRACKING_API_KEY=beaker-demo-key
FEATURE_FLAGS_API_KEY=beaker-flags-key

# Email (OTP)
SMTP_HOST=mailpit
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@beaker.local
LOG_ONLY_OTP=0

# LiteLLM / AI
LITELLM_BASE_URL=http://litellm:4000/v1
LITELLM_API_KEY=$LITELLM_MASTER_KEY
LITELLM_DEFAULT_MODEL=gpt-4o-mini
LITELLM_MODELS=gpt-4o-mini,gpt-3.5-turbo
OPENAI_API_KEY=your_key
LITELLM_MASTER_KEY=your_litellm_key
```

## 🔧 Development

### Backend (Rust)
```bash
cd backend
cargo run
```

### Frontend (React)
```bash
cd frontend
npm install
npm run dev
```

## 📜 License
MIT
