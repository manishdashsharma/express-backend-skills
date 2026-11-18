# __PROJECT_NAME__ API

__ONE_LINE_PRODUCT_DESCRIPTION__

## Setup

```bash
cp .env.example .env
docker compose up -d
npm install
__SETUP_EXTRA__npm run dev
```

API: `http://localhost:5000/v1` · Health: `GET /v1/health` · Readiness: `GET /v1/health/ready`

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Start with file watching |
| `npm start` | Start for production |
| `npm run lint` | Lint `src/` |
__SCRIPTS_EXTRA__
## Modules

See [api/README.md](api/README.md).
