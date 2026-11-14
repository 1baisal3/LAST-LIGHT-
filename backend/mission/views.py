from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import APIException
import logging

from .errors import HorizonsError, HorizonsTimeout, TerrainConfigurationError, TerrainCoverageError
from datasets.integrity import DatasetIntegrityError
from .serializers import MissionSimulationSerializer
from .orchestration import run_mission
from .response_serializers import FixPlanResponseSerializer, MissionResponseSerializer, SourceErrorSerializer, ThrottleErrorSerializer
from mission_control.schema_tools import extend_schema
from .throttles import MissionUserThrottle

logger = logging.getLogger(__name__)


class MissionSimulationView(APIView):
    permission_classes = [IsAuthenticated]
    throttle_classes = [MissionUserThrottle]
    fix_plan_only = False

    @extend_schema(
        tags=['Mission'], request=MissionSimulationSerializer,
        responses={200: MissionResponseSerializer, 400: {'description': 'Invalid simulation input.'},
                   401: {'description': 'JWT authentication required.'},
                   422: SourceErrorSerializer, 429: ThrottleErrorSerializer, 502: SourceErrorSerializer,
                   503: SourceErrorSerializer, 504: SourceErrorSerializer},
        description='Simulate 1–168 continuous hourly intervals (duration_hours, default 24), including Sun/Earth azimuths and a 36-point horizon_profile. Seven-day clients send duration_hours=168. disaster_mode injects a manual solar-storm-v1 stress test and forces bounded Fix Plan with stricter reserves. Source mode is selected by the server. Optional throttling returns 429 with Retry-After.',
    )
    def post(self, request):
        serializer = MissionSimulationSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            options = dict(serializer.validated_data)
            if self.fix_plan_only:
                options['auto_resolve'] = True
            result = run_mission(**options)
        except DatasetIntegrityError as exc:
            return Response({'detail': str(exc), 'code': 'dataset_integrity'}, status=503)
        except HorizonsTimeout as exc:
            return Response({'detail': str(exc), 'code': 'ephemeris_timeout'}, status=504)
        except HorizonsError as exc:
            return Response({'detail': str(exc), 'code': 'ephemeris_unavailable'}, status=502)
        except TerrainConfigurationError as exc:
            return Response({'detail': str(exc), 'code': 'terrain_unavailable'}, status=503)
        except TerrainCoverageError as exc:
            return Response({'detail': str(exc), 'code': 'terrain_coverage'}, status=422)
        if self.fix_plan_only:
            result = {'risk': result['risk'], 'fix_plan': result['fix_plan'], 'threat_status': result['threat_status']}
        response_class = FixPlanResponseSerializer if self.fix_plan_only else MissionResponseSerializer
        contract = response_class(data=result)
        if not contract.is_valid():
            logger.error('Mission response contract failed: %s', contract.errors)
            raise APIException('Simulation returned an invalid response contract.')
        return Response(contract.data)


class FixPlanView(MissionSimulationView):
    fix_plan_only = True

    @extend_schema(
        tags=['Fix Plan'], request=MissionSimulationSerializer,
        responses={200: FixPlanResponseSerializer, 400: {'description': 'Invalid simulation input.'},
                   401: {'description': 'JWT authentication required.'},
                   422: SourceErrorSerializer, 429: ThrottleErrorSerializer, 502: SourceErrorSerializer,
                   503: SourceErrorSerializer, 504: SourceErrorSerializer},
        description='Evaluate the scenario and search for a recovery plan. Forces auto_resolve=true. Transit and waiting survival are not modeled.',
    )
    def post(self, request):
        return super().post(request)
