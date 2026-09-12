# Frontend

React + Vite + TypeScript frontend for Route Duration Tracker.

## Local development

Requires Node.js and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

The map picker loads Google Maps JavaScript API v3 when `VITE_GOOGLE_MAPS_API_KEY` is configured, accepts clicks for both points, and calculates duration through Google Routes API. The Generate route link button uses `VITE_API_BASE_URL` to create a short Docker-style route ID through the backend.

Run PostgreSQL, install the backend dependencies, export `DATABASE_URL`, and start the API:

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt
export DATABASE_URL=postgresql://postgres:postgres@localhost:5432/route_duration_tracker
python backend/server.py
```

Then start the frontend with `npm run dev --prefix frontend`.

## Publish to Yandex Cloud

See [DEPLOY_YANDEX_OBJECT_STORAGE.md](./DEPLOY_YANDEX_OBJECT_STORAGE.md) for the production build and Yandex Object Storage website setup.
