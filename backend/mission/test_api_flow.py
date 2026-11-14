from django.test import override_settings
from rest_framework.test import APITestCase


@override_settings(MISSION_DATA_MODE='synthetic-v1', MISSION_THROTTLE_ENABLED=False)
class CompleteMissionAPITests(APITestCase):
    def register_and_login(self, username):
        credentials = {'username': username, 'password': 'Lunar-route-7296!'}
        response = self.client.post('/api/auth/register/', {**credentials, 'email': f'{username}@example.com'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertNotIn('password', response.data)
        response = self.client.post('/api/auth/token/', credentials, format='json')
        self.assertEqual(response.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {response.data['access']}")
        return response.data

    def test_register_simulate_week_save_restore_refresh_and_owner_isolation(self):
        self.assertEqual(self.client.post('/api/mission/', {}, format='json').status_code, 401)
        owner = self.register_and_login('mission-owner')
        inputs = {'latitude': -89.5, 'longitude': 32, 'date': '2026-11-15',
                  'duration_hours': 168, 'auto_resolve': False}
        response = self.client.post('/api/mission/', inputs, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        result = response.json()
        self.assertEqual(len(result['hourly_data']), 168)
        saved = self.client.post('/api/runs/', {
            'name': 'Seven-day mission', 'battery_capacity_wh': 1000,
            'initial_charge_percent': 100, 'mast_height_m': 2,
            'results': {'version': 1, 'request': inputs, 'response': result},
        }, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        detail = f"/api/runs/{saved.data['id']}/"
        self.assertEqual(self.client.get('/api/runs/').data['count'], 1)
        self.assertEqual(self.client.get(detail).json()['results']['response'], result)
        self.client.credentials()
        self.register_and_login('other-mission-owner')
        self.assertEqual(self.client.get('/api/runs/').data['count'], 0)
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.assertEqual(self.client.delete(detail).status_code, 404)
        self.client.credentials()
        refreshed = self.client.post('/api/auth/token/refresh/', {'refresh': owner['refresh']}, format='json')
        self.assertEqual(refreshed.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refreshed.data['access']}")
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertEqual(self.client.get('/api/runs/').data['count'], 0)
