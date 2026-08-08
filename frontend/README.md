# Frontend

React + Vite + TypeScript frontend for Route Duration Tracker.

## Local development

Requires Node.js and npm.

```bash
npm install
cp .env.example .env
npm run dev
```

The current screen is an intentionally small MVP shell. The map panel uses a clickable placeholder so the route-selection flow can be developed before wiring in the Yandex Maps SDK. The next integration step is to replace `map-placeholder` in `src/App.tsx` with the provider map and send the selected coordinates to the backend API.
