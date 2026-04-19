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
-   **CUPED & Sequential Testing**: Variance reduction via CUPED (Controlled Experiment Using Pre-Experiment Data) and sequential testing with always-valid p-values.
-   **Advanced Targeting Rules**: Rule-based user group management using a flexible JSON-based editor for complex targeting (regex, hash-based, manual).
-   **Feature Flags & Gates**: Full CRUD for feature flags and gates with real-time SDK evaluation and user-group targeting.
-   **Live Dashboard**: Real-time visualization of experiment progress with a 5-second polling interval and "Live" status synchronization.
-   **SRM & Anomaly Detection**: Automatic Sample Ratio Mismatch detection and anomaly alerts for guardrail metrics.
-   **Session Replay**: Client-side session recording and playback powered by [rrweb](https://github.com/rrweb-io/rrweb).
-   **Experiment Lifecycle**: Full management of experiment states (Draft, Running, Paused, Stopped).
-   **Hypothesis Tracking**: Structured management of null and alternative hypotheses with power analysis and sample size calculators.
-   **AI Assist**: LLM-powered experiment suggestions, hypothesis drafting, one-pager generation, and background polling insights with auto-stop on severe regressions.
-   **Integrations**: Google OAuth login and Jira issue creation/linking per experiment.
-   **MCP Support**: Model Context Protocol server exposing experiments, feature flags, and analytics as tools for Claude and other AI agents.

## 🏗️ Architecture

-   **Backend**: Rust (Actix-web) — optimized for safety and throughput.
-   **Frontend**: React 18 (Vite, TypeScript, Tailwind, Recharts) — rich, responsive UI with live data sync.
-   **Database**:
    - ClickHouse — OLAP database for high-throughput event analytics.
    - PostgreSQL — relational DB for experiments, users, and config.
-   **AI/LLM**: Direct OpenAI-compatible API (Groq by default); optional LiteLLM proxy via the `ai` Docker Compose profile.
-   **Infrastructure**: Fully containerized with Docker Compose (backend, frontend, ClickHouse, PostgreSQL, Mailpit, LiteLLM).

## 🛠️ Quick Start

### Prerequisites
- Docker & Docker Compose

### Running the Platform
1.  **Clone the repository**:
    ```bash
    git clone https://github.com/pastorenue/beaker.git
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

1.  **Create an experiment** via the UI at [http://localhost:3001/create](http://localhost:3001/create).
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

### Authentication
-   `POST /api/auth/register` - Register a new user
-   `POST /api/auth/login` - Email + password login
-   `POST /api/auth/verify-otp` - OTP / TOTP verification
-   `POST /api/auth/forgot-password` / `POST /api/auth/reset-password` - Password recovery
-   `POST /api/auth/totp/setup` - Enable TOTP second factor

### Experiment Management
-   `POST /api/experiments` - Create new experiment
-   `GET /api/experiments` - List all experiments
-   `GET /api/experiments/:id` - Get experiment details
-   `PUT /api/experiments/:id` - Update experiment
-   `POST /api/experiments/:id/start` / `/pause` / `/stop` / `/restart` - Lifecycle transitions
-   `GET /api/experiments/:id/analysis` - Real-time statistical analysis
-   `GET /api/experiments/:id/variant-activity` - Per-variant throughput metrics
-   `GET|POST /api/experiments/:id/cuped/config` - CUPED configuration

### Event Ingestion
-   `POST /api/events` - Ingest a metric event
    ```json
    {
      "experiment_id": "uuid",
      "user_id": "string",
      "variant": "string",
      "metric_name": "string",
      "metric_value": 1.0
    }
    ```

### Tracking (high-throughput)
-   `POST /api/track/session/start` - Start a user session
-   `POST /api/track/session/end` - End a user session
-   `POST /api/track/event` - Track a client-side event
-   `POST /api/track/replay` - Ingest rrweb session replay data
-   `GET /api/track/sessions` / `GET /api/track/events` - List recorded sessions / events

### Feature Flags & Gates
-   `GET|POST /api/feature-flags` - List / create feature flags
-   `PUT|DELETE /api/feature-flags/:id` - Update / delete a flag
-   `GET|POST /api/feature-gates` - List / create feature gates
-   `POST /api/sdk/evaluate/flags` - SDK flag evaluation
-   `POST /api/sdk/evaluate/gate/:id` - SDK gate evaluation

### User Group Assignment
-   `GET|POST /api/user-groups` - List / create user groups
-   `POST /api/user-groups/assign` - Assign a user to a variant and group

### AI Assist
-   `POST /api/ai/chat` - Chat with AI assistant
-   `POST /api/ai/chat/stream` - Streaming chat response
-   `GET /api/ai/models` - List available LLM models
-   `POST /api/ai/suggest-metrics` - Suggest metrics for an experiment
-   `POST /api/ai/draft-hypothesis` - Draft a hypothesis
-   `POST /api/ai/draft-one-pager` - Generate an experiment one-pager
-   `PATCH /api/ai/config` - Update AI runtime configuration

### Model Context Protocol (MCP)
-   `POST /api/mcp/tools/list` - List available MCP tools
-   `POST /api/mcp/tools/call` - Execute an MCP tool

## 🔐 Auth & Default Access

Auth is enabled by default with email + password. If a user enables TOTP, login becomes **Authenticator-only**. Google OAuth is also supported.

- Default admin user is created on first boot:
  - Email: `admin@beaker.local`
  - Password: `admin`
- Email OTP is disabled for login (no SMTP requirement for auth). TOTP is the only second factor.

Environment variables (see `docker-compose.yml`):
```bash
JWT_SECRET=change-me
JWT_TTL_MINUTES=60
ALLOW_DEV_OTP=1
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

## 🧩 SDK Usage

Two SDKs are available: a **TypeScript/JavaScript SDK** (`@beaker/sdk`) and a **Python SDK** (`beaker-sdk`).

### Tracking SDK (TypeScript)
Sends sessions, events, and rrweb replay data to `/api/track/*`.

```ts
import { BeakerTracker } from '@beaker/sdk';

const tracker = new BeakerTracker({
  endpoint: 'http://localhost:8080/api/track',
  apiKey: '<TRACKING_API_KEY>',
  userId: 'user_123',
  autoTrack: true,
  recordReplay: true,
});

await tracker.init();
await tracker.track('cta_click', { variant: 'A' }, 'click');
```

### Feature Flags SDK (TypeScript)
Evaluates flags and gates via `/api/sdk/evaluate/flags`.

```ts
import { BeakerFeatureFlags } from '@beaker/sdk';

const flags = new BeakerFeatureFlags({
  endpoint: 'http://localhost:8080/api/sdk/evaluate/flags',
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

## 🤖 AI Assist

AI Assist connects directly to any OpenAI-compatible API. By default it uses **Groq** (`llama-3.3-70b-versatile`). LiteLLM is available as an optional proxy via the `ai` Docker Compose profile.

**Default setup (Groq):**
```bash
export PERSONAL_GROQ_KEY=your_groq_key
```

**Optional LiteLLM proxy:**
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

AI backend endpoints:
- `POST /api/ai/chat` / `POST /api/ai/chat/stream`
- `GET /api/ai/models`
- `POST /api/ai/suggest-metrics`
- `POST /api/ai/draft-hypothesis`
- `POST /api/ai/draft-one-pager`
- `PATCH /api/ai/config`

**AI Polling:** The backend can run background insight polling (configurable via `AI_POLLING_ENABLED` and `AI_POLLING_INTERVAL_MINUTES`) to auto-surface regressions and auto-stop experiments on severe metric degradation.

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

# Default admin (created on first boot)
DEFAULT_ADMIN_EMAIL=admin@beaker.local
DEFAULT_ADMIN_PASSWORD=admin

# Google OAuth (optional)
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# SDK keys (seeded into Postgres on first boot)
TRACKING_API_KEY=beaker-demo-key
FEATURE_FLAGS_API_KEY=beaker-flags-key

# Email (OTP)
SMTP_HOST=mailpit
SMTP_USER=
SMTP_PASS=
SMTP_FROM=no-reply@beaker.local
LOG_ONLY_OTP=0

# AI (Groq by default; swap AI_BASE_URL for any OpenAI-compatible endpoint)
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=$PERSONAL_GROQ_KEY
AI_DEFAULT_MODEL=llama-3.3-70b-versatile
AI_MODELS=llama-3.3-70b-versatile,llama-3.1-8b-instant
AI_POLLING_ENABLED=true
AI_POLLING_INTERVAL_MINUTES=15

# LiteLLM proxy (only needed with --profile ai)
LITELLM_MASTER_KEY=your_litellm_key
OPENAI_API_KEY=your_openai_key

# MCP (Model Context Protocol)
MCP_ENABLED=true
MCP_API_KEY=your-mcp-key
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
