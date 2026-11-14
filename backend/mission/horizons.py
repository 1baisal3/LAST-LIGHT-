"""JPL observer tables: Sun (10), Earth center (399), lunar site (coord@301)."""

import csv
import hashlib
import json
import math
from datetime import timezone

import requests
from django.core.cache import cache
from django.conf import settings

from datasets.integrity import DatasetIntegrityError, EphemerisStore

from .errors import HorizonsError, HorizonsTimeout
from .providers import SkyGeometry

API_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'


def julian_date(timestamp):
    if timestamp.tzinfo is None or timestamp.utcoffset() is None:
        raise ValueError('Horizons requires an aware UTC timestamp.')
    return timestamp.astimezone(timezone.utc).timestamp() / 86400 + 2440587.5


def parse_observer_table(result, epochs):
    """Read named CSV columns and verify all requested Julian UTC epochs."""
    try:
        header, body = result.split('$$SOE', 1)
        body, _ = body.split('$$EOE', 1)
        columns = next(
            next(csv.reader([line])) for line in reversed(header.splitlines())
            if 'Azi_' in line and 'Elev_' in line and ',' in line
        )
        columns = [column.strip() for column in columns]
        az_index = next(i for i, value in enumerate(columns) if value.startswith('Azi_'))
        el_index = next(i for i, value in enumerate(columns) if value.startswith('Elev_'))
        range_index = columns.index('delta')
        rows = [row for row in csv.reader(body.strip().splitlines()) if row and row[0].strip()]
        if len(rows) != len(epochs):
            raise ValueError('Unexpected number of epochs')
        values = []
        for row, epoch in zip(rows, epochs):
            jd = float(row[0])
            azimuth, elevation, distance = (float(row[i]) for i in (az_index, el_index, range_index))
            if not all(math.isfinite(v) for v in (jd, azimuth, elevation, distance)):
                raise ValueError('Non-finite ephemeris')
            if abs(jd - epoch) > 1 / 86400 or not 0 <= azimuth <= 360 or not -90 <= elevation <= 90 or distance <= 0:
                raise ValueError('Invalid epoch or geometry')
            values.append((azimuth % 360, elevation, distance))
        return values
    except (AttributeError, TypeError, ValueError, IndexError, StopIteration) as exc:
        raise HorizonsError('JPL Horizons returned an invalid or incomplete observer table.') from exc


class JPLHorizonsProvider:
    data_mode = 'external'

    def __init__(self, session=None, timeout_s=15, cache_seconds=3600):
        self.session = session if session is not None else requests
        self.timeout_s = timeout_s
        self.cache_seconds = cache_seconds
        self.artifact_sha256 = []

    def _target(self, command, site, epochs):
        params = {
            'format': 'json', 'COMMAND': f"'{command}'", 'OBJ_DATA': "'NO'",
            'MAKE_EPHEM': "'YES'", 'EPHEM_TYPE': "'OBSERVER'",
            'CENTER': "'coord@301'", 'COORD_TYPE': "'GEODETIC'",
            # The Moon uses east-positive longitude; altitude is in kilometres.
            'SITE_COORD': f"'{site.longitude},{site.latitude},{site.altitude_m / 1000}'",
            'TLIST': ','.join(f"'{value:.9f}'" for value in epochs),
            'TLIST_TYPE': "'JD'", 'TIME_TYPE': "'UT'", 'CAL_FORMAT': "'JD'",
            'QUANTITIES': "'4,20'", 'CSV_FORMAT': "'YES'",
            'ANG_FORMAT': "'DEG'", 'APPARENT': "'AIRLESS'",
            'EXTRA_PREC': "'YES'", 'RANGE_UNITS': "'AU'",
            'ELEV_CUT': "'-90'", 'SKIP_DAYLT': "'NO'", 'R_T_S_ONLY': "'NO'",
        }
        key = 'horizons:v2:' + hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
        store = EphemerisStore(settings.EPHEMERIS_STORE_PATH)
        cached = cache.get(key)
        if cached is not None:
            if not isinstance(cached, dict) or 'sha256' not in cached:
                raise DatasetIntegrityError('Invalid cached ephemeris reference.')
            archived = store.load(cached['sha256'])
            self.artifact_sha256.append(cached['sha256'])
            if not isinstance(archived, dict) or archived.get('request') != params:
                raise DatasetIntegrityError('Archived ephemeris does not match its request.')
            return parse_observer_table(archived.get('result'), epochs)
        try:
            response = self.session.get(API_URL, params=params, timeout=self.timeout_s)
            response.raise_for_status()
            payload = response.json()
        except requests.Timeout as exc:
            raise HorizonsTimeout('JPL Horizons request timed out.') from exc
        except (requests.RequestException, ValueError) as exc:
            raise HorizonsError('JPL Horizons is unavailable or returned invalid JSON.') from exc
        if not isinstance(payload, dict) or payload.get('error') or not isinstance(payload.get('result'), str):
            raise HorizonsError('JPL Horizons could not calculate the requested ephemeris.')
        parsed = parse_observer_table(payload['result'], epochs)
        digest = store.save({'source': API_URL, 'request': params, 'result': payload['result']})
        self.artifact_sha256.append(digest)
        cache.set(key, {'sha256': digest}, timeout=self.cache_seconds)
        return parsed

    def geometries(self, site, timestamps):
        if not timestamps:
            return []
        epochs = [julian_date(timestamp) for timestamp in timestamps]
        sun = self._target('10', site, epochs)
        earth = self._target('399', site, epochs)
        return [
            SkyGeometry(
                sun_azimuth_deg=s[0], sun_elevation_deg=s[1], sun_distance_au=s[2],
                earth_azimuth_deg=e[0], earth_elevation_deg=e[1],
            ) for s, e in zip(sun, earth)
        ]
