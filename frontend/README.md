# Frontend

React + Vite + TypeScript frontend for Route Duration Tracker.

## Local development

Requires Node.js and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

The map picker now loads Google Maps JavaScript API v3 when VITE_GOOGLE_MAPS_API_KEY is configured, accepts clicks for both points, and displays custom markers.

## Publish to Yandex Cloud

See [DEPLOY_YANDEX_OBJECT_STORAGE.md](./DEPLOY_YANDEX_OBJECT_STORAGE.md) for the production build and Yandex Object Storage website setup.
