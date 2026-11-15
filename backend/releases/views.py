import math

from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from mission.errors import HorizonsError, HorizonsTimeout, TerrainConfigurationError, TerrainCoverageError
from mission.throttles import MissionUserThrottle
from mission_control.schema_tools import extend_schema

from .models import DataRelease
from .point_site import build_point_site


class LatestReleaseView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        tags=['Datasets'],
        description='The most recently loaded data release: sites, provenance and validation in the frontend contract.',
        responses={200: {'type': 'object'}, 404: {'description': 'No data release has been loaded.'}},
    )
    def get(self, request):
        release = DataRelease.objects.first()
        if release is None:
            raise Http404('No data release has been loaded.')
        return Response(release.as_dataset())


class ReleaseDetailView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @extend_schema(
        tags=['Datasets'],
        description='A data release by datasetId.',
        responses={200: {'type': 'object'}, 404: {'description': 'Unknown datasetId.'}},
    )
    def get(self, request, dataset_id):
        release = DataRelease.objects.filter(dataset_id=dataset_id).first()
        if release is None:
            raise Http404('Unknown datasetId.')
        return Response(release.as_dataset())


def _coordinate(raw, low, high):
    try:
        value = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(value) or not low <= value <= high:
        return None
    return value


class PointSiteView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []
    throttle_classes = [MissionUserThrottle]

    @extend_schema(
        tags=['Datasets'],
        description=(
            'A site for arbitrary coordinates in the frontend contract, aligned to the window of the given release: '
            'horizon profiles for 2, 5 and 10 m masts every 10 degrees and hourly Sun and Earth geometry. '
            'dataMode tells whether JPL Horizons and LOLA or the synthetic-v1 demo providers were used.'
        ),
        responses={
            200: {'type': 'object'},
            400: {'description': 'lat must be in [-90, 90] and lon in [-180, 180].'},
            404: {'description': 'Unknown datasetId.'},
            422: {'description': 'The point is outside the terrain coverage.'},
            502: {'description': 'Ephemeris source failed or returned an invalid window.'},
            503: {'description': 'Terrain source is not configured.'},
            504: {'description': 'Ephemeris source timed out.'},
        },
    )
    def get(self, request, dataset_id):
        release = DataRelease.objects.filter(dataset_id=dataset_id).first()
        if release is None:
            raise Http404('Unknown datasetId.')
        latitude = _coordinate(request.query_params.get('lat'), -90, 90)
        longitude = _coordinate(request.query_params.get('lon'), -180, 180)
        errors = {}
        if latitude is None:
            errors['lat'] = 'Enter a latitude from -90 to 90.'
        if longitude is None:
            errors['lon'] = 'Enter a longitude from -180 to 180.'
        if errors:
            return Response(errors, status=400)
        try:
            return Response(build_point_site(release, latitude, longitude))
        except TerrainCoverageError as exc:
            return Response({'detail': str(exc), 'code': 'terrain_coverage'}, status=422)
        except TerrainConfigurationError as exc:
            return Response({'detail': str(exc), 'code': 'terrain_unavailable'}, status=503)
        except HorizonsTimeout as exc:
            return Response({'detail': str(exc), 'code': 'ephemeris_timeout'}, status=504)
        except (HorizonsError, ValueError) as exc:
            return Response({'detail': str(exc), 'code': 'ephemeris_unavailable'}, status=502)
