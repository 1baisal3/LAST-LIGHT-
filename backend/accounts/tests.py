from django.contrib.auth import get_user_model
from django.urls import reverse
from rest_framework.test import APITestCase


class AuthenticationAPITests(APITestCase):
    def setUp(self):
        self.payload = {
            'username': 'commander', 'email': 'crew@example.com',
            'password': 'Lunar!Orbit-9284-Risk',
        }

    def test_registration_hashes_password_and_ignores_privilege_fields(self):
        response = self.client.post(
            reverse('register'),
            {**self.payload, 'is_staff': True, 'is_superuser': True},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        self.assertNotIn('password', response.data)
        user = get_user_model().objects.get(username=self.payload['username'])
        self.assertTrue(user.check_password(self.payload['password']))
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)

    def test_registration_validates_password_email_and_required_fields(self):
        for patch in ({'password': '123'}, {'email': 'bad'}, {'email': ''}, {'username': ''}):
            with self.subTest(patch=patch):
                response = self.client.post(reverse('register'), {**self.payload, **patch})
                self.assertEqual(response.status_code, 400)
        self.assertFalse(get_user_model().objects.exists())

    def test_duplicate_email_and_username_are_rejected(self):
        get_user_model().objects.create_user(**self.payload)
        for patch, field in (({'username': 'pilot'}, 'email'), ({'email': 'other@example.com'}, 'username')):
            response = self.client.post(reverse('register'), {**self.payload, **patch})
            self.assertEqual(response.status_code, 400)
            self.assertIn(field, response.data)

    def test_registration_login_refresh_and_authenticated_request(self):
        self.assertEqual(self.client.post(reverse('register'), self.payload).status_code, 201)
        response = self.client.post(reverse('token_obtain_pair'), {
            'username': self.payload['username'], 'password': self.payload['password'],
        })
        self.assertEqual(response.status_code, 200)
        refresh = self.client.post(reverse('token_refresh'), {'refresh': response.data['refresh']})
        self.assertEqual(refresh.status_code, 200)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {refresh.data['access']}")
        self.assertEqual(self.client.get(reverse('scenario-list')).status_code, 200)

    def test_wrong_password_and_invalid_tokens_are_rejected(self):
        get_user_model().objects.create_user(**self.payload)
        response = self.client.post(reverse('token_obtain_pair'), {
            'username': self.payload['username'], 'password': 'incorrect',
        })
        self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.post(reverse('token_refresh'), {'refresh': 'invalid'}).status_code, 401)
        self.client.credentials(HTTP_AUTHORIZATION='Bearer invalid')
        self.assertEqual(self.client.get(reverse('scenario-list')).status_code, 401)
