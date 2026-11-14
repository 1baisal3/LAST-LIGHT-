from contextlib import ExitStack
from dataclasses import asdict, replace
from datetime import date, datetime, time, timedelta, timezone

from django.conf import settings

from .errors import HorizonsError
from .horizons import JPLHorizonsProvider
from .physics import (
    MAX_TEMPERATURE_C, MIN_TEMPERATURE_C, SimulationParameters,
    dust_transmission, panel_power_w, solar_irradiance, thermal_step,
)
from .providers import HORIZON_PROFILE_AZIMUTHS, LandingSite
from .terrain import LOLATerrainProvider, line_of_sight
from .data_sources import SyntheticEphemerisProvider, SyntheticTerrainProvider, provider_mode, resolve_data_mode
from .threats import DisasterScenario


def simulate_mission(*, latitude: float, longitude: float, date: date,
                     ephemeris=None, terrain=None, disaster_mode=False, threat=None, duration_hours=24, **options) -> dict:
    if isinstance(duration_hours, bool) or not isinstance(duration_hours, int) or not 1 <= duration_hours <= 168:
        raise ValueError('Duration must be an integer from 1 to 168 hours.')
    parameters = SimulationParameters(**options)
    threat = threat if threat is not None else DisasterScenario.for_mission(disaster_mode, date)
    start = datetime.combine(date, time.min, tzinfo=timezone.utc)
    timestamps = [start + timedelta(hours=hour) for hour in range(duration_hours)]
    with ExitStack() as stack:
        mode = resolve_data_mode()
        if terrain is None:
            if mode == 'synthetic-v1':
                terrain = SyntheticTerrainProvider()
            else:
                terrain = stack.enter_context(LOLATerrainProvider(
                    settings.LOLA_DEM_PATH,
                    max_distance_m=settings.LOLA_PROFILE_DISTANCE_M,
                    step_m=settings.LOLA_PROFILE_STEP_M,
                ))
        if ephemeris is None:
            ephemeris = (SyntheticEphemerisProvider() if mode == 'synthetic-v1'
                         else JPLHorizonsProvider(timeout_s=settings.HORIZONS_TIMEOUT_S))
        elevation = terrain.elevation_m(latitude, longitude)
        site = LandingSite(latitude, longitude, elevation + parameters.mast_height_m)
        geometries = ephemeris.geometries(site, timestamps)
        if len(geometries) != duration_hours:
            raise HorizonsError('JPL Horizons returned an incomplete mission window.')
        temperature = parameters.initial_temperature_c
        charge_wh = parameters.battery_capacity_wh * parameters.initial_charge_percent / 100
        hourly_data = []
        for hour, (timestamp, geometry) in enumerate(zip(timestamps, geometries)):
            effects = threat.effects(timestamp)
            load_w = parameters.power_load_w * effects['load_fraction']
            internal_heat_w = parameters.internal_heat_w * effects['load_fraction']
            sun_horizon = terrain.horizon_deg(site, geometry.sun_azimuth_deg, parameters.mast_height_m)
            earth_horizon = terrain.horizon_deg(site, geometry.earth_azimuth_deg, parameters.mast_height_m)
            illuminated = line_of_sight(geometry.sun_elevation_deg, sun_horizon)
            irradiance = solar_irradiance(geometry.sun_elevation_deg, geometry.sun_distance_au, illuminated)
            end_temperature = thermal_step(temperature, irradiance, replace(parameters, internal_heat_w=internal_heat_w))
            dust = parameters.initial_dust_g_m2 + parameters.dust_deposition_g_m2_day * (hour + 0.5) / 24
            transmission = dust_transmission(dust, parameters.dust_extinction_m2_g)
            power = panel_power_w(
                irradiance, parameters.panel_area_m2, parameters.panel_efficiency,
                (temperature + end_temperature) / 2, transmission * effects['panel_health_factor'],
            )
            # One-hour intervals: average watts numerically equal watt-hours.
            balance_wh = power - load_w
            unconstrained_charge = charge_wh + balance_wh
            unserved_wh = max(0.0, -unconstrained_charge)
            spilled_wh = max(0.0, unconstrained_charge - parameters.battery_capacity_wh)
            charge_wh = min(parameters.battery_capacity_wh, max(0.0, unconstrained_charge))
            hourly_data.append({
                'timestamp': timestamp.isoformat().replace('+00:00', 'Z'),
                'sun_elevation_deg': geometry.sun_elevation_deg,
                'sun_azimuth_deg': geometry.sun_azimuth_deg,
                'earth_elevation_deg': geometry.earth_elevation_deg,
                'earth_azimuth_deg': geometry.earth_azimuth_deg,
                'sun_horizon_deg': sun_horizon, 'earth_horizon_deg': earth_horizon,
                'sun_visible': illuminated,
                'earth_visible': line_of_sight(geometry.earth_elevation_deg, earth_horizon),
                'communications_available': line_of_sight(geometry.earth_elevation_deg, earth_horizon) and not effects['communications_blackout'],
                'communications_blackout': effects['communications_blackout'],
                'threat_phase': effects['phase'], 'systems_mode': effects['systems_mode'],
                'panel_health_factor': effects['panel_health_factor'],
                'effective_power_load_w': load_w, 'effective_internal_heat_w': internal_heat_w,
                'solar_irradiance_w_m2': irradiance,
                'panel_power_w': power, 'panel_dust_transmission': transmission,
                'energy_balance_wh': balance_wh, 'battery_charge_wh': charge_wh,
                'unserved_energy_wh': unserved_wh, 'spilled_energy_wh': spilled_wh,
                'temperature_c': end_temperature,
                'temperature_within_limits': MIN_TEMPERATURE_C <= end_temperature <= MAX_TEMPERATURE_C,
            })
            temperature = end_temperature
        horizon_profile = [
            {'azimuth_deg': azimuth, 'elevation_deg': terrain.horizon_deg(site, azimuth, parameters.mast_height_m)}
            for azimuth in HORIZON_PROFILE_AZIMUTHS
        ]
        data_mode = provider_mode(terrain, ephemeris)
        return {
            'latitude': latitude, 'longitude': longitude, 'date': date.isoformat(),
            'duration_hours': duration_hours,
            'timezone': 'UTC', 'is_placeholder': data_mode == 'synthetic-v1',
            'horizon_profile': horizon_profile,
            'threat_status': threat.summary(timestamps),
            'model': {
                'version': 'engineering-v1', 'parameters': asdict(parameters),
                'data_mode': data_mode,
                'temperature_limits_c': [MIN_TEMPERATURE_C, MAX_TEMPERATURE_C],
                'ephemeris_source': type(ephemeris).__name__,
                'terrain_source': type(terrain).__name__,
                'terrain_sha256': terrain.sha256 if isinstance(getattr(terrain, 'sha256', None), str) else None,
                'ephemeris_sha256': list(ephemeris.artifact_sha256[-2:]) if isinstance(getattr(ephemeris, 'artifact_sha256', None), list) else [],
                'terrain_profile_distance_m': settings.LOLA_PROFILE_DISTANCE_M,
                'terrain_profile_step_m': settings.LOLA_PROFILE_STEP_M,
                'assumptions': [
                    'Horizontal panels; Sun and Earth treated as point centers.',
                    'Hourly geometry held constant over each one-hour interval.',
                    'Lumped thermal body; -130 C effective radiative environment; no active control.',
                    'Dust and hardware coefficients are configurable engineering assumptions.',
                    'Finite terrain sampling; relief beyond the sampled range is not resolved.',
                    'No eclipses, Earth station geometry, RF link budget, or subpixel terrain.',
                ],
            },
            'hourly_data': hourly_data,
        }
