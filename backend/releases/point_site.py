import math
from contextlib import ExitStack
from datetime import datetime, timedelta

from django.conf import settings

from mission.data_sources import SyntheticEphemerisProvider, SyntheticTerrainProvider, resolve_data_mode
from mission.errors import HorizonsError
from mission.horizons import JPLHorizonsProvider
from mission.providers import LandingSite
from mission.terrain import LOLATerrainProvider

from .contract import ReleaseContractError, validate_release

POINT_SITE_ID = 'point'
PROFILE_STEP_DEG = 10
MASTS = (2, 5, 10)
TOLERANCE_DEG = 1e-6


def _providers(stack):
    mode = resolve_data_mode()
    if mode == 'synthetic-v1':
        return mode, SyntheticTerrainProvider(), SyntheticEphemerisProvider()
    terrain = stack.enter_context(LOLATerrainProvider(
        settings.LOLA_DEM_PATH,
        max_distance_m=settings.LOLA_PROFILE_DISTANCE_M,
        step_m=settings.LOLA_PROFILE_STEP_M,
    ))
    return mode, terrain, JPLHorizonsProvider(timeout_s=settings.HORIZONS_TIMEOUT_S)


def _profile(terrain, site, mast_m):
    return [float(terrain.horizon_deg(site, azimuth, mast_m)) for azimuth in range(0, 360, PROFILE_STEP_DEG)]


def _monotone(lower, higher):
    if any(value > higher[index] + TOLERANCE_DEG for index, value in enumerate(lower)):
        return None
    return [min(value, higher[index]) for index, value in enumerate(lower)]


def _format_utc(moment):
    return moment.strftime('%Y-%m-%dT%H:%M:%SZ')


def _round(value):
    return round(float(value), 6)


def build_point_site(release, latitude, longitude, terrain=None, ephemeris=None):
    window = release.sites['window']
    start = datetime.fromisoformat(window['start'].replace('Z', '+00:00'))
    timestamps = [start + timedelta(hours=hour) for hour in range(window['count'])]
    with ExitStack() as stack:
        mode, default_terrain, default_ephemeris = _providers(stack)
        terrain = terrain or default_terrain
        ephemeris = ephemeris or default_ephemeris
        ground = terrain.elevation_m(latitude, longitude)
        site = LandingSite(latitude, longitude, ground + MASTS[0])
        geometries = ephemeris.geometries(site, timestamps)
        if len(geometries) != len(timestamps):
            raise HorizonsError('Ephemeris returned an incomplete window.')
        profiles = {mast: _profile(terrain, LandingSite(latitude, longitude, ground + mast), mast) for mast in MASTS}

    hours = []
    for moment, geometry in zip(timestamps, geometries):
        values = (geometry.sun_azimuth_deg, geometry.sun_elevation_deg, geometry.earth_azimuth_deg, geometry.earth_elevation_deg)
        if any(value is None or not math.isfinite(value) for value in values):
            raise HorizonsError('Ephemeris returned missing Sun or Earth geometry.')
        hours.append({
            't': _format_utc(moment),
            'sunAz': _round(geometry.sun_azimuth_deg % 360),
            'sunEl': _round(geometry.sun_elevation_deg),
            'earthAz': _round(geometry.earth_azimuth_deg % 360),
            'earthEl': _round(geometry.earth_elevation_deg),
        })
    for hour in hours:
        for key in ('sunAz', 'earthAz'):
            if hour[key] >= 360:
                hour[key] = 0.0

    base = [_round(value) for value in profiles[2]]
    point = {
        'id': POINT_SITE_ID,
        'name': f'{latitude:.4f}, {longitude:.4f}',
        'lat': _round(latitude),
        'lon': _round(longitude),
        'horizon': base,
        'hours': hours,
    }
    five = _monotone([_round(value) for value in profiles[5]], base)
    ten = _monotone([_round(value) for value in profiles[10]], five) if five else None
    if five and ten:
        point['horizonByMast'] = {'5': five, '10': ten}

    sites_file = {'version': 1, 'window': window, 'sites': [point]}
    try:
        validate_release(sites_file, release.provenance, release.validation)
    except ReleaseContractError as exc:
        raise ValueError('; '.join(exc.issues[:5])) from exc
    return {'site': point, 'dataMode': mode}
