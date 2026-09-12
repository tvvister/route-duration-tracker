import json
import os
import random
import re
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
import mimetypes

import psycopg
from psycopg.rows import dict_row

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR.parent / 'frontend' / 'dist'
DATABASE_URL = os.environ.get('DATABASE_URL', 'postgresql://localhost:5432/route_duration_tracker')
PORT = int(os.environ.get('PORT', '8080'))
CORS_ORIGIN = os.environ.get('CORS_ORIGIN', '*')
ROUTE_ID_PATTERN = re.compile(r'^/api/routes/([a-z]+_[a-z]+)$')
VIEW_PATTERN = re.compile(r'^/api/routes/([a-z]+_[a-z]+)/view$')

ADJECTIVES = [
    'bold', 'brave', 'calm', 'clever', 'eager', 'fancy', 'fierce', 'focused',
    'happy', 'kind', 'lively', 'lucid', 'mighty', 'nimble', 'proud',
    'quick', 'quiet', 'sharp', 'swift', 'wise',
]
NAMES = [
    'ada', 'babbage', 'bohr', 'curie', 'darwin', 'einstein', 'fermi', 'faraday',
    'hopper', 'lovelace', 'maxwell', 'newton', 'pascal', 'turing', 'tesla', 'wright',
]


def utc_now():
    return datetime.now(timezone.utc)


def public_route(row):
    return {
        'publicId': row['public_id'],
        'origin': {'latitude': row['origin_lat'], 'longitude': row['origin_lng']},
        'destination': {'latitude': row['destination_lat'], 'longitude': row['destination_lng']},
        'createdAt': row['created_at'].isoformat(),
        'lastViewedAt': row['last_viewed_at'].isoformat(),
    }


def validate_point(value, field_name):
    if not isinstance(value, dict):
        raise ValueError(f'{field_name} is required.')
    try:
        latitude = float(value['latitude'])
        longitude = float(value['longitude'])
    except (KeyError, TypeError, ValueError) as error:
        raise ValueError(f'{field_name} must contain latitude and longitude.') from error
    if not -90 <= latitude <= 90:
        raise ValueError(f'{field_name}.latitude must be between -90 and 90.')
    if not -180 <= longitude <= 180:
        raise ValueError(f'{field_name}.longitude must be between -180 and 180.')
    return latitude, longitude


def generate_route_id(connection):
    for _ in range(100):
        candidate = f'{random.choice(ADJECTIVES)}_{random.choice(NAMES)}'
        if connection.execute('SELECT 1 FROM routes WHERE public_id = %s', (candidate,)).fetchone() is None:
            return candidate
    raise RuntimeError('Could not generate a unique route ID.')


def create_route(origin, destination):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        public_id = generate_route_id(connection)
        row = connection.execute(
            """
            INSERT INTO routes (public_id, origin_lat, origin_lng, destination_lat, destination_lng)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING public_id, origin_lat, origin_lng, destination_lat, destination_lng, created_at, last_viewed_at
            """,
            (public_id, origin[0], origin[1], destination[0], destination[1]),
        ).fetchone()
        return public_route(row)


def get_route(public_id):
    with psycopg.connect(DATABASE_URL, row_factory=dict_row) as connection:
        row = connection.execute(
            """
            UPDATE routes
            SET last_viewed_at = %s
            WHERE public_id = %s
            RETURNING public_id, origin_lat, origin_lng, destination_lat, destination_lng, created_at, last_viewed_at
            """,
            (utc_now(), public_id),
        ).fetchone()
        return public_route(row) if row else None


def touch_route(public_id):
    with psycopg.connect(DATABASE_URL) as connection:
        updated = connection.execute(
            'UPDATE routes SET last_viewed_at = %s WHERE public_id = %s',
            (utc_now(), public_id),
        ).rowcount
        return updated > 0


def initialize_database():
    schema = (BASE_DIR / 'schema.sql').read_text(encoding='utf-8')
    with psycopg.connect(DATABASE_URL) as connection:
        connection.execute(schema)


def serve_static(handler, pathname):
    frontend_root = FRONTEND_DIR.resolve()
    requested_path = (frontend_root / unquote(pathname.lstrip('/'))).resolve()
    try:
        requested_path.relative_to(frontend_root)
    except ValueError:
        requested_path = frontend_root / 'index.html'

    file_path = requested_path if requested_path.is_file() else frontend_root / 'index.html'
    if not file_path.is_file():
        handler._send_json(404, {'error': 'Frontend build not found.'})
        return

    body = file_path.read_bytes()
    content_type = mimetypes.guess_type(file_path.name)[0] or 'application/octet-stream'
    handler.send_response(200)
    handler.send_header('Content-Type', content_type)
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Cache-Control', 'no-cache' if file_path.name == 'index.html' else 'public, max-age=31536000, immutable')
    handler.end_headers()
    handler.wfile.write(body)


class RouteHandler(BaseHTTPRequestHandler):
    def _send_json(self, status, payload):
        body = json.dumps(payload).encode('utf-8')
        self.send_response(status)
        self.send_header('Access-Control-Allow-Origin', CORS_ORIGIN)
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get('Content-Length', '0'))
        if length > 1_000_000:
            raise ValueError('Request body is too large.')
        raw = self.rfile.read(length)
        try:
            return json.loads(raw or '{}')
        except json.JSONDecodeError as error:
            raise ValueError('Request body must be valid JSON.') from error

    def do_OPTIONS(self):
        self._send_json(204, {})

    def do_GET(self):
        pathname = urlparse(self.path).path
        if pathname == '/api/health':
            self._send_json(200, {'status': 'ok'})
            return
        match = ROUTE_ID_PATTERN.fullmatch(pathname)
        if match:
            route = get_route(match.group(1))
            self._send_json(200, route) if route else self._send_json(404, {'error': 'Route not found.'})
            return
        if pathname.startswith('/api/'):
            self._send_json(404, {'error': 'Not found.'})
            return
        serve_static(self, pathname)

    def do_POST(self):
        pathname = urlparse(self.path).path
        try:
            if pathname == '/api/routes':
                body = self._read_json()
                origin = validate_point(body.get('origin'), 'origin')
                destination = validate_point(body.get('destination'), 'destination')
                if origin == destination:
                    raise ValueError('origin and destination must be different points.')
                self._send_json(201, create_route(origin, destination))
                return
            match = VIEW_PATTERN.fullmatch(pathname)
            if match:
                self._send_json(200, {'ok': True}) if touch_route(match.group(1)) else self._send_json(404, {'error': 'Route not found.'})
                return
            self._send_json(404, {'error': 'Not found.'})
        except ValueError as error:
            self._send_json(400, {'error': str(error)})
        except Exception as error:
            print(f'API error: {error}')
            self._send_json(500, {'error': 'Internal server error.'})

    def log_message(self, format_string, *args):
        print(f'{self.address_string()} - {format_string % args}')


def main():
    initialize_database()
    server = ThreadingHTTPServer(('0.0.0.0', PORT), RouteHandler)
    print(f'Route API listening on http://localhost:{PORT}')
    server.serve_forever()


if __name__ == '__main__':
    main()
