import math
from copy import deepcopy
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import override_settings
from django.urls import reverse
from rest_framework.test import APITestCase

from .response_serializers import HourlySampleSerializer, MissionResponseSerializer


@override_settings(MISSION_DATA_MODE='synthetic-v1', MISSION_THROTTLE_ENABLED=False)
class MissionContractTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='contract', email='contract@example.com')

    def setUp(self):
        self.client.force_authenticate(self.user)
        self.payload = {'latitude': -89, 'longitude': 32, 'date': '2026-11-14', 'auto_resolve': False}

    def simulate(self):
        response = self.client.post(reverse('mission-simulation'), self.payload, format='json')
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_complete_response_and_azimuth_contract(self):
        data = self.simulate()
        self.assertEqual(set(data), set(MissionResponseSerializer().fields))
        contract = MissionResponseSerializer(data=data)
        self.assertTrue(contract.is_valid(), contract.errors)
        self.assertEqual(len(data['hourly_data']), 24)
        for row in data['hourly_data']:
            self.assertEqual(set(row), set(HourlySampleSerializer().fields))
            for field in ('sun_azimuth_deg', 'earth_azimuth_deg'):
                self.assertIsInstance(row[field], (int, float))
                self.assertTrue(math.isfinite(row[field]))
                self.assertGreaterEqual(row[field], 0)
                self.assertLess(row[field], 360)

    def test_profile_covers_full_circle_in_sorted_degree_samples(self):
        profile = self.simulate()['horizon_profile']
        self.assertEqual(len(profile), 36)
        self.assertEqual([point['azimuth_deg'] for point in profile], list(range(0, 360, 10)))
        for point in profile:
            self.assertEqual(set(point), {'azimuth_deg', 'elevation_deg'})
            self.assertTrue(math.isfinite(point['elevation_deg']))
            self.assertGreaterEqual(point['elevation_deg'], -90)
            self.assertLessEqual(point['elevation_deg'], 90)
        # Featureless synthetic sphere: raising the observer lowers the limb.
        base = profile[0]['elevation_deg']
        self.payload['mast_height_m'] = 20
        self.assertLess(self.simulate()['horizon_profile'][0]['elevation_deg'], base)

    def test_serializer_rejects_missing_duplicate_and_nonfinite_contract_values(self):
        valid = self.simulate()
        invalid = []
        missing = deepcopy(valid)
        del missing['horizon_profile']
        invalid.append(missing)
        duplicate = deepcopy(valid)
        duplicate['horizon_profile'][1]['azimuth_deg'] = 0
        invalid.append(duplicate)
        short = deepcopy(valid)
        short['horizon_profile'].pop()
        invalid.append(short)
        for field in ('sun_azimuth_deg', 'earth_azimuth_deg'):
            for value in (None, float('nan'), 360, -1):
                bad = deepcopy(valid)
                bad['hourly_data'][0][field] = value
                invalid.append(bad)
        bad = deepcopy(valid)
        bad['horizon_profile'][0]['elevation_deg'] = float('inf')
        invalid.append(bad)
        for index, body in enumerate(invalid):
            with self.subTest(case=index):
                self.assertFalse(MissionResponseSerializer(data=body).is_valid())

    def test_runtime_contract_validation_does_not_return_invalid_success(self):
        invalid = self.simulate()
        del invalid['horizon_profile']
        with patch('mission.views.run_mission', return_value=invalid), self.assertLogs('mission.views', level='ERROR'):
            response = self.client.post(reverse('mission-simulation'), self.payload, format='json')
        self.assertEqual(response.status_code, 500)
        self.assertNotIn('hourly_data', response.data)

    def test_synthetic_mode_is_deterministic_and_does_not_touch_external_sources(self):
        with patch('mission.orchestration.JPLHorizonsProvider') as jpl, patch('mission.orchestration.LOLATerrainProvider') as lola:
            first = self.simulate()
            self.assertEqual(first, self.simulate())
        jpl.assert_not_called()
        lola.assert_not_called()
        self.assertTrue(first['is_placeholder'])
        self.assertEqual(first['model']['data_mode'], 'synthetic-v1')
        self.assertIsNone(first['model']['terrain_sha256'])
        self.assertEqual(first['model']['ephemeris_sha256'], [])

    @override_settings(MISSION_DATA_MODE='auto', LOLA_DEM_PATH='')
    def test_auto_uses_synthetic_only_when_no_dem_is_configured(self):
        self.assertEqual(self.simulate()['model']['data_mode'], 'synthetic-v1')

    @override_settings(MISSION_DATA_MODE='auto', LOLA_DEM_PATH='/missing/lola.tif')
    def test_configured_bad_dem_is_not_replaced_by_synthetic_data(self):
        response = self.client.post(reverse('mission-simulation'), self.payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'terrain_unavailable')

    @override_settings(MISSION_DATA_MODE='external', LOLA_DEM_PATH='')
    def test_external_mode_requires_a_real_dem(self):
        response = self.client.post(reverse('mission-simulation'), self.payload, format='json')
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data['code'], 'terrain_unavailable')


@override_settings(MISSION_DATA_MODE='synthetic-v1', MISSION_THROTTLE_ENABLED=True, MISSION_THROTTLE_RATE='1/min')
class MissionThrottleTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.first = get_user_model().objects.create_user(username='quota-first', email='first@example.com')
        cls.second = get_user_model().objects.create_user(username='quota-second', email='second@example.com')

    def setUp(self):
        cache.clear()
        self.addCleanup(cache.clear)
        self.client.force_authenticate(self.first)
        self.payload = {'latitude': 0, 'longitude': 0, 'date': '2026-11-14', 'auto_resolve': False}

    def post(self, name='mission-simulation'):
        return self.client.post(reverse(name), self.payload, format='json')

    def test_limit_blocks_before_simulation_and_returns_retry_after(self):
        self.assertEqual(self.post().status_code, 200)
        with patch('mission.views.run_mission') as compute:
            response = self.post()
        self.assertEqual(response.status_code, 429)
        self.assertGreater(int(response['Retry-After']), 0)
        compute.assert_not_called()

    def test_fix_plan_shares_the_same_account_budget(self):
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.post('mission-fix-plan').status_code, 429)

    def test_users_have_independent_budgets_and_docs_remain_available(self):
        self.assertEqual(self.post().status_code, 200)
        self.client.force_authenticate(self.second)
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.client.get(reverse('swagger-ui')).status_code, 200)

    @override_settings(MISSION_THROTTLE_ENABLED=False)
    def test_disabled_throttling_does_not_apply_a_limit(self):
        self.assertEqual(self.post().status_code, 200)
        self.assertEqual(self.post().status_code, 200)

    def test_budget_expires_after_the_window(self):
        with patch('mission.throttles.MissionUserThrottle.timer', return_value=100):
            self.assertEqual(self.post().status_code, 200)
            self.assertEqual(self.post().status_code, 429)
        with patch('mission.throttles.MissionUserThrottle.timer', return_value=161):
            self.assertEqual(self.post().status_code, 200)
