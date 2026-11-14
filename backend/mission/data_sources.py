"""Explicit synthetic demo providers and server-side data source selection."""

import math
from datetime import datetime, timezone

from django.conf import settings

from .errors import TerrainConfigurationError
from .providers import SkyGeometry
from .terrain import MOON_RADIUS_M


def resolve_data_mode():
    mode = settings.MISSION_DATA_MODE
    if mode == 'auto':
        # A configured path must be validated; errors never trigger a synthetic fallback.
        return 'external' if settings.LOLA_DEM_PATH else 'synthetic-v1'
    if mode not in ('external', 'synthetic-v1'):
        raise TerrainConfigurationError('Unsupported MISSION_DATA_MODE.')
    return mode


def provider_mode(terrain, ephemeris):
    modes = [getattr(provider, 'data_mode', None) for provider in (terrain, ephemeris)]
    if all(isinstance(mode, str) and mode == 'synthetic-v1' for mode in modes):
        return 'synthetic-v1'
    if all(isinstance(mode, str) and mode == 'external' for mode in modes):
        return 'external'
    return 'injected'


def _horizontal(latitude, hour_angle):
    up = math.cos(latitude) * math.cos(hour_angle)
    north = -math.sin(latitude) * math.cos(hour_angle)
    east = -math.sin(hour_angle)
    return math.degrees(math.asin(max(-1, min(1, up)))), math.degrees(math.atan2(east, north)) % 360


class SyntheticEphemerisProvider:
    """Reproducible circular demo geometry, not a JPL ephemeris prediction."""

    data_mode = 'synthetic-v1'
    artifact_sha256 = ()

    def geometries(self, site, timestamps):
        latitude = math.radians(site.latitude)
        longitude = math.radians(site.longitude)
        epoch = datetime(2000, 1, 1, 12, tzinfo=timezone.utc)
        earth_elevation, earth_azimuth = _horizontal(latitude, longitude)
        values = []
        for timestamp in timestamps:
            days = (timestamp - epoch).total_seconds() / 86400
            angle = (2 * math.pi * days / 29.530588853 + longitude) % (2 * math.pi)
            sun_elevation, sun_azimuth = _horizontal(latitude, angle)
            values.append(SkyGeometry(
                sun_elevation_deg=sun_elevation, sun_azimuth_deg=sun_azimuth,
                earth_elevation_deg=earth_elevation, earth_azimuth_deg=earth_azimuth,
                sun_distance_au=1.0,
            ))
        return values


class SyntheticTerrainProvider:
    """Featureless lunar reference sphere for deterministic offline demos."""

    data_mode = 'synthetic-v1'
    sha256 = None

    def elevation_m(self, latitude, longitude):
        return 0.0

    def horizon_deg(self, site, azimuth_deg, mast_height_m):
        return -math.degrees(math.acos(MOON_RADIUS_M / (MOON_RADIUS_M + mast_height_m)))
