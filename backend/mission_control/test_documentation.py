from django.conf import settings
from django.test import SimpleTestCase
from django.urls import resolve, reverse

from .documentation import build_fallback_schema, validate_contract_structure


class DocumentationTests(SimpleTestCase):
    def test_schema_and_both_documentation_pages_are_public(self):
        for name in ('swagger-ui', 'redoc'):
            response = self.client.get(reverse(name))
            self.assertEqual(response.status_code, 200)
            self.assertContains(response, reverse('schema'))
        response = self.client.get(reverse('schema'), HTTP_ACCEPT='application/json')
        self.assertEqual(response.status_code, 200)
        schema = response.json()
        self.assertEqual(schema['info']['title'], 'Last Light API')
        self.assertIn('/api/mission/', schema['paths'])
        self.assertIn('/api/mission/fix-plan/', schema['paths'])
        self.assertIn('/api/runs/', schema['paths'])

    def test_contract_structure_references_and_documented_routes_are_valid(self):
        schema = build_fallback_schema()
        validate_contract_structure(schema)
        for path, operations in schema['paths'].items():
            match = resolve(path.replace('{id}', '1'))
            for method in operations:
                if hasattr(match.func, 'actions'):
                    self.assertIn(method, match.func.actions)
                else:
                    self.assertTrue(hasattr(match.func.view_class, method))

    def test_jwt_security_public_authentication_and_private_scenarios(self):
        schema = build_fallback_schema()
        self.assertEqual(schema['components']['securitySchemes']['jwtAuth']['scheme'], 'bearer')
        for path, operations in schema['paths'].items():
            for operation in operations.values():
                expected = [] if '/auth/' in path else [{'jwtAuth': []}]
                self.assertEqual(operation['security'], expected)

    def test_request_and_response_fields_capture_simulation_and_fix_plan(self):
        schemas = build_fallback_schema()['components']['schemas']
        request = schemas['MissionRequest']
        self.assertEqual(set(request['required']), {'latitude', 'longitude', 'date'})
        self.assertEqual(request['properties']['latitude']['minimum'], -90)
        self.assertEqual(request['properties']['longitude']['maximum'], 180)
        self.assertIn('auto_resolve', request['properties'])
        response = schemas['MissionResponse']['properties']
        self.assertEqual(response['hourly_data']['minItems'], 24)
        self.assertEqual(response['hourly_data']['maxItems'], 24)
        self.assertIn('risk', response)
        plan = response['fix_plan']['properties']
        self.assertIn('found', plan['status']['enum'])
        self.assertTrue(plan['recommendation']['nullable'])
        self.assertEqual(plan['recommendation']['properties']['distance_m']['maximum'], 1000)

    def test_active_openapi_exposes_full_mission_contract_to_swagger(self):
        schema = self.client.get(reverse('schema'), HTTP_ACCEPT='application/json').json()

        def dereference(node):
            while '$ref' in node:
                target = schema
                for part in node['$ref'][2:].split('/'):
                    target = target[part]
                node = target
            return node

        operation = schema['paths']['/api/mission/']['post']
        request = dereference(operation['requestBody']['content']['application/json']['schema'])
        self.assertTrue({'latitude', 'longitude', 'date'}.issubset(request['properties']))
        self.assertIn('disaster_mode', request['properties'])
        self.assertIn('worst_case_override', request['properties'])
        response = dereference(operation['responses']['200']['content']['application/json']['schema'])
        self.assertIn('horizon_profile', response['required'])
        self.assertIn('threat_status', response['required'])
        threat = dereference(response['properties']['threat_status'])
        self.assertIn('source', threat['properties'])
        self.assertIn('panel_damage_rate_per_hour', threat['properties'])
        profile = response['properties']['horizon_profile']
        self.assertEqual(profile['minItems'], 36)
        self.assertEqual(profile['maxItems'], 36)
        self.assertEqual(set(dereference(profile['items'])['properties']), {'azimuth_deg', 'elevation_deg'})
        hourly = dereference(response['properties']['hourly_data']['items'])
        for field in ('sun_azimuth_deg', 'earth_azimuth_deg'):
            self.assertIn(field, hourly['required'])
            self.assertEqual(hourly['properties'][field]['type'], 'number')
        for field in ('communications_available', 'communications_blackout', 'panel_health_factor', 'effective_power_load_w'):
            self.assertIn(field, hourly['required'])
        self.assertIn('429', operation['responses'])
        self.assertContains(self.client.get(reverse('swagger-ui')), reverse('schema'))

    def test_history_schema_preserves_owner_and_password_boundaries(self):
        schemas = build_fallback_schema()['components']['schemas']
        self.assertNotIn('user', schemas['SavedScenarioRequest']['properties'])
        self.assertEqual(schemas['SavedScenarioResponse']['properties']['user']['type'], 'integer')
        self.assertNotIn('password', schemas['RegistrationResponse']['properties'])
        self.assertTrue(schemas['RegistrationRequest']['properties']['password']['writeOnly'])
        response = build_fallback_schema()['paths']['/api/runs/']['get']['responses']['200']
        self.assertEqual(response['content']['application/json']['schema']['properties']['results']['maxItems'], 50)

    def test_invalid_schema_reference_and_duplicate_operation_id_are_detected(self):
        schema = build_fallback_schema()
        schema['paths']['/api/mission/']['post']['responses']['200'] = {
            'description': 'bad', 'content': {'application/json': {'schema': {'$ref': '#/missing'}}},
        }
        with self.assertRaises(KeyError):
            validate_contract_structure(schema)
        schema = build_fallback_schema()
        schema['paths']['/api/mission/']['post']['operationId'] = schema['paths']['/api/runs/']['get']['operationId']
        with self.assertRaises(AssertionError):
            validate_contract_structure(schema)

    def test_configured_generator_validates_schema_when_installed(self):
        if settings.HAS_SPECTACULAR:
            from drf_spectacular.generators import SchemaGenerator
            from drf_spectacular.validation import validate_schema
            validate_schema(SchemaGenerator().get_schema(request=None, public=True))
        else:
            # Validate the active offline contract; this is not full OpenAPI meta-validation.
            validate_contract_structure(build_fallback_schema())
