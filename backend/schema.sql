CREATE TABLE IF NOT EXISTS routes (
    public_id TEXT PRIMARY KEY,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    avoid_tolls BOOLEAN NOT NULL DEFAULT FALSE,
    provider TEXT NOT NULL DEFAULT 'google_routes',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_checked_at TIMESTAMPTZ,
    CONSTRAINT routes_public_id_format CHECK (public_id ~ '^[a-z]+_[a-z]+$'),
    CONSTRAINT routes_origin_lat_range CHECK (origin_lat BETWEEN -90 AND 90),
    CONSTRAINT routes_origin_lng_range CHECK (origin_lng BETWEEN -180 AND 180),
    CONSTRAINT routes_destination_lat_range CHECK (destination_lat BETWEEN -90 AND 90),
    CONSTRAINT routes_destination_lng_range CHECK (destination_lng BETWEEN -180 AND 180),
    CONSTRAINT routes_different_points CHECK (origin_lat <> destination_lat OR origin_lng <> destination_lng)
);

ALTER TABLE routes ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'google_routes';
ALTER TABLE routes ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS avoid_tolls BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS routes_last_viewed_at_idx ON routes (last_viewed_at);
CREATE INDEX IF NOT EXISTS routes_last_checked_at_idx ON routes (last_checked_at);

CREATE TABLE IF NOT EXISTS route_measurements (
    id BIGSERIAL PRIMARY KEY,
    route_public_id TEXT NOT NULL REFERENCES routes(public_id) ON DELETE CASCADE,
    measured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    duration_seconds INTEGER,
    distance_meters INTEGER,
    provider TEXT NOT NULL DEFAULT 'google_routes',
    status TEXT NOT NULL,
    error_code TEXT,
    CONSTRAINT route_measurements_status CHECK (status IN ('ok', 'provider_error', 'invalid_route')),
    CONSTRAINT route_measurements_duration_nonnegative CHECK (duration_seconds IS NULL OR duration_seconds >= 0),
    CONSTRAINT route_measurements_distance_nonnegative CHECK (distance_meters IS NULL OR distance_meters >= 0),
    CONSTRAINT route_measurements_result_shape CHECK (
        (status = 'ok' AND duration_seconds IS NOT NULL AND error_code IS NULL)
        OR (status <> 'ok' AND duration_seconds IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS route_measurements_route_time_idx
    ON route_measurements (route_public_id, measured_at DESC);
