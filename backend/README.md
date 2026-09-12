# Python + PostgreSQL API

The backend stores route coordinates in PostgreSQL and exposes the API used by the frontend.

## Local setup

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
createdb route_duration_tracker
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/route_duration_tracker
export CORS_ORIGIN=http://localhost:5173
python backend/server.py
```

The server listens on `http://localhost:8080` by default. The schema is applied automatically on startup.

Endpoints:

- `POST /api/routes` — save coordinates and return a Docker-style `publicId`.
- `GET /api/routes/:publicId` — retrieve coordinates and update `last_viewed_at`.
- `POST /api/routes/:publicId/view` — update `last_viewed_at`.
- `GET /api/health` — health check.


## Docker Compose

From the repository root:

```bash
cp .env.example .env
# Set VITE_GOOGLE_MAPS_API_KEY, GOOGLE_ROUTES_API_KEY, and a long URL-safe
# POSTGRES_PASSWORD in .env, then run:
docker compose up --build
```

Open `http://localhost:8080`. Compose starts PostgreSQL with a persistent Docker
volume, waits until it is ready, and then starts the application. The application
image builds the frontend with Node.js and serves both the API and frontend from
Python, so Node.js and PostgreSQL do not need to be installed on the host.

The `worker` service records every active route immediately after it starts and
then at the beginning of every hour (for example, `22:00`, `23:00`, and `00:00`).
It uses live traffic through Google Routes API and stores successful and failed
checks in `route_measurements`. Use a separate server-side API key in
`GOOGLE_ROUTES_API_KEY`; a browser key restricted by HTTP referrer will not work
for the worker.

Run one measurement cycle manually:

```bash
docker compose run --rm worker python backend/worker.py --once
```

Inspect recent measurements:

```bash
docker compose exec database psql -U route_tracker -d route_duration_tracker \
  -c "SELECT route_public_id, measured_at, duration_seconds, distance_meters, status, error_code FROM route_measurements ORDER BY measured_at DESC LIMIT 20;"
```
