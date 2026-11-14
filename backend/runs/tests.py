from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase

from .models import SavedScenario


class SavedScenarioAPITests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.user = get_user_model().objects.create_user(
            username='commander', email='commander@example.com',
        )
        cls.other = get_user_model().objects.create_user(
            username='pilot', email='pilot@example.com',
        )
        cls.own = SavedScenario.objects.create(
            user=cls.user, battery_capacity_wh=1000, mast_height_m=2,
        )
        cls.foreign = SavedScenario.objects.create(
            user=cls.other, battery_capacity_wh=500, mast_height_m=1,
        )

    def setUp(self):
        self.client.force_authenticate(self.user)
        self.url = reverse('scenario-list')
        self.payload = {
            'name': 'South pole', 'battery_capacity_wh': 1200,
            'initial_charge_percent': 90, 'mast_height_m': 3,
            'worst_case_mode': True, 'results': {'risk': 0.4},
        }

    def test_anonymous_access_is_rejected(self):
        self.client.force_authenticate(user=None)
        detail = reverse('scenario-detail', args=[self.own.pk])
        for response in (
            self.client.get(self.url),
            self.client.post(self.url, self.payload, format='json'),
            self.client.get(detail),
            self.client.delete(detail),
        ):
            self.assertEqual(response.status_code, 401)

    def test_create_assigns_authenticated_owner_and_preserves_results(self):
        self.payload['user'] = self.other.pk
        response = self.client.post(self.url, self.payload, format='json')
        self.assertEqual(response.status_code, 201)
        scenario = SavedScenario.objects.get(pk=response.data['id'])
        self.assertEqual(scenario.user, self.user)
        self.assertEqual(scenario.results, {'risk': 0.4})

    def test_list_contains_only_own_scenarios(self):
        response = self.client.get(self.url, {'user': self.other.pk})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 1)
        self.assertEqual(response.data['results'][0]['id'], self.own.pk)

    def test_pagination_never_exceeds_50_and_allows_older_records(self):
        SavedScenario.objects.bulk_create([
            SavedScenario(user=self.user, battery_capacity_wh=100, mast_height_m=1)
            for _ in range(50)
        ])
        response = self.client.get(self.url, {'page_size': 1000})
        self.assertEqual(response.data['count'], 51)
        self.assertEqual(len(response.data['results']), 50)
        self.assertIsNotNone(response.data['next'])
        response = self.client.get(self.url, {'page': 2})
        self.assertEqual([item['id'] for item in response.data['results']], [self.own.pk])

    def test_other_users_scenario_is_hidden_and_cannot_be_deleted(self):
        detail = reverse('scenario-detail', args=[self.foreign.pk])
        self.assertEqual(self.client.get(detail).status_code, 404)
        self.assertEqual(self.client.delete(detail).status_code, 404)
        self.assertTrue(SavedScenario.objects.filter(pk=self.foreign.pk).exists())

    def test_retrieve_and_delete_own_scenario(self):
        detail = reverse('scenario-detail', args=[self.own.pk])
        self.assertEqual(self.client.get(detail).status_code, 200)
        self.assertEqual(self.client.delete(detail).status_code, 204)
        self.assertFalse(SavedScenario.objects.filter(pk=self.own.pk).exists())

    def test_updates_are_disabled(self):
        detail = reverse('scenario-detail', args=[self.own.pk])
        self.assertEqual(self.client.patch(detail, {'name': 'Changed'}).status_code, 405)
        self.assertEqual(self.client.put(detail, self.payload, format='json').status_code, 405)

    def test_invalid_parameters_are_rejected(self):
        for field, value in (
            ('battery_capacity_wh', -1), ('initial_charge_percent', 101),
            ('mast_height_m', -1), ('mast_height_m', 'NaN'),
            ('battery_capacity_wh', 'Infinity'),
        ):
            with self.subTest(field=field, value=value):
                payload = {**self.payload, field: value}
                response = self.client.post(self.url, payload, format='json')
                self.assertEqual(response.status_code, 400)
                self.assertIn(field, response.data)
