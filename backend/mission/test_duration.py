from copy import deepcopy
from datetime import datetime, timedelta
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import override_settings
from rest_framework.test import APITestCase

from .response_serializers import MissionResponseSerializer
from .services import simulate_mission


@override_settings(MISSION_DATA_MODE='synthetic-v1', MISSION_THROTTLE_ENABLED=False)
class MissionDurationTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(username='week')

    def setUp(self):
        self.client.force_authenticate(self.user)
        self.body = dict(latitude=-89, longitude=32, date='2026-11-15',
                         duration_hours=168, auto_resolve=False)

    def test_week_is_continuous_and_retains_battery_state_across_midnight(self):
        response = self.client.post('/api/mission/', {
            **self.body, 'panel_area_m2': 0, 'battery_capacity_wh': 10000,
            'power_load_w': 10,
        }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        data = response.json()
        self.assertEqual(data['duration_hours'], 168)
        self.assertEqual(len(data['hourly_data']), 168)
        start = datetime.fromisoformat('2026-11-15T00:00:00+00:00')
        for index, row in enumerate(data['hourly_data']):
            self.assertEqual(datetime.fromisoformat(row['timestamp'].replace('Z', '+00:00')), start + timedelta(hours=index))
            self.assertAlmostEqual(row['battery_charge_wh'], 10000 - 10 * (index + 1))
        bad = deepcopy(data)
        bad['hourly_data'][24]['timestamp'] = bad['hourly_data'][0]['timestamp']
        self.assertFalse(MissionResponseSerializer(data=bad).is_valid())
        bad = deepcopy(data)
        bad['hourly_data'].pop()
        self.assertFalse(MissionResponseSerializer(data=bad).is_valid())

    def test_invalid_duration_is_rejected_before_computation(self):
        for value in (0, -1, 169, 1.5, 'week'):
            with self.subTest(value=value), patch('mission.views.run_mission') as run:
                response = self.client.post('/api/mission/', {**self.body, 'duration_hours': value}, format='json')
                self.assertEqual(response.status_code, 400)
                run.assert_not_called()
        response = self.client.post('/api/mission/', {**self.body, 'date': '2100-12-31'}, format='json')
        self.assertEqual(response.status_code, 400)

    def test_existing_clients_keep_a_day_and_recovery_candidates_keep_a_week(self):
        body = {key: value for key, value in self.body.items() if key != 'duration_hours'}
        self.assertEqual(len(self.client.post('/api/mission/', body, format='json').data['hourly_data']), 24)
        with patch('mission.orchestration.simulate_mission', wraps=simulate_mission) as run:
            response = self.client.post('/api/mission/fix-plan/', {
                **self.body, 'panel_area_m2': 0, 'battery_capacity_wh': 1,
            }, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertGreater(run.call_count, 1)
        self.assertTrue(all(call.kwargs['duration_hours'] == 168 for call in run.call_args_list))
