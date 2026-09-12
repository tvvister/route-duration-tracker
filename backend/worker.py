import argparse
import json
import os
import time
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

import psycopg
from psycopg.rows import dict_row


BASE_DIR = Path(__file__).resolve().parent
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://localhost:5432/route_duration_tracker')
ROUTES_API_URL = os.environ.get(
    'GOOGLE_ROUTES_API_URL',
    'https://routes.googleapis.com/directions/v2:computeRoutes',
)
REQUEST_TIMEOUT_SECONDS = float(os.environ.get('WORKER_REQUEST_TIMEOUT_SECONDS', '20'))
MAX_ATTEMPTS = int(os.environ.get('WORKER_MAX_ATTEMPTS', '3'))
RETRY_BASE_SECONDS = float(os.environ.get('WORKER_RETRY_BASE_SECONDS', '2'))
ACTIVE_ROUTE_DAYS = int(os.environ.get('ACTIVE_ROUTE_DAYS', '60'))
WORKER_LOCK_ID = 724_683_921


class ProviderError(Exception):
    def __init__(self, code, transient=False):
        super().__init__(code)
        self.code = code
        self.transient = transient


class InvalidRouteError(Exception):
    def __init__(self, code):
        super().__init__(code)
        self.code = code


def utc_now():
    return datetime.now(timezone.utc)


def log(event, **fields):
    payload = {'timestamp': utc_now().isoformat(), 'event': event, **fields}
    print(json.dumps(payload, ensure_ascii=False, sort_keys=True), flush=True)


def initialize_database():
    schema = (BASE_DIR / 'schema.sql').read_text(encoding='utf-8')
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute(schema)


def seconds_until_next_hour(now):
    next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return max(0.0, (next_hour - now).total_seconds())


def parse_duration_seconds(value):
    if not isinstance(value, str) or not value.endswith('s'):
        raise ProviderError('invalid_duration')
    try:
        seconds = Decimal(value[:-1])
    except InvalidOperation as error:
        raise ProviderError('invalid_duration') from error
    if not seconds.is_finite() or seconds < 0:
        raise ProviderError('invalid_duration')
    return int(seconds.quantize(Decimal('1'), rounding=ROUND_HALF_UP))


def provider_error_code(body, fallback):
    try:
        payload = json.loads(body)
        code = payload.get('error', {}).get('status')
        if isinstance(code, str) and code:
            return code[:120]
    except (json.JSONDecodeError, AttributeError):
        pass
    return fallback


def request_route_measurement(route, api_key, open_url=None):
    payload = {
        'origin': {
            'location': {
                'latLng': {
                    'latitude': route['origin_lat'],
                    'longitude': route['origin_lng'],
                },
            },
        },
        'destination': {
            'location': {
                'latLng': {
                    'latitude': route['destination_lat'],
                    'longitude': route['destination_lng'],
                },
            },
        },
        'travelMode': 'DRIVE',
        'routingPreference': 'TRAFFIC_AWARE',
        'units': 'METRIC',
    }
    request = Request(
        ROUTES_API_URL,
        data=json.dumps(payload).encode('utf-8'),
        method='POST',
        headers={
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': api_key,
            'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
        },
    )
    if open_url is None:
        open_url = urlopen

    try:
        with open_url(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            response_payload = json.load(response)
    except HTTPError as error:
        body = error.read().decode('utf-8', errors='replace')
        code = provider_error_code(body, f'http_{error.code}')
        raise ProviderError(code, transient=error.code == 429 or error.code >= 500) from error
    except (URLError, TimeoutError) as error:
        raise ProviderError('network_error', transient=True) from error
    except json.JSONDecodeError as error:
        raise ProviderError('invalid_json', transient=True) from error

    routes = response_payload.get('routes')
    if not isinstance(routes, list) or not routes:
        raise InvalidRouteError('no_route')

    result = routes[0]
    duration_seconds = parse_duration_seconds(result.get('duration'))
    distance_meters = result.get('distanceMeters')
    if distance_meters is not None:
        if not isinstance(distance_meters, int) or distance_meters < 0:
            raise ProviderError('invalid_distance')

    return duration_seconds, distance_meters


def request_with_retries(route, api_key):
    for attempt in range(1, MAX_ATTEMPTS + 1):
        try:
            return request_route_measurement(route, api_key)
        except ProviderError as error:
            if not error.transient or attempt == MAX_ATTEMPTS:
                raise
            delay = RETRY_BASE_SECONDS * (2 ** (attempt - 1))
            log(
                'provider_retry',
                route_id=route['public_id'],
                error_code=error.code,
                attempt=attempt,
                retry_in_seconds=delay,
            )
            time.sleep(delay)


def active_routes():
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        return connection.execute(
            """
            SELECT public_id, origin_lat, origin_lng, destination_lat, destination_lng
            FROM routes
            WHERE provider = 'google_routes'
              AND last_viewed_at >= now() - (%s * interval '1 day')
            ORDER BY public_id
            """,
            (ACTIVE_ROUTE_DAYS,),
        ).fetchall()


def save_measurement(route_id, measured_at, status, duration_seconds=None, distance_meters=None, error_code=None):
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute(
            """
            INSERT INTO route_measurements (
                route_public_id, measured_at, duration_seconds, distance_meters,
                provider, status, error_code
            )
            VALUES (%s, %s, %s, %s, 'google_routes', %s, %s)
            """,
            (route_id, measured_at, duration_seconds, distance_meters, status, error_code),
        )
        connection.execute(
            'UPDATE routes SET last_checked_at = %s WHERE public_id = %s',
            (measured_at, route_id),
        )


def measure_all_routes(api_key):
    routes = active_routes()
    log('measurement_run_started', route_count=len(routes))
    succeeded = 0
    failed = 0

    for route in routes:
        measured_at = utc_now()
        try:
            duration_seconds, distance_meters = request_with_retries(route, api_key)
            save_measurement(
                route['public_id'],
                measured_at,
                'ok',
                duration_seconds=duration_seconds,
                distance_meters=distance_meters,
            )
            succeeded += 1
            log(
                'route_measured',
                route_id=route['public_id'],
                duration_seconds=duration_seconds,
                distance_meters=distance_meters,
            )
        except InvalidRouteError as error:
            save_measurement(route['public_id'], measured_at, 'invalid_route', error_code=error.code)
            failed += 1
            log('route_measurement_failed', route_id=route['public_id'], status='invalid_route', error_code=error.code)
        except ProviderError as error:
            save_measurement(route['public_id'], measured_at, 'provider_error', error_code=error.code)
            failed += 1
            log('route_measurement_failed', route_id=route['public_id'], status='provider_error', error_code=error.code)
        except Exception as error:
            failed += 1
            log('route_measurement_store_failed', route_id=route['public_id'], error_type=type(error).__name__)

    log('measurement_run_finished', route_count=len(routes), succeeded=succeeded, failed=failed)


def run_worker(api_key, once=False):
    initialize_database()
    with psycopg.connect(DATABASE_URL, autocommit=True) as lock_connection:
        log('worker_waiting_for_lock')
        lock_connection.execute('SELECT pg_advisory_lock(%s)', (WORKER_LOCK_ID,))
        log('worker_started')

        measure_all_routes(api_key)
        if once:
            return

        while True:
            delay = seconds_until_next_hour(utc_now())
            log('worker_sleeping', next_run_in_seconds=round(delay, 3))
            time.sleep(delay)
            measure_all_routes(api_key)


def main():
    parser = argparse.ArgumentParser(description='Collect hourly route-duration measurements.')
    parser.add_argument('--once', action='store_true', help='Measure immediately and exit.')
    args = parser.parse_args()

    api_key = os.environ.get('GOOGLE_ROUTES_API_KEY')
    if not api_key:
        raise SystemExit('GOOGLE_ROUTES_API_KEY is required.')
    run_worker(api_key, once=args.once)


if __name__ == '__main__':
    main()
