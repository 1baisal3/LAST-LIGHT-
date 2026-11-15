from django.http import Http404
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from mission_control.schema_tools import extend_schema

from .models import DataRelease


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
