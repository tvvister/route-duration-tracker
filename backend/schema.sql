CREATE TABLE IF NOT EXISTS routes (
    public_id TEXT PRIMARY KEY,
    origin_lat DOUBLE PRECISION NOT NULL,
    origin_lng DOUBLE PRECISION NOT NULL,
    destination_lat DOUBLE PRECISION NOT NULL,
    destination_lng DOUBLE PRECISION NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_viewed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT routes_public_id_format CHECK (public_id ~ '^[a-z]+_[a-z]+$'),
    CONSTRAINT routes_origin_lat_range CHECK (origin_lat BETWEEN -90 AND 90),
    CONSTRAINT routes_origin_lng_range CHECK (origin_lng BETWEEN -180 AND 180),
    CONSTRAINT routes_destination_lat_range CHECK (destination_lat BETWEEN -90 AND 90),
    CONSTRAINT routes_destination_lng_range CHECK (destination_lng BETWEEN -180 AND 180),
    CONSTRAINT routes_different_points CHECK (origin_lat <> destination_lat OR origin_lng <> destination_lng)
);

CREATE INDEX IF NOT EXISTS routes_last_viewed_at_idx ON routes (last_viewed_at);
