"""OpenAPI endpoints, with a DRF serializer-based fallback for offline installs.

drf-spectacular is the configured generator when installed. The fallback keeps
docs usable in restricted development environments without pretending to be it.
"""

from django.conf import settings
from django.http import JsonResponse
from django.urls import reverse
from django.views import View
from django.views.generic import TemplateView
from rest_framework import serializers
from rest_framework.schemas.openapi import AutoSchema
from django.db import models

from accounts.serializers import RegistrationSerializer
from mission.response_serializers import FixPlanResponseSerializer, MissionResponseSerializer, SourceErrorSerializer
from mission.serializers import MissionSimulationSerializer
from runs.serializers import SavedScenarioSerializer


class _SerializerMapper(AutoSchema):
    def map_field(self, field):
        if isinstance(field, serializers.JSONField):
            return {}  # JSON results may contain any JSON value, not just objects.
        if isinstance(field, serializers.PrimaryKeyRelatedField) and field.read_only:
            model = field.parent.Meta.model
            key = model._meta.get_field(field.source).related_model._meta.pk
            if isinstance(key, models.IntegerField):
                return {'type': 'integer'}
        schema = super().map_field(field)
        if isinstance(field, (serializers.ListSerializer, serializers.ListField)):
            if field.min_length is not None:
                schema['minItems'] = field.min_length
            if field.max_length is not None:
                schema['maxItems'] = field.max_length
        if isinstance(field, serializers.DictField):
            schema['additionalProperties'] = self.map_field(field.child)
        return schema


def _component(serializer, *, request=False):
    schema = _SerializerMapper().map_serializer(serializer)
    properties = schema['properties']
    for name in list(properties):
        field = serializer.fields[name]
        if (request and field.read_only) or (not request and field.write_only):
            del properties[name]
    schema['required'] = [name for name in schema.get('required', []) if name in properties]
    if not schema['required']:
        del schema['required']
    return schema


def _json_response(schema, description='Success'):
    return {'description': description, 'content': {'application/json': {'schema': schema}}}


def build_fallback_schema():
    components = {
        'MissionRequest': _component(MissionSimulationSerializer(), request=True),
        'MissionResponse': _component(MissionResponseSerializer()),
        'FixPlanResponse': _component(FixPlanResponseSerializer()),
        'SourceError': _component(SourceErrorSerializer()),
        'RegistrationRequest': _component(RegistrationSerializer(), request=True),
        'RegistrationResponse': _component(RegistrationSerializer()),
        'SavedScenarioRequest': _component(SavedScenarioSerializer(), request=True),
        'SavedScenarioResponse': _component(SavedScenarioSerializer()),
        'TokenRequest': {
            'type': 'object', 'required': ['username', 'password'],
            'properties': {'username': {'type': 'string'}, 'password': {'type': 'string', 'writeOnly': True}},
        },
        'TokenPair': {
            'type': 'object', 'required': ['access', 'refresh'],
            'properties': {'access': {'type': 'string'}, 'refresh': {'type': 'string'}},
        },
        'RefreshRequest': {'type': 'object', 'required': ['refresh'], 'properties': {'refresh': {'type': 'string'}}},
        'AccessToken': {'type': 'object', 'required': ['access'], 'properties': {'access': {'type': 'string'}}},
    }
    reference = lambda name: {'$ref': f'#/components/schemas/{name}'}
    paths = {}

    def operation(operation_id, tag, description, *, request=None, response=None, status='200', public=False):
        value = {
            'operationId': operation_id, 'tags': [tag], 'description': description,
            'security': [] if public else [{'jwtAuth': []}],
            'responses': {status: _json_response(reference(response)) if response else {'description': 'Deleted'}},
        }
        if request:
            value['requestBody'] = {'required': True, 'content': {'application/json': {'schema': reference(request)}}}
            value['responses']['400'] = {'description': 'Input validation failed; field names map to error lists.'}
        if not public or tag == 'Authentication':
            value['responses']['401'] = {'description': 'Missing/invalid credentials or token.'}
        return value

    paths['/api/auth/register/'] = {'post': operation(
        'auth_register', 'Authentication', 'Register username, unique email and a validated password.',
        request='RegistrationRequest', response='RegistrationResponse', status='201', public=True,
    )}
    paths['/api/auth/token/'] = {'post': operation(
        'auth_token', 'Authentication', 'Obtain a JWT pair with username and password.',
        request='TokenRequest', response='TokenPair', public=True,
    )}
    paths['/api/auth/token/refresh/'] = {'post': operation(
        'auth_token_refresh', 'Authentication', 'Obtain an access token using a refresh token.',
        request='RefreshRequest', response='AccessToken', public=True,
    )}
    for path, operation_id, tag, response in (
        ('/api/mission/', 'mission_simulate', 'Mission', 'MissionResponse'),
        ('/api/mission/fix-plan/', 'mission_fix_plan', 'Fix Plan', 'FixPlanResponse'),
    ):
        value = operation(
            operation_id, tag,
            '1–168-hour simulation (duration_hours, default 24) and bounded recovery search. Safe havens are within 1 km; alternative windows are +1/+3/+7 days. '
            'Survival is a safe-hour fraction, not a probability; transit and waiting survival are not simulated.',
            request='MissionRequest', response=response,
        )
        if response == 'MissionResponse':
            value['description'] += (
                ' Returns duration_hours consecutive samples including sun_azimuth_deg and earth_azimuth_deg, plus a static '
                '36-point horizon_profile with azimuth_deg and elevation_deg, sampled every 10 degrees. '
                'model.data_mode identifies synthetic-v1, external or injected sources.'
            )
        value['description'] += (
            ' disaster_mode (alias worst_case_override) injects solar-storm-v1, disables noncritical loads '
            'and forces bounded recovery search with stricter reserves even if auto_resolve=false. '
            'threat_status describes a manual stress test, not an observed event or JPL impact forecast.'
        )
        value['responses']['429'] = {
            **_json_response({'type': 'object', 'required': ['detail'], 'properties': {'detail': {'type': 'string'}}},
                             'Optional account request limit exceeded.'),
            'headers': {'Retry-After': {'description': 'Seconds until another request may be attempted.', 'schema': {'type': 'integer'}}},
        }
        for status, description in (
            ('422', 'Insufficient terrain coverage or NoData.'),
            ('502', 'Horizons upstream error.'), ('503', 'Missing/invalid dataset or SHA-256 failure.'),
            ('504', 'Horizons timeout.'),
        ):
            value['responses'][status] = _json_response(reference('SourceError'), description)
        paths[path] = {'post': value}
    page = {
        'type': 'object', 'required': ['count', 'next', 'previous', 'results'],
        'properties': {
            'count': {'type': 'integer', 'minimum': 0},
            'next': {'type': 'string', 'format': 'uri', 'nullable': True},
            'previous': {'type': 'string', 'format': 'uri', 'nullable': True},
            'results': {'type': 'array', 'maxItems': 50, 'items': reference('SavedScenarioResponse')},
        },
    }
    for prefix in ('runs', 'scenarios'):
        collection, detail = f'/api/{prefix}/', f'/api/{prefix}/{{id}}/'
        listing = operation(f'{prefix}_list', 'Runs', 'Own scenarios, newest first; at most 50 records per page.')
        listing['responses']['200'] = _json_response(page)
        listing['parameters'] = [
            {'name': 'page', 'in': 'query', 'schema': {'type': 'integer', 'minimum': 1}},
            {'name': 'page_size', 'in': 'query', 'schema': {'type': 'integer', 'minimum': 1, 'maximum': 50}},
        ]
        listing['responses']['404'] = {'description': 'Page does not exist.'}
        paths[collection] = {
            'get': listing,
            'post': operation(f'{prefix}_create', 'Runs', 'Save a scenario; owner is assigned from JWT.',
                              request='SavedScenarioRequest', response='SavedScenarioResponse', status='201'),
        }
        paths[detail] = {}
        for method in ('get', 'delete'):
            value = operation(
                f'{prefix}_{"retrieve" if method == "get" else "destroy"}', 'Runs',
                'Owned records only. Foreign scenario IDs return 404.',
                response='SavedScenarioResponse' if method == 'get' else None,
                status='200' if method == 'get' else '204',
            )
            value['parameters'] = [{'name': 'id', 'in': 'path', 'required': True, 'schema': {'type': 'integer'}}]
            value['responses']['404'] = {'description': 'Scenario not found or belongs to another user.'}
            paths[detail][method] = value
    return {
        'openapi': '3.0.3',
        'info': {'title': 'Last Light API', 'version': '1.1.0', 'description': 'Lunar mission engineering simulations and private history.'},
        'paths': paths,
        'components': {'schemas': components, 'securitySchemes': {
            'jwtAuth': {'type': 'http', 'scheme': 'bearer', 'bearerFormat': 'JWT'},
        }},
    }


def validate_contract_structure(schema):
    """Local contract checks; full OpenAPI validation is provided by spectacular."""
    identifiers = set()
    assert schema['openapi'].startswith('3.0.')
    assert schema['info']['title']
    for path, operations in schema['paths'].items():
        assert path.startswith('/')
        for operation in operations.values():
            identifier = operation['operationId']
            assert identifier not in identifiers, f'Duplicate operationId: {identifier}'
            identifiers.add(identifier)
            assert operation['responses']
            for response in operation['responses'].values():
                assert isinstance(response['description'], str)

    def visit(node):
        if isinstance(node, dict):
            if '$ref' in node:
                assert node['$ref'].startswith('#/')
                target = schema
                for part in node['$ref'][2:].split('/'):
                    target = target[part]
            if node.get('type') == 'object':
                assert set(node.get('required', [])).issubset(node.get('properties', {}))
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
    visit(schema)


if settings.HAS_SPECTACULAR:
    from drf_spectacular.views import (
        SpectacularAPIView as SchemaView,
        SpectacularRedocView as RedocView,
        SpectacularSwaggerView as SwaggerView,
    )
else:
    class SchemaView(View):
        def get(self, request):
            return JsonResponse(build_fallback_schema())

    class SwaggerView(TemplateView):
        template_name = 'mission/swagger.html'
        url_name = 'schema'

        def get_context_data(self, **kwargs):
            return {**super().get_context_data(**kwargs), 'schema_url': reverse(self.url_name)}

    class RedocView(SwaggerView):
        template_name = 'mission/redoc.html'
