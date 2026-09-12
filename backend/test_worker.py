import io
import json
import unittest
from datetime import datetime, timezone

from worker import ProviderError, parse_duration_seconds, request_route_measurement, seconds_until_next_hour


class FakeResponse(io.BytesIO):
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_value, traceback):
        self.close()


class WorkerTests(unittest.TestCase):
    def test_seconds_until_next_hour(self):
        now = datetime(2026, 9, 12, 21, 23, 0, tzinfo=timezone.utc)
        self.assertEqual(seconds_until_next_hour(now), 37 * 60)

    def test_seconds_until_next_hour_handles_fractional_second(self):
        now = datetime(2026, 9, 12, 21, 59, 59, 500000, tzinfo=timezone.utc)
        self.assertEqual(seconds_until_next_hour(now), 0.5)

    def test_parse_fractional_duration(self):
        self.assertEqual(parse_duration_seconds('123.5s'), 124)

    def test_parse_invalid_duration(self):
        with self.assertRaises(ProviderError):
            parse_duration_seconds('unknown')

    def test_route_request_uses_traffic_and_parses_response(self):
        captured = {}

        def open_url(request, timeout):
            captured['payload'] = json.loads(request.data)
            captured['field_mask'] = request.headers['X-goog-fieldmask']
            captured['timeout'] = timeout
            return FakeResponse(json.dumps({
                'routes': [{'duration': '901.4s', 'distanceMeters': 12345}],
            }).encode('utf-8'))

        route = {
            'origin_lat': 55.75,
            'origin_lng': 37.61,
            'destination_lat': 55.76,
            'destination_lng': 37.62,
        }
        result = request_route_measurement(route, 'test-key', open_url=open_url)

        self.assertEqual(result, (901, 12345))
        self.assertEqual(captured['payload']['routingPreference'], 'TRAFFIC_AWARE')
        self.assertEqual(captured['field_mask'], 'routes.duration,routes.distanceMeters')
        self.assertGreater(captured['timeout'], 0)


if __name__ == '__main__':
    unittest.main()
