# avry-zeroclaw

AI Agent Gateway for the Aivory platform — powered by ZeroClaw runtime with VPS Bridge proxy.

## Architecture

```
Dashboard (Next.js)
    │
    │  POST /console/stream, /aria/stream, /workflows/generate
    │
    ▼
VPS Bridge (:3003) ─── Node.js thin proxy
    │  • CORS handling
    │  • Auth injection
    │  • SSE stream normalization
    │  • Direct diagnostic endpoints (OpenRouter fallback)
    │
    ▼
ZeroClaw (:3010) ─── Rust AI daemon
    │  • Multi-agent routing (AGENTS.md)
    │  • Sub-agent orchestration (workflow_brain, diagnostic_brain, etc.)
    │  • Skills-based structured output
    │  • MCP connection to n8n-MCP
    │  • Memory (SQLite), sessions, cron, cost tracking
    │  • OpenRouter LLM calls (qwen/qwen3-235b-a22b)
    │
    ▼
n8n-MCP (:3020) → n8n (:5678) for workflow operations
```

## Services

| Service | Port | Description |
|---------|------|-------------|
| ZeroClaw | 3010 | AI agent runtime (Rust binary) |
| VPS Bridge | 3003 | Thin proxy between frontend and ZeroClaw |

## Directory Structure

```
avry-zeroclaw/
├── bin/zeroclaw              # ZeroClaw binary (Linux x86_64)
├── config/                   # ZeroClaw configuration (~/.zeroclaw)
│   ├── config.toml           # Main config (providers, agents, skills, etc.)
│   ├── identity.md           # AI persona definition
│   ├── skills/               # Installed skills (workflow_*, etc.)
│   └── workspace/            # Workspace data (SOUL.md, AGENTS.md, etc.)
├── runtime/                  # Runtime state (brain.db, sessions, etc.)
├── skills/                   # Additional skill repositories
├── vps-bridge/               # VPS Bridge source code
│   ├── server.js             # Main proxy server
│   ├── endpoints.js          # API endpoint handlers
│   ├── lib/supabase.js       # Supabase client
│   └── Dockerfile
├── Dockerfile.zeroclaw       # ZeroClaw container
├── docker-compose.yml        # All services
└── .env.example              # Environment template
```

## Run Locally

```bash
# Create shared network (first time only)
docker network create aivory-network

# Start services
docker compose up --build
```

## Key Endpoints (via VPS Bridge :3003)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/console/stream` | AI console chat (SSE) |
| POST | `/aria/stream` | Floating AIRA assistant (SSE) |
| POST | `/workflows/generate` | Workflow spec generation (JSON) |
| POST | `/workflows/repair` | Workflow repair (JSON) |
| POST | `/diagnostics/run` | Deep diagnostic (OpenRouter) |
| POST | `/diagnostic/run` | Free diagnostic (OpenRouter) |
| GET | `/health` | Health check |
| GET | `/api/entitlements/:userId` | User entitlements |

## Configuration

ZeroClaw config lives in `config/config.toml`. Key sections:
- `[providers.models.openrouter]` — LLM provider config
- `[agents.*]` — Sub-agent definitions (workflow_brain, diagnostic_brain, etc.)
- `[mcp]` — n8n-MCP connection
- `[memory]` — SQLite memory backend
- `[gateway]` — HTTP gateway settings

## Part of Aivory

This service is part of the [Aivory platform](https://github.com/ClementHansel/aivory).
