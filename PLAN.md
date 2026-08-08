# Route Duration Tracker — Implementation Plan

## 1. Goal

Build a web application where a person selects an origin and destination on a map, receives a shareable route link, and can view the route's duration history over time.

The system checks each active route approximately once per hour through a maps routing API, stores each measurement in PostgreSQL hosted in Yandex Cloud, and removes routes that have not been viewed for 60 days.

## 2. Proposed architecture

- **Frontend:** map-based route creation and route history timeline.
- **Backend API:** route creation, route lookup, visit tracking, and health endpoints.
- **Worker/scheduler:** hourly duration collection and daily retention cleanup.
- **Database:** PostgreSQL with separate route and measurement records.
- **Maps provider adapter:** an abstraction around Yandex Maps initially, allowing Google Maps or another provider later.
- **Deployment:** containerized services deployed to Yandex Cloud; secrets supplied through environment variables or a managed secret store.

## 3. Core user flow

1. The user opens the application and selects point 1 and point 2 on the map.
2. The frontend sends coordinates and optional labels to the backend.
3. The backend validates the points, creates a route with a secure public identifier, and returns a shareable URL.
4. The user opens the URL to see route details and a duration timeline.
5. Each page visit updates the route's `last_viewed_at` timestamp.

## 4. Data model

### `routes`

- `id` — internal UUID.
- `public_id` — unguessable identifier used in URLs.
- `origin_lat`, `origin_lng` — origin coordinates.
- `destination_lat`, `destination_lng` — destination coordinates.
- `origin_label`, `destination_label` — optional display names.
- `provider` — routing provider name.
- `created_at` — creation timestamp.
- `last_viewed_at` — most recent page visit.
- `last_checked_at` — most recent successful or attempted route check.
- `deleted_at` — optional soft-delete timestamp if a recovery window is desired.

### `route_measurements`

- `id` — internal UUID or bigint.
- `route_id` — foreign key to `routes` with cascading deletion.
- `measured_at` — measurement timestamp.
- `duration_seconds` — route duration returned by the provider.
- `distance_meters` — optional distance returned by the provider.
- `status` — `ok`, `provider_error`, or `invalid_route`.
- `error_code` — optional normalized provider error.

Indexes should cover `routes.last_viewed_at`, `routes.last_checked_at`, and `(route_id, measured_at)`.

## 5. Backend API

- `POST /api/routes` — create a route from two coordinates.
- `GET /api/routes/:publicId` — return route details and timeline data.
- `POST /api/routes/:publicId/view` — record a page visit; this may also happen inside the GET request with rate limiting.
- `GET /api/health` — liveness/readiness check.

The API should validate coordinate ranges, reject identical points, cap timeline ranges, and apply request rate limits.

## 6. Scheduled processing

### Hourly measurement job

1. Select routes that are not expired and are due for a check.
2. Request route duration from the provider adapter.
3. Insert a measurement in a transaction.
4. Update `last_checked_at`.
5. Retry transient provider or network failures with bounded backoff.
6. Record failures without deleting historical measurements.

The job must be idempotent enough to tolerate retries and overlapping worker instances. A database lock or lease can prevent duplicate work.

### Retention job

Run at least daily:

1. Find routes where `last_viewed_at < now() - interval '60 days'`.
2. Delete measurements and routes in a transaction, or mark them deleted before permanent removal.
3. Log the number of removed routes and measurements.

## 7. Frontend

- Map picker with clear origin and destination markers.
- Route preview and generated share link.
- Timeline chart with date/time on the x-axis and duration on the y-axis.
- Empty, loading, provider-error, and expired-route states.
- Responsive layout and accessible keyboard/focus behavior.

## 8. Security and privacy

- Do not expose database credentials or maps API keys in the repository.
- Use unguessable public route identifiers; do not expose sequential database IDs.
- Apply API rate limits and input validation.
- Configure CORS narrowly for the deployed frontend.
- Store only the coordinates and labels needed for the feature.
- Document that anyone with a route link can view that route's history.

## 9. Observability

- Structured logs for route creation, provider calls, job runs, and cleanup.
- Metrics for successful checks, provider failures, latency, active routes, and cleanup counts.
- Alerts for repeated provider failures, database connectivity errors, and stalled workers.

## 10. Testing strategy

- Unit tests for coordinate validation, public ID generation, retention rules, and provider response normalization.
- API tests for route creation, lookup, view tracking, rate limits, and expired routes.
- Worker tests for retries, idempotency, locking, and cleanup transactions.
- Frontend tests for map selection, link generation, timeline rendering, and error states.
- A small end-to-end test against a provider sandbox or mocked adapter.

## 11. Delivery phases

### Phase 1 — Foundation

- Choose the stack and create the frontend/backend/worker structure.
- Add local PostgreSQL and migration tooling.
- Implement configuration and secret handling.

### Phase 2 — Route creation

- Build the map picker and provider adapter.
- Add `routes` migrations and route creation API.
- Generate and display shareable links.

### Phase 3 — History collection

- Add `route_measurements` migrations and timeline API.
- Implement the hourly worker with retries and locking.
- Build the timeline page.

### Phase 4 — Lifecycle and hardening

- Implement visit tracking and 60-day cleanup.
- Add rate limits, observability, backups, and failure handling.
- Complete automated tests and security review.

### Phase 5 — Yandex Cloud deployment

- Provision PostgreSQL and application services.
- Configure domains, TLS, environment variables, scheduled jobs, and monitoring.
- Run a production smoke test and document operations.

## 12. Open decisions

- Frontend/backend language and framework.
- Yandex Maps routing endpoint and API quota model.
- Whether route pages are public or require an account.
- Whether cleanup is immediate or uses a soft-delete grace period.
- Timeline aggregation and maximum history range returned per request.
