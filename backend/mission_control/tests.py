from django.test import SimpleTestCase, override_settings


@override_settings(ALLOWED_HOSTS=['testserver'])
class LocalFrontendCORSTests(SimpleTestCase):
    def test_local_origins_allow_authorized_api_preflight(self):
        for origin in ('http://localhost:3000', 'http://127.0.0.1:3000'):
            with self.subTest(origin=origin):
                response = self.client.options(
                    '/api/scenarios/',
                    HTTP_ORIGIN=origin,
                    HTTP_ACCESS_CONTROL_REQUEST_METHOD='POST',
                    HTTP_ACCESS_CONTROL_REQUEST_HEADERS='authorization,content-type',
                )
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response['Access-Control-Allow-Origin'], origin)
                self.assertIn('authorization', response['Access-Control-Allow-Headers'])
                self.assertIn('content-type', response['Access-Control-Allow-Headers'])
                self.assertIn('POST', response['Access-Control-Allow-Methods'])

    def test_unlisted_origins_are_not_granted_cors_access(self):
        for origin in ('https://example.com', 'http://localhost:3001'):
            with self.subTest(origin=origin):
                response = self.client.options(
                    '/api/scenarios/',
                    HTTP_ORIGIN=origin,
                    HTTP_ACCESS_CONTROL_REQUEST_METHOD='GET',
                )
                self.assertNotIn('Access-Control-Allow-Origin', response)

    def test_authentication_errors_include_cors_headers(self):
        response = self.client.get(
            '/api/scenarios/', HTTP_ORIGIN='http://localhost:3000',
        )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response['Access-Control-Allow-Origin'], 'http://localhost:3000')
