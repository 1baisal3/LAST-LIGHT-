from datetime import date, datetime, timedelta, timezone
from unittest.mock import Mock, patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, override_settings
from django.urls import reverse
from rest_framework.test import APITestCase
from rest_framework_simplejwt.tokens import RefreshToken

from .providers import LandingSite, SkyGeometry
from .errors import HorizonsError, HorizonsTimeout, TerrainConfigurationError, TerrainCoverageError
from .services import simulate_mission
from datasets.integrity import DatasetIntegrityError
from .response_serializers import FixPlanResponseSerializer, MissionResponseSerializer


@override_settings(MISSION_DATA_MODE='external', MISSION_THROTTLE_ENABLED=False)
class MissionSimulationAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='mission-commander', email='mission@example.com',
        )

    def setUp(self):
        self.url = reverse('mission-simulation')
        self.client.force_authenticate(self.user)
        self.payload = {'latitude': -89.5, 'longitude': 32.0, 'date': '2026-11-14'}
        self.ephemeris = Mock()
        self.ephemeris.geometries.return_value = [SkyGeometry(
            sun_elevation_deg=30, sun_azimuth_deg=120,
            earth_elevation_deg=10, earth_azimuth_deg=45,
        )] * 24
        self.terrain = Mock()
        self.terrain.elevation_m.return_value = 0
        self.terrain.horizon_deg.return_value = 0
        ephemeris_patch = patch('mission.orchestration.JPLHorizonsProvider', return_value=self.ephemeris)
        terrain_patch = patch('mission.orchestration.LOLATerrainProvider')
        ephemeris_patch.start()
        self.terrain_factory = terrain_patch.start()
        self.terrain_factory.return_value.__enter__.return_value = self.terrain
        self.addCleanup(ephemeris_patch.stop)
        self.addCleanup(terrain_patch.stop)

    def test_returns_exactly_24_hourly_utc_samples(self):
        self.assertEqual(self.url, '/api/mission/')
        response = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 200)
        data = response.json()
        contract = MissionResponseSerializer(data=data)
        self.assertTrue(contract.is_valid(), contract.errors)
        for field, value in self.payload.items():
            self.assertEqual(data[field], value)
        self.assertEqual(data['timezone'], 'UTC')
        self.assertIs(data['is_placeholder'], False)
        self.assertEqual(len(data['hourly_data']), 24)
        start = datetime(2026, 11, 14, tzinfo=timezone.utc)
        for hour, row in enumerate(data['hourly_data']):
            timestamp = datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00'))
            self.assertEqual(timestamp, start + timedelta(hours=hour))
            self.assertTrue({
                'timestamp', 'energy_balance_wh', 'sun_elevation_deg',
                'sun_azimuth_deg', 'earth_visible',
            }.issubset(row))
            for field in ('energy_balance_wh', 'sun_elevation_deg', 'sun_azimuth_deg', 'earth_visible'):
                self.assertIsNotNone(row[field])
            self.assertTrue(row['earth_visible'])
            self.assertGreater(row['panel_power_w'], 0)
            self.assertGreaterEqual(row['battery_charge_wh'], 0)
            self.assertLessEqual(row['battery_charge_wh'], 1000)

    def test_source_failures_have_explicit_status_codes(self):
        for error, status_code, code in (
            (HorizonsError('Unavailable'), 502, 'ephemeris_unavailable'),
            (HorizonsTimeout('Timeout'), 504, 'ephemeris_timeout'),
            (TerrainConfigurationError('Missing DEM'), 503, 'terrain_unavailable'),
            (TerrainCoverageError('No coverage'), 422, 'terrain_coverage'),
            (DatasetIntegrityError('Changed'), 503, 'dataset_integrity'),
        ):
            with self.subTest(code=code):
                self.ephemeris.geometries.side_effect = error
                response = self.client.post(self.url, self.payload, format='json')
                self.assertEqual(response.status_code, status_code)
                self.assertEqual(response.data['code'], code)

    def test_optional_physics_parameters_are_validated(self):
        for field, value in (
            ('panel_efficiency', 1.1), ('thermal_capacity_j_k', 0),
            ('mast_height_m', -1), ('emissivity', 0),
            ('initial_dust_g_m2', -1), ('panel_area_m2', 'NaN'),
            ('date', '2101-01-01'),
            ('critical_charge_percent', 51), ('minimum_survival_percent', 101),
        ):
            with self.subTest(field=field):
                response = self.client.post(self.url, {**self.payload, field: value}, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_fix_plan_endpoint_validates_response_and_requires_jwt(self):
        url = reverse('mission-fix-plan')
        response = self.client.post(url, self.payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['fix_plan']['status'], 'not_needed')
        contract = FixPlanResponseSerializer(data=response.data)
        self.assertTrue(contract.is_valid(), contract.errors)
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post(url, self.payload, format='json').status_code, 401)

    def test_failed_simulation_runs_bounded_resolver_and_can_disable_it(self):
        self.terrain.horizon_deg.return_value = 40
        response = self.client.post(self.url, {**self.payload, 'initial_charge_percent': 0}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['risk']['is_safe'])
        self.assertEqual(response.data['fix_plan']['status'], 'not_found')
        self.assertLessEqual(len(response.data['fix_plan']['attempts']), 11)
        self.assertIsNone(response.data['fix_plan']['recommendation'])
        contract = MissionResponseSerializer(data=response.data)
        self.assertTrue(contract.is_valid(), contract.errors)
        response = self.client.post(self.url, {
            **self.payload, 'initial_charge_percent': 0, 'auto_resolve': False,
        }, format='json')
        self.assertEqual(response.data['fix_plan']['status'], 'disabled')
        self.assertEqual(response.data['fix_plan']['attempts'], [])

    def test_endpoint_returns_a_validated_safe_haven_after_failed_simulation(self):
        night = SkyGeometry(sun_elevation_deg=-10, sun_azimuth_deg=120,
                            earth_elevation_deg=10, earth_azimuth_deg=45)
        day = SkyGeometry(sun_elevation_deg=60, sun_azimuth_deg=120,
                          earth_elevation_deg=10, earth_azimuth_deg=45)
        self.ephemeris.geometries.side_effect = [[night] * 24, [day] * 24]
        response = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data['risk']['is_safe'])
        plan = response.data['fix_plan']
        self.assertEqual(plan['status'], 'found')
        self.assertEqual(plan['recommendation']['type'], 'safe_haven')
        self.assertTrue(plan['recommendation']['risk']['is_safe'])
        self.assertLessEqual(plan['recommendation']['distance_m'], 1000)
        contract = MissionResponseSerializer(data=response.data)
        self.assertTrue(contract.is_valid(), contract.errors)

    def test_shadow_los_and_battery_deficit(self):
        self.terrain.horizon_deg.return_value = 40
        response = self.client.post(self.url, {
            **self.payload, 'initial_charge_percent': 0, 'power_load_w': 50,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        for row in response.data['hourly_data']:
            self.assertFalse(row['sun_visible'])
            self.assertFalse(row['earth_visible'])
            self.assertEqual(row['energy_balance_wh'], -50)
            self.assertEqual(row['battery_charge_wh'], 0)
            self.assertEqual(row['unserved_energy_wh'], 50)

    def test_energy_accounting_and_overtemperature_warning(self):
        response = self.client.post(self.url, {
            **self.payload, 'panel_area_m2': 10, 'thermal_capacity_j_k': 10,
            'emissivity': 0.1, 'power_load_w': 0,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        previous_charge = 1000
        for row in response.data['hourly_data']:
            self.assertAlmostEqual(
                previous_charge + row['energy_balance_wh'] + row['unserved_energy_wh'],
                row['battery_charge_wh'] + row['spilled_energy_wh'],
            )
            previous_charge = row['battery_charge_wh']
        row = response.data['hourly_data'][-1]
        self.assertGreater(row['temperature_c'], 120)
        self.assertFalse(row['temperature_within_limits'])

    def test_jwt_authentication(self):
        self.client.force_authenticate(user=None)
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
        self.assertEqual(self.client.post(self.url, self.payload, format='json').status_code, 200)

    def test_anonymous_and_invalid_token_requests_are_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertEqual(self.client.post(self.url, self.payload, format='json').status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid')
        self.assertEqual(self.client.post(self.url, self.payload, format='json').status_code, 401)

    def test_required_fields(self):
        for field in self.payload:
            with self.subTest(field=field):
                payload = {key: value for key, value in self.payload.items() if key != field}
                response = self.client.post(self.url, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_invalid_coordinates_and_dates(self):
        for field, value in (
            ('latitude', -90.1), ('latitude', 90.1),
            ('longitude', -180.1), ('longitude', 180.1),
            ('latitude', 'NaN'), ('latitude', 'Infinity'),
            ('longitude', '-Infinity'), ('longitude', 'unknown'),
            ('latitude', None), ('longitude', None),
            ('date', '2026-02-29'), ('date', '2026-13-01'),
            ('date', '14/11/2026'), ('date', '2026-11-14T10:00:00Z'),
            ('date', None),
        ):
            with self.subTest(field=field, value=value):
                response = self.client.post(
                    self.url, {**self.payload, field: value}, format='json',
                )
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)

    def test_coordinate_boundaries_and_leap_day(self):
        for latitude, longitude in ((-90, -180), (90, 180), (0, 0)):
            with self.subTest(latitude=latitude, longitude=longitude):
                response = self.client.post(self.url, {
                    'latitude': latitude, 'longitude': longitude, 'date': '2028-02-29',
                }, format='json')
                self.assertEqual(response.status_code, 200)
                rows = response.data['hourly_data']
                self.assertEqual(rows[0]['timestamp'], '2028-02-29T00:00:00Z')
                self.assertEqual(rows[-1]['timestamp'], '2028-02-29T23:00:00Z')

    def test_unsupported_methods_and_malformed_json(self):
        self.assertEqual(self.client.get(self.url).status_code, 405)
        self.assertEqual(self.client.delete(self.url).status_code, 405)
        response = self.client.post(self.url, '{', content_type='application/json')
        self.assertEqual(response.status_code, 400)


class SimulationProviderTests(SimpleTestCase):
    def test_injected_providers_receive_site_and_utc_times(self):
        geometry = SkyGeometry(
            sun_elevation_deg=10, sun_azimuth_deg=120,
            earth_elevation_deg=5, earth_azimuth_deg=45,
        )
        ephemeris = Mock()
        ephemeris.geometries.return_value = [geometry] * 24
        terrain = Mock()
        terrain.elevation_m.return_value = 100
        terrain.horizon_deg.return_value = 0

        result = simulate_mission(
            latitude=-89, longitude=30, date=date(2026, 11, 14),
            ephemeris=ephemeris, terrain=terrain,
        )

        site = LandingSite(latitude=-89, longitude=30, altitude_m=102)
        ephemeris.geometries.assert_called_once_with(site, [
            datetime(2026, 11, 14, hour, tzinfo=timezone.utc) for hour in range(24)
        ])
        terrain.horizon_deg.assert_any_call(site, 45, 2)
        for azimuth in range(0, 360, 10):
            terrain.horizon_deg.assert_any_call(site, azimuth, 2)
        for row in result['hourly_data']:
            self.assertEqual(row['sun_elevation_deg'], 10)
            self.assertEqual(row['sun_azimuth_deg'], 120)
            self.assertIs(row['earth_visible'], True)
            self.assertIsInstance(row['energy_balance_wh'], float)
