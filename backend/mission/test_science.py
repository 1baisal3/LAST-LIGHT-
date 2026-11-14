import math
from dataclasses import replace
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import Mock, patch

import numpy as np
import rasterio
import requests
from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rasterio.transform import from_origin
from datasets.integrity import DatasetIntegrityError, register_dataset

from .errors import HorizonsError, HorizonsTimeout, TerrainConfigurationError, TerrainCoverageError
from .horizons import JPLHorizonsProvider, julian_date, parse_observer_table
from .physics import (
    STEFAN_BOLTZMANN, SimulationParameters, dust_transmission,
    panel_power_w, solar_irradiance, thermal_step,
)
from .providers import LandingSite
from .services import simulate_mission
from .orchestration import run_mission
from .terrain import LOLATerrainProvider, MOON_RADIUS_M, line_of_sight


def observer_table(epochs, azimuth=90, elevation=30, distance=1):
    # Observer CSV quantity 4 (az/el) and 20 (range/range-rate).
    rows = '\n'.join(f'{epoch:.9f}, , , {azimuth}, {elevation}, {distance}, 0,' for epoch in epochs)
    return (
        'Date_________JDUT, , , Azi_(a-app), Elev_(a-app), delta, deldot,\n'
        '$$SOE\n' + rows + '\n$$EOE\n'
    )


class HorizonsTests(SimpleTestCase):
    def setUp(self):
        directory = TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        override = override_settings(EPHEMERIS_STORE_PATH=Path(directory.name))
        override.enable()
        self.addCleanup(override.disable)
        cache.clear()
        self.site = LandingSite(-89, 32, 1200)
        self.times = [datetime(2026, 11, 14, hour, tzinfo=timezone.utc) for hour in range(24)]
        self.epochs = [julian_date(t) for t in self.times]
        self.session = Mock()
        sun, earth = Mock(), Mock()
        sun.json.return_value = {'result': observer_table(self.epochs, elevation=20, distance=1)}
        earth.json.return_value = {'result': observer_table(self.epochs, azimuth=45, elevation=5, distance=0.00257)}
        self.session.get.side_effect = [sun, earth]

    def test_batched_sun_and_earth_geometry_and_cache(self):
        provider = JPLHorizonsProvider(session=self.session)
        data = provider.geometries(self.site, self.times)
        self.assertEqual(len(data), 24)
        self.assertEqual(data[0].sun_elevation_deg, 20)
        self.assertEqual(data[0].earth_elevation_deg, 5)
        self.assertEqual(data[0].sun_distance_au, 1)
        self.assertEqual(self.session.get.call_count, 2)
        sun_call, earth_call = self.session.get.call_args_list
        self.assertEqual(sun_call.kwargs['params']['CENTER'], "'coord@301'")
        self.assertEqual(sun_call.kwargs['params']['SITE_COORD'], "'32,-89,1.2'")
        self.assertEqual(sun_call.kwargs['params']['COMMAND'], "'10'")
        self.assertEqual(earth_call.kwargs['params']['COMMAND'], "'399'")
        self.assertEqual(len(sun_call.kwargs['params']['TLIST'].split(',')), 24)
        for value in sun_call.kwargs['params']['TLIST'].split(','):
            self.assertTrue(value.startswith("'") and value.endswith("'"))
        self.assertEqual(provider.geometries(self.site, self.times), data)
        self.assertEqual(self.session.get.call_count, 2)

    def test_j2000_and_timezone_conversion(self):
        self.assertEqual(julian_date(datetime(2000, 1, 1, 12, tzinfo=timezone.utc)), 2451545)
        local = self.times[0].astimezone(timezone(timedelta(hours=6)))
        self.assertEqual(julian_date(local), self.epochs[0])
        with self.assertRaises(ValueError):
            julian_date(datetime(2026, 1, 1))

    def test_actual_jpl_long_column_names_and_legacy_names_are_supported(self):
        epochs = [julian_date(value) for value in self.times]
        legacy = observer_table(epochs)
        actual = legacy.replace('Azi_(a-app)', 'Azimuth_(a-app)').replace('Elev_(a-app)', 'Elevation_(a-app)')
        self.assertEqual(parse_observer_table(actual, epochs), parse_observer_table(legacy, epochs))

    def test_seven_day_request_uses_a_short_hourly_range_for_each_target(self):
        times = [self.times[0] + timedelta(hours=hour) for hour in range(168)]
        epochs = [julian_date(value) for value in times]
        self.session.get.side_effect = None
        self.session.get.return_value.json.return_value = {'result': observer_table(epochs)}
        rows = JPLHorizonsProvider(session=self.session).geometries(self.site, times)
        self.assertEqual(len(rows), 168)
        self.assertEqual(self.session.get.call_count, 2)
        for call in self.session.get.call_args_list:
            parameters = call.kwargs['params']
            self.assertNotIn('TLIST', parameters)
            self.assertEqual(parameters['STEP_SIZE'], "'1 h'")
            self.assertEqual(parameters['START_TIME'], f"'JD{epochs[0]:.9f}'")
            self.assertEqual(parameters['STOP_TIME'], f"'JD{epochs[-1]:.9f}'")

    def test_corrupt_cached_ephemeris_is_rejected(self):
        from django.conf import settings
        provider = JPLHorizonsProvider(session=self.session)
        provider.geometries(self.site, self.times)
        archive = Path(settings.EPHEMERIS_STORE_PATH) / f'{provider.artifact_sha256[0]}.json'
        archive.write_text('{"result":"corrupt"}')
        with self.assertRaises(DatasetIntegrityError):
            provider.geometries(self.site, self.times)
        self.assertEqual(self.session.get.call_count, 2)

    def test_cache_cannot_substitute_a_valid_archive_for_another_request(self):
        provider = JPLHorizonsProvider(session=self.session)
        provider.geometries(self.site, self.times)
        with patch('mission.horizons.cache.get', return_value={'sha256': provider.artifact_sha256[1]}):
            with self.assertRaises(DatasetIntegrityError):
                provider.geometries(self.site, self.times)

    def test_invalid_incomplete_and_nonfinite_tables(self):
        for body in (
            'no table', observer_table(self.epochs[:1]),
            observer_table(self.epochs, elevation='n.a.'),
            observer_table(self.epochs, azimuth='NaN'),
            observer_table(self.epochs, distance=0),
            observer_table([epoch + 1 for epoch in self.epochs]),
        ):
            with self.subTest(body=body[:80]), self.assertRaises(HorizonsError):
                parse_observer_table(body, self.epochs)

    def test_http_timeout_error_json_and_service_errors(self):
        for failure, expected in (
            (requests.Timeout(), HorizonsTimeout),
            (requests.ConnectionError(), HorizonsError),
            (requests.HTTPError(), HorizonsError),
        ):
            with self.subTest(failure=failure):
                self.session.get.side_effect = failure
                with self.assertRaises(expected):
                    JPLHorizonsProvider(session=self.session).geometries(self.site, self.times)
        self.session.get.side_effect = None
        response = self.session.get.return_value
        for payload in ({'error': 'Bad date'}, {'result': 'invalid table'}, [], {}):
            response.json.return_value = payload
            with self.assertRaises(HorizonsError):
                JPLHorizonsProvider(session=self.session).geometries(self.site, self.times)
        response.json.side_effect = ValueError('invalid JSON')
        with self.assertRaises(HorizonsError):
            JPLHorizonsProvider(session=self.session).geometries(self.site, self.times)


class PhysicsTests(SimpleTestCase):
    def test_flux_illumination_projection_and_inverse_square(self):
        self.assertEqual(solar_irradiance(90, 1), 1361)
        self.assertAlmostEqual(solar_irradiance(30, 1), 680.5)
        self.assertEqual(solar_irradiance(-20, 1), 0)
        self.assertEqual(solar_irradiance(90, 1, illuminated=False), 0)
        self.assertEqual(solar_irradiance(90, 2), 1361 / 4)

    def test_dust_halves_power_at_one_optical_half_depth(self):
        self.assertEqual(dust_transmission(0, 0.5), 1)
        transmission = dust_transmission(math.log(2) / 0.5, 0.5)
        self.assertAlmostEqual(transmission, 0.5)
        self.assertAlmostEqual(panel_power_w(1000, 2, 0.2, 25, transmission), 200)
        self.assertLess(panel_power_w(1000, 2, 0.2, 120, 1), panel_power_w(1000, 2, 0.2, 25, 1))
        self.assertEqual(panel_power_w(0, 2, 0.2, 25, 1), 0)

    def test_thermal_equilibrium_matches_radiative_balance(self):
        parameters = SimulationParameters()
        flux = 1000
        equilibrium_k = (
            143.15**4 + (parameters.solar_absorptivity * flux + parameters.internal_heat_w / parameters.thermal_area_m2)
            / (parameters.emissivity * STEFAN_BOLTZMANN)
        ) ** 0.25
        equilibrium_c = equilibrium_k - 273.15
        self.assertAlmostEqual(thermal_step(equilibrium_c, flux, parameters), equilibrium_c, places=8)
        self.assertGreater(thermal_step(20, flux, parameters), 20)
        self.assertLess(thermal_step(20, 0, parameters), 20)
        self.assertEqual(thermal_step(20, flux, parameters, duration_s=0), 20)

    def test_nightside_equilibrium_and_overtemperature_are_not_clamped(self):
        parameters = replace(SimulationParameters(), internal_heat_w=0)
        self.assertAlmostEqual(thermal_step(-130, 0, parameters), -130, places=8)
        hot = replace(parameters, thermal_capacity_j_k=10, emissivity=0.1)
        self.assertGreater(thermal_step(20, 1361, hot), 120)

    def test_los_grazing_and_occlusion(self):
        self.assertTrue(line_of_sight(5, 4))
        self.assertFalse(line_of_sight(5, 5))
        self.assertFalse(line_of_sight(5, 6))
        self.assertTrue(line_of_sight(-0.01, -0.1))


class TerrainTests(SimpleTestCase):
    def setUp(self):
        self.directory = TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.path = Path(self.directory.name) / 'lola.tif'
        self.manifest_path = Path(self.directory.name) / 'manifest.json'
        override = override_settings(
            DATASET_MANIFEST_PATH=self.manifest_path,
            EPHEMERIS_STORE_PATH=Path(self.directory.name) / 'ephemerides',
        )
        override.enable()
        self.addCleanup(override.disable)
        self.site = LandingSite(0, 0)
        self.crs = f'+proj=eqc +R={MOON_RADIUS_M} +units=m +no_defs'

    def write_dem(self, values=None, crs=None, scale=1, offset=0):
        self.path = Path(self.directory.name) / f'lola-{len(list(Path(self.directory.name).glob("*.tif")))}.tif'
        values = values if values is not None else np.zeros((401, 401), dtype='float32')
        with rasterio.open(
            self.path, 'w', driver='GTiff', width=401, height=401,
            count=1, dtype='float32', nodata=-9999, crs=crs or self.crs,
            transform=from_origin(-20050, 20050, 100, 100),
        ) as dataset:
            dataset.write(values.astype('float32'), 1)
            dataset.scales = (scale,)
            dataset.offsets = (offset,)
        register_dataset(self.path, self.manifest_path)

    def test_projected_dem_profile_has_lunar_curvature(self):
        self.write_dem()
        with LOLATerrainProvider(self.path, max_distance_m=1000, step_m=100) as terrain:
            self.assertEqual(terrain.elevation_m(0, 0), 0)
            profile = terrain.profile(self.site, 90)
            self.assertEqual(len(profile), 10)
            self.assertEqual(profile[-1]['distance_m'], 1000)
            # For a same-height spherical surface, elevation is -central_angle/2.
            self.assertAlmostEqual(profile[-1]['elevation_angle_deg'], -math.degrees(1000 / MOON_RADIUS_M) / 2, places=6)
            self.assertAlmostEqual(terrain.horizon_deg(self.site, 90, 0), 0)
            self.assertLess(terrain.horizon_deg(self.site, 90, 2), 0)
        self.assertTrue(terrain.dataset.closed)

    def test_changed_topography_is_rejected_before_simulation(self):
        self.write_dem()
        with rasterio.open(self.path, 'r+') as dataset:
            dataset.write(np.ones((401, 401), dtype='float32'), 1)
        with self.assertRaises(DatasetIntegrityError):
            LOLATerrainProvider(self.path)
        with override_settings(MISSION_DATA_MODE='auto', LOLA_DEM_PATH=str(self.path)):
            with patch('mission.orchestration.JPLHorizonsProvider') as jpl:
                with self.assertRaises(DatasetIntegrityError):
                    run_mission(latitude=0, longitude=0, date=date(2026, 11, 14), auto_resolve=False)
                jpl.assert_not_called()

    def test_eastern_ridge_obstructs_low_target_and_taller_mast_helps(self):
        values = np.zeros((401, 401), dtype='float32')
        values[:, 210] = 500  # ridge at x=1000 m, east of the site
        self.write_dem(values)
        with LOLATerrainProvider(self.path, max_distance_m=2000, step_m=100) as terrain:
            horizon = terrain.horizon_deg(self.site, 90, 0)
            self.assertGreater(horizon, 26)
            self.assertLess(horizon, 27)
            self.assertFalse(line_of_sight(10, horizon))
            self.assertTrue(line_of_sight(30, horizon))
            self.assertLess(terrain.horizon_deg(self.site, 90, 100), horizon)
            self.assertAlmostEqual(terrain.horizon_deg(self.site, 270), 0)

    def test_nodata_and_out_of_coverage_never_mean_flat_ground(self):
        values = np.zeros((401, 401), dtype='float32')
        values[200, 201] = -9999
        self.write_dem(values)
        with LOLATerrainProvider(self.path, max_distance_m=1000, step_m=100) as terrain:
            with self.assertRaises(TerrainCoverageError):
                terrain.profile(self.site, 90)
            with self.assertRaises(TerrainCoverageError):
                terrain.elevation_m(60, 60)

    def test_scale_offset_and_wrong_planet_crs(self):
        self.write_dem(np.full((401, 401), 2), scale=0.5, offset=10)
        with LOLATerrainProvider(self.path) as terrain:
            self.assertEqual(terrain.elevation_m(0, 0), 11)
        self.write_dem(crs='EPSG:4326')
        with self.assertRaises(TerrainConfigurationError):
            LOLATerrainProvider(self.path)
        with self.assertRaises(TerrainConfigurationError):
            LOLATerrainProvider('')

    def test_geographic_positive_longitude_dataset(self):
        with rasterio.open(
            self.path, 'w', driver='GTiff', width=360, height=180,
            count=1, dtype='float32',
            crs=f'+proj=longlat +R={MOON_RADIUS_M} +no_defs',
            transform=from_origin(0, 90, 1, 1),
        ) as dataset:
            values = np.zeros((180, 360), dtype='float32')
            values[90, 350] = 123
            dataset.write(values, 1)
        register_dataset(self.path, self.manifest_path)
        with LOLATerrainProvider(self.path) as terrain:
            self.assertEqual(terrain.elevation_m(-0.5, -9.5), 123)

    def test_missing_crs_and_sampling_configuration_are_rejected(self):
        self.write_dem()
        for distance, step in ((1000, 0), (1000, 2000), (200000, 100), (10000, 0.1)):
            with self.subTest(distance=distance, step=step), self.assertRaises(TerrainConfigurationError):
                LOLATerrainProvider(self.path, max_distance_m=distance, step_m=step)
        with rasterio.open(
            self.path, 'w', driver='GTiff', width=10, height=10,
            count=1, dtype='float32', transform=from_origin(0, 1000, 100, 100),
        ) as dataset:
            dataset.write(np.zeros((10, 10), dtype='float32'), 1)
        with self.assertRaises(TerrainConfigurationError):
            LOLATerrainProvider(self.path)

    def test_integration_real_geotiff_and_mocked_jpl_http(self):
        self.write_dem()
        epochs = [julian_date(datetime(2026, 11, 14, hour, tzinfo=timezone.utc)) for hour in range(24)]
        session = Mock()
        sun, earth = Mock(), Mock()
        sun.json.return_value = {'result': observer_table(epochs, elevation=60)}
        earth.json.return_value = {'result': observer_table(epochs, azimuth=180, elevation=-5)}
        session.get.side_effect = [sun, earth]
        cache.clear()
        with override_settings(MISSION_DATA_MODE='auto', LOLA_DEM_PATH=str(self.path)):
            with patch('mission.orchestration.JPLHorizonsProvider', return_value=JPLHorizonsProvider(session=session)):
                result = run_mission(latitude=0, longitude=0, date=date(2026, 11, 14), auto_resolve=False)
        self.assertFalse(result['is_placeholder'])
        self.assertEqual(result['model']['data_mode'], 'external')
        self.assertEqual(len(result['horizon_profile']), 36)
        self.assertEqual(len(result['model']['terrain_sha256']), 64)
        self.assertEqual(len(result['model']['ephemeris_sha256']), 2)
        self.assertEqual(len(result['hourly_data']), 24)
        for row in result['hourly_data']:
            self.assertGreater(row['energy_balance_wh'], 0)
            self.assertTrue(row['sun_visible'])
            self.assertFalse(row['earth_visible'])
        transmissions = [row['panel_dust_transmission'] for row in result['hourly_data']]
        self.assertGreater(transmissions[0], transmissions[-1])
